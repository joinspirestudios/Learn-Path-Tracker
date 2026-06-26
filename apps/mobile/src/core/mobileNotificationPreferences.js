// Mobile notification preferences (pure). Mirrors the web preferences model but
// belongs to the mobile skin so it has no web/DOM dependency. Safety defaults:
// in-app ON; mobile local notifications OFF; daily reminders OFF (never schedule
// without explicit opt-in). Quiet hours suppress local notifications.

export const MOBILE_NOTIFICATION_PREFERENCES_SCHEMA_VERSION = 1;

export const MOBILE_NOTIFICATION_PREFERENCE_DEFAULTS = Object.freeze({
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

export function isValidReminderTime(value) {
  return TIME_RE.test(String(value || ''));
}

export function sanitizeTimezone(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text || text.length > 64) return '';
  return /^[A-Za-z]+(?:[_-][A-Za-z]+)*(?:\/[A-Za-z0-9]+(?:[_+-][A-Za-z0-9]+)*)*$/.test(text) ? text : '';
}

function cleanBool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}
function cleanTime(value, fallback) {
  return isValidReminderTime(value) ? String(value) : fallback;
}

export function normalizeMobileNotificationPreferences(input = {}, uid = '') {
  const s = input && typeof input === 'object' ? input : {};
  const d = MOBILE_NOTIFICATION_PREFERENCE_DEFAULTS;
  return {
    uid: String(s.uid || uid || '').trim().slice(0, 128),
    inAppEnabled: cleanBool(s.inAppEnabled, d.inAppEnabled),
    webPushEnabled: cleanBool(s.webPushEnabled, d.webPushEnabled),
    mobileLocalEnabled: cleanBool(s.mobileLocalEnabled, d.mobileLocalEnabled),
    dailyReminderEnabled: cleanBool(s.dailyReminderEnabled, d.dailyReminderEnabled),
    dailyReminderTime: cleanTime(s.dailyReminderTime, d.dailyReminderTime),
    streakRiskEnabled: cleanBool(s.streakRiskEnabled, d.streakRiskEnabled),
    missedDayEnabled: cleanBool(s.missedDayEnabled, d.missedDayEnabled),
    proofUploadEnabled: cleanBool(s.proofUploadEnabled, d.proofUploadEnabled),
    publicProgressInteractionEnabled: cleanBool(s.publicProgressInteractionEnabled, d.publicProgressInteractionEnabled),
    moderationUpdatesEnabled: cleanBool(s.moderationUpdatesEnabled, d.moderationUpdatesEnabled),
    quietHoursEnabled: cleanBool(s.quietHoursEnabled, d.quietHoursEnabled),
    quietHoursStart: cleanTime(s.quietHoursStart, d.quietHoursStart),
    quietHoursEnd: cleanTime(s.quietHoursEnd, d.quietHoursEnd),
    timezone: sanitizeTimezone(s.timezone),
    updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : Date.now(),
    schemaVersion: Number(s.schemaVersion) || MOBILE_NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
  };
}

export function defaultMobileNotificationPreferences(uid = '') {
  return normalizeMobileNotificationPreferences({}, uid);
}

// Quiet-hours check (handles windows wrapping midnight). `now` is local time.
export function inQuietHours(preferences, now = new Date()) {
  const p = normalizeMobileNotificationPreferences(preferences || {});
  if (!p.quietHoursEnabled) return false;
  const parse = (v) => { const m = TIME_RE.exec(v); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const start = parse(p.quietHoursStart);
  const end = parse(p.quietHoursEnd);
  if (start == null || end == null || start === end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  return start < end ? (cur >= start && cur < end) : (cur >= start || cur < end);
}

export default {
  MOBILE_NOTIFICATION_PREFERENCE_DEFAULTS,
  MOBILE_NOTIFICATION_PREFERENCES_SCHEMA_VERSION,
  isValidReminderTime,
  sanitizeTimezone,
  normalizeMobileNotificationPreferences,
  defaultMobileNotificationPreferences,
  inQuietHours,
};
