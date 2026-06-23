// Path personalization model — pure validation/sanitization for owner-editable
// path visual identity. No Firebase, no DOM, no side effects.
//
// Narrow by design: banner image, accent color, cover title, public subtitle.
// Never touches server-managed stats or ownership fields.

import { currentSchemaVersion } from './schema-versioning.js';
import { safeExternalUrl } from './urls.js';

export const PATH_PERSONALIZATION_SCHEMA_VERSION = currentSchemaVersion('pathPersonalization') || 1;

export const COVER_TITLE_MAX = 80;
export const PUBLIC_SUBTITLE_MAX = 140;

// Fields the client must never write via personalization (server-managed).
export const SERVER_MANAGED_PATH_FIELDS = [
  'stats', 'joinedCount', 'activeThisWeek', 'activeWeekKey', 'day1StartedCount',
  'day7ReachedCount', 'halfwayReachedCount', 'completedCount', 'proofSubmissionCount',
  'publicProgressCount', 'statsUpdatedAt', 'statsSchemaVersion',
];

// Identity fields that personalization must never change.
export const PROTECTED_PATH_FIELDS = ['ownerId', 'creatorId', 'creatorUid', 'visibility'];

function str(value, fallback = '') {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  return String(value);
}

export function sanitizeAccentColor(value) {
  const v = str(value).trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : '';
}

export function sanitizeCoverTitle(value) {
  return str(value).replace(/\s+/g, ' ').trim().slice(0, COVER_TITLE_MAX);
}

export function sanitizePublicSubtitle(value) {
  return str(value).replace(/\s+/g, ' ').trim().slice(0, PUBLIC_SUBTITLE_MAX);
}

export function isOwnPathBannerStoragePath(path, uid) {
  const p = str(path).trim();
  if (!p) return true;
  return p.startsWith('users/' + uid + '/pathBanners/');
}

// Build a sanitized personalization patch (only safe fields). Strips anything
// server-managed or identity-related.
export function sanitizePathPersonalization(input = {}, { uid, now = new Date() } = {}) {
  return {
    bannerURL: safeExternalUrl(input.bannerURL) || '',
    bannerStoragePath: isOwnPathBannerStoragePath(input.bannerStoragePath, uid) ? str(input.bannerStoragePath).trim() : '',
    accentColor: sanitizeAccentColor(input.accentColor),
    coverTitle: sanitizeCoverTitle(input.coverTitle),
    publicSubtitle: sanitizePublicSubtitle(input.publicSubtitle),
    updatedAt: now,
    schemaVersion: PATH_PERSONALIZATION_SCHEMA_VERSION,
  };
}

// True if the patch contains any forbidden (server-managed or protected) key.
export function personalizationTouchesProtectedFields(patch = {}) {
  const keys = Object.keys(patch || {});
  return keys.some(k => SERVER_MANAGED_PATH_FIELDS.includes(k) || PROTECTED_PATH_FIELDS.includes(k));
}

export function canEditPathPersonalization(path = {}, uid) {
  const id = str(uid).trim();
  if (!id || !path) return false;
  return path.ownerId === id || path.creatorId === id || path.creatorUid === id;
}

// Public-safe personalization (for cards/previews). No storage paths.
export function safePathPersonalization(path = {}) {
  const p = (path && path.personalization) || path || {};
  return {
    bannerURL: safeExternalUrl(p.bannerURL) || '',
    accentColor: sanitizeAccentColor(p.accentColor),
    coverTitle: sanitizeCoverTitle(p.coverTitle),
    publicSubtitle: sanitizePublicSubtitle(p.publicSubtitle),
  };
}

export default {
  PATH_PERSONALIZATION_SCHEMA_VERSION,
  SERVER_MANAGED_PATH_FIELDS,
  PROTECTED_PATH_FIELDS,
  sanitizeAccentColor,
  sanitizeCoverTitle,
  sanitizePublicSubtitle,
  sanitizePathPersonalization,
  personalizationTouchesProtectedFields,
  canEditPathPersonalization,
  safePathPersonalization,
};
