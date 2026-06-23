// User profile persistence (web). Thin wrapper over the Firestore client.
//
// Profile doc:        users/{uid}/profile/main
// Username reservation: usernames/{usernameLower}
//
// Username uniqueness is guaranteed by Firestore rules (create-only-when-absent)
// combined with a writeBatch here — not by client-side checks alone.

import { fb as defaultFb } from './firebase.js';
import {
  buildProfileDocument, buildUsernameReservation, sanitizeUsername, safePublicProfile,
} from './user-profile-model.js';

function profileRef(fb, uid) {
  return fb.doc(fb.db, 'users', uid, 'profile', 'main');
}
function usernameRef(fb, usernameLower) {
  return fb.doc(fb.db, 'usernames', usernameLower);
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

// Save text profile fields (no username, no asset paths) — safe merge write.
export async function saveProfileText(uid, input, { fb = defaultFb, now = new Date() } = {}) {
  const doc = buildProfileDocument({ ...input, uid }, { uid, now });
  // Username/asset paths are managed by dedicated calls; strip them here.
  const { username, usernameLower, avatarStoragePath, coverStoragePath, ...rest } = doc;
  await fb.setDoc(profileRef(fb, uid), rest, { merge: true });
  return rest;
}

// Claim (or change) a username atomically via batch. The reservation create is
// gated by Firestore rules so a taken username makes the whole batch fail.
export async function claimUsername(uid, username, { fb = defaultFb, currentUsernameLower = '', now = new Date() } = {}) {
  const lower = sanitizeUsername(username);
  if (!lower) throw new Error('Invalid username');
  if (lower === currentUsernameLower) return { username: lower, unchanged: true };

  const reservation = buildUsernameReservation({ uid, username: lower }, { now });
  const batch = fb.writeBatch(fb.db);
  batch.set(usernameRef(fb, lower), reservation); // rule denies if already taken
  batch.set(profileRef(fb, uid), { username: lower, usernameLower: lower, updatedAt: now }, { merge: true });
  if (currentUsernameLower && currentUsernameLower !== lower) {
    batch.delete(usernameRef(fb, currentUsernameLower));
  }
  await batch.commit();
  return { username: lower, unchanged: false };
}

export default { loadProfile, loadPublicProfile, saveProfileText, claimUsername };
