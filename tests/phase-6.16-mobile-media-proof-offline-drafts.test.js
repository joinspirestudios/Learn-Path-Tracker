import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isAllowedMediaType, isAllowedMediaSize, mediaProofKind, validateMediaAsset,
  mediaProofStoragePath, normalizeMediaAsset, mediaProofRecord, MEDIA_PROOF_MAX_BYTES,
} from '../apps/mobile/src/core/mobileMediaProofMappers.js';
import {
  createProofDraft, addDraft, removeDraft, markDraftStatus, pendingDrafts,
  nextPendingDraft, isQueueEmpty,
} from '../apps/mobile/src/core/mobileOfflineDrafts.js';
import {
  UPLOAD_STATUS, deriveUploadStatus, isPendingUpload, uploadStatusLabel,
} from '../apps/mobile/src/core/mobileProofUploadState.js';
import { createMobileProofStorageRepository } from '../apps/mobile/src/services/mobileProofStorageRepository.js';
import { createMobileMediaProofRepository } from '../apps/mobile/src/services/mobileMediaProofRepository.js';
import { createMobileOfflineDraftRepository } from '../apps/mobile/src/services/mobileOfflineDraftRepository.js';

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

const imageAsset = { uri: 'file:///tmp/a.png', fileName: 'a.png', mimeType: 'image/png', size: 1000 };
const pdfAsset = { uri: 'file:///tmp/r.pdf', fileName: 'r.pdf', mimeType: 'application/pdf', size: 2000 };

/* ── 1. Files exist ── */

test('Phase 6.16 all expected files exist', () => {
  const files = [
    'apps/mobile/src/services/mobileMediaProofRepository.js',
    'apps/mobile/src/services/mobileProofStorageRepository.js',
    'apps/mobile/src/services/mobileOfflineDraftRepository.js',
    'apps/mobile/src/core/mobileMediaProofMappers.js',
    'apps/mobile/src/core/mobileOfflineDrafts.js',
    'apps/mobile/src/core/mobileProofUploadState.js',
    'apps/mobile/src/components/MobileMediaProofPicker.js',
    'apps/mobile/src/components/MobileProofDraftCard.js',
    'apps/mobile/src/components/MobileUploadStatusBanner.js',
    'apps/mobile/src/components/MobileProofThumbnail.js',
    'docs/mobile-media-proof-offline-drafts.md',
  ];
  for (const f of files) assert.ok(existsSync(resolve(root, f)), 'missing ' + f);
});

/* ── 2. Dependencies ── */

test('Phase 6.16 mobile deps include image-picker/file-system/async-storage; root does not', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  assert.ok(pkg.dependencies['expo-image-picker'], 'expo-image-picker present');
  assert.ok(pkg.dependencies['expo-file-system'], 'expo-file-system present');
  assert.ok(pkg.dependencies['@react-native-async-storage/async-storage'], 'async-storage present');
  // Still no camera/audio.
  assert.equal(pkg.dependencies['expo-camera'], undefined);
  assert.equal(pkg.dependencies['expo-av'], undefined);
  const rootPkg = JSON.parse(read('package.json'));
  const rootDeps = { ...rootPkg.dependencies, ...rootPkg.devDependencies };
  for (const d of ['expo-image-picker', 'expo-file-system', '@react-native-async-storage/async-storage', 'expo', 'react-native']) {
    assert.equal(rootDeps[d], undefined, d + ' must not be a root dependency');
  }
});

test('Phase 6.16 test is registered in root npm test', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.test, /phase-6\.16-mobile-media-proof-offline-drafts\.test\.js/);
});

/* ── 3. Media proof mappers ── */

test('Phase 6.16 media type/size validation (image+pdf, <=10MB)', () => {
  assert.equal(isAllowedMediaType('image/png'), true);
  assert.equal(isAllowedMediaType('application/pdf'), true);
  assert.equal(isAllowedMediaType('video/mp4'), false);
  assert.equal(isAllowedMediaSize(1000), true);
  assert.equal(isAllowedMediaSize(MEDIA_PROOF_MAX_BYTES + 1), false);
  assert.equal(validateMediaAsset(imageAsset).ok, true);
  assert.equal(validateMediaAsset({ uri: 'x', mimeType: 'video/mp4', size: 10 }).ok, false);
  assert.equal(validateMediaAsset({ uri: 'x', mimeType: 'image/png', size: 99 * 1024 * 1024 }).ok, false);
});

test('Phase 6.16 media kind + storage path under owner evidence path', () => {
  assert.equal(mediaProofKind(imageAsset), 'image');
  assert.equal(mediaProofKind(pdfAsset), 'file');
  const path = mediaProofStoragePath({ uid: 'u1', enrollmentId: 'e1', assetId: 'x' });
  assert.match(path, /^evidence\/u1\/e1\//);
});

test('Phase 6.16 media proof record is private/submitted, never verified', () => {
  const rec = mediaProofRecord({ taskId: 't', dayNumber: 2, pathId: 'p', uid: 'u', asset: imageAsset, storagePath: 'evidence/u/e/x', downloadURL: 'https://dl/x' });
  assert.equal(rec.privacy, 'private');
  assert.equal(rec.submitted, true);
  assert.equal(rec.verified, false);
  assert.equal(rec.proofKind, 'image');
  assert.equal(rec.fileName, 'a.png');
});

/* ── 4. Offline draft queue ── */

test('Phase 6.16 offline draft queue add/remove/status/pending', () => {
  const draft = createProofDraft({ pathId: 'p', dayNumber: 1, taskId: 't', asset: imageAsset, uid: 'u' });
  assert.equal(draft.status, UPLOAD_STATUS.QUEUED);
  let drafts = addDraft([], draft);
  assert.equal(drafts.length, 1);
  assert.equal(isQueueEmpty(drafts), false);
  assert.equal(nextPendingDraft(drafts).id, draft.id);
  drafts = markDraftStatus(drafts, draft.id, UPLOAD_STATUS.UPLOADED);
  assert.equal(pendingDrafts(drafts).length, 0);
  assert.equal(isQueueEmpty(drafts), true);
  drafts = removeDraft(drafts, draft.id);
  assert.equal(drafts.length, 0);
});

test('Phase 6.16 draft stores only a local URI reference, no file bytes', () => {
  const draft = createProofDraft({ pathId: 'p', dayNumber: 1, taskId: 't', asset: { ...imageAsset, bytes: 'SHOULD_NOT_PERSIST' }, uid: 'u' });
  assert.equal(draft.asset.uri, 'file:///tmp/a.png');
  assert.doesNotMatch(JSON.stringify(draft), /SHOULD_NOT_PERSIST/);
});

/* ── 5. Upload state ── */

test('Phase 6.16 upload status transitions + offline queue', () => {
  assert.equal(deriveUploadStatus({ queued: true, online: false }), UPLOAD_STATUS.OFFLINE_QUEUED);
  assert.equal(deriveUploadStatus({ queued: true, online: true }), UPLOAD_STATUS.QUEUED);
  assert.equal(deriveUploadStatus({ uploading: true }), UPLOAD_STATUS.UPLOADING);
  assert.equal(deriveUploadStatus({ uploaded: true }), UPLOAD_STATUS.UPLOADED);
  assert.equal(isPendingUpload(UPLOAD_STATUS.FAILED), true);
  assert.doesNotMatch(uploadStatusLabel(UPLOAD_STATUS.UPLOADED), /verified/i);
});

/* ── 6. Repositories (DI, no live services) ── */

test('Phase 6.16 storage repo uploads to evidence path via injected gateway', async () => {
  const calls = [];
  const storageGateway = { uploadFile: async (path, blob, meta) => { calls.push({ path, meta }); return { path, downloadURL: 'https://dl/' + path }; } };
  const repo = createMobileProofStorageRepository({ storageGateway, fetchBlob: async () => ({ fake: 'blob' }) });
  const res = await repo.uploadMediaProof({ uid: 'u1', enrollmentId: 'e1', asset: imageAsset });
  assert.match(res.storagePath, /^evidence\/u1\/e1\//);
  assert.match(res.downloadURL, /^https:\/\/dl\//);
  assert.equal(calls[0].meta.contentType, 'image/png');
});

test('Phase 6.16 storage repo rejects invalid media before upload', async () => {
  const storageGateway = { uploadFile: async () => { throw new Error('should not be called'); } };
  const repo = createMobileProofStorageRepository({ storageGateway, fetchBlob: async () => ({}) });
  await assert.rejects(() => repo.uploadMediaProof({ uid: 'u1', enrollmentId: 'e1', asset: { uri: 'x', mimeType: 'video/mp4', size: 10 } }), e => e.code === 'invalid_media');
});

test('Phase 6.16 media proof repo orchestrates validate->upload->record', async () => {
  const storageRepo = { uploadMediaProof: async () => ({ storagePath: 'evidence/u/e/x', downloadURL: 'https://dl/x' }) };
  const repo = createMobileMediaProofRepository({ storageRepo });
  const rec = await repo.submitMediaProof({ uid: 'u', pathId: 'p', enrollmentId: 'e', dayNumber: 1, taskId: 't', asset: imageAsset });
  assert.equal(rec.verified, false);
  assert.equal(rec.privacy, 'private');
  assert.equal(rec.storagePath, 'evidence/u/e/x');
  await assert.rejects(() => repo.submitMediaProof({ uid: 'u', asset: { uri: 'x', mimeType: 'video/mp4', size: 1 } }), e => e.code === 'invalid_media');
});

test('Phase 6.16 offline draft repo persists via injected storage adapter', async () => {
  const mem = {};
  const storage = {
    getItem: async k => (k in mem ? mem[k] : null),
    setItem: async (k, v) => { mem[k] = v; },
    removeItem: async k => { delete mem[k]; },
  };
  const repo = createMobileOfflineDraftRepository({ storage });
  const draft = createProofDraft({ pathId: 'p', dayNumber: 1, taskId: 't', asset: imageAsset, uid: 'u' });
  await repo.saveDraft(draft);
  let loaded = await repo.loadDrafts();
  assert.equal(loaded.length, 1);
  assert.equal((await repo.nextPending()).id, draft.id);
  await repo.setDraftStatus(draft.id, UPLOAD_STATUS.UPLOADED);
  assert.equal((await repo.pending()).length, 0);
  await repo.removeDraft(draft.id);
  assert.equal((await repo.loadDrafts()).length, 0);
});

/* ── 7. Components (source-level; no expo import at test time) ── */

test('Phase 6.16 media picker uses library only (no camera/audio)', () => {
  const src = read('apps/mobile/src/components/MobileMediaProofPicker.js');
  assert.match(src, /expo-image-picker/);
  assert.match(src, /launchImageLibraryAsync/);
  assert.doesNotMatch(src, /launchCameraAsync|expo-camera|expo-av|CameraView/);
  assert.match(src, /validateMediaAsset/);
});

test('Phase 6.16 draft card + upload banner + thumbnail exist and avoid verified copy', () => {
  for (const f of ['MobileProofDraftCard', 'MobileUploadStatusBanner', 'MobileProofThumbnail']) {
    const src = read('apps/mobile/src/components/' + f + '.js');
    assert.match(src, /auroraTheme/);
    assert.doesNotMatch(src, /proof verified|Proof verified/);
    assert.doesNotMatch(src, /\.css/);
  }
});

/* ── 8. No forbidden behavior ── */

test('Phase 6.16 no camera/audio capture anywhere in mobile source; no admin', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /expo-camera|expo-av|CameraView|launchCameraAsync/, file + ' uses camera/audio');
    assert.doesNotMatch(src, /expo-notifications/, file + ' uses notifications');
    assert.doesNotMatch(src, /from\s+['"]firebase-admin/, file);
  }
});

test('Phase 6.16 mobile dependency set is exactly the expected list', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(),
    ['@react-native-async-storage/async-storage', 'expo', 'expo-file-system', 'expo-image-picker', 'firebase', 'react', 'react-native']);
});

test('Phase 6.16 Vercel function count unchanged; rules unchanged', () => {
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  const sr = read('storage.rules');
  assert.match(sr, /match \/evidence\/\{userId\}\/\{enrollmentId\}\/\{allPaths=\*\*\}/);
  assert.doesNotMatch(sr, /match \/\{allPaths=\*\*\}/);
});

/* ── 9. Docs ── */

test('Phase 6.16 documentation exists and references the phase', () => {
  const doc = read('docs/mobile-media-proof-offline-drafts.md');
  assert.match(doc, /media proof/i);
  assert.match(doc, /offline draft/i);
  assert.match(read('README.md'), /Phase 6\.16/);
});
