// Orchestrates mobile media proof submission: validate -> upload -> build a
// private proof record. Dependency-injected (`storageRepo`); tests inject a fake.
// Proof is private by default and "submitted", never "verified".

import { validateMediaAsset, mediaProofRecord } from '../core/mobileMediaProofMappers.js';

export function createMobileMediaProofRepository({ storageRepo, now = () => Date.now() } = {}) {
  if (!storageRepo) throw new Error('createMobileMediaProofRepository requires a storageRepo');

  return {
    // Validate first so an invalid asset never starts an upload.
    validate(asset) {
      return validateMediaAsset(asset || {});
    },
    async submitMediaProof({ uid, pathId, enrollmentId, dayNumber, taskId, asset } = {}) {
      const check = validateMediaAsset(asset || {});
      if (!check.ok) throw Object.assign(new Error(check.error), { code: 'invalid_media' });
      const { storagePath, downloadURL } = await storageRepo.uploadMediaProof({ uid, enrollmentId, asset });
      return mediaProofRecord({
        taskId, dayNumber, pathId, uid, asset, storagePath, downloadURL, now: now(),
      });
    },
  };
}

export default createMobileMediaProofRepository;
