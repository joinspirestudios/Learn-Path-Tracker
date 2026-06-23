// Firebase client config resolver for mobile.
//
// Pure: reads public Expo env vars via env.js and reports whether the mobile
// cloud connection is configured. Never reads Firebase Admin secrets. Never logs
// config values. No network calls.

import { getMobileFirebaseConfig, hasMobileFirebaseConfig } from './env.js';

export function resolveFirebaseConfig(env) {
  return getMobileFirebaseConfig(env);
}

export function isFirebaseConfigured(env) {
  return hasMobileFirebaseConfig(env);
}

export default { resolveFirebaseConfig, isFirebaseConfigured };
