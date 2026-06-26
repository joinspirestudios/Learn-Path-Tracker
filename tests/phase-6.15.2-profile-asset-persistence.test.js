import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  saveProfileText, uploadProfileAvatar, uploadProfileCover, loadProfile,
} from '../src/user-profile-db.js';
import {
  buildProfileTextUpdate, safePublicProfile, safeAuthorProfile,
} from '../src/user-profile-model.js';
import { profilePreviewCardHTML, profileAvatarMarkHTML } from '../src/views/profile-editor.js';
import { renderShellNav } from '../src/ui/core-layout.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }

// A path-keyed fake Firestore + Storage wrapper that MERGES like Firestore.
function fakeFb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const state = { uploaded: [] };
  const fb = {
    firestoreReady: true,
    storageReady: true,
    db: {}, storage: {},
    doc: (db, ...segs) => ({ path: segs.join('/') }),
    getDoc: async (ref) => {
      const data = docs.get(ref.path);
      return { exists: () => data != null, data: () => (data ? { ...data } : null) };
    },
    setDoc: async (ref, data, opts = {}) => {
      const prev = docs.get(ref.path) || {};
      docs.set(ref.path, opts.merge ? { ...prev, ...data } : { ...data });
    },
    storageRef: (s, path) => ({ path }),
    uploadBytes: async (ref, file) => { state.uploaded.push(ref.path); },
    getDownloadURL: async (ref) => 'https://download.example/' + ref.path,
    writeBatch: () => ({ set() {}, delete() {}, async commit() {} }),
  };
  return { fb, docs, state };
}

/* ── 1. Root cause: text save must NOT clear asset fields ── */

test('Phase 6.15.2 buildProfileTextUpdate omits all image asset fields', () => {
  const update = buildProfileTextUpdate({
    uid: 'u1', displayName: 'Ada', bio: 'hi',
    avatarURL: 'https://x/a.png', avatarStoragePath: 'users/u1/profile/avatar/a',
    coverURL: 'https://x/c.png', coverStoragePath: 'users/u1/profile/cover/c',
  }, { uid: 'u1' });
  assert.equal(update.avatarURL, undefined);
  assert.equal(update.avatarStoragePath, undefined);
  assert.equal(update.coverURL, undefined);
  assert.equal(update.coverStoragePath, undefined);
  assert.equal(update.displayName, 'Ada');
});

test('Phase 6.15.2 saveProfileText never writes image fields', async () => {
  const { fb, docs } = fakeFb();
  await saveProfileText('u1', { displayName: 'Ada', bio: 'hi', avatarURL: 'https://x/a.png', coverURL: 'https://x/c.png' }, { fb });
  const saved = docs.get('users/u1/profile/main');
  assert.equal(saved.avatarURL, undefined);
  assert.equal(saved.coverURL, undefined);
  assert.equal(saved.avatarStoragePath, undefined);
  assert.equal(saved.coverStoragePath, undefined);
});

test('Phase 6.15.2 a text-only save AFTER upload preserves the uploaded image fields', async () => {
  const { fb, docs } = fakeFb();
  // 1. upload avatar + cover
  await uploadProfileAvatar('u1', { type: 'image/png', size: 1000 }, { fb });
  await uploadProfileCover('u1', { type: 'image/jpeg', size: 2000 }, { fb });
  const afterUpload = docs.get('users/u1/profile/main');
  assert.ok(afterUpload.avatarURL && afterUpload.coverURL);
  // 2. text-only save
  await saveProfileText('u1', { displayName: 'Ada', bio: 'updated' }, { fb });
  const afterText = docs.get('users/u1/profile/main');
  assert.equal(afterText.avatarURL, afterUpload.avatarURL, 'avatar preserved');
  assert.equal(afterText.coverURL, afterUpload.coverURL, 'cover preserved');
  assert.equal(afterText.avatarStoragePath, afterUpload.avatarStoragePath);
  assert.equal(afterText.coverStoragePath, afterUpload.coverStoragePath);
  assert.equal(afterText.displayName, 'Ada');
  // 3. loadProfile returns the preserved image fields
  const loaded = await loadProfile('u1', { fb });
  assert.ok(loaded.avatarURL && loaded.coverURL);
});

/* ── 2. Upload functions ── */

test('Phase 6.15.2 uploadProfileAvatar writes avatarURL/avatarStoragePath to the user path', async () => {
  const { fb, docs, state } = fakeFb();
  const res = await uploadProfileAvatar('u1', { type: 'image/webp', size: 1000 }, { fb });
  assert.match(state.uploaded[0], /^users\/u1\/profile\/avatar\//);
  assert.match(res.avatarURL, /^https:\/\/download\.example\//);
  assert.match(res.avatarStoragePath, /^users\/u1\/profile\/avatar\//);
  assert.ok(docs.get('users/u1/profile/main').avatarURL);
});

test('Phase 6.15.2 uploadProfileCover writes coverURL/coverStoragePath to the user path', async () => {
  const { fb, state } = fakeFb();
  const res = await uploadProfileCover('u1', { type: 'image/png', size: 2000 }, { fb });
  assert.match(state.uploaded[0], /^users\/u1\/profile\/cover\//);
  assert.match(res.coverURL, /^https:\/\/download\.example\//);
  assert.match(res.coverStoragePath, /^users\/u1\/profile\/cover\//);
});

test('Phase 6.15.2 uploads validate type and size', async () => {
  const { fb } = fakeFb();
  await assert.rejects(() => uploadProfileAvatar('u1', { type: 'application/pdf', size: 100 }, { fb }), e => e.code === 'invalid_asset');
  await assert.rejects(() => uploadProfileCover('u1', { type: 'image/png', size: 99 * 1024 * 1024 }, { fb }), e => e.code === 'invalid_asset');
});

/* ── 3. Save flow wiring (source-level) ── */

test('Phase 6.15.2 wireProfileEditor validates files, uploads, and reloads without clearing on no-file', () => {
  const views = read('src/views.js');
  const block = views.slice(views.indexOf('function wireProfileEditor'), views.indexOf('function wireProfileEditor') + 4000);
  assert.match(block, /uploadProfileAvatar/);
  assert.match(block, /uploadProfileCover/);
  assert.match(block, /saveProfileText/);
  assert.match(block, /loadProfile/);
  // uploads only run when a file is pending — no unconditional clearing.
  assert.match(block, /if\(pendingAvatar\)/);
  assert.match(block, /if\(pendingCover\)/);
  assert.doesNotMatch(block, /avatarURL\s*:\s*''/);
});

/* ── 4. Rendering ── */

test('Phase 6.15.2 profile preview renders avatar + cover when present, initials otherwise', () => {
  const withImages = profilePreviewCardHTML({ uid: 'u', displayName: 'Ada', avatarURL: 'https://x/a.png', coverURL: 'https://x/c.png', publicProfileEnabled: true });
  assert.match(withImages, /aurora-profile-avatar"[^>]*src="https:\/\/x\/a\.png"/);
  assert.match(withImages, /aurora-profile-cover"[^>]*src="https:\/\/x\/c\.png"/);
  const noImages = profileAvatarMarkHTML({ displayName: 'Ada Lovelace' });
  assert.match(noImages, /is-empty/);
  assert.match(noImages, />AL</);
});

test('Phase 6.15.2 side nav renders avatar image and initials fallback', () => {
  const withAvatar = renderShellNav({ active: 'today', user: { displayName: 'Ada', username: 'ada_l', avatarURL: 'https://x/a.png' } });
  assert.match(withAvatar, /<img[^>]*aurora-side-nav-avatar[^>]*src="https:\/\/x\/a\.png"|aurora-side-nav-avatar"[^>]*src="https:\/\/x\/a\.png"/);
  const initials = renderShellNav({ active: 'today', user: { displayName: 'Ada Lovelace' } });
  assert.match(initials, /aurora-side-nav-avatar is-empty/);
});

test('Phase 6.15.2 appShellHTML passes avatarURL into the shell user object', () => {
  const views = read('src/views.js');
  assert.match(views, /avatarURL:\s*profile\.avatarURL/);
});

/* ── 5. Mobile display ── */

test('Phase 6.15.2 MobileProfileCard renders avatar and cover by URL', () => {
  const src = read('apps/mobile/src/components/MobileProfileCard.js');
  assert.match(src, /avatarURL/);
  assert.match(src, /coverURL/);
  assert.match(src, /Image/);
});

test('Phase 6.15.2 mobile editor does not claim mobile image upload', () => {
  const src = read('apps/mobile/src/components/MobileProfileEditor.js');
  assert.match(src, /uploaded on web/i);
  assert.doesNotMatch(src, /ImagePicker|launchImageLibrary|expo-image-picker/);
});

/* ── 6. Public-safe profile ── */

test('Phase 6.15.2 safePublicProfile preserves avatarURL, gates coverURL, hides storage paths', () => {
  const pub = safePublicProfile({ uid: 'u', displayName: 'A', avatarURL: 'https://x/a.png', coverURL: 'https://x/c.png', avatarStoragePath: 'users/u/profile/avatar/a', publicProfileEnabled: true });
  assert.equal(pub.avatarURL, 'https://x/a.png');
  assert.equal(pub.coverURL, 'https://x/c.png');
  assert.equal(pub.avatarStoragePath, undefined);
  assert.equal(pub.coverStoragePath, undefined);
  const priv = safePublicProfile({ uid: 'u', displayName: 'A', avatarURL: 'https://x/a.png', coverURL: 'https://x/c.png', publicProfileEnabled: false });
  assert.equal(priv.coverURL, '', 'cover hidden when profile private');
  assert.equal(priv.avatarURL, 'https://x/a.png', 'avatar still allowed');
  const author = safeAuthorProfile({ uid: 'u', displayName: 'A', avatarURL: 'https://x/a.png', publicProfileEnabled: true });
  assert.equal(author.avatarURL, 'https://x/a.png');
});

/* ── 7. No forbidden behavior + rules unchanged ── */

test('Phase 6.15.2 mobile deps unchanged; Vercel function count unchanged', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@react-native-async-storage/async-storage', 'expo', 'expo-file-system', 'expo-image-picker', 'expo-notifications', 'firebase', 'react', 'react-native']);
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
});

test('Phase 6.15.2 Firestore + Storage rules remain strict and narrow', () => {
  const fr = read('firestore.rules');
  assert.match(fr, /match \/usernames\/\{usernameLower\}/);
  assert.match(fr, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
  const sr = read('storage.rules');
  assert.match(sr, /match \/users\/\{userId\}\/profile\/avatar\/\{assetId\}/);
  assert.match(sr, /match \/users\/\{userId\}\/profile\/cover\/\{assetId\}/);
  assert.doesNotMatch(sr, /match \/\{allPaths=\*\*\}/);
});
