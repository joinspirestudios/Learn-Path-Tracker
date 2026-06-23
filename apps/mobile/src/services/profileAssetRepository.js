// Mobile profile asset rules (avatar/cover/path-banner).
//
// Phase 6.15 does NOT add a mobile image-selection dependency or upload. This
// module only exposes the allowed asset rules and Storage path builders so a
// later phase can wire mobile upload safely. Mobile users edit images on web for
// now; the app still displays them by URL.

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ASSET_MAX_BYTES = {
  avatar: 2 * 1024 * 1024,
  profileCover: 5 * 1024 * 1024,
  pathBanner: 5 * 1024 * 1024,
};

export const MOBILE_ASSET_UPLOAD_ENABLED = false;

function seg(value, fallback) {
  const s = String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return s || fallback;
}

export function avatarStoragePath(uid, assetId) {
  return 'users/' + seg(uid, 'user') + '/profile/avatar/' + seg(assetId, 'asset');
}
export function coverStoragePath(uid, assetId) {
  return 'users/' + seg(uid, 'user') + '/profile/cover/' + seg(assetId, 'asset');
}
export function pathBannerStoragePath(uid, pathId, assetId) {
  return 'users/' + seg(uid, 'user') + '/pathBanners/' + seg(pathId, 'path') + '/' + seg(assetId, 'asset');
}

export function isAllowedImageType(contentType) {
  return ALLOWED_IMAGE_TYPES.includes(String(contentType || ''));
}

export function createProfileAssetRepository() {
  return {
    uploadEnabled: MOBILE_ASSET_UPLOAD_ENABLED,
    avatarStoragePath,
    coverStoragePath,
    pathBannerStoragePath,
    isAllowedImageType,
  };
}

export default createProfileAssetRepository;
