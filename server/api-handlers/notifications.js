// ── server/api-handlers/notifications.js ────────────────────────────────────
// Consolidated notification endpoints, mounted inside the existing community
// router (api/community.js) — NO new top-level Vercel function is added.
//
// Routes (via ?route=):
//   list-notifications              GET   auth
//   mark-notification-read          POST  auth
//   mark-all-notifications-read     POST  auth
//   notification-preferences        GET/POST auth
//   save-push-subscription          POST  auth
//   delete-push-subscription        POST  auth
//   send-test-notification          POST  auth   (current user only)
//   run-notification-scheduler      POST  CRON_SECRET (no user data exposed)
//
// All user endpoints require auth and only ever touch the caller's own
// users/{uid}/** space. Notifications never carry tokens or private proof.

import { createRouteLogger } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { requireJsonBody, boundedText } from '../../api/_lib/http.js';
import { getAdminFirestore } from '../../api/_lib/firebase-admin.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';
import { normalizeNotification, notificationIsUnread, notificationPublicSafeView } from '../../src/notification-model.js';
import {
  normalizeNotificationPreferences, defaultNotificationPreferences,
} from '../../src/notification-preferences-model.js';
import { createUserNotification, markNotificationServerRead } from '../notification-service.js';
import { getPublicVapidKey, webPushConfigured } from '../web-push-service.js';

function userCol(db, uid, sub) {
  return db.collection('users').doc(uid).collection(sub);
}

function safeId(value, max = 240) {
  return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, max);
}

async function readNotifications(db, uid) {
  const snap = await userCol(db, uid, 'notifications').get();
  const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
  return docs
    .map(d => normalizeNotification({ id: d.id, ...(typeof d.data === 'function' ? d.data() : {}) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

// GET list-notifications
export function createListNotificationsHandler({ authenticate = requireAuth, db = null, logger = console } = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    const log = createRouteLogger('list-notifications', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try {
      const auth = await authenticate(req);
      if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET'); throw apiError('method_not_allowed', 'GET only.', 405);
      }
      const firestore = db || getAdminFirestore();
      const all = await readNotifications(firestore, auth.uid);
      const visible = all.filter(n => !n.archived);
      log.event('list_notifications_ok', { count: visible.length });
      return sendPrivateJson(res, 200, {
        ok: true,
        notifications: visible.map(notificationPublicSafeView),
        unreadCount: visible.filter(notificationIsUnread).length,
      }, requestId);
    } catch (error) {
      return sendApiError(res, error, requestId);
    }
  };
}

// POST mark-notification-read { notificationId, read? }
export function createMarkNotificationReadHandler({ authenticate = requireAuth, rateLimit = enforceRateLimit, db = null, logger = console } = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    setPrivateNoStore(res, requestId);
    try {
      const auth = await authenticate(req);
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw apiError('method_not_allowed', 'POST only.', 405); }
      const body = requireJsonBody(req, 4 * 1024);
      const notificationId = safeId(boundedText(body.notificationId, 'notificationId', 240, { required: true }));
      await rateLimit(auth.uid, 'notificationWrite');
      const firestore = db || getAdminFirestore();
      await markNotificationServerRead({ adminDb: firestore, uid: auth.uid, notificationId, read: body.read !== false });
      return sendPrivateJson(res, 200, { ok: true, notificationId }, requestId);
    } catch (error) {
      return sendApiError(res, error, requestId);
    }
  };
}

// POST mark-all-notifications-read
export function createMarkAllNotificationsReadHandler({ authenticate = requireAuth, rateLimit = enforceRateLimit, db = null } = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    setPrivateNoStore(res, requestId);
    try {
      const auth = await authenticate(req);
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw apiError('method_not_allowed', 'POST only.', 405); }
      await rateLimit(auth.uid, 'notificationWrite');
      const firestore = db || getAdminFirestore();
      const all = await readNotifications(firestore, auth.uid);
      const unread = all.filter(notificationIsUnread);
      for (const n of unread) {
        // eslint-disable-next-line no-await-in-loop
        await markNotificationServerRead({ adminDb: firestore, uid: auth.uid, notificationId: n.id, read: true });
      }
      return sendPrivateJson(res, 200, { ok: true, marked: unread.length }, requestId);
    } catch (error) {
      return sendApiError(res, error, requestId);
    }
  };
}

// GET/POST notification-preferences
export function createNotificationPreferencesHandler({ authenticate = requireAuth, rateLimit = enforceRateLimit, db = null } = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    setPrivateNoStore(res, requestId);
    try {
      const auth = await authenticate(req);
      const firestore = db || getAdminFirestore();
      const ref = userCol(firestore, auth.uid, 'notificationPreferences').doc('main');
      if (req.method === 'GET') {
        const snap = await ref.get();
        const data = snap && snap.exists ? (typeof snap.data === 'function' ? snap.data() : {}) : null;
        const preferences = data
          ? normalizeNotificationPreferences({ ...data, uid: auth.uid }, auth.uid)
          : defaultNotificationPreferences(auth.uid);
        return sendPrivateJson(res, 200, { ok: true, preferences }, requestId);
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); throw apiError('method_not_allowed', 'GET or POST only.', 405); }
      const body = requireJsonBody(req, 4 * 1024);
      await rateLimit(auth.uid, 'notificationWrite');
      const preferences = normalizeNotificationPreferences(
        { ...(body.preferences || body), uid: auth.uid, updatedAt: Date.now() }, auth.uid);
      await ref.set(preferences, { merge: true });
      return sendPrivateJson(res, 200, { ok: true, preferences }, requestId);
    } catch (error) {
      return sendApiError(res, error, requestId);
    }
  };
}

// POST save-push-subscription { subscription }
export function createSavePushSubscriptionHandler({ authenticate = requireAuth, rateLimit = enforceRateLimit, db = null } = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    setPrivateNoStore(res, requestId);
    try {
      const auth = await authenticate(req);
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw apiError('method_not_allowed', 'POST only.', 405); }
      const body = requireJsonBody(req, 8 * 1024);
      const subscription = body.subscription && typeof body.subscription === 'object' ? body.subscription : {};
      const endpoint = boundedText(subscription.endpoint, 'subscription.endpoint', 2048, { required: true });
      await rateLimit(auth.uid, 'notificationWrite');
      const subscriptionId = pushSubscriptionId(endpoint);
      const record = {
        subscriptionId,
        endpoint,
        keys: subscription.keys && typeof subscription.keys === 'object'
          ? { p256dh: String(subscription.keys.p256dh || '').slice(0, 256), auth: String(subscription.keys.auth || '').slice(0, 256) }
          : {},
        expirationTime: subscription.expirationTime != null ? subscription.expirationTime : null,
        platform: 'web',
        updatedAt: Date.now(),
      };
      const firestore = db || getAdminFirestore();
      await userCol(firestore, auth.uid, 'pushSubscriptions').doc(subscriptionId).set(record, { merge: true });
      return sendPrivateJson(res, 200, { ok: true, subscriptionId }, requestId);
    } catch (error) {
      return sendApiError(res, error, requestId);
    }
  };
}

// POST delete-push-subscription { subscriptionId }
export function createDeletePushSubscriptionHandler({ authenticate = requireAuth, rateLimit = enforceRateLimit, db = null } = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    setPrivateNoStore(res, requestId);
    try {
      const auth = await authenticate(req);
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw apiError('method_not_allowed', 'POST only.', 405); }
      const body = requireJsonBody(req, 4 * 1024);
      const subscriptionId = safeId(boundedText(body.subscriptionId, 'subscriptionId', 240, { required: true }));
      await rateLimit(auth.uid, 'notificationWrite');
      const firestore = db || getAdminFirestore();
      await userCol(firestore, auth.uid, 'pushSubscriptions').doc(subscriptionId).delete();
      return sendPrivateJson(res, 200, { ok: true, subscriptionId }, requestId);
    } catch (error) {
      return sendApiError(res, error, requestId);
    }
  };
}

// POST send-test-notification — creates an in-app notification for the CURRENT
// user only. Never targets another user. Reports whether push is configured.
export function createSendTestNotificationHandler({ authenticate = requireAuth, rateLimit = enforceRateLimit, db = null, env = process.env } = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    setPrivateNoStore(res, requestId);
    try {
      const auth = await authenticate(req);
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw apiError('method_not_allowed', 'POST only.', 405); }
      await rateLimit(auth.uid, 'notificationTest');
      const firestore = db || getAdminFirestore();
      const notification = await createUserNotification({
        adminDb: firestore,
        uid: auth.uid,
        notification: {
          type: 'system',
          title: 'Test notification',
          body: 'This is a test notification from Learn Path Tracker.',
          uniqueSuffix: Date.now().toString(36),
        },
      });
      return sendPrivateJson(res, 200, {
        ok: true,
        notification: notificationPublicSafeView(notification),
        webPushConfigured: webPushConfigured(env),
        publicVapidKey: getPublicVapidKey(env),
      }, requestId);
    } catch (error) {
      return sendApiError(res, error, requestId);
    }
  };
}

// POST run-notification-scheduler — secured by CRON_SECRET, no user data
// exposed. The pure scheduler logic lives in src/notification-scheduler.js;
// fan-out delivery to opted-in users requires a Vercel Cron trigger + a user
// index and is documented as the deployment step (see the docs).
export function createRunNotificationSchedulerHandler({ env = process.env } = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    setPrivateNoStore(res, requestId);
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw apiError('method_not_allowed', 'POST only.', 405); }
      const secret = String(env.CRON_SECRET || '');
      const provided = String(req.headers?.['x-cron-secret'] || req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
      if (!secret || provided !== secret) {
        throw apiError('unauthorized', 'A valid cron secret is required.', 401);
      }
      // No-op by default; the cron entry point is secured and ready. Returns a
      // summary only — never any user data.
      return sendPrivateJson(res, 200, { ok: true, processed: 0, configured: !!secret }, requestId);
    } catch (error) {
      return sendApiError(res, error, requestId);
    }
  };
}

// Local copy of the id derivation (kept in sync with src/notification-db.js).
function pushSubscriptionId(endpoint) {
  const text = String(endpoint || '');
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return 'sub_' + hash.toString(36);
}

export const listNotificationsHandler = createListNotificationsHandler();
export const markNotificationReadHandler = createMarkNotificationReadHandler();
export const markAllNotificationsReadHandler = createMarkAllNotificationsReadHandler();
export const notificationPreferencesHandler = createNotificationPreferencesHandler();
export const savePushSubscriptionHandler = createSavePushSubscriptionHandler();
export const deletePushSubscriptionHandler = createDeletePushSubscriptionHandler();
export const sendTestNotificationHandler = createSendTestNotificationHandler();
export const runNotificationSchedulerHandler = createRunNotificationSchedulerHandler();

export default {
  listNotificationsHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
  notificationPreferencesHandler,
  savePushSubscriptionHandler,
  deletePushSubscriptionHandler,
  sendTestNotificationHandler,
  runNotificationSchedulerHandler,
};
