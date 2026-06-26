// ── server/notification-service.js ──────────────────────────────────────────
// Server-side notification creation. Firebase Admin bypasses client rules, so
// this is the trusted path that creates event notifications under
// users/{uid}/notifications/{notificationId}. Clients never create arbitrary
// event notifications — they only mark read/archived.
//
// Idempotency: event notifications use a deterministic id derived from the
// event, so a repeated event updates (no-op) rather than spamming duplicates.

import {
  normalizeNotification, isAllowedNotificationType, sanitizeNotificationPayload,
} from '../src/notification-model.js';
import {
  normalizeNotificationPreferences, notificationTypeEnabled,
} from '../src/notification-preferences-model.js';
import { reminderFallsInQuietHours } from '../src/notification-scheduler.js';

function safeSegment(value, max = 200) {
  return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, max);
}

// Deterministic, id/path-safe notification id from event parts. Stable inputs
// produce a stable id → idempotent writes.
export function buildNotificationId(input = {}) {
  const type = isAllowedNotificationType(input.type) ? input.type : 'system';
  const parts = [type];
  for (const key of ['scopeId', 'entityId', 'sourceUserId', 'pathId', 'dayNumber', 'dateKey']) {
    if (input[key] != null && input[key] !== '') parts.push(safeSegment(input[key], 80));
  }
  if (parts.length === 1 && input.uniqueSuffix == null) {
    parts.push(Date.now().toString(36));
  }
  if (input.uniqueSuffix != null) parts.push(safeSegment(input.uniqueSuffix, 40));
  return parts.join('_').slice(0, 240);
}

function notificationDocRef(adminDb, uid, id) {
  return adminDb.collection('users').doc(uid).collection('notifications').doc(id);
}

// Create (or idempotently refresh) a single notification for a user. Returns
// the stored, normalized notification. Throws on missing uid/invalid type.
export async function createUserNotification({ adminDb, uid, notification, now = () => new Date() } = {}) {
  if (!adminDb) throw new Error('adminDb is required');
  if (!uid) throw new Error('uid is required');
  const safe = sanitizeNotificationPayload(notification || {});
  if (!isAllowedNotificationType(safe.type)) throw new Error('Unknown notification type');
  const createdAtMs = Date.now();
  const id = safe.id ? safeSegment(safe.id, 240) : buildNotificationId({ ...safe, type: safe.type });
  const normalized = normalizeNotification({
    ...safe, id, uid, createdAt: createdAtMs, updatedAt: createdAtMs, read: false, archived: false,
  });
  // Store with server timestamps for ordering; keep numeric mirrors for clients.
  const ref = notificationDocRef(adminDb, uid, id);
  await ref.set({
    ...normalized,
    serverCreatedAt: now(),
    serverUpdatedAt: now(),
  }, { merge: true });
  return normalized;
}

export async function createManyUserNotifications({ adminDb, notifications = [], now = () => new Date() } = {}) {
  const results = [];
  for (const entry of notifications) {
    if (!entry || !entry.uid) continue;
    // eslint-disable-next-line no-await-in-loop
    results.push(await createUserNotification({ adminDb, uid: entry.uid, notification: entry.notification || entry, now }));
  }
  return results;
}

export async function markNotificationServerRead({ adminDb, uid, notificationId, read = true, now = () => new Date() } = {}) {
  if (!adminDb || !uid || !notificationId) return false;
  await notificationDocRef(adminDb, uid, notificationId)
    .set({ read: !!read, updatedAt: Date.now(), serverUpdatedAt: now() }, { merge: true });
  return true;
}

// Whether a push (web or mobile) should be sent for a notification, honoring the
// user's preferences, the per-category toggle, and quiet hours. In-app storage
// is decided separately — quiet hours never block storing the in-app record.
export function notificationShouldSendPush({ preferences, notification, now = new Date() } = {}) {
  const prefs = normalizeNotificationPreferences(preferences || {});
  const type = notification && notification.type;
  if (!isAllowedNotificationType(type)) return false;
  if (!prefs.webPushEnabled && !prefs.mobileLocalEnabled) return false;
  if (!notificationTypeEnabled(prefs, type)) return false;
  if (reminderFallsInQuietHours({ preferences: prefs, now })) return false;
  return true;
}

export default {
  buildNotificationId,
  createUserNotification,
  createManyUserNotifications,
  markNotificationServerRead,
  notificationShouldSendPush,
};
