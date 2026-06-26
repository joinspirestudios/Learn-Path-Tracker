// Uploads media proof to Firebase Storage (owner-only evidence path).
//
// Dependency-injected: `storageGateway` (from firebaseClient.createStorageGateway)
// and `fetchBlob` (uri -> Blob). Tests inject fakes so no live Storage/network is
// touched. Never logs file contents or tokens.

import { validateMediaAsset, mobileProofStoragePath, normalizeMediaAsset } from '../core/mobileMediaProofMappers.js';

function newAssetId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

async function defaultFetchBlob(uri) {
  if (typeof fetch === 'undefined') throw new Error('No fetch available to read the file');
  const res = await fetch(uri);
  return res.blob();
}

export function createMobileProofStorageRepository({ storageGateway, fetchBlob = defaultFetchBlob } = {}) {
  if (!storageGateway) throw new Error('createMobileProofStorageRepository requires a storageGateway');

  return {
    async uploadMediaProof({ uid, pathId, dayNumber, taskId, asset } = {}) {
      if (!uid) throw Object.assign(new Error('Sign in required'), { code: 'unauthenticated' });
      const normalized = normalizeMediaAsset(asset || {});
      const check = validateMediaAsset(asset || {});
      if (!check.ok) throw Object.assign(new Error(check.error), { code: 'invalid_media' });
      const path = mobileProofStoragePath({ uid, pathId, dayNumber, taskId, assetId: newAssetId() });
      const blob = await fetchBlob(normalized.uri);
      const result = await storageGateway.uploadFile(path, blob, { contentType: normalized.contentType });
      return { storagePath: result.path || path, downloadURL: result.downloadURL || '' };
    },
  };
}

export default createMobileProofStorageRepository;
