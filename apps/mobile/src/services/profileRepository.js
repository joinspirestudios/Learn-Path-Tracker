// Mobile profile repository — read the signed-in user's profile and update safe
// text fields. Dependency-injected user-data gateway (users/{uid}/...), so tests
// use a fake gateway. Writes only the current user's own profile. Never logs or
// exposes ID tokens. Username changes are managed on web (transactional
// reservation); mobile updates display name / bio / website / visibility only.

import {
  sanitizeDisplayName, sanitizeBio, safePublicProfile,
} from '../core/mobileProfileMappers.js';

const PROFILE_SUB = 'profile';
const PROFILE_DOC = 'main';

function safeUrl(v) {
  const s = v == null ? '' : String(v).trim();
  if (!/^https?:\/\//i.test(s)) return '';
  try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') ? u.toString() : ''; }
  catch { return ''; }
}

export function createProfileRepository({ gateway } = {}) {
  if (!gateway) throw new Error('createProfileRepository requires a gateway');
  return {
    async getProfile(uid) {
      if (!uid) return null;
      const record = await gateway.getUserDoc(uid, PROFILE_SUB, PROFILE_DOC);
      return record ? { uid, ...record.data } : null;
    },
    async getPublicProfile(uid) {
      const profile = await this.getProfile(uid);
      return profile ? safePublicProfile(profile) : null;
    },
    // Safe text fields only (no username, no asset paths).
    async saveProfileText(uid, input = {}) {
      if (!uid) throw new Error('saveProfileText requires uid');
      const patch = {
        uid,
        displayName: sanitizeDisplayName(input.displayName),
        bio: sanitizeBio(input.bio),
        websiteURL: safeUrl(input.websiteURL),
        publicProfileEnabled: input.publicProfileEnabled !== false,
      };
      await gateway.setUserDoc(uid, PROFILE_SUB, PROFILE_DOC, patch);
      return patch;
    },
  };
}

export default createProfileRepository;
