// ── notification-scheduler.js ───────────────────────────────────────────────
// Pure scheduler helpers for daily reminders and streak-risk alerts. No timers,
// no Firebase, no side effects — actual delivery requires a cron/scheduled
// trigger (Vercel does not run continuously). See
// docs/cross-platform-notification-system.md for the cron setup.
//
// Times are local "HH:MM" strings. `now` is a Date interpreted in the user's
// local wall-clock (callers pass a Date already shifted to the user's tz, or
// accept server-local time as a documented approximation).

import { normalizeNotificationPreferences } from './notification-preferences-model.js';

function minutesOfDay(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  return d.getHours() * 60 + d.getMinutes();
}

function parseHm(value) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date || Date.now());
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

// True when `now` falls inside the user's quiet-hours window. Handles windows
// that wrap past midnight (e.g. 22:00 → 07:00). Disabled quiet hours → false.
export function reminderFallsInQuietHours({ preferences, now = new Date() } = {}) {
  const p = normalizeNotificationPreferences(preferences || {});
  if (!p.quietHoursEnabled) return false;
  const start = parseHm(p.quietHoursStart);
  const end = parseHm(p.quietHoursEnd);
  if (start == null || end == null || start === end) return false;
  const cur = minutesOfDay(now);
  if (start < end) return cur >= start && cur < end;
  // Wraps midnight: inside if after start OR before end.
  return cur >= start || cur < end;
}

// Whether a daily reminder is due now: opt-in, past the configured time, and
// not already sent today (tracked by the caller via lastReminderAt).
export function shouldSendDailyReminder({ preferences, now = new Date(), lastReminderAt = null } = {}) {
  const p = normalizeNotificationPreferences(preferences || {});
  if (!p.inAppEnabled || !p.dailyReminderEnabled) return false;
  const target = parseHm(p.dailyReminderTime);
  if (target == null) return false;
  if (minutesOfDay(now) < target) return false;
  // One reminder per local day.
  if (lastReminderAt != null) {
    const last = lastReminderAt instanceof Date ? lastReminderAt : new Date(lastReminderAt);
    if (dayKey(last) === dayKey(now)) return false;
  }
  return true;
}

// Whether a streak-risk alert should fire: opt-in, the user has an active
// streak, has not acted today, and we are inside the configured risk window
// (defaults to the evening if no time given). Quiet hours suppress push but the
// caller may still store the in-app notification.
export function shouldSendStreakRiskAlert({ preferences, pathState = {}, now = new Date() } = {}) {
  const p = normalizeNotificationPreferences(preferences || {});
  if (!p.inAppEnabled || !p.streakRiskEnabled) return false;
  const state = pathState && typeof pathState === 'object' ? pathState : {};
  if (!Number(state.currentStreak) || Number(state.currentStreak) <= 0) return false;
  if (state.completedToday === true) return false;
  if (state.lastActiveDayKey && state.lastActiveDayKey === dayKey(now)) return false;
  // Only warn late enough in the day to be meaningful (after 17:00 by default).
  const riskAfter = parseHm(state.riskAfterTime) ?? 17 * 60;
  return minutesOfDay(now) >= riskAfter;
}

// The next local datetime the daily reminder should fire (today if still ahead,
// otherwise tomorrow). Returns a Date or null when reminders are disabled.
export function nextReminderWindow(preferences, now = new Date()) {
  const p = normalizeNotificationPreferences(preferences || {});
  if (!p.dailyReminderEnabled) return null;
  const target = parseHm(p.dailyReminderTime);
  if (target == null) return null;
  const base = now instanceof Date ? new Date(now) : new Date(now);
  base.setSeconds(0, 0);
  base.setHours(Math.floor(target / 60), target % 60, 0, 0);
  if (base.getTime() <= (now instanceof Date ? now.getTime() : Date.now())) {
    base.setDate(base.getDate() + 1);
  }
  return base;
}

export { dayKey as reminderDayKey };

export default {
  reminderFallsInQuietHours,
  shouldSendDailyReminder,
  shouldSendStreakRiskAlert,
  nextReminderWindow,
};
