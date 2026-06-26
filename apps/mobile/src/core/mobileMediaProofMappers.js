// Pure mappers for mobile MEDIA proof (image/file). No React Native, no Firebase,
// no Expo imports, no side effects. Validates type/size, builds the Storage path,
// and produces safe proof records. Proof is private by default and "submitted",
// never "verified".

// Mirrors the web evidence Storage rule (image types + pdf, <= 10 MB).
export const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MEDIA_PROOF_MAX_BYTES = 10 * 1024 * 1024;

function str(v) { return v == null ? '' : String(v); }

export function isAllowedMediaType(contentType) {
  return ALLOWED_MEDIA_TYPES.includes(str(contentType));
}

export function isAllowedMediaSize(size) {
  const n = Number(size);
  return Number.isFinite(n) && n > 0 && n <= MEDIA_PROOF_MAX_BYTES;
}

export function mediaProofKind(asset = {}) {
  return str(asset.mimeType || asset.type).toLowerCase().startsWith('image/') ? 'image' : 'file';
}

export function validateMediaAsset(asset = {}) {
  const contentType = str(asset.mimeType || asset.type);
  if (!isAllowedMediaType(contentType)) {
    return { ok: false, error: 'Only JPEG, PNG, WebP images or PDF files are allowed.' };
  }
  if (!isAllowedMediaSize(asset.size || asset.fileSize)) {
    return { ok: false, error: 'This file is too large (max 10 MB).' };
  }
  return { ok: true, error: '' };
}

function seg(value, fallback) {
  const s = str(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return s || fallback;
}

// Evidence Storage path — owner-only by existing Storage rules:
//   evidence/{uid}/{enrollmentId}/{assetId}
export function mediaProofStoragePath({ uid, enrollmentId, assetId } = {}) {
  return 'evidence/' + seg(uid, 'user') + '/' + seg(enrollmentId, 'enrollment') + '/' + seg(assetId, 'asset');
}

// Normalize a picked asset into a draft-ready media descriptor (no upload yet).
export function normalizeMediaAsset(asset = {}) {
  const contentType = str(asset.mimeType || asset.type);
  return {
    uri: str(asset.uri),
    fileName: str(asset.fileName || asset.name) || (mediaProofKind(asset) === 'image' ? 'image' : 'file'),
    contentType,
    size: Number(asset.size || asset.fileSize) || 0,
    kind: mediaProofKind(asset),
  };
}

// A private proof record produced AFTER a successful upload.
export function mediaProofRecord({ taskId, dayNumber, pathId, uid, asset = {}, storagePath, downloadURL, now = null } = {}) {
  const normalized = normalizeMediaAsset(asset);
  return {
    taskId: str(taskId),
    dayNumber: Number(dayNumber) || 1,
    pathId: str(pathId),
    uid: str(uid),
    evidenceType: normalized.kind === 'image' ? 'file' : 'file', // stored as file evidence
    proofKind: normalized.kind, // image | file (display hint)
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
  validateMediaAsset, mediaProofStoragePath, normalizeMediaAsset, mediaProofRecord,
};
