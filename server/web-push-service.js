// ── server/web-push-service.js ──────────────────────────────────────────────
// Server-side browser push delivery via the Web Push protocol (VAPID).
//
// Graceful degradation is a hard requirement: if the VAPID env vars are missing
// or the optional `web-push` package is not installed, push is DISABLED and
// in-app notifications keep working. Nothing here ever throws at import time.
//
// Env (never commit the private key):
//   WEB_PUSH_PUBLIC_VAPID_KEY   — safe to expose to the browser
//   WEB_PUSH_PRIVATE_VAPID_KEY  — server-only secret
//   WEB_PUSH_SUBJECT            — mailto: or https: contact, e.g. mailto:team@app

import { notificationPublicSafeView } from '../src/notification-model.js';

export function readVapidConfig(env = process.env) {
  return {
    publicKey: String(env.WEB_PUSH_PUBLIC_VAPID_KEY || '').trim(),
    privateKey: String(env.WEB_PUSH_PRIVATE_VAPID_KEY || '').trim(),
    subject: String(env.WEB_PUSH_SUBJECT || '').trim(),
  };
}

export function webPushConfigured(env = process.env) {
  const { publicKey, privateKey, subject } = readVapidConfig(env);
  return !!(publicKey && privateKey && subject);
}

// The public VAPID key is the ONLY VAPID value that may reach the client.
export function getPublicVapidKey(env = process.env) {
  return readVapidConfig(env).publicKey;
}

// Build the JSON the service worker will render. Public-safe by construction —
// it can never carry a token, Storage path, or private proof body.
export function buildPushPayload(notification = {}) {
  const safe = notificationPublicSafeView(notification);
  return {
    title: safe.title,
    body: safe.body,
    type: safe.type,
    actionUrl: safe.actionUrl,
    icon: '/icon-192.png',
    badge: '/badge-72.png',
    tag: safe.id || safe.type,
  };
}

// Lazily load the optional `web-push` package. Returns null when it is not
// installed so callers can degrade gracefully instead of crashing.
async function loadWebPush(injected) {
  if (injected) return injected;
  try {
    const mod = await import('web-push');
    return mod.default || mod;
  } catch {
    return null;
  }
}

// Send a single push. Returns a result object; never throws. On a gone/expired
// endpoint (404/410) returns { ok:false, gone:true } so the caller can prune the
// stored subscription.
export async function sendWebPush({ subscription, notification, env = process.env, webpush = null } = {}) {
  if (!webPushConfigured(env)) return { ok: false, disabled: true, reason: 'not_configured' };
  const lib = await loadWebPush(webpush);
  if (!lib) return { ok: false, disabled: true, reason: 'web_push_not_installed' };
  const sub = subscription && typeof subscription === 'object' ? subscription : {};
  if (!sub.endpoint) return { ok: false, reason: 'invalid_subscription' };
  const { publicKey, privateKey, subject } = readVapidConfig(env);
  try {
    if (typeof lib.setVapidDetails === 'function') {
      lib.setVapidDetails(subject, publicKey, privateKey);
    }
    const payload = JSON.stringify(buildPushPayload(notification));
    await lib.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys || {} },
      payload,
    );
    return { ok: true };
  } catch (error) {
    const status = Number(error && (error.statusCode || error.status)) || 0;
    if (status === 404 || status === 410) return { ok: false, gone: true, status };
    return { ok: false, status, reason: 'send_failed' };
  }
}

// Send to many subscriptions, collecting endpoints that should be pruned.
export async function sendWebPushToSubscriptions({ subscriptions = [], notification, env = process.env, webpush = null } = {}) {
  const expired = [];
  let sent = 0;
  for (const subscription of subscriptions) {
    // eslint-disable-next-line no-await-in-loop
    const result = await sendWebPush({ subscription, notification, env, webpush });
    if (result.ok) sent += 1;
    else if (result.gone && subscription && subscription.subscriptionId) expired.push(subscription.subscriptionId);
  }
  return { sent, expired };
}

export default {
  readVapidConfig,
  webPushConfigured,
  getPublicVapidKey,
  buildPushPayload,
  sendWebPush,
  sendWebPushToSubscriptions,
};
