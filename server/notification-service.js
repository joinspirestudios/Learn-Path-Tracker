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
import { webPushConfigured, sendWebPushToSubscriptions } from './web-push-service.js';

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

// Load the user's stored web push subscriptions (owner-only space). Returns an
// array of { subscriptionId, endpoint, keys, ... } — never exposed to clients.
async function loadUserPushSubscriptions(adminDb, uid) {
  const snap = await adminDb.collection('users').doc(uid).collection('pushSubscriptions').get();
  const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
  return docs.map(d => {
    const data = typeof d.data === 'function' ? d.data() : (d.data || {});
    return { subscriptionId: d.id, ...data };
  });
}

// Load the user's notification preferences (owner-only). Falls back to safe
// defaults (push OFF) when absent.
async function loadUserPreferences(adminDb, uid) {
  try {
    const snap = await adminDb.collection('users').doc(uid).collection('notificationPreferences').doc('main').get();
    const data = snap && snap.exists ? (typeof snap.data === 'function' ? snap.data() : {}) : null;
    return normalizeNotificationPreferences({ ...(data || {}), uid }, uid);
  } catch {
    return normalizeNotificationPreferences({ uid }, uid);
  }
}

async function deleteExpiredSubscriptions(adminDb, uid, expiredIds) {
  for (const subscriptionId of expiredIds || []) {
    if (!subscriptionId) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await adminDb.collection('users').doc(uid).collection('pushSubscriptions').doc(String(subscriptionId)).delete();
    } catch { /* best effort cleanup */ }
  }
}

// Attempt to deliver a browser push for `notification` to the user's stored
// subscriptions. Honors preferences + quiet hours via notificationShouldSendPush
// and graceful-degrades when web push is not configured. NEVER throws and never
// exposes subscription details. Returns { sent, expired, disabledReason }.
export async function deliverUserPushNotifications({
  adminDb, uid, notification, preferences = null, env = process.env, webpush = null, now = new Date(),
} = {}) {
  const result = { sent: 0, expired: 0, disabledReason: null };
  try {
    if (!adminDb || !uid || !notification) { result.disabledReason = 'invalid_request'; return result; }
    const prefs = preferences || await loadUserPreferences(adminDb, uid);
    if (!prefs.webPushEnabled) { result.disabledReason = 'web_push_disabled'; return result; }
    if (!notificationShouldSendPush({ preferences: prefs, notification, now })) {
      // Either a disabled category or quiet hours suppressed the push.
      result.disabledReason = reminderFallsInQuietHours({ preferences: prefs, now }) ? 'quiet_hours' : 'preference_off';
      return result;
    }
    if (!webPushConfigured(env)) { result.disabledReason = 'not_configured'; return result; }
    const subscriptions = await loadUserPushSubscriptions(adminDb, uid);
    if (!subscriptions.length) { result.disabledReason = 'no_subscription'; return result; }
    const { sent, expired } = await sendWebPushToSubscriptions({ subscriptions, notification, env, webpush });
    result.sent = sent;
    result.expired = (expired || []).length;
    if (expired && expired.length) await deleteExpiredSubscriptions(adminDb, uid, expired);
    return result;
  } catch {
    // Push is best-effort; never let delivery failures bubble up.
    result.disabledReason = result.disabledReason || 'error';
    return result;
  }
}

export default {
  buildNotificationId,
  createUserNotification,
  createManyUserNotifications,
  markNotificationServerRead,
  notificationShouldSendPush,
  deliverUserPushNotifications,
};
