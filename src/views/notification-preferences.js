// ── views/notification-preferences.js ───────────────────────────────────────
// Pure HTML render helper for the notification preferences panel (Profile /
// Settings). Renders toggles for in-app, browser push, daily reminder + time,
// streak-risk, proof-upload, public-progress interaction, moderation updates and
// quiet hours — plus (Phase 6.18.1) a visible save status, a "Send test
// notification" control, browser-push diagnostics and a daily-reminder scheduler
// note. Never renders tokens, push endpoint keys, or private data.

import { esc } from '../helpers.js';
import { normalizeNotificationPreferences } from '../notification-preferences-model.js';

function toggleRow(key, label, description, checked) {
  return '<label class="aurora-pref-row" for="pref-' + esc(key) + '">'
    + '<span class="aurora-pref-text">'
    + '<span class="aurora-pref-label">' + esc(label) + '</span>'
    + (description ? '<span class="aurora-pref-desc">' + esc(description) + '</span>' : '')
    + '</span>'
    + '<input type="checkbox" id="pref-' + esc(key) + '" class="aurora-pref-toggle" data-pref="' + esc(key) + '"'
    + (checked ? ' checked' : '') + ' />'
    + '</label>';
}

function timeRow(key, label, value) {
  return '<label class="aurora-pref-row" for="pref-' + esc(key) + '">'
    + '<span class="aurora-pref-text"><span class="aurora-pref-label">' + esc(label) + '</span></span>'
    + '<input type="time" id="pref-' + esc(key) + '" class="aurora-pref-time" data-pref="' + esc(key) + '" value="' + esc(value) + '" />'
    + '</label>';
}

// pushState: 'unsupported' | 'denied' | 'granted' | 'default'
// pushConfigured: whether the CLIENT can subscribe (browser support + client
// VITE_WEB_PUSH_PUBLIC_VAPID_KEY present).
export function renderPushSection({ preferences, pushState = 'default', pushConfigured = true } = {}) {
  const p = normalizeNotificationPreferences(preferences || {});
  let note = '';
  let blocked = false; // no action possible
  let action = '';
  const enabledOn = p.webPushEnabled && pushState === 'granted' && pushConfigured;

  if (pushState === 'unsupported') {
    note = 'Browser notifications are not available in this browser.';
    blocked = true;
  } else if (!pushConfigured) {
    // Missing client VITE_WEB_PUSH_PUBLIC_VAPID_KEY (build-time) or unsupported.
    note = 'Browser push is not configured yet. Check VITE_WEB_PUSH_PUBLIC_VAPID_KEY and redeploy.';
    blocked = true;
  } else if (pushState === 'denied') {
    note = 'Browser notifications are blocked in your browser settings.';
    blocked = true;
  } else if (enabledOn) {
    note = 'Browser notifications are on.';
    action = '<button type="button" class="aurora-pref-push-disable" data-action="disable-web-push">Turn off browser push</button>';
  } else {
    note = 'Browser notifications are off.';
    action = '<button type="button" class="aurora-pref-push-enable" data-action="enable-web-push">Enable browser push</button>';
  }

  return '<div class="aurora-pref-push" data-push-state="' + esc(pushState) + '" data-push-configured="' + (pushConfigured ? 'true' : 'false') + '">'
    + toggleRow('webPushEnabled', 'Browser push notifications',
      'Get reminders even when the tab is closed.', enabledOn)
    + '<p class="aurora-pref-push-note"' + (blocked ? ' data-push-blocked="true"' : '') + '>' + esc(note) + '</p>'
    + action
    + '</div>';
}

const STATUS_LABEL = {
  unsupported: 'unsupported', denied: 'denied', granted: 'granted', default: 'not requested yet',
  configured: 'configured', missing: 'missing', unknown: 'unknown', active: 'active', sent: 'sent',
};

function diagRow(label, value) {
  return '<div class="aurora-pref-diag-row"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
}

// Safe, human-readable copy for each server-side push disabled reason.
const DISABLED_REASON_COPY = {
  web_push_disabled: 'Browser push is off in your preferences.',
  not_configured: 'Browser push is not configured on the server.',
  no_subscription: 'This browser is not subscribed yet. Turn browser push off and on again.',
  quiet_hours: 'Quiet hours are currently suppressing push notifications.',
  preference_off: 'This notification type is disabled.',
  web_push_not_installed: 'Push delivery package is not available.',
  error: 'Push could not be sent.',
};

export function disabledReasonCopy(reason) {
  return DISABLED_REASON_COPY[reason] || 'Push was not sent.';
}

// Browser-push diagnostics block: support / permission / client key / server /
// subscription / last test. Labels only — never endpoints, keys or tokens.
function renderPushDiagnostics({ pushState, pushConfigured, serverPushConfigured, subscriptionState, testResult }) {
  const support = pushState === 'unsupported' ? 'unsupported' : 'supported';
  const permission = STATUS_LABEL[pushState] || 'unknown';
  const clientKey = pushConfigured ? 'configured' : 'missing';
  const server = serverPushConfigured == null ? 'unknown' : (serverPushConfigured ? 'configured' : 'missing');
  const sub = STATUS_LABEL[subscriptionState] || 'unknown';
  let lastTest = 'not run yet';
  if (testResult) {
    if (testResult.pushSent) lastTest = 'sent';
    else if (testResult.pushDisabledReason) lastTest = disabledReasonCopy(testResult.pushDisabledReason);
    else lastTest = 'in-app only';
  }
  return '<div class="aurora-pref-diagnostics" aria-label="Browser push diagnostics">'
    + '<h3 class="aurora-pref-diag-title">Browser push status</h3>'
    + diagRow('Browser support', support)
    + diagRow('Permission', permission)
    + diagRow('Client VAPID key', clientKey)
    + diagRow('Server push', server)
    + diagRow('Subscription', sub)
    + diagRow('Last test push', lastTest)
    + (clientKey === 'missing'
      ? '<p class="aurora-pref-diag-hint">Set VITE_WEB_PUSH_PUBLIC_VAPID_KEY in your deploy and redeploy to enable browser push.</p>'
      : '')
    + '</div>';
}

function renderSaveStatus(saveStatus, saveMessage) {
  if (!saveMessage) return '';
  const tone = saveStatus === 'error' ? 'error' : (saveStatus === 'saved' ? 'ok' : 'pending');
  return '<p class="aurora-pref-save-status" role="status" data-save-status="' + esc(saveStatus || 'idle') + '" data-tone="' + esc(tone) + '">' + esc(saveMessage) + '</p>';
}

function renderTestSection({ signedIn, testStatus, testResult }) {
  if (!signedIn) return '';
  let result = '';
  if (testStatus === 'sending') {
    result = '<p class="aurora-pref-test-status" role="status">Sending test notification…</p>';
  } else if (testStatus === 'error') {
    result = '<p class="aurora-pref-test-status" data-tone="error" role="status">Could not send a test notification. Try again.</p>';
  } else if (testStatus === 'done' && testResult) {
    const line = testResult.pushSent
      ? 'In-app notification created. Browser push sent.'
      : (testResult.pushAttempted
        ? 'In-app notification created. Browser push not sent: ' + disabledReasonCopy(testResult.pushDisabledReason)
        : 'In-app notification created. Browser push not attempted: ' + disabledReasonCopy(testResult.pushDisabledReason));
    result = '<p class="aurora-pref-test-status" data-tone="ok" role="status">' + esc(line) + '</p>';
  }
  return '<div class="aurora-pref-test">'
    + '<button type="button" class="aurora-pref-test-btn" data-action="send-test-notification">Send test notification</button>'
    + result
    + '</div>';
}

// The full preferences panel. Defaults make push OFF and daily reminders OFF.
export function renderNotificationPreferences({
  preferences = {}, pushState = 'default', pushConfigured = true,
  signedIn = false, serverPushConfigured = null, subscriptionState = 'unknown',
  saveStatus = 'idle', saveMessage = '', testStatus = 'idle', testResult = null,
} = {}) {
  const p = normalizeNotificationPreferences(preferences);
  return '<section class="aurora-notification-prefs" aria-label="Notification preferences">'
    + '<header class="aurora-pref-header"><h2>Notifications</h2>'
    + '<p class="aurora-pref-sub">Choose what reaches you. We never send spam, and reminders are off until you turn them on.</p>'
    + '</header>'

    + '<fieldset class="aurora-pref-group"><legend>In your account</legend>'
    + toggleRow('inAppEnabled', 'In-app notifications', 'Show notifications in the app.', p.inAppEnabled)
    + '</fieldset>'

    + '<fieldset class="aurora-pref-group"><legend>Browser push</legend>'
    + renderPushSection({ preferences: p, pushState, pushConfigured })
    + renderPushDiagnostics({ pushState, pushConfigured, serverPushConfigured, subscriptionState, testResult })
    + renderTestSection({ signedIn, testStatus, testResult })
    + '</fieldset>'

    + '<fieldset class="aurora-pref-group"><legend>Reminders</legend>'
    + toggleRow('dailyReminderEnabled', 'Daily reminder', 'A gentle nudge to do today.', p.dailyReminderEnabled)
    + timeRow('dailyReminderTime', 'Reminder time', p.dailyReminderTime)
    + toggleRow('streakRiskEnabled', 'Streak-risk alerts', 'Warn me when my streak is at risk.', p.streakRiskEnabled)
    + toggleRow('missedDayEnabled', 'Missed-day alerts', 'Let me know when I miss a day.', p.missedDayEnabled)
    + '<p class="aurora-pref-scheduler-note">Daily reminders are saved here. Scheduled delivery requires the notification scheduler (cron) to be enabled on the server.</p>'
    + '</fieldset>'

    + '<fieldset class="aurora-pref-group"><legend>Proof & progress</legend>'
    + toggleRow('proofUploadEnabled', 'Proof upload alerts', 'Pending or failed proof uploads.', p.proofUploadEnabled)
    + toggleRow('publicProgressInteractionEnabled', 'Public progress interactions',
      'When someone respects or comments on your public progress.', p.publicProgressInteractionEnabled)
    + toggleRow('moderationUpdatesEnabled', 'Moderation updates', 'Reports and moderation outcomes.', p.moderationUpdatesEnabled)
    + '</fieldset>'

    + '<fieldset class="aurora-pref-group"><legend>Quiet hours</legend>'
    + toggleRow('quietHoursEnabled', 'Enable quiet hours', 'Pause push and reminders during these hours.', p.quietHoursEnabled)
    + timeRow('quietHoursStart', 'From', p.quietHoursStart)
    + timeRow('quietHoursEnd', 'To', p.quietHoursEnd)
    + '</fieldset>'

    + '<div class="aurora-pref-actions"><button type="button" class="aurora-pref-save" data-action="save-notification-preferences">Save preferences</button>'
    + renderSaveStatus(saveStatus, saveMessage)
    + '</div>'
    + '</section>';
}

export default { renderNotificationPreferences, renderPushSection, disabledReasonCopy };
