// Environment access for the mobile app.
//
// Reads public Expo env vars only. These are PUBLIC Firebase client config
// values and a public API base URL — never Firebase Admin secrets, provider
// keys, or ID tokens. No secret is read or stored here.

export const API_BASE_URL_ENV = 'EXPO_PUBLIC_LEARN_PATH_API_BASE_URL';

// Documented fallback only. Production builds should set the env var explicitly.
// This is a public web origin, not a secret.
export const DEFAULT_API_BASE_URL = 'https://learn-path-tracker.vercel.app';

export const FIREBASE_ENV_KEYS = {
  apiKey: 'EXPO_PUBLIC_FIREBASE_API_KEY',
  authDomain: 'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  projectId: 'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  storageBucket: 'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  messagingSenderId: 'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  appId: 'EXPO_PUBLIC_FIREBASE_APP_ID',
};

// Minimum keys required before we attempt to initialize the Firebase client.
const REQUIRED_FIREBASE_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];

function envSource(env) {
  return env || (typeof process !== 'undefined' && process.env) || {};
}

export function getApiBaseUrl(env) {
  const source = envSource(env);
  const fromEnv = source[API_BASE_URL_ENV];
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  return DEFAULT_API_BASE_URL;
}

// Alias kept for naming clarity in cloud modules.
export function getMobileApiBaseUrl(env) {
  return getApiBaseUrl(env);
}

export function getMobileFirebaseConfig(env) {
  const source = envSource(env);
  const config = {};
  for (const [field, key] of Object.entries(FIREBASE_ENV_KEYS)) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      config[field] = value.trim();
    }
  }
  return config;
}

export function hasMobileFirebaseConfig(env) {
  const config = getMobileFirebaseConfig(env);
  return REQUIRED_FIREBASE_KEYS.every(key => typeof config[key] === 'string' && config[key].length > 0);
}

export default {
  API_BASE_URL_ENV,
  DEFAULT_API_BASE_URL,
  FIREBASE_ENV_KEYS,
  getApiBaseUrl,
  getMobileApiBaseUrl,
  getMobileFirebaseConfig,
  hasMobileFirebaseConfig,
};
