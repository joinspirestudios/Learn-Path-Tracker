// User profile model — pure validation, sanitization and safe public shaping.
//
// No DOM, no Firebase, no environment, no side effects. Shared by web and mobile
// (one brain). Private fields (email, tokens, auth metadata, storage paths) are
// never included in public-safe output.

import { currentSchemaVersion, normalizeDocumentSchemaVersion } from './schema-versioning.js';
import { safeExternalUrl } from './urls.js';

export const USER_PROFILE_SCHEMA_VERSION = currentSchemaVersion('userProfile') || 1;

export const DISPLAY_NAME_MIN = 1;
export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 300;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
export const LOCATION_MAX = 80;

export const RESERVED_USERNAMES = new Set([
  'admin', 'root', 'support', 'help', 'api', 'app', 'www', 'learn', 'path',
  'tracker', 'learnpathtracker', 'official', 'team', 'moderator', 'system',
]);

function str(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

export function sanitizeDisplayName(value) {
  return str(value).replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX);
}

export function validateDisplayName(value) {
  const clean = sanitizeDisplayName(value);
  if (clean.length < DISPLAY_NAME_MIN) return { ok: false, value: '', error: 'Display name is required.' };
  return { ok: true, value: clean, error: '' };
}

export function sanitizeBio(value) {
  return str(value).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, BIO_MAX);
}

export function sanitizeLocation(value) {
  return str(value).replace(/\s+/g, ' ').trim().slice(0, LOCATION_MAX);
}

export function sanitizeWebsiteURL(value) {
  return safeExternalUrl(value) || '';
}

export function normalizeUsername(value) {
  return str(value).trim().toLowerCase();
}

export function isReservedUsername(value) {
  return RESERVED_USERNAMES.has(normalizeUsername(value));
}

// Allowed: lowercase letters, numbers, underscore, period. 3-24 chars. No spaces.
export function validateUsername(value) {
  const lower = normalizeUsername(value);
  if (!lower) return { ok: false, value: '', error: 'Username is required.' };
  if (lower.length < USERNAME_MIN || lower.length > USERNAME_MAX) {
    return { ok: false, value: lower, error: 'Username must be 3–24 characters.' };
  }
  if (!/^[a-z0-9_.]+$/.test(lower)) {
    return { ok: false, value: lower, error: 'Use lowercase letters, numbers, underscore or period only.' };
  }
  if (isReservedUsername(lower)) {
    return { ok: false, value: lower, error: 'This username is reserved.' };
  }
  return { ok: true, value: lower, error: '' };
}

export function sanitizeUsername(value) {
  const result = validateUsername(value);
  return result.ok ? result.value : '';
}

// Only allow storage URLs/paths that live under the user's own profile space.
export function isOwnProfileAssetPath(path, uid) {
  const p = str(path).trim();
  if (!p) return true; // empty is allowed (no asset)
  return p.startsWith('users/' + uid + '/profile/');
}

// Build a normalized full profile document (private — stored at users/{uid}/profile/main).
export function buildProfileDocument(input = {}, { uid, now = new Date() } = {}) {
  const id = str(uid || input.uid).trim();
  const displayName = sanitizeDisplayName(input.displayName);
  const username = sanitizeUsername(input.username);
  return {
    uid: id,
    displayName,
    username,
    usernameLower: username,
    bio: sanitizeBio(input.bio),
    avatarURL: sanitizeWebsiteURL(input.avatarURL),
    avatarStoragePath: isOwnProfileAssetPath(input.avatarStoragePath, id) ? str(input.avatarStoragePath).trim() : '',
    coverURL: sanitizeWebsiteURL(input.coverURL),
    coverStoragePath: isOwnProfileAssetPath(input.coverStoragePath, id) ? str(input.coverStoragePath).trim() : '',
    locationLabel: sanitizeLocation(input.locationLabel),
    websiteURL: sanitizeWebsiteURL(input.websiteURL),
    publicProfileEnabled: input.publicProfileEnabled !== false,
    createdAt: input.createdAt || now,
    updatedAt: now,
    schemaVersion: normalizeDocumentSchemaVersion('userProfile', input, USER_PROFILE_SCHEMA_VERSION) || USER_PROFILE_SCHEMA_VERSION,
  };
}

// Public-safe profile: only fields that may appear publicly. Never email/tokens/paths.
export function safePublicProfile(profile = {}) {
  if (!profile || typeof profile !== 'object') return null;
  const publicEnabled = profile.publicProfileEnabled !== false;
  return {
    uid: str(profile.uid).trim(),
    displayName: sanitizeDisplayName(profile.displayName),
    username: sanitizeUsername(profile.username || profile.usernameLower),
    bio: publicEnabled ? sanitizeBio(profile.bio) : '',
    avatarURL: sanitizeWebsiteURL(profile.avatarURL),
    coverURL: publicEnabled ? sanitizeWebsiteURL(profile.coverURL) : '',
    publicProfileEnabled: publicEnabled,
  };
}

// Author display for public cards. Falls back to legacy creatorName/displayName.
export function safeAuthorProfile(profile = {}, fallback = {}) {
  const safe = safePublicProfile(profile) || {};
  const displayName = safe.displayName
    || sanitizeDisplayName(fallback.displayName || fallback.creatorName || fallback.authorName)
    || 'A learner';
  return {
    displayName,
    username: safe.username || '',
    avatarURL: safe.avatarURL || sanitizeWebsiteURL(fallback.avatarURL || fallback.authorPhotoURL) || '',
  };
}

// Username reservation document (usernames/{usernameLower}).
export function buildUsernameReservation({ uid, username }, { now = new Date() } = {}) {
  const lower = sanitizeUsername(username);
  if (!lower) return null;
  return { uid: str(uid).trim(), username: lower, usernameLower: lower, createdAt: now, updatedAt: now };
}

// Whether `uid` may claim `usernameLower` given an existing reservation (or none).
export function canClaimUsername({ usernameLower, uid, existingReservation }) {
  const lower = normalizeUsername(usernameLower);
  if (!validateUsername(lower).ok) return false;
  if (!existingReservation) return true; // unclaimed
  return str(existingReservation.uid).trim() === str(uid).trim(); // only own reservation
}

export default {
  USER_PROFILE_SCHEMA_VERSION,
  RESERVED_USERNAMES,
  sanitizeDisplayName,
  validateDisplayName,
  sanitizeBio,
  sanitizeLocation,
  sanitizeWebsiteURL,
  normalizeUsername,
  isReservedUsername,
  validateUsername,
  sanitizeUsername,
  isOwnProfileAssetPath,
  buildProfileDocument,
  safePublicProfile,
  safeAuthorProfile,
  buildUsernameReservation,
  canClaimUsername,
};
