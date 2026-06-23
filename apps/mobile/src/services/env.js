// Environment access for the mobile foundation.
//
// The API base URL is supplied at build/runtime through an Expo public env var:
//   EXPO_PUBLIC_LEARN_PATH_API_BASE_URL
//
// No secrets live in source. This file only reads a public base URL. It never
// reads or stores Firebase service accounts, Anthropic keys, Deepgram keys, or
// Firebase ID tokens.

export const API_BASE_URL_ENV = 'EXPO_PUBLIC_LEARN_PATH_API_BASE_URL';

// Documented fallback only. Production builds should set the env var explicitly.
// This is a public web origin, not a secret.
export const DEFAULT_API_BASE_URL = 'https://learn-path-tracker.vercel.app';

export function getApiBaseUrl(env) {
  const source = env || (typeof process !== 'undefined' && process.env) || {};
  const fromEnv = source[API_BASE_URL_ENV];
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/+$/, '');
  }
  return DEFAULT_API_BASE_URL;
}

export default { API_BASE_URL_ENV, DEFAULT_API_BASE_URL, getApiBaseUrl };
