// ── notification-db.js ──────────────────────────────────────────────────────
// Web client persistence for notifications, preferences and push subscriptions.
// Thin wrapper over the injected Firestore client (`fb`). All reads/writes stay
// inside the signed-in user's own owner-only space:
//
//   users/{uid}/notifications/{notificationId}
//   users/{uid}/notificationPreferences/main
//   users/{uid}/pushSubscriptions/{subscriptionId}
//
// Dependency-injected `fb` keeps this unit-testable with no live Firebase.
// Notifications are normalized + sanitized on read so the UI never sees raw
// tokens or private proof fields.

import { fb as defaultFb } from './firebase.js';
import { normalizeNotification, notificationIsUnread } from './notification-model.js';
import {
  normalizeNotificationPreferences, defaultNotificationPreferences,
} from './notification-preferences-model.js';

function notificationsCol(fb, uid) {
  return fb.collection(fb.db, 'users', uid, 'notifications');
}
function notificationRef(fb, uid, id) {
  return fb.doc(fb.db, 'users', uid, 'notifications', id);
}
function preferencesRef(fb, uid) {
  return fb.doc(fb.db, 'users', uid, 'notificationPreferences', 'main');
}
function subscriptionRef(fb, uid, subscriptionId) {
  return fb.doc(fb.db, 'users', uid, 'pushSubscriptions', subscriptionId);
}

function snapToNotification(docSnap) {
  const data = typeof docSnap.data === 'function' ? docSnap.data() : (docSnap.data || {});
  return normalizeNotification({ id: docSnap.id, ...data });
}

// List the user's notifications, newest first. Options: { includeArchived,
// limit }. Archived notifications are excluded unless explicitly requested.
export async function listNotifications(uid, { fb = defaultFb, includeArchived = false, limit = 50 } = {}) {
  if (!uid || !fb.firestoreReady) return [];
  const snap = await fb.getDocs(notificationsCol(fb, uid));
  const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
  let items = docs.map(snapToNotification);
  if (!includeArchived) items = items.filter(n => !n.archived);
  items.sort((a, b) => b.createdAt - a.createdAt);
  return typeof limit === 'number' && limit > 0 ? items.slice(0, limit) : items;
}

export async function getUnreadNotificationCount(uid, { fb = defaultFb } = {}) {
  const items = await listNotifications(uid, { fb, includeArchived: false, limit: 0 });
  return items.filter(notificationIsUnread).length;
}

export async function markNotificationRead(uid, notificationId, { fb = defaultFb, read = true, now = Date.now() } = {}) {
  if (!uid || !notificationId) return false;
  await fb.setDoc(notificationRef(fb, uid, notificationId), { read: !!read, updatedAt: now }, { merge: true });
  return true;
}

export async function markAllNotificationsRead(uid, { fb = defaultFb, now = Date.now() } = {}) {
  if (!uid || !fb.firestoreReady) return 0;
  const items = await listNotifications(uid, { fb, includeArchived: true, limit: 0 });
  const unread = items.filter(notificationIsUnread);
  for (const n of unread) {
    await fb.setDoc(notificationRef(fb, uid, n.id), { read: true, updatedAt: now }, { merge: true });
  }
  return unread.length;
}

export async function archiveNotification(uid, notificationId, { fb = defaultFb, now = Date.now() } = {}) {
  if (!uid || !notificationId) return false;
  await fb.setDoc(notificationRef(fb, uid, notificationId),
    { archived: true, read: true, updatedAt: now }, { merge: true });
  return true;
}

export async function loadNotificationPreferences(uid, { fb = defaultFb } = {}) {
  if (!uid || !fb.firestoreReady) return defaultNotificationPreferences(uid);
  const snap = await fb.getDoc(preferencesRef(fb, uid));
  const data = snap && snap.exists && snap.exists() ? snap.data() : null;
  return data ? normalizeNotificationPreferences({ ...data, uid }, uid) : defaultNotificationPreferences(uid);
}

export async function saveNotificationPreferences(uid, preferences, { fb = defaultFb, now = Date.now() } = {}) {
  if (!uid) throw Object.assign(new Error('Sign in required'), { code: 'unauthenticated' });
  const normalized = normalizeNotificationPreferences({ ...preferences, uid, updatedAt: now }, uid);
  await fb.setDoc(preferencesRef(fb, uid), normalized, { merge: true });
  return normalized;
}

// Push subscription metadata only. The browser PushSubscription JSON carries an
// endpoint + keys; we store it as-is for the server to send pushes, but never a
// Firebase ID token, password, or any private proof. The id is derived from the
// endpoint so re-subscribing is idempotent.
export async function saveWebPushSubscription(uid, subscription, { fb = defaultFb, now = Date.now() } = {}) {
  if (!uid) throw Object.assign(new Error('Sign in required'), { code: 'unauthenticated' });
  const sub = subscription && typeof subscription === 'object' ? subscription : {};
  const endpoint = String(sub.endpoint || '').trim();
  if (!endpoint) throw Object.assign(new Error('Invalid subscription'), { code: 'invalid_subscription' });
  const subscriptionId = pushSubscriptionId(endpoint);
  const record = {
    subscriptionId,
    endpoint,
    keys: sub.keys && typeof sub.keys === 'object'
      ? { p256dh: String(sub.keys.p256dh || ''), auth: String(sub.keys.auth || '') }
      : {},
    expirationTime: sub.expirationTime != null ? sub.expirationTime : null,
    platform: 'web',
    createdAt: now,
    updatedAt: now,
  };
  await fb.setDoc(subscriptionRef(fb, uid, subscriptionId), record, { merge: true });
  return record;
}

export async function deleteWebPushSubscription(uid, subscriptionId, { fb = defaultFb } = {}) {
  if (!uid || !subscriptionId) return false;
  await fb.deleteDoc(subscriptionRef(fb, uid, subscriptionId));
  return true;
}

// Stable id from a subscription endpoint (id/path-safe, length-capped).
export function pushSubscriptionId(endpoint) {
  const text = String(endpoint || '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return 'sub_' + hash.toString(36);
}

export default {
  listNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  archiveNotification,
  loadNotificationPreferences,
  saveNotificationPreferences,
  saveWebPushSubscription,
  deleteWebPushSubscription,
  pushSubscriptionId,
};
