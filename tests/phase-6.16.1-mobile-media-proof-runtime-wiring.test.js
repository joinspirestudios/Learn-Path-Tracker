import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isAllowedMediaType, validateMediaAsset, mobileProofStoragePath, mediaProofKind,
} from '../apps/mobile/src/core/mobileMediaProofMappers.js';
import {
  createInitialMobileLoopState, startTodaySession, markTaskDone, addUploadedMediaProof,
  taskHasUploadedMediaProof, finishMobileDay,
} from '../apps/mobile/src/core/mobileCoreLoop.js';
import { buildDayLogPayload } from '../apps/mobile/src/core/mobileDaySync.js';

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
const uploadedRecord = { storagePath: 'users/u/proofMedia/local-demo-path/day-1/proof/x', evidenceUrl: 'https://dl/x', fileName: 'a.png', fileType: 'image/png', fileSize: 1000 };

/* ── 1. Image-only scope ── */

test('Phase 6.16.1 image-only — PDF/video/audio/file rejected', () => {
  assert.equal(isAllowedMediaType('image/jpeg'), true);
  assert.equal(isAllowedMediaType('image/png'), true);
  assert.equal(isAllowedMediaType('image/webp'), true);
  assert.equal(isAllowedMediaType('application/pdf'), false);
  assert.equal(isAllowedMediaType('video/mp4'), false);
  assert.equal(isAllowedMediaType('audio/mpeg'), false);
  assert.equal(isAllowedMediaType('text/plain'), false);
  assert.equal(validateMediaAsset({ uri: 'x', mimeType: 'application/pdf', size: 10 }).ok, false);
  assert.equal(mediaProofKind({ mimeType: 'application/pdf' }), 'image'); // all media proof is image now
});

test('Phase 6.16.1 no PDF/document/audio/video deps in mobile package', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  for (const banned of ['expo-document-picker', 'expo-av', 'expo-camera', 'expo-media-library']) {
    assert.equal(pkg.dependencies[banned], undefined);
  }
});

/* ── 2. Camera/library picker ── */

test('Phase 6.16.1 picker uses both library and camera via expo-image-picker, permissions on tap', () => {
  const src = read('apps/mobile/src/components/MobileMediaProofPicker.js');
  assert.match(src, /expo-image-picker/);
  assert.match(src, /launchImageLibraryAsync/);
  assert.match(src, /launchCameraAsync/);
  assert.match(src, /requestMediaLibraryPermissionsAsync/);
  assert.match(src, /requestCameraPermissionsAsync/);
  // Permissions are requested inside the action handlers, not at module top-level/effect.
  assert.doesNotMatch(src, /useEffect\([^)]*request(Camera|MediaLibrary)Permissions/s);
  // No separate camera/audio native modules.
  assert.doesNotMatch(src, /expo-camera|expo-av|CameraView/);
});

/* ── 3. Storage path ── */

test('Phase 6.16.1 mobileProofStoragePath is owner-scoped and traversal-safe', () => {
  const path = mobileProofStoragePath({ uid: 'u1', pathId: 'p1', dayNumber: 3, taskId: 't1', assetId: 'a1' });
  assert.match(path, /^users\/u1\/proofMedia\/p1\/day-3\/t1\/a1$/);
  // Path traversal / unsafe characters are sanitized.
  const evil = mobileProofStoragePath({ uid: '../../etc', pathId: '..', dayNumber: 1, taskId: '/x', assetId: 'a' });
  assert.match(evil, /^users\/[^/]+\/proofMedia\//);
  assert.doesNotMatch(evil, /\.\./);
  // Never uses profile/avatar/cover/banner or generic upload paths.
  assert.doesNotMatch(path, /profile\/avatar|profile\/cover|pathBanners|evidence\//);
});

/* ── 4. Storage rules ── */

test('Phase 6.16.1 Storage rules allow owner-scoped image-only proofMedia, deny generic/public', () => {
  const sr = read('storage.rules');
  assert.match(sr, /match \/users\/\{userId\}\/proofMedia\/\{pathId\}\/\{dayFolder\}\/\{taskId\}\/\{assetId\}/);
  assert.match(sr, /request\.auth\.uid == userId/);
  // image-only validator (no PDF in the profile image validator used for proof media).
  assert.match(sr, /function validProfileImage/);
  assert.doesNotMatch(sr, /match \/\{allPaths=\*\*\}/);
});

/* ── 5. Core loop: uploaded image satisfies proof; draft-only does not ── */

function proofTaskState() {
  // local demo has a required-proof task with id 'proof'.
  return startTodaySession(createInitialMobileLoopState());
}

test('Phase 6.16.1 uploaded image proof satisfies a proof-required task', () => {
  let s = proofTaskState();
  // Without proof, the proof task cannot be marked done.
  const blocked = markTaskDone(s, 'proof');
  assert.equal(blocked.session.taskState.proof.done, false);
  // Attach uploaded media proof → now it can be completed.
  s = addUploadedMediaProof(s, 'proof', uploadedRecord);
  assert.equal(taskHasUploadedMediaProof(s, 'proof'), true);
  const done = markTaskDone(s, 'proof');
  assert.equal(done.session.taskState.proof.done, true);
});

test('Phase 6.16.1 addUploadedMediaProof stores storagePath/downloadURL, never localUri', () => {
  const s = addUploadedMediaProof(proofTaskState(), 'proof', { ...uploadedRecord, localUri: 'file:///tmp/secret.png' });
  const mp = s.session.taskState.proof.mediaProof;
  assert.equal(mp.storagePath, uploadedRecord.storagePath);
  assert.equal(mp.verified, false);
  assert.doesNotMatch(JSON.stringify(mp), /file:\/\/\/tmp\/secret/);
});

/* ── 6. Day-log payload: uploaded media metadata only, no localUri/base64/draft ── */

test('Phase 6.16.1 buildDayLogPayload includes uploaded media metadata, excludes localUri/base64', () => {
  let s = proofTaskState();
  s = addUploadedMediaProof(s, 'proof', uploadedRecord);
  s = markTaskDone(s, 'proof');
  s = markTaskDone(s, 'review');
  s = markTaskDone(s, 'work-block');
  s = finishMobileDay(s);
  const payload = buildDayLogPayload(s, { pathId: 'local-demo-path', uid: 'u', dayNumber: 1 });
  const mediaProof = payload.proof.find(p => p.type === 'image');
  assert.ok(mediaProof, 'uploaded image proof present in day log');
  assert.equal(mediaProof.storagePath, uploadedRecord.storagePath);
  assert.equal(mediaProof.verified, false);
  assert.equal(mediaProof.submitted, true);
  assert.equal(payload.uploadedMediaProofCount, 1);
  const json = JSON.stringify(payload);
  assert.doesNotMatch(json, /localUri|base64|data:image/);
});

test('Phase 6.16.1 draft-only image (no storagePath) does not enter the day log', () => {
  let s = proofTaskState();
  // Simulate a draft-only state: a media draft is tracked at app level, not on
  // the loop task state, so it must not appear in the synced payload.
  s = markTaskDone(s, 'review');
  s = markTaskDone(s, 'work-block');
  s = finishMobileDay(s);
  const payload = buildDayLogPayload(s, { pathId: 'local-demo-path', uid: 'u', dayNumber: 1 });
  assert.equal(payload.proof.some(p => p.type === 'image'), false);
  assert.equal(payload.uploadedMediaProofCount, 0);
});

/* ── 7. MobileApp wiring (source-level) ── */

test('Phase 6.16.1 MobileApp instantiates proof repos and passes media handlers', () => {
  const src = read('apps/mobile/src/app/MobileApp.js');
  assert.match(src, /createMobileProofStorageRepository/);
  assert.match(src, /createMobileMediaProofRepository/);
  assert.match(src, /createMobileOfflineDraftRepository/);
  assert.match(src, /createStorageGateway/);
  assert.match(src, /handleAddImageProofDraft/);
  assert.match(src, /handleUploadProofDraft/);
  assert.match(src, /handleRetryProofDraft/);
  assert.match(src, /handleRemoveProofDraft/);
  assert.match(src, /onAddImageProof=\{handleAddImageProofDraft\}/);
  // Sync is blocked while uploads pending.
  assert.match(src, /Upload your pending proof images before syncing/);
});

/* ── 8. DailyFocus + Completion wiring ── */

test('Phase 6.16.1 DailyFocusScreen renders media picker + draft cards + uploaded-satisfies logic', () => {
  const src = read('apps/mobile/src/screens/DailyFocusScreen.js');
  assert.match(src, /MobileMediaProofPicker/);
  assert.match(src, /MobileProofDraftCard/);
  assert.match(src, /hasUploadedMedia/);
  assert.match(src, /onAddImageProof/);
  assert.doesNotMatch(src, /proof verified/i);
});

test('Phase 6.16.1 CompletionResultScreen shows upload counts and blocks sync when pending', () => {
  const src = read('apps/mobile/src/screens/CompletionResultScreen.js');
  assert.match(src, /pendingProofCount/);
  assert.match(src, /failedProofCount/);
  assert.match(src, /uploadsPending/);
  assert.match(src, /Sync blocked|before syncing/);
  assert.match(src, /Retry failed uploads|Upload pending proof/);
});

test('Phase 6.16.1 Today/Roadmap show compact upload status', () => {
  assert.match(read('apps/mobile/src/screens/TodayScreen.js'), /pendingProofCount/);
  assert.match(read('apps/mobile/src/screens/PathRoadmapScreen.js'), /pendingProofCount/);
});

/* ── 9. Public progress sanitization ── */

test('Phase 6.16.1 public day-log summary excludes storagePath/downloadURL', () => {
  // summarizeDayLog (public-safe) carries counts only, not the proof array.
  const summarySrc = read('apps/mobile/src/core/mobileDaySync.js');
  assert.match(summarySrc, /function summarizeDayLog/);
  const sumBlock = summarySrc.slice(summarySrc.indexOf('function summarizeDayLog'), summarySrc.indexOf('function summarizeDayLog') + 500);
  assert.doesNotMatch(sumBlock, /storagePath|downloadURL|proof:/);
});

/* ── 10. No forbidden behavior ── */

test('Phase 6.16.1 no notifications/social/admin in mobile source; no new Vercel route', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /expo-notifications|leaderboard|\bfollowers?\b|\bfollowing\b/i, file);
    assert.doesNotMatch(src, /from\s+['"]firebase-admin/, file);
  }
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
});

/* ── 11. Docs ── */

test('Phase 6.16.1 docs document runtime wiring + image-only scope', () => {
  const doc = read('docs/mobile-media-proof-offline-drafts.md');
  assert.match(doc, /6\.16\.1/);
  assert.match(doc, /image.only|image only/i);
  assert.match(doc, /camera/i);
});
