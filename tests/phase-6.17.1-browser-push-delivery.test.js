import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  webPushConfigured, getPublicVapidKey, sendWebPushToSubscriptions,
} from '../server/web-push-service.js';
import { deliverUserPushNotifications, createUserNotification } from '../server/notification-service.js';
import { buildCommentNotification, deliverBuiltNotification } from '../server/notification-triggers.js';
import { createSendTestNotificationHandler } from '../server/api-handlers/notifications.js';
import { renderNotificationPreferences, renderPushSection } from '../src/views/notification-preferences.js';

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

const VAPID_ENV = { WEB_PUSH_PUBLIC_VAPID_KEY: 'pub', WEB_PUSH_PRIVATE_VAPID_KEY: 'priv', WEB_PUSH_SUBJECT: 'mailto:x@y.z' };

// Minimal Firebase-Admin-shaped fake supporting nested collections, doc.get/set/
// delete and collection.get (prefix scan).
function fakeAdminDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  function docRef(path) {
    return {
      path,
      collection(name) { return colRef(path + '/' + name); },
      async get() { const d = docs.get(path); return { exists: d != null, id: path.split('/').pop(), data: () => d }; },
      async set(data, options) { const ex = options && options.merge ? (docs.get(path) || {}) : {}; docs.set(path, { ...ex, ...data }); },
      async delete() { docs.delete(path); },
    };
  }
  function colRef(path) {
    return {
      path,
      doc(id) { return docRef(path + '/' + id); },
      async get() {
        const prefix = path + '/';
        const out = [];
        for (const [p, data] of docs) {
          if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) out.push({ id: p.split('/').pop(), data: () => data });
        }
        return { docs: out };
      },
    };
  }
  return { collection(name) { return colRef(name); }, _docs: docs };
}

function fakeWebpush() {
  const calls = [];
  return {
    calls,
    setVapidDetails() {},
    async sendNotification(sub, payload) { calls.push({ endpoint: sub.endpoint, payload }); return { statusCode: 201 }; },
  };
}

/* ── 1. Dependency correction ── */

test('Phase 6.17.1 root package includes web-push; mobile does not', () => {
  const rootPkg = JSON.parse(read('package.json'));
  assert.ok(rootPkg.dependencies['web-push'], 'web-push in root deps');
  const mobilePkg = JSON.parse(read('apps/mobile/package.json'));
  assert.equal(mobilePkg.dependencies['web-push'], undefined, 'web-push must not be in mobile deps');
});

test('Phase 6.17.1 lockfile resolves web-push and firebase-admin stays pinned', () => {
  const lock = JSON.parse(read('package-lock.json'));
  assert.ok(lock.packages['node_modules/web-push'], 'web-push present in lockfile');
  assert.equal(JSON.parse(read('package.json')).dependencies['firebase-admin'], '13.10.0');
});

/* ── 2. Permission UX is opt-in only ── */

test('Phase 6.17.1 no permission/subscription/SW-register at import time', () => {
  const main = read('src/main.js');
  // Permission + subscribe + register only happen inside named handlers, never
  // at module top level.
  assert.doesNotMatch(main, /^\s*(await\s+)?requestWebPushPermission\(/m);
  assert.doesNotMatch(main, /^\s*(await\s+)?subscribeToWebPush\(/m);
  assert.doesNotMatch(main, /^\s*(await\s+)?registerLearnPathServiceWorker\(/m);
  // The only path that requests permission is the explicit enable handler.
  assert.match(main, /enableWebPushFromClick/);
  assert.match(main, /data-action.*enable-web-push|'enable-web-push'/);
});

test('Phase 6.17.1 push client modules do not auto-run permission/subscribe on import', () => {
  for (const rel of ['src/web-push-permissions.js', 'src/web-push-client.js', 'src/service-worker-registration.js']) {
    const src = read(rel);
    assert.doesNotMatch(src, /^\s*(Notification\.requestPermission|navigator\.serviceWorker\.register)\(/m, rel);
  }
});

/* ── 3. Preference UI states ── */

test('Phase 6.17.1 push UI distinguishes all states with safe copy', () => {
  const unsupported = renderPushSection({ preferences: {}, pushState: 'unsupported', pushConfigured: true });
  assert.match(unsupported, /not available in this browser/i);
  assert.doesNotMatch(unsupported, /enable-web-push/);

  const notConfigured = renderPushSection({ preferences: {}, pushState: 'default', pushConfigured: false });
  assert.match(notConfigured, /not configured yet/i);
  assert.doesNotMatch(notConfigured, /data-action="enable-web-push"/);

  const denied = renderPushSection({ preferences: {}, pushState: 'denied', pushConfigured: true });
  assert.match(denied, /blocked in your browser settings/i);
  assert.doesNotMatch(denied, /data-action="enable-web-push"/);

  const off = renderPushSection({ preferences: { webPushEnabled: false }, pushState: 'default', pushConfigured: true });
  assert.match(off, /Browser notifications are off/i);
  assert.match(off, /data-action="enable-web-push"/);

  const on = renderPushSection({ preferences: { webPushEnabled: true }, pushState: 'granted', pushConfigured: true });
  assert.match(on, /Browser notifications are on/i);
  assert.match(on, /data-action="disable-web-push"/);
});

test('Phase 6.17.1 full preferences panel renders push controls and no private data', () => {
  const html = renderNotificationPreferences({ preferences: {}, pushState: 'default', pushConfigured: true });
  assert.match(html, /data-pref="webPushEnabled"/);
  assert.doesNotMatch(html, /idToken|password|proofBody|endpoint/i);
});

/* ── 4. Env config ── */

test('Phase 6.17.1 server webPushConfigured requires all three VAPID vars', () => {
  assert.equal(webPushConfigured({}), false);
  assert.equal(webPushConfigured({ WEB_PUSH_PUBLIC_VAPID_KEY: 'pub' }), false);
  assert.equal(webPushConfigured({ WEB_PUSH_PUBLIC_VAPID_KEY: 'pub', WEB_PUSH_PRIVATE_VAPID_KEY: 'priv' }), false);
  assert.equal(webPushConfigured(VAPID_ENV), true);
  assert.equal(getPublicVapidKey(VAPID_ENV), 'pub');
});

test('Phase 6.17.1 client uses VITE_WEB_PUSH_PUBLIC_VAPID_KEY; docs mention both', () => {
  assert.match(read('src/main.js'), /VITE_WEB_PUSH_PUBLIC_VAPID_KEY/);
  const doc = read('docs/cross-platform-notification-system.md');
  assert.match(doc, /VITE_WEB_PUSH_PUBLIC_VAPID_KEY/);
  assert.match(doc, /WEB_PUSH_PRIVATE_VAPID_KEY/);
  assert.match(doc, /WEB_PUSH_SUBJECT/);
});

/* ── 5. Push delivery helper ── */

test('Phase 6.17.1 deliverUserPushNotifications sends to subscriptions and prunes expired', async () => {
  const adminDb = fakeAdminDb({
    'users/u1/notificationPreferences/main': { uid: 'u1', webPushEnabled: true, publicProgressInteractionEnabled: true },
    'users/u1/pushSubscriptions/sub_a': { subscriptionId: 'sub_a', endpoint: 'https://push/a', keys: { p256dh: 'k', auth: 'a' } },
  });
  const webpush = fakeWebpush();
  const result = await deliverUserPushNotifications({
    adminDb, uid: 'u1', notification: { type: 'public_progress_comment', title: 'New comment', body: 'b' },
    env: VAPID_ENV, webpush, now: new Date(2026, 0, 1, 12, 0),
  });
  assert.equal(result.sent, 1);
  assert.equal(webpush.calls.length, 1);
  assert.doesNotMatch(JSON.stringify(webpush.calls[0].payload), /proofBody|storagePath|idToken/);

  // Expired (410) subscription is deleted.
  const gone = fakeAdminDb({
    'users/u1/notificationPreferences/main': { uid: 'u1', webPushEnabled: true, publicProgressInteractionEnabled: true },
    'users/u1/pushSubscriptions/sub_b': { subscriptionId: 'sub_b', endpoint: 'https://push/b', keys: {} },
  });
  const goneLib = { setVapidDetails() {}, async sendNotification() { const e = new Error('gone'); e.statusCode = 410; throw e; } };
  const r2 = await deliverUserPushNotifications({ adminDb: gone, uid: 'u1', notification: { type: 'public_progress_comment' }, env: VAPID_ENV, webpush: goneLib, now: new Date(2026, 0, 1, 12, 0) });
  assert.equal(r2.expired, 1);
  assert.equal(gone._docs.has('users/u1/pushSubscriptions/sub_b'), false, 'expired subscription pruned');
});

test('Phase 6.17.1 deliverUserPushNotifications respects disabled/quiet-hours/not-configured; never throws', async () => {
  const base = {
    'users/u1/pushSubscriptions/sub_a': { subscriptionId: 'sub_a', endpoint: 'https://push/a', keys: {} },
  };
  // webPushEnabled false → no send.
  const off = fakeAdminDb({ ...base, 'users/u1/notificationPreferences/main': { uid: 'u1', webPushEnabled: false } });
  const w1 = fakeWebpush();
  const r1 = await deliverUserPushNotifications({ adminDb: off, uid: 'u1', notification: { type: 'public_progress_comment' }, env: VAPID_ENV, webpush: w1 });
  assert.equal(r1.sent, 0); assert.equal(w1.calls.length, 0); assert.equal(r1.disabledReason, 'web_push_disabled');

  // Quiet hours suppress push.
  const quiet = fakeAdminDb({ ...base, 'users/u1/notificationPreferences/main': { uid: 'u1', webPushEnabled: true, publicProgressInteractionEnabled: true, quietHoursEnabled: true, quietHoursStart: '22:00', quietHoursEnd: '07:00' } });
  const w2 = fakeWebpush();
  const r2 = await deliverUserPushNotifications({ adminDb: quiet, uid: 'u1', notification: { type: 'public_progress_comment' }, env: VAPID_ENV, webpush: w2, now: new Date(2026, 0, 1, 23, 30) });
  assert.equal(r2.sent, 0); assert.equal(w2.calls.length, 0); assert.equal(r2.disabledReason, 'quiet_hours');

  // Not configured → safe disabled reason, no throw.
  const unconf = fakeAdminDb({ ...base, 'users/u1/notificationPreferences/main': { uid: 'u1', webPushEnabled: true, publicProgressInteractionEnabled: true } });
  const r3 = await deliverUserPushNotifications({ adminDb: unconf, uid: 'u1', notification: { type: 'public_progress_comment' }, env: {}, webpush: fakeWebpush() });
  assert.equal(r3.sent, 0); assert.equal(r3.disabledReason, 'not_configured');
});

/* ── 6. send-test-notification wiring ── */

function testNotificationHandler(opts = {}) {
  return createSendTestNotificationHandler({
    authenticate: async () => ({ uid: 'u1' }),
    rateLimit: async () => {},
    db: opts.db,
    env: opts.env || {},
    webpush: opts.webpush || fakeWebpush(),
  });
}
function recorder() {
  return { statusCode: 200, headers: {}, payload: null, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(v) { this.payload = v; return v; } };
}
function postReq() { return { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: {} }; }

test('Phase 6.17.1 send-test creates in-app notification and attempts push when configured', async () => {
  const db = fakeAdminDb({ 'users/u1/notificationPreferences/main': { uid: 'u1', webPushEnabled: true }, 'users/u1/pushSubscriptions/sub_a': { subscriptionId: 'sub_a', endpoint: 'https://push/a', keys: {} } });
  const webpush = fakeWebpush();
  const res = recorder();
  await testNotificationHandler({ db, env: VAPID_ENV, webpush })(postReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.ok(res.payload.notification, 'in-app notification returned');
  assert.equal(res.payload.pushSent, 1);
  assert.equal(res.payload.webPushConfigured, true);
  // In-app notification was stored.
  assert.ok([...db._docs.keys()].some(k => k.startsWith('users/u1/notifications/')));
  // Never returns raw subscription endpoint/keys.
  assert.doesNotMatch(JSON.stringify(res.payload), /push\/a|p256dh|endpoint/);
});

test('Phase 6.17.1 send-test works in-app-only when push not configured', async () => {
  const db = fakeAdminDb({ 'users/u1/notificationPreferences/main': { uid: 'u1', webPushEnabled: true } });
  const res = recorder();
  await testNotificationHandler({ db, env: {} })(postReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.webPushConfigured, false);
  assert.equal(res.payload.pushSent, 0);
  assert.equal(res.payload.pushDisabledReason, 'not_configured');
  assert.ok([...db._docs.keys()].some(k => k.startsWith('users/u1/notifications/')));
});

test('Phase 6.17.1 send-test does not push when webPushEnabled false', async () => {
  const db = fakeAdminDb({ 'users/u1/notificationPreferences/main': { uid: 'u1', webPushEnabled: false }, 'users/u1/pushSubscriptions/sub_a': { subscriptionId: 'sub_a', endpoint: 'https://push/a', keys: {} } });
  const webpush = fakeWebpush();
  const res = recorder();
  await testNotificationHandler({ db, env: VAPID_ENV, webpush })(postReq(), res);
  assert.equal(res.payload.pushSent, 0);
  assert.equal(webpush.calls.length, 0);
  assert.equal(res.payload.pushDisabledReason, 'web_push_disabled');
});

/* ── 7. Public progress trigger push ── */

test('Phase 6.17.1 deliverBuiltNotification stores in-app and attempts push best-effort', async () => {
  const db = fakeAdminDb({ 'users/owner/notificationPreferences/main': { uid: 'owner', webPushEnabled: true, publicProgressInteractionEnabled: true }, 'users/owner/pushSubscriptions/sub_a': { subscriptionId: 'sub_a', endpoint: 'https://push/a', keys: {} } });
  const webpush = fakeWebpush();
  const built = buildCommentNotification({ ownerUid: 'owner', actorUid: 'actor', entryId: 'e1', commentId: 'c1' });
  const stored = await deliverBuiltNotification({ adminDb: db, built, env: VAPID_ENV, webpush });
  assert.ok(stored);
  assert.equal(webpush.calls.length, 1);
  // Comment body / social vocabulary never in the push payload.
  assert.doesNotMatch(JSON.stringify(webpush.calls[0].payload), /\blike\b|\bheart\b|comment body/i);
});

test('Phase 6.17.1 own reaction/comment does not notify; push failure does not throw', async () => {
  assert.equal(buildCommentNotification({ ownerUid: 'u', actorUid: 'u', entryId: 'e' }), null);
  // A throwing webpush must not bubble out of the trigger.
  const db = fakeAdminDb({ 'users/owner/notificationPreferences/main': { uid: 'owner', webPushEnabled: true, publicProgressInteractionEnabled: true }, 'users/owner/pushSubscriptions/sub_a': { subscriptionId: 'sub_a', endpoint: 'https://push/a', keys: {} } });
  const boom = { setVapidDetails() {}, async sendNotification() { throw new Error('network'); } };
  const built = buildCommentNotification({ ownerUid: 'owner', actorUid: 'actor', entryId: 'e1', commentId: 'c1' });
  const stored = await deliverBuiltNotification({ adminDb: db, built, env: VAPID_ENV, webpush: boom });
  assert.ok(stored, 'in-app notification still created despite push failure');
});

test('Phase 6.17.1 react/comment handlers still forward triggers', () => {
  assert.match(read('server/api-handlers/react-progress.js'), /notifyProgressReaction/);
  assert.match(read('server/api-handlers/comment-progress.js'), /notifyProgressComment/);
});

/* ── 8. Service worker ── */

test('Phase 6.17.1 service worker handles push + click, no caching, no private strings', () => {
  const sw = read('public/learn-path-service-worker.js');
  assert.match(sw, /addEventListener\(['"]push['"]/);
  assert.match(sw, /addEventListener\(['"]notificationclick['"]/);
  assert.match(sw, /showNotification/);
  assert.match(sw, /actionUrl/);
  // No app-asset caching in this phase.
  assert.doesNotMatch(sw, /caches\.open|cache\.addAll|CacheStorage/);
  // Never logs/contains private fields.
  assert.doesNotMatch(sw, /proofBody|reflection|evidenceUrl|storagePath|idToken|password/i);
});

/* ── 9. API/router invariants ── */

test('Phase 6.17.1 no new top-level API route files; only 3 routers; functions < 12', () => {
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_')).map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(Object.keys(vercel.functions || {}).length < 12);
  // Community router still owns the notification actions.
  assert.match(read('api/community.js'), /send-test-notification/);
});

/* ── 10. No forbidden behavior ── */

test('Phase 6.17.1 no social/economy/email/SMS/analytics added in touched modules', () => {
  for (const rel of ['server/notification-service.js', 'server/notification-triggers.js', 'server/web-push-service.js',
    'server/api-handlers/notifications.js', 'src/views/notification-preferences.js', 'src/main.js']) {
    const src = read(rel);
    assert.doesNotMatch(src, /\bfollowers?\b|\bfollowing\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy/i, rel);
    assert.doesNotMatch(src, /twilio|sendgrid|mailgun|nodemailer|@segment|mixpanel|amplitude\.com|google-analytics|gtag\(/i, rel);
  }
});

test('Phase 6.17.1 firebase-admin never imported on mobile and stays 13.10.0', () => {
  assert.equal(JSON.parse(read('package.json')).dependencies['firebase-admin'], '13.10.0');
  for (const file of walk(resolve(mobile, 'src'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /from\s+['"]firebase-admin/, file);
  }
});
