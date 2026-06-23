// Profile/path-banner asset rules — pure helpers for allowed types, sizes and
// Storage paths. No Firebase, no DOM, no upload here (callers do the upload).
//
// Only profile avatar/cover and path banner images are supported. No proof or
// evidence media paths are defined here.

export const ASSET_KINDS = ['avatar', 'profileCover', 'pathBanner'];

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const ASSET_MAX_BYTES = {
  avatar: 2 * 1024 * 1024, // 2 MB
  profileCover: 5 * 1024 * 1024, // 5 MB
  pathBanner: 5 * 1024 * 1024, // 5 MB
};

export function isAllowedImageType(contentType) {
  return ALLOWED_IMAGE_TYPES.includes(String(contentType || ''));
}

export function isAllowedAssetSize(kind, size) {
  const max = ASSET_MAX_BYTES[kind];
  const n = Number(size);
  return Number.isFinite(n) && n > 0 && !!max && n <= max;
}

export function validateAsset(kind, { contentType, size } = {}) {
  if (!ASSET_KINDS.includes(kind)) return { ok: false, error: 'Unsupported asset type.' };
  if (!isAllowedImageType(contentType)) return { ok: false, error: 'Only JPEG, PNG or WebP images are allowed.' };
  if (!isAllowedAssetSize(kind, size)) return { ok: false, error: 'This image is too large.' };
  return { ok: true, error: '' };
}

function safeSegment(value, fallback) {
  const s = String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return s || fallback;
}

export function avatarStoragePath(uid, assetId) {
  return 'users/' + safeSegment(uid, 'user') + '/profile/avatar/' + safeSegment(assetId, 'asset');
}

export function coverStoragePath(uid, assetId) {
  return 'users/' + safeSegment(uid, 'user') + '/profile/cover/' + safeSegment(assetId, 'asset');
}

// Path banners use a user-owned Storage path so Storage rules can validate
// ownership by uid alone (path ownership is enforced in Firestore on save).
export function pathBannerStoragePath(uid, pathId, assetId) {
  return 'users/' + safeSegment(uid, 'user') + '/pathBanners/' + safeSegment(pathId, 'path') + '/' + safeSegment(assetId, 'asset');
}

export function storagePathForKind(kind, { uid, pathId, assetId } = {}) {
  if (kind === 'avatar') return avatarStoragePath(uid, assetId);
  if (kind === 'profileCover') return coverStoragePath(uid, assetId);
  if (kind === 'pathBanner') return pathBannerStoragePath(uid, pathId, assetId);
  return '';
}

export function isOwnAvatarPath(path, uid) {
  return String(path || '').startsWith('users/' + uid + '/profile/avatar/');
}
export function isOwnCoverPath(path, uid) {
  return String(path || '').startsWith('users/' + uid + '/profile/cover/');
}
export function isOwnPathBannerPath(path, uid) {
  return String(path || '').startsWith('users/' + uid + '/pathBanners/');
}

export default {
  ASSET_KINDS,
  ALLOWED_IMAGE_TYPES,
  ASSET_MAX_BYTES,
  isAllowedImageType,
  isAllowedAssetSize,
  validateAsset,
  avatarStoragePath,
  coverStoragePath,
  pathBannerStoragePath,
  storagePathForKind,
  isOwnAvatarPath,
  isOwnCoverPath,
  isOwnPathBannerPath,
};
