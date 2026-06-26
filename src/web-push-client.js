// ── web-push-client.js ──────────────────────────────────────────────────────
// Browser push subscription helpers. No permission is requested here and no
// work happens at import time — call subscribeToWebPush() only after the user
// has explicitly opted in (see web-push-permissions.js).
//
// The PushSubscription JSON carries an endpoint + public keys only. It never
// contains a Firebase ID token, password, or any private proof. The private
// VAPID key lives ONLY on the server; the client receives the public key.

import { browserSupportsPush } from './web-push-permissions.js';
import { registerLearnPathServiceWorker } from './service-worker-registration.js';

// Convert a base64url VAPID public key into the Uint8Array the Push API needs.
export function urlBase64ToUint8Array(base64String) {
  const input = String(base64String || '');
  const padding = '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = (input + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = typeof atob === 'function'
    ? atob(base64)
    : Buffer.from(base64, 'base64').toString('binary');
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export async function getExistingPushSubscription(scope = globalThis) {
  if (!browserSupportsPush(scope)) return null;
  try {
    const reg = await registerLearnPathServiceWorker(scope);
    if (!reg || !reg.pushManager) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

// Subscribe to web push. Requires the caller to have already obtained
// permission. Returns the subscription JSON (endpoint + keys) or null. Never
// throws and never returns private data.
export async function subscribeToWebPush({ publicVapidKey, scope = globalThis } = {}) {
  if (!browserSupportsPush(scope)) return null;
  if (!publicVapidKey) return null;
  if (scope.Notification && scope.Notification.permission !== 'granted') return null;
  try {
    const reg = await registerLearnPathServiceWorker(scope);
    if (!reg || !reg.pushManager) return null;
    const existing = await reg.pushManager.getSubscription();
    const subscription = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
    });
    return subscriptionToSafeJson(subscription);
  } catch {
    return null;
  }
}

export async function unsubscribeFromWebPush(subscription) {
  if (!subscription || typeof subscription.unsubscribe !== 'function') return false;
  try {
    return await subscription.unsubscribe();
  } catch {
    return false;
  }
}

// Project a PushSubscription into the safe JSON we persist: endpoint + public
// keys + expiration only. No tokens, no private user data.
export function subscriptionToSafeJson(subscription) {
  if (!subscription) return null;
  const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
  return {
    endpoint: String(json.endpoint || ''),
    expirationTime: json.expirationTime != null ? json.expirationTime : null,
    keys: json.keys && typeof json.keys === 'object'
      ? { p256dh: String(json.keys.p256dh || ''), auth: String(json.keys.auth || '') }
      : {},
  };
}

export default {
  urlBase64ToUint8Array,
  getExistingPushSubscription,
  subscribeToWebPush,
  unsubscribeFromWebPush,
  subscriptionToSafeJson,
};
