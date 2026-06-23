// Server-side profile sanitizer.
//
// Reduces a stored private profile to the public-safe author fields the server
// may attach to public surfaces (e.g. public progress entries). Never returns
// email, tokens, auth metadata, storage paths, or private fields.

import { safePublicProfile, safeAuthorProfile } from '../src/user-profile-model.js';

export function toPublicProfile(profile) {
  return safePublicProfile(profile);
}

// Public author fields for a content card, with a legacy fallback (e.g. the
// token display name / creatorName) when no profile exists.
export function toPublicAuthor(profile, fallback = {}) {
  return safeAuthorProfile(profile || {}, fallback);
}

export default { toPublicProfile, toPublicAuthor };
