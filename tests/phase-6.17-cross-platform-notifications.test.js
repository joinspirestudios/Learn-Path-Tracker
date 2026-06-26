import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NOTIFICATION_TYPES, isAllowedNotificationType, sanitizeNotificationPayload,
  normalizeNotification, notificationPublicSafeView, notificationIsUnread,
} from '../src/notification-model.js';
import {
  NOTIFICATION_PREFERENCE_DEFAULTS, normalizeNotificationPreferences,
  defaultNotificationPreferences, isValidReminderTime, sanitizeTimezone,
} from '../src/notification-preferences-model.js';
import {
  reminderFallsInQuietHours, shouldSendDailyReminder, shouldSendStreakRiskAlert, nextReminderWindow,
} from '../src/notification-scheduler.js';
import notificationDb, {
  listNotifications, markNotificationRead, markAllNotificationsRead, archiveNotification,
  loadNotificationPreferences, saveNotificationPreferences, saveWebPushSubscription, deleteWebPushSubscription,
  getUnreadNotificationCount,
} from '../src/notification-db.js';
import {
  buildNotificationId, createUserNotification, notificationShouldSendPush,
} from '../server/notification-service.js';
import {
  webPushConfigured, getPublicVapidKey, buildPushPayload, sendWebPush,
} from '../server/web-push-service.js';
import {
  buildReactionNotification, buildCommentNotification, buildModerationNotification,
} from '../server/notification-triggers.js';
import { browserSupportsPush, requestWebPushPermission } from '../src/web-push-permissions.js';
import { subscriptionToSafeJson } from '../src/web-push-client.js';
import { renderNotificationBell, renderNotificationCenter } from '../src/views/notification-center.js';
import { renderNotificationPreferences } from '../src/views/notification-preferences.js';
import communityRouter from '../api/community.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = resolve(root, 'apps/mobile');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/* ── 1. Notification model ── */

test('Phase 6.17 allowed types accepted, unknown rejected', () => {
  for (const t of NOTIFICATION_TYPES) assert.equal(isAllowedNotificationType(t), true, t);
  assert.equal(isAllowedNotificationType('follow'), false);
  assert.equal(isAllowedNotificationType('leaderboard'), false);
  assert.equal(isAllowedNotificationType('heart'), false);
  // Unknown type collapses to 'system' on normalize.
  assert.equal(normalizeNotification({ type: 'leaderboard' }).type, 'system');
});

test('Phase 6.17 sanitization strips private proof, reflection, evidence, storage, tokens', () => {
  const dirty = {
    type: 'day_synced', title: 'Saved', body: 'ok',
    proofBody: 'secret proof', reflection: 'private reflection',
    evidenceUrl: 'https://x/evidence', storagePath: 'users/u/proofMedia/p/day-1/t/a',
    downloadURL: 'https://x', token: 'eyJabc', idToken: 'tok', password: 'pw', email: 'a@b.com',
    base64: 'data:image/png;base64,AAAA',
  };
  const safe = sanitizeNotificationPayload(dirty);
  for (const banned of ['proofBody', 'reflection', 'evidenceUrl', 'storagePath', 'downloadURL', 'token', 'idToken', 'password', 'email', 'base64']) {
    assert.equal(banned in safe, false, banned + ' must be stripped');
  }
  const json = JSON.stringify(normalizeNotification(dirty));
  assert.doesNotMatch(json, /secret proof|private reflection|proofMedia|eyJabc|a@b\.com|data:image/);
});

test('Phase 6.17 title/body scrub leaked emails, file/storage URIs and tokens', () => {
  const n = normalizeNotification({
    type: 'system',
    title: 'Hi a@b.com',
    body: 'see file:///tmp/secret.png and gs://bucket/x and eyJsomeTokenValue1234',
  });
  assert.doesNotMatch(n.title, /a@b\.com/);
  assert.doesNotMatch(n.body, /file:\/\/\/|gs:\/\/|eyJsomeTokenValue/);
});

test('Phase 6.17 public-safe view excludes uid/source ids/tokens', () => {
  const view = notificationPublicSafeView({
    type: 'public_progress_reaction', uid: 'owner', sourceUserId: 'actor', title: 'Hi', body: 'b',
    token: 'eyJ', entityId: 'entry-1',
  });
  assert.equal('uid' in view, false);
  assert.equal('sourceUserId' in view, false);
  assert.equal('entityId' in view, false);
  assert.equal('token' in view, false);
  assert.deepEqual(Object.keys(view).sort(),
    ['actionLabel', 'actionUrl', 'archived', 'body', 'createdAt', 'id', 'priority', 'read', 'title', 'type']);
});

test('Phase 6.17 idempotency key generation is stable', () => {
  const a = buildNotificationId({ type: 'public_progress_reaction', scopeId: 'entry-1', sourceUserId: 'actor' });
  const b = buildNotificationId({ type: 'public_progress_reaction', scopeId: 'entry-1', sourceUserId: 'actor' });
  assert.equal(a, b);
  assert.doesNotMatch(a, /[^a-zA-Z0-9_-]/);
  assert.notEqual(a, buildNotificationId({ type: 'public_progress_reaction', scopeId: 'entry-2', sourceUserId: 'actor' }));
});

test('Phase 6.17 notificationIsUnread reflects read/archived', () => {
  assert.equal(notificationIsUnread({ read: false, archived: false }), true);
  assert.equal(notificationIsUnread({ read: true, archived: false }), false);
  assert.equal(notificationIsUnread({ read: false, archived: true }), false);
});

/* ── 2. Preferences model ── */

test('Phase 6.17 defaults: in-app on, push off, reminders off', () => {
  const d = defaultNotificationPreferences('u1');
  assert.equal(d.inAppEnabled, true);
  assert.equal(d.webPushEnabled, false);
  assert.equal(d.mobileLocalEnabled, false);
  assert.equal(d.dailyReminderEnabled, false);
  assert.equal(NOTIFICATION_PREFERENCE_DEFAULTS.webPushEnabled, false);
  assert.equal(NOTIFICATION_PREFERENCE_DEFAULTS.dailyReminderEnabled, false);
});

test('Phase 6.17 invalid reminder time rejected, valid accepted', () => {
  assert.equal(isValidReminderTime('09:30'), true);
  assert.equal(isValidReminderTime('24:00'), false);
  assert.equal(isValidReminderTime('9:30'), false);
  assert.equal(isValidReminderTime('nonsense'), false);
  // Normalization falls back to the default time for invalid input.
  assert.equal(normalizeNotificationPreferences({ dailyReminderTime: 'bad' }).dailyReminderTime, '09:00');
  assert.equal(normalizeNotificationPreferences({ dailyReminderTime: '06:15' }).dailyReminderTime, '06:15');
});

test('Phase 6.17 timezone sanitized', () => {
  assert.equal(sanitizeTimezone('Europe/London'), 'Europe/London');
  assert.equal(sanitizeTimezone('UTC'), 'UTC');
  assert.equal(sanitizeTimezone('not a tz; drop'), '');
  assert.equal(sanitizeTimezone('a'.repeat(80)), '');
});

test('Phase 6.17 quiet hours validation (wrap past midnight)', () => {
  const prefs = { quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' };
  assert.equal(reminderFallsInQuietHours({ preferences: prefs, now: new Date(2026, 0, 1, 23, 0) }), true);
  assert.equal(reminderFallsInQuietHours({ preferences: prefs, now: new Date(2026, 0, 1, 3, 0) }), true);
  assert.equal(reminderFallsInQuietHours({ preferences: prefs, now: new Date(2026, 0, 1, 12, 0) }), false);
  assert.equal(reminderFallsInQuietHours({ preferences: { ...prefs, quietHoursEnabled: false }, now: new Date(2026, 0, 1, 23, 0) }), false);
});

/* ── 3. Scheduler ── */

test('Phase 6.17 daily reminder only when opt-in, after time, once per day', () => {
  const prefs = { inAppEnabled: true, dailyReminderEnabled: true, dailyReminderTime: '09:00' };
  assert.equal(shouldSendDailyReminder({ preferences: prefs, now: new Date(2026, 0, 1, 8, 0) }), false);
  assert.equal(shouldSendDailyReminder({ preferences: prefs, now: new Date(2026, 0, 1, 9, 30) }), true);
  // Already sent today → no repeat.
  assert.equal(shouldSendDailyReminder({ preferences: prefs, now: new Date(2026, 0, 1, 9, 30), lastReminderAt: new Date(2026, 0, 1, 9, 5) }), false);
  // Disabled by default.
  assert.equal(shouldSendDailyReminder({ preferences: { dailyReminderEnabled: false }, now: new Date(2026, 0, 1, 10, 0) }), false);
});

test('Phase 6.17 streak-risk alert respects opt-in and active streak', () => {
  const prefs = { inAppEnabled: true, streakRiskEnabled: true };
  assert.equal(shouldSendStreakRiskAlert({ preferences: prefs, pathState: { currentStreak: 5, completedToday: false }, now: new Date(2026, 0, 1, 19, 0) }), true);
  assert.equal(shouldSendStreakRiskAlert({ preferences: prefs, pathState: { currentStreak: 5, completedToday: true }, now: new Date(2026, 0, 1, 19, 0) }), false);
  assert.equal(shouldSendStreakRiskAlert({ preferences: prefs, pathState: { currentStreak: 0 }, now: new Date(2026, 0, 1, 19, 0) }), false);
  assert.equal(shouldSendStreakRiskAlert({ preferences: { streakRiskEnabled: false }, pathState: { currentStreak: 5 }, now: new Date(2026, 0, 1, 19, 0) }), false);
});

test('Phase 6.17 nextReminderWindow null when disabled', () => {
  assert.equal(nextReminderWindow({ dailyReminderEnabled: false }, new Date()), null);
  const next = nextReminderWindow({ dailyReminderEnabled: true, dailyReminderTime: '09:00' }, new Date(2026, 0, 1, 10, 0));
  assert.ok(next instanceof Date);
  assert.equal(next.getDate(), 2); // rolled to tomorrow
});

/* ── 4. Notification DB (DI, no live Firebase) ── */

function fakeFb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  return {
    firestoreReady: true,
    db: { __fake: true },
    doc(_db, ...parts) { return { path: parts.join('/') }; },
    collection(_db, ...parts) { return { path: parts.join('/') }; },
    async getDoc(ref) { const d = docs.get(ref.path); return { exists: () => d != null, data: () => d, id: ref.path.split('/').pop() }; },
    async getDocs(ref) {
      const prefix = ref.path + '/';
      const out = [];
      for (const [path, data] of docs) if (path.startsWith(prefix)) out.push({ id: path.split('/').pop(), data: () => data });
      return { docs: out };
    },
    async setDoc(ref, data, options) { const ex = options && options.merge ? (docs.get(ref.path) || {}) : {}; docs.set(ref.path, { ...ex, ...data }); },
    async deleteDoc(ref) { docs.delete(ref.path); },
    _docs: docs,
  };
}

test('Phase 6.17 notification-db exposes the required functions', () => {
  for (const fn of ['listNotifications', 'getUnreadNotificationCount', 'markNotificationRead', 'markAllNotificationsRead',
    'archiveNotification', 'loadNotificationPreferences', 'saveNotificationPreferences', 'saveWebPushSubscription', 'deleteWebPushSubscription']) {
    assert.equal(typeof notificationDb[fn], 'function', fn);
  }
});

test('Phase 6.17 notification-db reads/writes via injected fb only', async () => {
  const fb = fakeFb({
    'users/u1/notifications/n1': { type: 'system', title: 'A', read: false, createdAt: 2 },
    'users/u1/notifications/n2': { type: 'day_synced', title: 'B', read: true, createdAt: 5 },
    'users/u1/notifications/n3': { type: 'system', title: 'C', archived: true, createdAt: 9 },
  });
  const list = await listNotifications('u1', { fb });
  assert.equal(list.length, 2); // archived excluded
  assert.equal(list[0].title, 'B'); // newest first
  assert.equal(await getUnreadNotificationCount('u1', { fb }), 1);

  await markNotificationRead('u1', 'n1', { fb });
  assert.equal(fb._docs.get('users/u1/notifications/n1').read, true);
  await archiveNotification('u1', 'n2', { fb });
  assert.equal(fb._docs.get('users/u1/notifications/n2').archived, true);
  await markAllNotificationsRead('u1', { fb });

  const prefs = await saveNotificationPreferences('u1', { dailyReminderEnabled: true, dailyReminderTime: '07:00' }, { fb });
  assert.equal(prefs.dailyReminderEnabled, true);
  const loaded = await loadNotificationPreferences('u1', { fb });
  assert.equal(loaded.dailyReminderTime, '07:00');

  const sub = await saveWebPushSubscription('u1', { endpoint: 'https://push.example/abc', keys: { p256dh: 'k', auth: 'a' } }, { fb });
  assert.ok(sub.subscriptionId);
  // Stored subscription never contains a token/password.
  assert.doesNotMatch(JSON.stringify(fb._docs.get('users/u1/pushSubscriptions/' + sub.subscriptionId)), /idToken|password/);
  assert.equal(await deleteWebPushSubscription('u1', sub.subscriptionId, { fb }), true);
});

/* ── 5. Server notification service ── */

function fakeAdminDb() {
  const docs = new Map();
  function docRef(path) {
    return {
      path,
      collection(name) { return colRef(path + '/' + name); },
      async set(data, options) { const ex = options && options.merge ? (docs.get(path) || {}) : {}; docs.set(path, { ...ex, ...data }); },
      async get() { const d = docs.get(path); return { exists: d != null, data: () => d, id: path.split('/').pop() }; },
      async delete() { docs.delete(path); },
    };
  }
  function colRef(path) { return { path, doc(id) { return docRef(path + '/' + id); } }; }
  return { collection(name) { return colRef(name); }, _docs: docs };
}

test('Phase 6.17 createUserNotification sanitizes payload and stores under owner space', async () => {
  const adminDb = fakeAdminDb();
  const stored = await createUserNotification({
    adminDb, uid: 'owner',
    notification: { type: 'public_progress_comment', title: 'New comment', body: 'ok', proofBody: 'secret', token: 'eyJ', scopeId: 'c1' },
  });
  assert.equal(stored.type, 'public_progress_comment');
  const key = [...adminDb._docs.keys()].find(k => k.startsWith('users/owner/notifications/'));
  assert.ok(key, 'notification stored under users/owner/notifications/*');
  const json = JSON.stringify(adminDb._docs.get(key));
  assert.doesNotMatch(json, /secret|eyJ/);
});

test('Phase 6.17 duplicate event id is idempotent (no duplicate docs)', async () => {
  const adminDb = fakeAdminDb();
  const note = { type: 'public_progress_reaction', scopeId: 'entry-1', sourceUserId: 'actor', title: 'r' };
  await createUserNotification({ adminDb, uid: 'owner', notification: note });
  await createUserNotification({ adminDb, uid: 'owner', notification: note });
  const keys = [...adminDb._docs.keys()].filter(k => k.startsWith('users/owner/notifications/'));
  assert.equal(keys.length, 1);
});

test('Phase 6.17 push suppressed when disabled or during quiet hours', () => {
  const note = { type: 'public_progress_comment' };
  assert.equal(notificationShouldSendPush({ preferences: { webPushEnabled: false, mobileLocalEnabled: false }, notification: note }), false);
  assert.equal(notificationShouldSendPush({ preferences: { webPushEnabled: true, publicProgressInteractionEnabled: true }, notification: note, now: new Date(2026, 0, 1, 12, 0) }), true);
  assert.equal(notificationShouldSendPush({
    preferences: { webPushEnabled: true, publicProgressInteractionEnabled: true, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' },
    notification: note, now: new Date(2026, 0, 1, 23, 30),
  }), false);
});

/* ── 6. Web push service ── */

test('Phase 6.17 web push disabled gracefully when VAPID missing', async () => {
  const env = {};
  assert.equal(webPushConfigured(env), false);
  assert.equal(getPublicVapidKey(env), '');
  const result = await sendWebPush({ subscription: { endpoint: 'https://x' }, notification: { type: 'system', title: 'T' }, env });
  assert.equal(result.ok, false);
  assert.equal(result.disabled, true);
});

test('Phase 6.17 web push configured reads public key only; payload is public-safe', () => {
  const env = { WEB_PUSH_PUBLIC_VAPID_KEY: 'pub', WEB_PUSH_PRIVATE_VAPID_KEY: 'priv', WEB_PUSH_SUBJECT: 'mailto:x@y.z' };
  assert.equal(webPushConfigured(env), true);
  assert.equal(getPublicVapidKey(env), 'pub');
  const payload = buildPushPayload({ type: 'system', title: 'T', body: 'B', token: 'eyJ', storagePath: 'gs://x' });
  assert.doesNotMatch(JSON.stringify(payload), /eyJ|gs:\/\/|priv/);
});

test('Phase 6.17 the private VAPID key is never referenced in client code', () => {
  for (const rel of ['src/web-push-client.js', 'src/web-push-permissions.js', 'src/service-worker-registration.js',
    'src/views/notification-center.js', 'src/views/notification-preferences.js', 'public/learn-path-service-worker.js']) {
    assert.doesNotMatch(read(rel), /WEB_PUSH_PRIVATE_VAPID_KEY|privateKey|privateVapid/i, rel);
  }
});

/* ── 7. Notification triggers ── */

test('Phase 6.17 reaction/comment triggers notify owner, never self, never comment body', () => {
  assert.equal(buildReactionNotification({ ownerUid: 'u', actorUid: 'u', entryId: 'e' }), null);
  const r = buildReactionNotification({ ownerUid: 'owner', actorUid: 'actor', entryId: 'e1' });
  assert.equal(r.uid, 'owner');
  assert.equal(r.notification.type, 'public_progress_reaction');

  const c = buildCommentNotification({ ownerUid: 'owner', actorUid: 'actor', entryId: 'e1', commentId: 'c1' });
  assert.equal(c.notification.type, 'public_progress_comment');
  // Generic copy; never echoes a comment body or uses social vocabulary.
  assert.doesNotMatch(JSON.stringify(c), /\blike\b|\bheart\b|\bfollow|\brank|leaderboard/i);

  const m = buildModerationNotification({ ownerUid: 'owner', kind: 'comment_hidden', entryId: 'e1' });
  assert.equal(m.notification.type, 'moderation_update');
});

test('Phase 6.17 existing react/comment handlers wire the notification triggers', () => {
  assert.match(read('server/api-handlers/react-progress.js'), /notifyProgressReaction/);
  assert.match(read('server/api-handlers/comment-progress.js'), /notifyProgressComment/);
});

/* ── 8. Web push client/permissions ── */

test('Phase 6.17 push permission is never requested at import; only via explicit call', () => {
  for (const rel of ['src/web-push-permissions.js', 'src/web-push-client.js', 'src/service-worker-registration.js']) {
    const src = read(rel);
    // No top-level call to requestPermission / Notification.requestPermission / register.
    assert.doesNotMatch(src, /^\s*(await\s+)?(Notification\.requestPermission|navigator\.serviceWorker\.register)\(/m, rel);
  }
});

test('Phase 6.17 browserSupportsPush + requestWebPushPermission handle unsupported/denied safely', async () => {
  assert.equal(browserSupportsPush({}), false);
  const deniedScope = { Notification: { permission: 'denied', requestPermission: async () => 'granted' }, navigator: { serviceWorker: {} }, PushManager: function () {} };
  assert.equal(await requestWebPushPermission(deniedScope), 'denied');
  assert.equal(await requestWebPushPermission({}), 'unsupported');
});

test('Phase 6.17 subscriptionToSafeJson contains only endpoint/keys/expiration, no private data', () => {
  const safe = subscriptionToSafeJson({ toJSON: () => ({ endpoint: 'https://p/x', expirationTime: null, keys: { p256dh: 'k', auth: 'a' }, idToken: 'eyJ' }) });
  assert.deepEqual(Object.keys(safe).sort(), ['endpoint', 'expirationTime', 'keys']);
  assert.doesNotMatch(JSON.stringify(safe), /idToken|eyJ/);
});

/* ── 9. API router ── */

function responseRecorder() {
  return {
    statusCode: 200, headers: {}, payload: null,
    setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(v) { this.payload = v; return v; },
  };
}
function req(route, method = 'POST', headers = {}) {
  return { method, query: { route }, url: `/api/community?route=${route}`, headers: { 'content-type': 'application/json', ...headers }, body: {}, once() {}, off() {}, [Symbol.asyncIterator]: async function* () {} };
}

test('Phase 6.17 community router handles notification actions and requires auth', async () => {
  for (const [route, method] of [
    ['list-notifications', 'GET'], ['mark-notification-read', 'POST'], ['mark-all-notifications-read', 'POST'],
    ['notification-preferences', 'GET'], ['save-push-subscription', 'POST'], ['delete-push-subscription', 'POST'],
    ['send-test-notification', 'POST'],
  ]) {
    const res = responseRecorder();
    await communityRouter(req(route, method), res);
    assert.equal(res.statusCode, 401, route + ' must require auth');
    assert.equal(res.payload?.error, 'unauthorized', route);
  }
});

test('Phase 6.17 run-notification-scheduler requires the cron secret', async () => {
  const res = responseRecorder();
  await communityRouter(req('run-notification-scheduler', 'POST'), res);
  assert.equal(res.statusCode, 401);
});

test('Phase 6.17 no new top-level API route files; only 3 routers remain', () => {
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_')).map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  // vercel.json still targets only the 3 routers.
  const vercel = JSON.parse(read('vercel.json'));
  assert.deepEqual(Object.keys(vercel.functions || {}).sort(), ['api/ai.js', 'api/community.js', 'api/voice.js']);
});

/* ── 10. Web UI ── */

test('Phase 6.17 notification bell renders with unread badge; no private data', () => {
  const bell = renderNotificationBell({ unreadCount: 3 });
  assert.match(bell, /aurora-bell/);
  assert.match(bell, /data-action="open-notifications"/);
  assert.match(bell, />3<|>3 unread/);
  assert.equal(renderNotificationBell({ unreadCount: 0 }).includes('aurora-bell-badge'), false);
});

test('Phase 6.17 notification center renders list, empty and read states', () => {
  const empty = renderNotificationCenter({ notifications: [], unreadCount: 0 });
  assert.match(empty, /all caught up/i);
  const list = renderNotificationCenter({
    notifications: [{ id: 'n1', type: 'day_synced', title: 'Saved', body: 'b', read: false, createdAt: Date.now() }],
    unreadCount: 1,
  });
  assert.match(list, /Saved/);
  assert.match(list, /data-action="mark-read"/);
  assert.match(list, /data-action="mark-all-read"/);
  assert.match(list, /data-action="archive-notification"/);
});

test('Phase 6.17 preferences UI includes push/daily/streak/proof/public-progress/quiet-hours controls', () => {
  const html = renderNotificationPreferences({ preferences: {}, pushState: 'default', pushConfigured: true });
  for (const key of ['inAppEnabled', 'webPushEnabled', 'dailyReminderEnabled', 'dailyReminderTime',
    'streakRiskEnabled', 'proofUploadEnabled', 'publicProgressInteractionEnabled', 'quietHoursEnabled']) {
    assert.match(html, new RegExp('data-pref="' + key + '"'), key);
  }
  // Graceful states.
  assert.match(renderNotificationPreferences({ preferences: {}, pushState: 'denied', pushConfigured: true }), /blocked in your browser/i);
  assert.match(renderNotificationPreferences({ preferences: {}, pushState: 'default', pushConfigured: false }), /not configured yet/i);
  assert.doesNotMatch(html, /idToken|password|proofBody/);
});

test('Phase 6.17 shell renders the bell when signed in', () => {
  const views = read('src/views.js');
  assert.match(views, /showBell:\s*true/);
  assert.match(read('src/ui/core-layout.js'), /renderNotificationBell/);
});

/* ── 11. Mobile ── */

test('Phase 6.17 mobile notification files exist', () => {
  for (const rel of [
    'src/core/mobileNotificationPreferences.js', 'src/services/mobileNotificationRepository.js',
    'src/services/mobileLocalNotificationService.js', 'src/components/MobileNotificationCenter.js',
    'src/components/MobileNotificationPreferences.js', 'src/components/MobileNotificationBadge.js',
    'src/screens/NotificationsScreen.js',
  ]) {
    assert.equal(existsSync(resolve(mobile, rel)), true, rel);
  }
});

test('Phase 6.17 expo-notifications is a mobile-only dependency', () => {
  const mobilePkg = JSON.parse(read('apps/mobile/package.json'));
  assert.ok(mobilePkg.dependencies['expo-notifications'], 'expo-notifications in mobile deps');
  const rootPkg = JSON.parse(read('package.json'));
  assert.equal(rootPkg.dependencies['expo-notifications'], undefined, 'never in root deps');
});

test('Phase 6.17 mobile local notifications request permission only on user action; no remote push token', () => {
  const src = read('apps/mobile/src/services/mobileLocalNotificationService.js');
  assert.match(src, /expo-notifications/);
  assert.match(src, /requestPermission/);
  assert.match(src, /scheduleNotificationAsync/);
  assert.match(src, /cancel/);
  // Remote push is deferred — no Expo push token requested.
  assert.doesNotMatch(src, /getExpoPushTokenAsync|getDevicePushTokenAsync/);
});

test('Phase 6.17 mobile preferences default mobile-local + reminders OFF', () => {
  const src = read('apps/mobile/src/core/mobileNotificationPreferences.js');
  assert.match(src, /mobileLocalEnabled:\s*false/);
  assert.match(src, /dailyReminderEnabled:\s*false/);
});

test('Phase 6.17 mobile does not falsely claim remote push and has no store credentials', () => {
  for (const file of walk(resolve(mobile, 'src'))) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /getExpoPushTokenAsync|EAS_|expoAccessToken|FCM_SERVER_KEY/i, file);
  }
});

/* ── 12. Firestore rules ── */

test('Phase 6.17 firestore rules document owner-only notification subpaths', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /users\/\{uid\}\/notifications/);
  assert.match(rules, /notificationPreferences/);
  assert.match(rules, /pushSubscriptions/);
  // Owner-only wildcard still gates the user subtree.
  assert.match(rules, /match \/users\/\{uid\}\/\{document=\*\*\}/);
  assert.match(rules, /request\.auth\.uid == uid/);
  // publicProgress client writes remain denied.
  assert.match(rules, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
});

test('Phase 6.17 storage rules add no new upload scope', () => {
  const sr = read('storage.rules');
  assert.doesNotMatch(sr, /notification/i);
  assert.doesNotMatch(sr, /match \/\{allPaths=\*\*\}/);
});

/* ── 13. No forbidden behavior ── */

test('Phase 6.17 new modules add no social/economy/email/SMS/analytics provider', () => {
  const files = [
    'src/notification-model.js', 'src/notification-preferences-model.js', 'src/notification-db.js',
    'src/notification-scheduler.js', 'src/web-push-client.js', 'src/web-push-permissions.js',
    'src/views/notification-center.js', 'src/views/notification-preferences.js',
    'server/notification-service.js', 'server/web-push-service.js', 'server/notification-triggers.js',
    'server/api-handlers/notifications.js',
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(src, /\bfollowers?\b|\bfollowing\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy/i, rel);
    assert.doesNotMatch(src, /twilio|sendgrid|mailgun|nodemailer|@segment|segment\.com|mixpanel|amplitude\.com|google-analytics|gtag\(|firebase-admin\/.*messaging/i, rel);
  }
});

test('Phase 6.17 firebase-admin stays at 13.10.0 and is never imported on mobile', () => {
  assert.equal(JSON.parse(read('package.json')).dependencies['firebase-admin'], '13.10.0');
  for (const file of walk(resolve(mobile, 'src'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /from\s+['"]firebase-admin/, file);
  }
});

/* ── 14. Docs ── */

test('Phase 6.17 docs document the notification system', () => {
  const doc = read('docs/cross-platform-notification-system.md');
  assert.match(doc, /6\.17/);
  assert.match(doc, /quiet hours/i);
  assert.match(doc, /VAPID/);
  assert.match(doc, /CRON_SECRET/);
  assert.match(doc, /deferred/i);
});
