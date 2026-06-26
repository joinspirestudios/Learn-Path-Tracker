import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  uploadProfileAvatar, uploadProfileCover, checkUsernameAvailability, claimUsername,
} from '../src/user-profile-db.js';
import { renderShellNav } from '../src/ui/core-layout.js';
import { profilePreviewCardHTML, profileEditorHTML, profileAvatarMarkHTML } from '../src/views/profile-editor.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }

// ── Fake Firebase wrapper ──
function fakeFb(overrides = {}) {
  const state = { saved: [], uploaded: null, batchOps: [], committed: false };
  const fb = {
    firestoreReady: true,
    storageReady: true,
    db: {}, storage: {},
    doc: (db, ...segs) => ({ path: segs.join('/') }),
    getDoc: async () => ({ exists: () => false, data: () => ({}) }),
    setDoc: async (ref, data, opts) => { state.saved.push({ path: ref.path, data, opts }); },
    storageRef: (s, path) => ({ path }),
    uploadBytes: async (ref, file, meta) => { state.uploaded = { path: ref.path, file, meta }; },
    getDownloadURL: async (ref) => 'https://download.example/' + ref.path,
    writeBatch: () => ({
      set: (ref, data) => state.batchOps.push({ op: 'set', path: ref.path, data }),
      delete: (ref) => state.batchOps.push({ op: 'delete', path: ref.path }),
      commit: async () => { state.committed = true; },
    }),
    ...overrides,
  };
  return { fb, state };
}

/* ── 1. Profile asset upload ── */

test('Phase 6.15.1 uploadProfileAvatar uploads and saves avatar URL + path', async () => {
  const { fb, state } = fakeFb();
  const result = await uploadProfileAvatar('u1', { type: 'image/png', size: 1000 }, { fb });
  assert.match(state.uploaded.path, /^users\/u1\/profile\/avatar\//);
  assert.match(result.avatarURL, /^https:\/\/download\.example\//);
  assert.match(result.avatarStoragePath, /^users\/u1\/profile\/avatar\//);
  const saved = state.saved[0];
  assert.match(saved.path, /users\/u1\/profile\/main/);
  assert.ok(saved.data.avatarURL && saved.data.avatarStoragePath);
  assert.equal(saved.opts.merge, true);
});

test('Phase 6.15.1 uploadProfileCover uploads and saves cover URL + path', async () => {
  const { fb, state } = fakeFb();
  const result = await uploadProfileCover('u1', { type: 'image/jpeg', size: 2000 }, { fb });
  assert.match(state.uploaded.path, /^users\/u1\/profile\/cover\//);
  assert.match(result.coverURL, /^https:\/\/download\.example\//);
  assert.match(result.coverStoragePath, /^users\/u1\/profile\/cover\//);
});

test('Phase 6.15.1 upload rejects non-image and oversized files', async () => {
  const { fb } = fakeFb();
  await assert.rejects(() => uploadProfileAvatar('u1', { type: 'application/pdf', size: 1000 }, { fb }), e => e.code === 'invalid_asset');
  await assert.rejects(() => uploadProfileAvatar('u1', { type: 'image/png', size: 5 * 1024 * 1024 }, { fb }), e => e.code === 'invalid_asset');
});

test('Phase 6.15.1 upload functions use storage + firestore wiring in source', () => {
  const src = read('src/user-profile-db.js');
  assert.match(src, /validateAsset/);
  assert.match(src, /avatarStoragePath/);
  assert.match(src, /coverStoragePath/);
  assert.match(src, /uploadBytes/);
  assert.match(src, /getDownloadURL/);
  assert.doesNotMatch(src, /evidence\//);
});

/* ── 2. Username availability ── */

test('Phase 6.15.1 checkUsernameAvailability: available / owned / taken', async () => {
  const free = fakeFb({ getDoc: async () => ({ exists: () => false }) });
  assert.equal((await checkUsernameAvailability('ada_l', 'u1', { fb: free.fb })).status, 'available');

  const owned = fakeFb({ getDoc: async () => ({ exists: () => true, data: () => ({ uid: 'u1' }) }) });
  assert.equal((await checkUsernameAvailability('ada_l', 'u1', { fb: owned.fb })).status, 'owned_by_current_user');

  const taken = fakeFb({ getDoc: async () => ({ exists: () => true, data: () => ({ uid: 'other' }) }) });
  assert.equal((await checkUsernameAvailability('ada_l', 'u1', { fb: taken.fb })).status, 'taken');
});

test('Phase 6.15.1 checkUsernameAvailability: invalid / reserved / permission-denied', async () => {
  const { fb } = fakeFb();
  assert.equal((await checkUsernameAvailability('ab', 'u1', { fb })).status, 'invalid');
  assert.equal((await checkUsernameAvailability('admin', 'u1', { fb })).status, 'reserved');
  const denied = fakeFb({ getDoc: async () => { throw Object.assign(new Error('x'), { code: 'permission-denied' }); } });
  assert.equal((await checkUsernameAvailability('ada_l', 'u1', { fb: denied.fb })).status, 'username_system_unavailable');
});

/* ── 3. Username claim ── */

test('Phase 6.15.1 claimUsername reuses an existing same-user reservation (no recreate)', async () => {
  const { fb, state } = fakeFb({ getDoc: async () => ({ exists: () => true, data: () => ({ uid: 'u1' }) }) });
  const res = await claimUsername('u1', 'ada_l', { fb, currentUsernameLower: '' });
  assert.equal(res.reused, true);
  assert.equal(state.committed, false, 'no batch / no reservation recreate');
  assert.ok(state.saved.length >= 1);
});

test('Phase 6.15.1 claimUsername creates reservation when available', async () => {
  const { fb, state } = fakeFb({ getDoc: async () => ({ exists: () => false }) });
  await claimUsername('u1', 'newname', { fb, currentUsernameLower: '' });
  assert.equal(state.committed, true);
  assert.ok(state.batchOps.some(o => o.op === 'set' && /usernames\/newname/.test(o.path)));
});

test('Phase 6.15.1 claimUsername rejects reserved and taken-by-other', async () => {
  const { fb } = fakeFb();
  await assert.rejects(() => claimUsername('u1', 'admin', { fb }), e => e.code === 'reserved_username');
  const other = fakeFb({ getDoc: async () => ({ exists: () => true, data: () => ({ uid: 'other' }) }) });
  await assert.rejects(() => claimUsername('u1', 'ada_l', { fb: other.fb }), e => e.code === 'username_taken');
});

test('Phase 6.15.1 claimUsername maps permission-denied to rules-blocked, NOT taken', async () => {
  const denied = fakeFb({ getDoc: async () => { throw Object.assign(new Error('x'), { code: 'permission-denied' }); } });
  await assert.rejects(() => claimUsername('u1', 'ada_l', { fb: denied.fb }), e => e.code === 'username_rules_blocked');
});

test('Phase 6.15.1 views.js no longer maps every permission-denied to taken', () => {
  const views = read('src/views.js');
  assert.match(views, /checkUsernameAvailability/);
  assert.match(views, /username_rules_blocked/);
  assert.match(views, /blocked by Firebase rules or configuration/);
  // The old blanket mapping is gone.
  assert.doesNotMatch(views, /permission-denied'\s*\?\s*'That username is taken/);
});

/* ── 4. Sidebar / avatar placement ── */

test('Phase 6.15.1 side nav user block renders avatar image', () => {
  const html = renderShellNav({ active: 'today', user: { displayName: 'Ada', username: 'ada_l', avatarURL: 'https://x/a.png' } });
  assert.match(html, /aurora-side-nav-avatar/);
  assert.match(html, /<img[^>]*src="https:\/\/x\/a\.png"/);
  assert.match(html, /@ada_l/);
});

test('Phase 6.15.1 side nav user block falls back to initials without avatar', () => {
  const html = renderShellNav({ active: 'today', user: { displayName: 'Ada Lovelace' } });
  assert.match(html, /aurora-side-nav-avatar is-empty/);
  assert.match(html, />AL</);
  assert.doesNotMatch(html, /idToken|accessToken|Bearer /);
});

/* ── 5. Profile preview rendering ── */

test('Phase 6.15.1 profile preview renders avatar and cover images when present', () => {
  const html = profilePreviewCardHTML({ uid: 'u', displayName: 'Ada', username: 'ada_l', avatarURL: 'https://x/a.png', coverURL: 'https://x/c.png', publicProfileEnabled: true });
  assert.match(html, /aurora-profile-cover"[^>]*src="https:\/\/x\/c\.png"/);
  assert.match(html, /aurora-profile-avatar"[^>]*src="https:\/\/x\/a\.png"/);
});

test('Phase 6.15.1 profile preview falls back to initials avatar mark', () => {
  const mark = profileAvatarMarkHTML({ displayName: 'Ada Lovelace' });
  assert.match(mark, /is-empty/);
  assert.match(mark, />AL</);
});

test('Phase 6.15.1 editor has file inputs and preview img elements', () => {
  const html = profileEditorHTML({});
  assert.match(html, /id="profileAvatarFile"/);
  assert.match(html, /id="profileCoverFile"/);
  assert.match(html, /id="profileAvatarPreview"/);
  assert.match(html, /id="profileCoverPreview"/);
});

/* ── 6. Mobile display ── */

test('Phase 6.15.1 mobile profile card renders avatar/cover by URL', () => {
  const src = read('apps/mobile/src/components/MobileProfileCard.js');
  assert.match(src, /avatarURL/);
  assert.match(src, /coverURL/);
  assert.match(src, /Image/);
});

test('Phase 6.15.1 mobile editor states image upload is on web (no fake upload)', () => {
  const src = read('apps/mobile/src/components/MobileProfileEditor.js');
  assert.match(src, /uploaded on web/i);
  assert.doesNotMatch(src, /ImagePicker|launchImageLibrary|expo-image-picker/);
});

/* ── 7. No forbidden behavior ── */

test('Phase 6.15.1 no new mobile deps and no proof/camera/notification deps', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@react-native-async-storage/async-storage', 'expo', 'expo-file-system', 'expo-image-picker', 'expo-notifications', 'firebase', 'react', 'react-native']);
});

test('Phase 6.15.1 Vercel function count unchanged', () => {
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  assert.ok(files.length < 12);
});

/* ── 8. Rules remain strict ── */

test('Phase 6.15.1 Firestore + Storage rules remain strict and narrow', () => {
  const fr = read('firestore.rules');
  assert.match(fr, /match \/usernames\/\{usernameLower\}/);
  assert.match(fr, /allow update: if false/);
  assert.match(fr, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
  const sr = read('storage.rules');
  assert.match(sr, /match \/users\/\{userId\}\/profile\/avatar\/\{assetId\}/);
  assert.match(sr, /match \/users\/\{userId\}\/profile\/cover\/\{assetId\}/);
  assert.doesNotMatch(sr, /match \/\{allPaths=\*\*\}/);
});
