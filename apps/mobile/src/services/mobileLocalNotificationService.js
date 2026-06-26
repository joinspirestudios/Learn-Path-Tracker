// Mobile local notification service — schedules on-device daily reminders and
// streak-risk nudges via expo-notifications. No remote push token is requested
// here (remote mobile push is deferred). Permission is requested ONLY when the
// user enables local notifications — never at import or app launch.
//
// `expo-notifications` is loaded lazily so this module stays importable in tests
// without the native dependency; tests inject a fake `notifications` module.

import { normalizeMobileNotificationPreferences, inQuietHours } from '../core/mobileNotificationPreferences.js';

const DAILY_REMINDER_ID_TAG = 'lpt-daily-reminder';

async function loadNotifications(injected) {
  if (injected) return injected;
  try {
    const mod = await import('expo-notifications');
    return mod.default || mod;
  } catch {
    return null;
  }
}

export function createMobileLocalNotificationService({ notifications = null } = {}) {
  let cachedScheduledId = null;

  async function getModule() {
    return loadNotifications(notifications);
  }

  return {
    // Whether local notifications are usable on this device.
    async isSupported() {
      const mod = await getModule();
      return !!mod;
    },

    // Requests OS permission. MUST be called from a user action (e.g. the user
    // toggling "mobile reminders" on). Returns true when granted.
    async requestPermission() {
      const mod = await getModule();
      if (!mod || typeof mod.requestPermissionsAsync !== 'function') return false;
      try {
        const result = await mod.requestPermissionsAsync();
        return !!(result && (result.granted || result.status === 'granted'));
      } catch {
        return false;
      }
    },

    // Schedule a daily reminder at the user's chosen time, honoring quiet hours.
    // Cancels any previously scheduled reminder first (idempotent). Returns the
    // scheduled id or null when disabled/unsupported/not permitted.
    async scheduleDailyReminder({ preferences, now = new Date() } = {}) {
      const prefs = normalizeMobileNotificationPreferences(preferences || {});
      const mod = await getModule();
      if (!mod || !prefs.mobileLocalEnabled || !prefs.dailyReminderEnabled) {
        await this.cancelDailyReminder();
        return null;
      }
      if (inQuietHours(prefs, now)) {
        // Respect quiet hours: do not surface a reminder right now.
        return null;
      }
      await this.cancelDailyReminder();
      const [hour, minute] = String(prefs.dailyReminderTime || '09:00').split(':').map(Number);
      try {
        cachedScheduledId = await mod.scheduleNotificationAsync({
          content: { title: 'Time for today', body: 'Keep your streak going — do today’s focus.' },
          trigger: { hour: hour || 9, minute: minute || 0, repeats: true },
        });
        return cachedScheduledId;
      } catch {
        return null;
      }
    },

    async cancelDailyReminder() {
      const mod = await getModule();
      if (!mod) return false;
      try {
        if (cachedScheduledId && typeof mod.cancelScheduledNotificationAsync === 'function') {
          await mod.cancelScheduledNotificationAsync(cachedScheduledId);
        } else if (typeof mod.cancelAllScheduledNotificationsAsync === 'function') {
          await mod.cancelAllScheduledNotificationsAsync();
        }
        cachedScheduledId = null;
        return true;
      } catch {
        return false;
      }
    },

    scheduledReminderId() {
      return cachedScheduledId;
    },
  };
}

export { DAILY_REMINDER_ID_TAG };
export default createMobileLocalNotificationService;
