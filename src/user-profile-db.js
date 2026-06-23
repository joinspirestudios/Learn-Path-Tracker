// User profile persistence (web). Thin wrapper over the Firestore + Storage
// clients.
//
// Profile doc:        users/{uid}/profile/main
// Username reservation: usernames/{usernameLower}
// Profile assets:      users/{uid}/profile/avatar|cover/{assetId}
//
// Username uniqueness is guaranteed by Firestore rules (create-only-when-absent)
// combined with availability checks + a writeBatch here — not by client checks
// alone. Permission-denied is NEVER reported as "taken".

import { fb as defaultFb } from './firebase.js';
import {
  buildProfileTextUpdate, buildUsernameReservation, sanitizeUsername, safePublicProfile,
  validateUsername, isReservedUsername, normalizeUsername,
} from './user-profile-model.js';
import { validateAsset, avatarStoragePath, coverStoragePath } from './profile-assets.js';

function profileRef(fb, uid) {
  return fb.doc(fb.db, 'users', uid, 'profile', 'main');
}
function usernameRef(fb, usernameLower) {
  return fb.doc(fb.db, 'usernames', usernameLower);
}

function newAssetId() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function isPermissionDenied(error) {
  const code = error && (error.code || error.message || '');
  return /permission-denied|insufficient|PERMISSION_DENIED/i.test(String(code));
}

export async function loadProfile(uid, { fb = defaultFb } = {}) {
  if (!uid || !fb.firestoreReady) return null;
  const snap = await fb.getDoc(profileRef(fb, uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function loadPublicProfile(uid, { fb = defaultFb } = {}) {
  const profile = await loadProfile(uid, { fb });
  return profile ? safePublicProfile(profile) : null;
}

// Text/preference-only save. Never writes avatar/cover URL or Storage path
// fields, so a text save can never wipe an uploaded image (the 6.15.2 bug).
export async function saveProfileText(uid, input, { fb = defaultFb, now = new Date() } = {}) {
  const update = buildProfileTextUpdate({ ...input, uid }, { uid, now });
  await fb.setDoc(profileRef(fb, uid), update, { merge: true });
  return update;
}

// ── Asset uploads ──────────────────────────────────────────────────────────

async function uploadProfileAsset(kind, uid, file, { fb = defaultFb, now = new Date() } = {}) {
  if (!uid) throw Object.assign(new Error('Sign in required'), { code: 'unauthenticated' });
  if (!file) throw Object.assign(new Error('No file selected'), { code: 'no_file' });
  const check = validateAsset(kind === 'avatar' ? 'avatar' : 'profileCover', {
    contentType: file.type, size: file.size,
  });
  if (!check.ok) throw Object.assign(new Error(check.error), { code: 'invalid_asset' });
  if (!fb.storageReady) throw Object.assign(new Error('Storage not configured'), { code: 'storage_unavailable' });

  const assetId = newAssetId();
  const path = kind === 'avatar' ? avatarStoragePath(uid, assetId) : coverStoragePath(uid, assetId);
  const ref = fb.storageRef(fb.storage, path);
  await fb.uploadBytes(ref, file, { contentType: file.type });
  const url = await fb.getDownloadURL(ref);
  const fields = kind === 'avatar'
    ? { avatarURL: url, avatarStoragePath: path, updatedAt: now }
    : { coverURL: url, coverStoragePath: path, updatedAt: now };
  await fb.setDoc(profileRef(fb, uid), fields, { merge: true });
  return fields;
}

export async function uploadProfileAvatar(uid, file, options = {}) {
  return uploadProfileAsset('avatar', uid, file, options);
}
export async function uploadProfileCover(uid, file, options = {}) {
  return uploadProfileAsset('cover', uid, file, options);
}

// ── Username availability + claim ────────────────────────────────────────────

// Returns one of: invalid | reserved | available | owned_by_current_user |
// taken | username_system_unavailable.
export async function checkUsernameAvailability(username, uid, { fb = defaultFb } = {}) {
  if (isReservedUsername(username)) return { status: 'reserved', error: 'This username is reserved.' };
  const result = validateUsername(username);
  if (!result.ok) return { status: 'invalid', error: result.error };
  const lower = result.value;
  if (!fb.firestoreReady) return { status: 'username_system_unavailable' };
  try {
    const snap = await fb.getDoc(usernameRef(fb, lower));
    if (!snap.exists()) return { status: 'available', usernameLower: lower };
    const owner = (snap.data() || {}).uid;
    return owner === uid
      ? { status: 'owned_by_current_user', usernameLower: lower }
      : { status: 'taken', usernameLower: lower };
  } catch (error) {
    if (isPermissionDenied(error)) return { status: 'username_system_unavailable' };
    return { status: 'error' };
  }
}

export async function claimUsername(uid, username, { fb = defaultFb, currentUsernameLower = '', now = new Date() } = {}) {
  if (isReservedUsername(username)) throw Object.assign(new Error('This username is reserved.'), { code: 'reserved_username' });
  const result = validateUsername(username);
  if (!result.ok) throw Object.assign(new Error(result.error), { code: 'invalid_username' });
  const lower = result.value;
  const current = normalizeUsername(currentUsernameLower);
  if (lower === current) return { username: lower, unchanged: true };

  // Inspect any existing reservation first so we can give accurate errors.
  let existing = null;
  try {
    const snap = await fb.getDoc(usernameRef(fb, lower));
    existing = snap.exists() ? (snap.data() || {}) : null;
  } catch (error) {
    if (isPermissionDenied(error)) {
      throw Object.assign(new Error('Username system unavailable'), { code: 'username_rules_blocked' });
    }
    throw Object.assign(new Error('Could not check username'), { code: 'username_check_failed' });
  }

  if (existing && existing.uid === uid) {
    // Already ours — just make sure the profile points at it. No re-create.
    await fb.setDoc(profileRef(fb, uid), { username: lower, usernameLower: lower, updatedAt: now }, { merge: true });
    return { username: lower, unchanged: false, reused: true };
  }
  if (existing && existing.uid !== uid) {
    throw Object.assign(new Error('That username is already taken.'), { code: 'username_taken' });
  }

  const reservation = buildUsernameReservation({ uid, username: lower }, { now });
  const batch = fb.writeBatch(fb.db);
  batch.set(usernameRef(fb, lower), reservation); // rule denies if it now exists (race)
  batch.set(profileRef(fb, uid), { username: lower, usernameLower: lower, updatedAt: now }, { merge: true });
  if (current && current !== lower) {
    batch.delete(usernameRef(fb, current));
  }
  try {
    await batch.commit();
  } catch (error) {
    if (isPermissionDenied(error)) {
      // We pre-confirmed availability, so a denial here means rules/config — not
      // a genuine "taken". (A rare race is also possible; surface the rules hint.)
      throw Object.assign(new Error('Username saving is blocked by Firebase rules or configuration.'), { code: 'username_rules_blocked' });
    }
    throw Object.assign(new Error('Could not save username.'), { code: 'username_save_failed' });
  }
  return { username: lower, unchanged: false };
}

export default {
  loadProfile, loadPublicProfile, saveProfileText,
  uploadProfileAvatar, uploadProfileCover,
  checkUsernameAvailability, claimUsername,
};
