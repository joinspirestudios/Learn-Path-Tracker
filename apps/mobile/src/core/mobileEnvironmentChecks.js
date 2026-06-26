// Mobile environment checks (pure). Report whether public configuration is
// present WITHOUT ever exposing the values. Returns safe status labels only:
//   'configured' | 'missing' | 'unknown'
// Never returns API keys, tokens, or any config value.

import { getApiBaseUrl, hasMobileFirebaseConfig, getMobileFirebaseConfig } from '../services/env.js';

export const ENV_STATUS = Object.freeze({
  CONFIGURED: 'configured',
  MISSING: 'missing',
  UNKNOWN: 'unknown',
});

function envSource(env) {
  return env || (typeof process !== 'undefined' && process.env) || {};
}

// API base URL: 'configured' when an explicit EXPO_PUBLIC base URL is set. The
// resolver always returns a default, so we check the raw env to distinguish an
// explicit value from the built-in fallback.
export function apiBaseStatus(env) {
  const source = envSource(env);
  const explicit = source.EXPO_PUBLIC_LEARN_PATH_API_BASE_URL;
  if (typeof explicit === 'string' && explicit.trim()) return ENV_STATUS.CONFIGURED;
  // A safe default exists, so the app still works, but the value is not explicit.
  return getApiBaseUrl(env) ? ENV_STATUS.CONFIGURED : ENV_STATUS.MISSING;
}

export function firebaseStatus(env) {
  return hasMobileFirebaseConfig(env) ? ENV_STATUS.CONFIGURED : ENV_STATUS.MISSING;
}

// Storage is configured when the Firebase storageBucket is present. We only
// report presence — never the bucket value.
export function storageStatus(env) {
  const config = getMobileFirebaseConfig(env);
  return config.storageBucket ? ENV_STATUS.CONFIGURED : ENV_STATUS.MISSING;
}

// A compact, value-free environment snapshot for diagnostics.
export function environmentSummary(env) {
  return {
    apiBase: apiBaseStatus(env),
    firebase: firebaseStatus(env),
    storage: storageStatus(env),
  };
}

export default {
  ENV_STATUS,
  apiBaseStatus,
  firebaseStatus,
  storageStatus,
  environmentSummary,
};
