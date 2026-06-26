import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

import {
  sanitizeDisplayName, validateDisplayName, sanitizeBio, sanitizeWebsiteURL,
  normalizeUsername, validateUsername, isReservedUsername, sanitizeUsername,
  safePublicProfile, safeAuthorProfile, buildProfileDocument, buildUsernameReservation,
  canClaimUsername,
} from '../src/user-profile-model.js';
import {
  validateAsset, avatarStoragePath, coverStoragePath, pathBannerStoragePath,
  isAllowedImageType, isAllowedAssetSize,
} from '../src/profile-assets.js';
import {
  sanitizePathPersonalization, safePathPersonalization, canEditPathPersonalization,
  personalizationTouchesProtectedFields, sanitizeAccentColor,
} from '../src/path-personalization-model.js';
import { publicProfileDTO, pathPersonalizationDTO } from '../src/shared-dtos.js';
import { toPublicAuthor, toPublicProfile } from '../server/user-profile-sanitizer.js';
import { profileSectionHTML, profileEditorHTML } from '../src/views/profile-editor.js';
import { pathPersonalizationEditorHTML } from '../src/views/path-personalization-editor.js';
import * as mobileProfile from '../apps/mobile/src/core/mobileProfileMappers.js';
import { createProfileRepository } from '../apps/mobile/src/services/profileRepository.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = resolve(root, 'apps/mobile');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

/* ── 1. Profile model ── */

test('Phase 6.15 displayName validation/sanitization', () => {
  assert.equal(validateDisplayName('  Ada  Lovelace ').value, 'Ada Lovelace');
  assert.equal(validateDisplayName('').ok, false);
  assert.equal(validateDisplayName('x'.repeat(80)).value.length, 60);
});

test('Phase 6.15 bio is length-limited and website sanitized', () => {
  assert.equal(sanitizeBio('a'.repeat(400)).length, 300);
  assert.equal(sanitizeWebsiteURL('https://ok.com/x'), 'https://ok.com/x');
  assert.equal(sanitizeWebsiteURL('javascript:alert(1)'), '');
  assert.equal(sanitizeWebsiteURL('not a url'), '');
});

test('Phase 6.15 safe public profile excludes private fields', () => {
  const profile = buildProfileDocument({
    uid: 'u1', displayName: 'Ada', username: 'ada_l', bio: 'hi',
    email: 'a@x.z', websiteURL: 'https://ada.dev', publicProfileEnabled: true,
  }, { uid: 'u1' });
  const safe = safePublicProfile(profile);
  const json = JSON.stringify(safe);
  assert.doesNotMatch(json, /a@x\.z|email|token|avatarStoragePath|coverStoragePath/i);
  assert.deepEqual(Object.keys(safe).sort(), ['avatarURL', 'bio', 'coverURL', 'displayName', 'publicProfileEnabled', 'uid', 'username'].sort());
});

test('Phase 6.15 publicProfileEnabled false hides extended details', () => {
  const safe = safePublicProfile({ uid: 'u', displayName: 'A', username: 'aaa', bio: 'secret', coverURL: 'https://x/c.png', publicProfileEnabled: false });
  assert.equal(safe.bio, '');
  assert.equal(safe.coverURL, '');
  assert.equal(safe.displayName, 'A'); // display name still allowed
});

/* ── 2. Username ── */

test('Phase 6.15 username normalize/validate/reserved', () => {
  assert.equal(normalizeUsername('  AdaL '), 'adal');
  assert.equal(validateUsername('ada_l.99').ok, true);
  assert.equal(validateUsername('ab').ok, false); // too short
  assert.equal(validateUsername('has space').ok, false);
  assert.equal(validateUsername('Bad$Sym').ok, false);
  assert.equal(isReservedUsername('admin'), true);
  assert.equal(validateUsername('admin').ok, false);
  assert.equal(sanitizeUsername('Valid_Name'), 'valid_name');
});

test('Phase 6.15 username reservation ownership', () => {
  const res = buildUsernameReservation({ uid: 'u1', username: 'Ada_L' });
  assert.equal(res.usernameLower, 'ada_l');
  assert.equal(res.uid, 'u1');
  assert.equal(canClaimUsername({ usernameLower: 'ada_l', uid: 'u1', existingReservation: null }), true);
  assert.equal(canClaimUsername({ usernameLower: 'ada_l', uid: 'u1', existingReservation: { uid: 'u1' } }), true);
  assert.equal(canClaimUsername({ usernameLower: 'ada_l', uid: 'u2', existingReservation: { uid: 'u1' } }), false);
  assert.equal(canClaimUsername({ usernameLower: 'admin', uid: 'u1', existingReservation: null }), false);
});

/* ── 3. Profile assets ── */

test('Phase 6.15 asset paths live under the user profile space', () => {
  assert.match(avatarStoragePath('u1', 'a1'), /^users\/u1\/profile\/avatar\//);
  assert.match(coverStoragePath('u1', 'a1'), /^users\/u1\/profile\/cover\//);
  assert.match(pathBannerStoragePath('u1', 'p1', 'a1'), /^users\/u1\/pathBanners\/p1\//);
});

test('Phase 6.15 asset type/size validation', () => {
  assert.equal(isAllowedImageType('image/png'), true);
  assert.equal(isAllowedImageType('application/pdf'), false);
  assert.equal(isAllowedImageType('video/mp4'), false);
  assert.equal(isAllowedAssetSize('avatar', 1024), true);
  assert.equal(isAllowedAssetSize('avatar', 5 * 1024 * 1024), false);
  assert.equal(validateAsset('avatar', { contentType: 'image/jpeg', size: 1000 }).ok, true);
  assert.equal(validateAsset('avatar', { contentType: 'image/gif', size: 1000 }).ok, false);
  assert.equal(validateAsset('proof', { contentType: 'image/png', size: 10 }).ok, false); // no proof kind
});

test('Phase 6.15 profile cannot reference another user asset path', () => {
  const doc = buildProfileDocument({ uid: 'u1', displayName: 'A', avatarStoragePath: 'users/u2/profile/avatar/x' }, { uid: 'u1' });
  assert.equal(doc.avatarStoragePath, ''); // foreign path stripped
});

/* ── 4. Path personalization ── */

test('Phase 6.15 path personalization sanitization + accent color', () => {
  assert.equal(sanitizeAccentColor('#6D5DF6'), '#6d5df6');
  assert.equal(sanitizeAccentColor('red'), '');
  const p = sanitizePathPersonalization({ publicSubtitle: 'x'.repeat(200), accentColor: '#6d5df6', coverTitle: 'T' }, { uid: 'u1' });
  assert.equal(p.publicSubtitle.length, 140);
  assert.equal(p.accentColor, '#6d5df6');
});

test('Phase 6.15 personalization rejects server-managed/protected fields', () => {
  assert.equal(personalizationTouchesProtectedFields({ stats: {} }), true);
  assert.equal(personalizationTouchesProtectedFields({ ownerId: 'x' }), true);
  assert.equal(personalizationTouchesProtectedFields({ proofSubmissionCount: 1 }), true);
  assert.equal(personalizationTouchesProtectedFields({ publicSubtitle: 'ok' }), false);
  const p = sanitizePathPersonalization({ stats: { x: 1 }, ownerId: 'evil', publicSubtitle: 'ok' }, { uid: 'u1' });
  assert.equal(p.stats, undefined);
  assert.equal(p.ownerId, undefined);
});

test('Phase 6.15 only owner can edit path personalization', () => {
  assert.equal(canEditPathPersonalization({ ownerId: 'u1' }, 'u1'), true);
  assert.equal(canEditPathPersonalization({ creatorId: 'u1' }, 'u1'), true);
  assert.equal(canEditPathPersonalization({ ownerId: 'other' }, 'u1'), false);
  const safe = safePathPersonalization({ personalization: { bannerURL: 'https://x/b.png', bannerStoragePath: 'users/u1/pathBanners/p/x' } });
  assert.doesNotMatch(JSON.stringify(safe), /bannerStoragePath/);
});

/* ── 5. Public surfaces / DTOs / server sanitizer ── */

test('Phase 6.15 publicProfileDTO and author sanitizer exclude private fields', () => {
  const dto = publicProfileDTO({ uid: 'u', displayName: 'A', username: 'aaa', email: 'a@x.z', publicProfileEnabled: true });
  assert.doesNotMatch(JSON.stringify(dto), /a@x\.z|email/);
  const author = toPublicAuthor(null, { creatorName: 'Creator C' });
  assert.equal(author.displayName, 'Creator C');
  const author2 = toPublicAuthor({ uid: 'u', displayName: 'Real Name', username: 'rn' });
  assert.equal(author2.displayName, 'Real Name');
  assert.ok(toPublicProfile({ uid: 'u', displayName: 'A' }));
  assert.ok(pathPersonalizationDTO({ bannerURL: 'https://x/b.png' }));
});

/* ── 6. Web UI ── */

test('Phase 6.15 web profile editor renders inputs and no token', () => {
  const html = profileSectionHTML({ uid: 'u', displayName: 'Ada', username: 'ada_l', bio: 'hi' });
  assert.match(html, /profileDisplayName/);
  assert.match(html, /profileUsername/);
  assert.match(html, /profileBio/);
  assert.match(html, /Save profile/);
  assert.doesNotMatch(html, /idToken|accessToken|Bearer /);
  assert.match(profileEditorHTML({}), /Edit profile/);
});

test('Phase 6.15 path personalization editor is owner-only', () => {
  const ownerHtml = pathPersonalizationEditorHTML({ ownerId: 'u1' }, { uid: 'u1' });
  assert.match(ownerHtml, /Personalize this path/);
  const nonOwner = pathPersonalizationEditorHTML({ ownerId: 'other' }, { uid: 'u1' });
  assert.equal(nonOwner, '');
});

test('Phase 6.15 views.js wires the profile editor into the Profile page', () => {
  const views = read('src/views.js');
  assert.match(views, /profileSectionHTML/);
  assert.match(views, /wireProfileEditor/);
});

/* ── 7. Mobile ── */

test('Phase 6.15 mobile profile mappers match the web model (parity)', () => {
  assert.equal(mobileProfile.sanitizeDisplayName('  A  B '), sanitizeDisplayName('  A  B '));
  assert.equal(mobileProfile.validateUsername('admin').ok, validateUsername('admin').ok);
  assert.equal(mobileProfile.validateUsername('good_name').ok, validateUsername('good_name').ok);
  const profile = { uid: 'u', displayName: 'A', username: 'aaa', bio: 'b', email: 'x@y.z', publicProfileEnabled: true };
  assert.deepEqual(mobileProfile.safePublicProfile(profile), safePublicProfile(profile));
});

test('Phase 6.15 mobile profile repository writes safe text only, own user', async () => {
  const store = {};
  const gateway = {
    getUserDoc: async (uid, sub, id) => (store[`${uid}/${sub}/${id}`] ? { id, data: store[`${uid}/${sub}/${id}`] } : null),
    setUserDoc: async (uid, sub, id, data) => { store[`${uid}/${sub}/${id}`] = data; return { id }; },
    listUserDocs: async () => [],
  };
  const repo = createProfileRepository({ gateway });
  await repo.saveProfileText('u1', { displayName: 'Ada', bio: 'hi', websiteURL: 'https://ada.dev', email: 'a@x.z' });
  const saved = store['u1/profile/main'];
  assert.equal(saved.displayName, 'Ada');
  assert.equal(saved.email, undefined, 'email never written by mobile profile repo');
  assert.equal(saved.username, undefined, 'username managed on web');
});

test('Phase 6.15 ProfileScreen renders profile and never exposes a token', () => {
  const src = read('apps/mobile/src/screens/ProfileScreen.js');
  assert.match(src, /MobileProfileCard/);
  assert.match(src, /MobileProfileEditor/);
  assert.doesNotMatch(src, /getIdToken|idToken|accessToken/);
});

test('Phase 6.15 mobile path banner component displays banner by URL only', () => {
  const src = read('apps/mobile/src/components/MobilePathBanner.js');
  assert.match(src, /bannerURL/);
  assert.match(src, /Image/);
});

/* ── 8. No forbidden behavior ── */

test('Phase 6.15 mobile adds no image-picker/camera/audio/proof-upload deps', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // Phase 6.15 itself added no media deps; camera/audio/etc. stay banned.
  // (expo-image-picker/expo-file-system/async-storage arrive in Phase 6.16.)
  for (const banned of [
    'expo-camera', 'expo-document-picker', 'expo-av',
    'expo-media-library', 'expo-notifications', 'firebase-admin',
  ]) {
    assert.equal(deps[banned], undefined, banned + ' must not be added');
  }
  assert.deepEqual(Object.keys(pkg.dependencies).sort(),
    ['@react-native-async-storage/async-storage', 'expo', 'expo-file-system', 'expo-image-picker', 'firebase', 'react', 'react-native']);
});

test('Phase 6.15 no camera/audio capture or admin in mobile source', () => {
  // Media upload (image-picker/Storage) arrives in Phase 6.16; camera/audio and
  // the Admin SDK remain banned on mobile.
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /expo-camera|expo-av|CameraView/, file);
    assert.doesNotMatch(src, /from\s+['"]firebase-admin/, file);
  }
});

test('Phase 6.15 no social/economy copy in new profile source', () => {
  for (const f of [
    'src/user-profile-model.js', 'src/path-personalization-model.js',
    'apps/mobile/src/screens/ProfileScreen.js', 'apps/mobile/src/components/MobileProfileCard.js',
  ]) {
    assert.doesNotMatch(read(f), /leaderboard|\bfollowers?\b|\bfollowing\b|ranking|hearts|gems|\bshop\b/i, f);
  }
});

test('Phase 6.15 Vercel function count unchanged (ai/community/voice)', () => {
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  assert.ok(files.length < 12);
});

/* ── 9. Firestore + Storage rules ── */

test('Phase 6.15 Firestore rules: usernames collection + strict user space', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/usernames\/\{usernameLower\}/);
  assert.match(rules, /allow create: if signedIn\(\)[\s\S]*?request\.resource\.data\.uid == request\.auth\.uid/);
  assert.match(rules, /allow update: if false/);
  assert.match(rules, /match \/users\/\{uid\}\/\{document=\*\*\}/);
  assert.match(rules, /match \/participantStats\/\{uid\}\s*\{\s*allow read, write: if false/);
  assert.match(rules, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
});

test('Phase 6.15 Storage rules: profile/banner image paths, no generic/proof upload', () => {
  const rules = read('storage.rules');
  assert.match(rules, /match \/users\/\{userId\}\/profile\/avatar\/\{assetId\}/);
  assert.match(rules, /match \/users\/\{userId\}\/profile\/cover\/\{assetId\}/);
  assert.match(rules, /match \/users\/\{userId\}\/pathBanners\/\{pathId\}\/\{assetId\}/);
  assert.match(rules, /validProfileImage/);
  // image-only content types for profile assets
  assert.match(rules, /image\/webp/);
  // no generic catch-all upload path was added
  assert.doesNotMatch(rules, /match \/\{allPaths=\*\*\}/);
});

/* ── 10. Docs ── */

test('Phase 6.15 documentation exists and references the phase', () => {
  assert.ok(existsSync(resolve(root, 'docs/account-profile-path-personalization.md')));
  assert.match(read('README.md'), /Phase 6\.15/);
  assert.match(read('apps/mobile/README.md'), /profile|personalization/i);
  const doc = read('docs/account-profile-path-personalization.md');
  assert.match(doc, /username/i);
  assert.match(doc, /6\.16/);
});
