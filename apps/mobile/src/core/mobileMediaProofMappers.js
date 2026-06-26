// Pure mappers for mobile IMAGE proof. No React Native, no Firebase, no Expo
// imports, no side effects. Validates type/size, builds the owner-scoped Storage
// path, and produces safe proof records. Proof is private by default and
// "submitted", never "verified".
//
// Phase 6.16.1: IMAGE proof only (JPEG/PNG/WebP). No PDF/file/video/audio.

export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MEDIA_PROOF_MAX_BYTES = 10 * 1024 * 1024;

function str(v) { return v == null ? '' : String(v); }

export function isAllowedMediaType(contentType) {
  return ALLOWED_MEDIA_TYPES.includes(str(contentType));
}

export function isAllowedMediaSize(size) {
  const n = Number(size);
  return Number.isFinite(n) && n > 0 && n <= MEDIA_PROOF_MAX_BYTES;
}

// All mobile media proof is image proof in this phase.
export function mediaProofKind() {
  return 'image';
}

export function validateMediaAsset(asset = {}) {
  const contentType = str(asset.mimeType || asset.type || asset.contentType);
  if (!isAllowedMediaType(contentType)) {
    return { ok: false, error: 'Only JPEG, PNG or WebP images are supported.' };
  }
  if (!isAllowedMediaSize(asset.size || asset.fileSize)) {
    return { ok: false, error: 'Image is too large (max 10 MB).' };
  }
  return { ok: true, error: '' };
}

// Sanitize a single path segment — strips traversal and unsafe characters.
function seg(value, fallback) {
  const s = str(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return s && s !== '.' && s !== '..' ? s : fallback;
}

// Owner-scoped proof media path. ALWAYS starts with users/{uid}/proofMedia and
// includes pathId, dayNumber, taskId and assetId. Never uses profile/avatar/
// cover/banner or generic upload paths, and cannot escape the user scope.
export function mobileProofStoragePath({ uid, pathId, dayNumber, taskId, assetId } = {}) {
  const day = Math.max(1, Number(dayNumber) || 1);
  return 'users/' + seg(uid, 'user') + '/proofMedia/'
    + seg(pathId, 'path') + '/day-' + day + '/'
    + seg(taskId, 'task') + '/' + seg(assetId, 'asset');
}

// Backward-compatible alias (Phase 6.16 name) → new owner-scoped path.
export function mediaProofStoragePath(opts = {}) {
  return mobileProofStoragePath(opts);
}

// Normalize a picked/captured asset into a draft-ready media descriptor.
export function normalizeMediaAsset(asset = {}) {
  const contentType = str(asset.mimeType || asset.type || asset.contentType);
  return {
    uri: str(asset.uri || asset.localUri),
    fileName: str(asset.fileName || asset.name) || 'image',
    contentType,
    size: Number(asset.size || asset.fileSize) || 0,
    width: Number(asset.width) || 0,
    height: Number(asset.height) || 0,
    kind: 'image',
  };
}

// A private proof record produced AFTER a successful upload. Never includes the
// local URI or raw bytes.
export function mediaProofRecord({ taskId, dayNumber, pathId, uid, asset = {}, storagePath, downloadURL, now = null } = {}) {
  const normalized = normalizeMediaAsset(asset);
  return {
    taskId: str(taskId),
    dayNumber: Number(dayNumber) || 1,
    pathId: str(pathId),
    uid: str(uid),
    evidenceType: 'file', // stored as file evidence on the day log
    proofKind: 'image',
    fileName: normalized.fileName,
    fileType: normalized.contentType,
    fileSize: normalized.size,
    storagePath: str(storagePath),
    evidenceUrl: str(downloadURL), // owner download URL (private by default)
    privacy: 'private',
    submitted: true,
    verified: false,
    createdAt: now,
  };
}

export default {
  ALLOWED_MEDIA_TYPES, MEDIA_PROOF_MAX_BYTES,
  isAllowedMediaType, isAllowedMediaSize, mediaProofKind,
  validateMediaAsset, mobileProofStoragePath, mediaProofStoragePath,
  normalizeMediaAsset, mediaProofRecord,
};
