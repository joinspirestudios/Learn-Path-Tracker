// Pure mobile profile mappers. Self-contained (no import outside apps/mobile so
// the Metro bundle stays clean); a parity test asserts these match the web
// src/user-profile-model.js helpers. Private fields are never exposed.

export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 300;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;

export const RESERVED_USERNAMES = new Set([
  'admin', 'root', 'support', 'help', 'api', 'app', 'www', 'learn', 'path',
  'tracker', 'learnpathtracker', 'official', 'team', 'moderator', 'system',
]);

function str(v) { return v == null ? '' : String(v); }
function safeUrl(v) {
  const s = str(v).trim();
  if (!/^https?:\/\//i.test(s)) return '';
  try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : ''; }
  catch { return ''; }
}

export function sanitizeDisplayName(value) {
  return str(value).replace(/\s+/g, ' ').trim().slice(0, DISPLAY_NAME_MAX);
}
export function sanitizeBio(value) {
  return str(value).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, BIO_MAX);
}
export function normalizeUsername(value) {
  return str(value).trim().toLowerCase();
}
export function isReservedUsername(value) {
  return RESERVED_USERNAMES.has(normalizeUsername(value));
}
export function validateUsername(value) {
  const lower = normalizeUsername(value);
  if (!lower) return { ok: false, value: '', error: 'Username is required.' };
  if (lower.length < USERNAME_MIN || lower.length > USERNAME_MAX) {
    return { ok: false, value: lower, error: 'Username must be 3–24 characters.' };
  }
  if (!/^[a-z0-9_.]+$/.test(lower)) {
    return { ok: false, value: lower, error: 'Use lowercase letters, numbers, underscore or period only.' };
  }
  if (isReservedUsername(lower)) return { ok: false, value: lower, error: 'This username is reserved.' };
  return { ok: true, value: lower, error: '' };
}
export function validateDisplayName(value) {
  const clean = sanitizeDisplayName(value);
  if (!clean) return { ok: false, value: '', error: 'Display name is required.' };
  return { ok: true, value: clean, error: '' };
}

export function safePublicProfile(profile = {}) {
  if (!profile || typeof profile !== 'object') return null;
  const publicEnabled = profile.publicProfileEnabled !== false;
  const username = validateUsername(profile.username || profile.usernameLower);
  return {
    uid: str(profile.uid).trim(),
    displayName: sanitizeDisplayName(profile.displayName),
    username: username.ok ? username.value : '',
    bio: publicEnabled ? sanitizeBio(profile.bio) : '',
    avatarURL: safeUrl(profile.avatarURL),
    coverURL: publicEnabled ? safeUrl(profile.coverURL) : '',
    publicProfileEnabled: publicEnabled,
  };
}

export function safeAuthorProfile(profile = {}, fallback = {}) {
  const safe = safePublicProfile(profile) || {};
  return {
    displayName: safe.displayName
      || sanitizeDisplayName(fallback.displayName || fallback.creatorName || fallback.authorName)
      || 'A learner',
    username: safe.username || '',
    avatarURL: safe.avatarURL || safeUrl(fallback.avatarURL || fallback.authorPhotoURL),
  };
}

export default {
  sanitizeDisplayName, sanitizeBio, normalizeUsername, isReservedUsername,
  validateUsername, validateDisplayName, safePublicProfile, safeAuthorProfile,
};
