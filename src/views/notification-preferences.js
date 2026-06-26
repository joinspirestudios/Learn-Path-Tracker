// ── views/notification-preferences.js ───────────────────────────────────────
// Pure HTML render helper for the notification preferences panel (Profile /
// Settings). Renders toggles for in-app, browser push, daily reminder + time,
// streak-risk, proof-upload, public-progress interaction, moderation updates and
// quiet hours. Never renders tokens, push endpoint keys, or private data.

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
// pushConfigured: whether server VAPID keys are present.
// Distinguishes every browser-push state with clear, safe copy:
//   unsupported           → not available in this browser
//   client VAPID missing  → not configured yet (no enable button)
//   server not configured → not configured yet (no enable button)
//   permission denied     → blocked in browser settings (no enable button)
//   granted + enabled     → on, with a "Turn off browser push" button
//   granted/not-requested → off, with an "Enable browser push" button
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
    // Covers both a missing client VITE_WEB_PUSH_PUBLIC_VAPID_KEY and a server
    // that has no VAPID keys configured.
    note = 'Browser push is not configured yet.';
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

// The full preferences panel. Defaults make push OFF and daily reminders OFF.
export function renderNotificationPreferences({ preferences = {}, pushState = 'default', pushConfigured = true } = {}) {
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
    + '</fieldset>'

    + '<fieldset class="aurora-pref-group"><legend>Reminders</legend>'
    + toggleRow('dailyReminderEnabled', 'Daily reminder', 'A gentle nudge to do today.', p.dailyReminderEnabled)
    + timeRow('dailyReminderTime', 'Reminder time', p.dailyReminderTime)
    + toggleRow('streakRiskEnabled', 'Streak-risk alerts', 'Warn me when my streak is at risk.', p.streakRiskEnabled)
    + toggleRow('missedDayEnabled', 'Missed-day alerts', 'Let me know when I miss a day.', p.missedDayEnabled)
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

    + '<div class="aurora-pref-actions"><button type="button" class="aurora-pref-save" data-action="save-notification-preferences">Save preferences</button></div>'
    + '</section>';
}

export default { renderNotificationPreferences, renderPushSection };
