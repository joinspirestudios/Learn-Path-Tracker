import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderShellNav } from '../src/ui/core-layout.js';
import {
  renderNotificationPreferences, renderPushSection, disabledReasonCopy,
} from '../src/views/notification-preferences.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }

/* ── 1. Sign out ── */

test('Phase 6.18.1 Aurora signed-in shell renders a sign-out action', () => {
  const nav = renderShellNav({ active: 'today', user: { displayName: 'Avery', username: 'avery' } });
  assert.match(nav, /data-action="sign-out"/);
  assert.match(nav, /Sign out/);
  // Signed-out (no user) → no user block / no sign-out.
  assert.doesNotMatch(renderShellNav({ active: 'today' }), /data-action="sign-out"/);
});

test('Phase 6.18.1 Profile account card also exposes sign-out', () => {
  const views = read('src/views.js');
  assert.match(views, /<h3>Account<\/h3>[\s\S]*?data-action="sign-out"/);
});

test('Phase 6.18.1 main.js wires sign-out to doSignOut and clears state', () => {
  const main = read('src/main.js');
  assert.match(main, /doSignOut/);
  assert.match(main, /action === 'sign-out'/);
  assert.match(main, /handleSignOutClick/);
  // Clears notification + adaptive transient state.
  assert.match(main, /clearSignedInTransientState/);
  assert.match(main, /store\.adaptivePlanDraft = null/);
  assert.match(main, /store\.adaptivePlanReviewOpen = false/);
  assert.match(main, /store\.notificationTestStatus = 'idle'/);
});

/* ── 2. Save preference UX ── */

test('Phase 6.18.1 preferences render visible save status (saving/saved/error)', () => {
  const saving = renderNotificationPreferences({ preferences: {}, saveStatus: 'saving', saveMessage: 'Saving preferences…' });
  assert.match(saving, /Saving preferences/);
  assert.match(saving, /data-save-status="saving"/);
  const saved = renderNotificationPreferences({ preferences: {}, saveStatus: 'saved', saveMessage: 'Preferences saved.' });
  assert.match(saved, /Preferences saved/);
  assert.match(saved, /data-tone="ok"/);
  const error = renderNotificationPreferences({ preferences: {}, saveStatus: 'error', saveMessage: 'Could not save preferences. Check your connection and try again.' });
  assert.match(error, /Could not save preferences/);
  assert.match(error, /data-tone="error"/);
});

test('Phase 6.18.1 save flow does not swallow errors silently', () => {
  const main = read('src/main.js');
  assert.match(main, /saveNotificationPreferencesFromForm/);
  assert.match(main, /notificationPreferenceStatus = 'saving'/);
  assert.match(main, /notificationPreferenceStatus = 'saved'/);
  assert.match(main, /notificationPreferenceStatus = 'error'/);
  // The save handler surfaces a visible error message rather than swallowing it.
  const saveBlock = main.slice(main.indexOf('async function saveNotificationPreferencesFromForm'), main.indexOf('async function sendTestNotificationFromClick'));
  assert.match(saveBlock, /Could not save preferences/);
  assert.doesNotMatch(saveBlock, /\/\* best effort \*\//);
});

/* ── 3. API persistence ── */

test('Phase 6.18.1 preference save + test use the consolidated community route via authFetch', () => {
  const main = read('src/main.js');
  assert.match(main, /authFetch\(/);
  assert.match(main, /\/api\/community\?route=notification-preferences/);
  assert.match(main, /\/api\/community\?route=send-test-notification/);
  // Token is obtained via authFetch (auth.js), never rendered/logged in main.
  assert.doesNotMatch(main, /getIdToken\(\)[\s\S]{0,40}(innerHTML|textContent)/);
});

test('Phase 6.18.1 api dir unchanged (3 routers) and functions < 12', () => {
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(Object.keys(vercel.functions || {}).length < 12);
  const names = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_')).map(e => e.name).sort();
  assert.deepEqual(names, ['ai.js', 'community.js', 'voice.js']);
});

/* ── 4. Test notification UI ── */

test('Phase 6.18.1 send-test button shown only when signed in; renders safe result', () => {
  const out = renderNotificationPreferences({ preferences: {}, signedIn: true });
  assert.match(out, /data-action="send-test-notification"/);
  assert.match(out, /Send test notification/);
  assert.doesNotMatch(renderNotificationPreferences({ preferences: {}, signedIn: false }), /data-action="send-test-notification"/);

  const sent = renderNotificationPreferences({ preferences: {}, signedIn: true, testStatus: 'done', testResult: { pushAttempted: true, pushSent: 1 } });
  assert.match(sent, /Browser push sent/);
  const blocked = renderNotificationPreferences({ preferences: {}, signedIn: true, testStatus: 'done', testResult: { pushAttempted: true, pushSent: 0, pushDisabledReason: 'no_subscription' } });
  assert.match(blocked, /not subscribed yet/i);
  // Never renders raw subscription endpoint/keys.
  assert.doesNotMatch(sent + blocked, /endpoint|p256dh|"auth"/);
});

test('Phase 6.18.1 disabledReasonCopy maps every server reason to safe copy', () => {
  assert.match(disabledReasonCopy('web_push_disabled'), /off in your preferences/i);
  assert.match(disabledReasonCopy('not_configured'), /not configured on the server/i);
  assert.match(disabledReasonCopy('no_subscription'), /not subscribed yet/i);
  assert.match(disabledReasonCopy('quiet_hours'), /quiet hours/i);
  assert.match(disabledReasonCopy('preference_off'), /disabled/i);
  assert.match(disabledReasonCopy('web_push_not_installed'), /not available/i);
  assert.match(disabledReasonCopy('error'), /could not be sent/i);
});

/* ── 5. Browser push diagnostics ── */

test('Phase 6.18.1 diagnostics distinguish support/permission/client/server/subscription', () => {
  const denied = renderNotificationPreferences({ preferences: {}, pushState: 'denied', pushConfigured: true });
  assert.match(denied, /Permission/);
  assert.match(denied, /denied/);
  const missingClient = renderNotificationPreferences({ preferences: {}, pushState: 'default', pushConfigured: false });
  assert.match(missingClient, /VITE_WEB_PUSH_PUBLIC_VAPID_KEY/);
  assert.match(missingClient, /Client VAPID key/);
  const unknownServer = renderNotificationPreferences({ preferences: {}, pushConfigured: true, serverPushConfigured: null });
  assert.match(unknownServer, /Server push/);
  assert.match(unknownServer, /unknown/);
  const missingServer = renderNotificationPreferences({ preferences: {}, pushConfigured: true, serverPushConfigured: false });
  assert.match(missingServer, /Server push[\s\S]*?missing/);
  const noSub = renderNotificationPreferences({ preferences: {}, pushConfigured: true, subscriptionState: 'missing' });
  assert.match(noSub, /Subscription/);
});

/* ── 6. Daily reminder scheduler clarity ── */

test('Phase 6.18.1 daily reminders are not falsely claimed automatic', () => {
  const out = renderNotificationPreferences({ preferences: {} });
  assert.match(out, /Scheduled delivery requires the notification scheduler/i);
  const doc = read('docs/cross-platform-notification-system.md');
  assert.match(doc, /scheduler|cron/i);
});

/* ── 7. Phase 7.0 regression protection ── */

test('Phase 6.18.1 Phase 7.0 adaptive planning remains wired and intact', () => {
  for (const rel of [
    'src/adaptive-planning-model.js', 'src/adaptive-planning-policy.js', 'src/adaptive-planning-context.js',
    'src/adaptive-planning-drafts.js', 'src/adaptive-planning-db.js',
    'src/views/adaptive-planning-panel.js', 'src/views/adaptive-planning-review.js',
    'server/api-handlers/adapt-path.js', 'server/adaptive-planning-service.js', 'server/adaptive-planning-sanitizer.js',
    'apps/mobile/src/core/mobileAdaptivePlanning.js', 'apps/mobile/src/screens/AdaptivePlanningScreen.js',
    'tests/phase-7.0-rolling-adaptive-planning.test.js',
  ]) {
    assert.equal(existsSync(resolve(root, rel)), true, rel);
  }
  assert.match(read('api/ai.js'), /adapt-path/);
  // Adaptive controller + click handlers preserved in main.js.
  const main = read('src/main.js');
  assert.match(main, /refreshAdaptivePlan/);
  assert.match(main, /handleAdaptiveAction/);
  assert.match(main, /apply-adaptation/);
  // 7.0 test still registered.
  assert.match(read('package.json'), /phase-7\.0-rolling-adaptive-planning\.test\.js/);
});

test('Phase 6.18.1 adaptive sanitizer still strips private fields; drafts not auto-applied', () => {
  const sanitizer = read('server/adaptive-planning-sanitizer.js');
  for (const k of ['proofBody', 'reflection', 'evidenceUrl', 'storagePath', 'token', 'password']) {
    assert.match(sanitizer, new RegExp(k));
  }
  // adapt-path handler returns applied:false.
  assert.match(read('server/api-handlers/adapt-path.js'), /applied:\s*false/);
});

/* ── 8. No forbidden behavior ── */

test('Phase 6.18.1 no social/economy/analytics/email-SMS added; admin pinned', () => {
  for (const rel of ['src/views/notification-preferences.js', 'src/main.js', 'src/ui/core-layout.js']) {
    const src = read(rel);
    assert.doesNotMatch(src, /\bfollowers?\b|\bfollowing\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy/i, rel);
    assert.doesNotMatch(src, /twilio|sendgrid|mailgun|nodemailer|@segment|mixpanel|amplitude\.com|google-analytics|gtag\(/i, rel);
  }
  assert.equal(JSON.parse(read('package.json')).dependencies['firebase-admin'], '13.10.0');
});

test('Phase 6.18.1 storage rules unchanged shape; firestore rules still owner-only', () => {
  assert.doesNotMatch(read('storage.rules'), /match \/\{allPaths=\*\*\}/);
  assert.match(read('firestore.rules'), /match \/users\/\{uid\}\/\{document=\*\*\}/);
});
