// ── notification-preferences-model.js ───────────────────────────────────────
// Pure notification-preferences model: defaults, normalization and validation.
// No DOM, no Firebase, no side effects.
//
// Safety defaults: in-app on; browser push OFF; mobile local OFF; daily
// reminders OFF (never schedule without explicit opt-in). Quiet hours suppress
// push/mobile delivery but in-app notifications may still be stored.

export const NOTIFICATION_PREFERENCES_SCHEMA_VERSION = 1;

export const NOTIFICATION_PREFERENCE_DEFAULTS = Object.freeze({
  inAppEnabled: true,
  webPushEnabled: false,
  mobileLocalEnabled: false,
  dailyReminderEnabled: false,
  dailyReminderTime: '09:00',
  streakRiskEnabled: true,
  missedDayEnabled: true,
  proofUploadEnabled: true,
  publicProgressInteractionEnabled: true,
  moderationUpdatesEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezone: '',
});

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
// IANA-style timezone (e.g. "Europe/London", "UTC", "America/Sao_Paulo").
const TZ_RE = /^[A-Za-z]+(?:[_-][A-Za-z]+)*(?:\/[A-Za-z0-9]+(?:[_+-][A-Za-z0-9]+)*)*$/;

export function isValidReminderTime(value) {
  return TIME_RE.test(String(value || ''));
}

export function sanitizeTimezone(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  if (text.length > 64) return '';
  return TZ_RE.test(text) ? text : '';
}

function cleanTime(value, fallback) {
  return isValidReminderTime(value) ? String(value) : fallback;
}

function cleanBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function cleanTimestamp(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Normalize arbitrary input into a complete, validated preferences document.
// Invalid times fall back to the safe default; invalid timezone becomes ''.
export function normalizeNotificationPreferences(input = {}, uid = '') {
  const source = input && typeof input === 'object' ? input : {};
  const d = NOTIFICATION_PREFERENCE_DEFAULTS;
  return {
    uid: String(source.uid || uid || '').trim().slice(0, 128),
    inAppEnabled: cleanBool(source.inAppEnabled, d.inAppEnabled),
    webPushEnabled: cleanBool(source.webPushEnabled, d.webPushEnabled),
    mobileLocalEnabled: cleanBool(source.mobileLocalEnabled, d.mobileLocalEnabled),
    dailyReminderEnabled: cleanBool(source.dailyReminderEnabled, d.dailyReminderEnabled),
    dailyReminderTime: cleanTime(source.dailyReminderTime, d.dailyReminderTime),
    streakRiskEnabled: cleanBool(source.streakRiskEnabled, d.streakRiskEnabled),
    missedDayEnabled: cleanBool(source.missedDayEnabled, d.missedDayEnabled),
    proofUploadEnabled: cleanBool(source.proofUploadEnabled, d.proofUploadEnabled),
    publicProgressInteractionEnabled: cleanBool(
      source.publicProgressInteractionEnabled, d.publicProgressInteractionEnabled),
    moderationUpdatesEnabled: cleanBool(source.moderationUpdatesEnabled, d.moderationUpdatesEnabled),
    quietHoursEnabled: cleanBool(source.quietHoursEnabled, d.quietHoursEnabled),
    quietHoursStart: cleanTime(source.quietHoursStart, d.quietHoursStart),
    quietHoursEnd: cleanTime(source.quietHoursEnd, d.quietHoursEnd),
    timezone: sanitizeTimezone(source.timezone),
    updatedAt: cleanTimestamp(source.updatedAt, Date.now()),
    schemaVersion: Number(source.schemaVersion) || NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
  };
}

export function defaultNotificationPreferences(uid = '') {
  return normalizeNotificationPreferences({}, uid);
}

// Whether a given notification type is enabled by the user's category toggles.
// In-app storage is governed separately by inAppEnabled.
export function notificationTypeEnabled(preferences, type) {
  const p = normalizeNotificationPreferences(preferences || {});
  switch (type) {
    case 'daily_reminder': return p.dailyReminderEnabled;
    case 'streak_risk': return p.streakRiskEnabled;
    case 'missed_day': return p.missedDayEnabled;
    case 'freeze_available': return p.missedDayEnabled;
    case 'proof_upload_pending':
    case 'proof_upload_failed': return p.proofUploadEnabled;
    case 'public_progress_published':
    case 'public_progress_reaction':
    case 'public_progress_comment': return p.publicProgressInteractionEnabled;
    case 'moderation_update': return p.moderationUpdatesEnabled;
    case 'day_synced':
    case 'path_milestone':
    case 'system':
    default:
      return true;
  }
}

export default {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
  isValidReminderTime,
  sanitizeTimezone,
  normalizeNotificationPreferences,
  defaultNotificationPreferences,
  notificationTypeEnabled,
};
