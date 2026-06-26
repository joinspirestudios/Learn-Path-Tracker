import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createInitialMobileLoopState, startTodaySession, markTaskDone, addTextProof,
  addLinkProof, addTaskReflection, finishMobileDay,
} from '../apps/mobile/src/core/mobileCoreLoop.js';
import {
  buildDayLogPayload, mobileDayLogId, isSessionFinished, summarizeDayLog,
} from '../apps/mobile/src/core/mobileDaySync.js';
import {
  mapTextProof, mapLinkProof, isValidProofUrl, collectSubmittedProof,
} from '../apps/mobile/src/core/mobileProofMappers.js';
import {
  buildPublicSummary, buildPublishRequest,
} from '../apps/mobile/src/core/mobilePublicProgressMappers.js';
import { SYNC_STATUS, deriveSyncStatus, canPublish } from '../apps/mobile/src/core/mobileSyncStatus.js';
import { createDayLogRepository } from '../apps/mobile/src/services/dayLogRepository.js';
import { createMobileProofRepository } from '../apps/mobile/src/services/mobileProofRepository.js';
import { createMobilePublicProgressRepository } from '../apps/mobile/src/services/mobilePublicProgressRepository.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = resolve(root, 'apps/mobile');

function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Build a finished session with all demo tasks done (proof task gets text proof).
function finishedSession() {
  let s = startTodaySession(createInitialMobileLoopState());
  s = markTaskDone(s, 'review');
  s = markTaskDone(s, 'work-block');
  s = addTextProof(s, 'proof', 'wrote my proof note');
  s = addTaskReflection(s, 'proof', 'a private reflection');
  s = markTaskDone(s, 'proof');
  s = markTaskDone(s, 'self-check');
  return finishMobileDay(s);
}

/* ── 1. Mobile day sync core ── */

test('Phase 6.13 finished session becomes a deterministic day-log payload', () => {
  const s = finishedSession();
  const payload = buildDayLogPayload(s, { pathId: 'p1', uid: 'u1', dayNumber: 1 });
  assert.ok(payload);
  assert.equal(payload.pathId, 'p1');
  assert.equal(payload.uid, 'u1');
  assert.equal(payload.dayNumber, 1);
  assert.equal(payload.status, 'completed');
  assert.equal(payload.completedTaskCount, 4);
  assert.equal(payload.proofSubmittedCount, 1);
  assert.equal(typeof payload.completionScore, 'number');
  assert.ok(payload.completionTier);
  assert.equal(payload.id, mobileDayLogId({ pathId: 'p1', uid: 'u1', dayNumber: 1 }));
});

test('Phase 6.13 in-progress session cannot sync as a finished day', () => {
  let s = startTodaySession(createInitialMobileLoopState());
  s = markTaskDone(s, 'review');
  assert.equal(isSessionFinished(s), false);
  assert.equal(buildDayLogPayload(s, { pathId: 'p1', uid: 'u1', dayNumber: 1 }), null);
});

test('Phase 6.13 day-log id is deterministic/idempotent', () => {
  const a = mobileDayLogId({ pathId: 'p1', uid: 'u1', dayNumber: 1 });
  const b = mobileDayLogId({ pathId: 'p1', uid: 'u1', dayNumber: 1 });
  assert.equal(a, b);
  assert.notEqual(a, mobileDayLogId({ pathId: 'p1', uid: 'u1', dayNumber: 2 }));
});

test('Phase 6.13 buildDayLogPayload does not mutate input session', () => {
  const s = finishedSession();
  const before = JSON.stringify(s);
  buildDayLogPayload(s, { pathId: 'p1', uid: 'u1', dayNumber: 1 });
  assert.equal(JSON.stringify(s), before);
});

test('Phase 6.13 day-log payload keeps proof/reflection (private space) but summary excludes them', () => {
  const s = finishedSession();
  const payload = buildDayLogPayload(s, { pathId: 'p1', uid: 'u1', dayNumber: 1 });
  assert.ok(Array.isArray(payload.proof));
  assert.ok(payload.reflections && payload.reflections.proof);
  const summary = summarizeDayLog(payload);
  assert.doesNotMatch(JSON.stringify(summary), /reflection|wrote my proof|private reflection/i);
});

/* ── 2. Proof mappers ── */

test('Phase 6.13 text proof maps to private submitted (not verified)', () => {
  const p = mapTextProof({ taskId: 't', body: 'did it' });
  assert.equal(p.type, 'text');
  assert.equal(p.privacy, 'private');
  assert.equal(p.submitted, true);
  assert.equal(p.verified, false);
});

test('Phase 6.13 link proof validates URL and is private/submitted', () => {
  const ok = mapLinkProof({ taskId: 't', url: 'https://example.com/proof' });
  assert.equal(ok.type, 'link');
  assert.equal(ok.url, 'https://example.com/proof');
  assert.equal(ok.submitted, true);
  assert.equal(ok.verified, false);
  const bad = mapLinkProof({ taskId: 't', url: 'not a url' });
  assert.equal(bad.url, '');
  assert.equal(bad.invalid, true);
  assert.equal(bad.submitted, false);
});

test('Phase 6.13 isValidProofUrl accepts http(s) only', () => {
  assert.equal(isValidProofUrl('https://x.com'), true);
  assert.equal(isValidProofUrl('http://x.com'), true);
  assert.equal(isValidProofUrl('ftp://x.com'), false);
  assert.equal(isValidProofUrl('javascript:alert(1)'), false);
  assert.equal(isValidProofUrl(''), false);
});

test('Phase 6.13 proof mappers reject media/file/storage fields', () => {
  const p = mapTextProof({ taskId: 't', body: 'x', downloadURL: 'y', storagePath: 'z', file: {} });
  assert.equal(p.downloadURL, undefined);
  assert.equal(p.storagePath, undefined);
  assert.equal(p.file, undefined);
});

test('Phase 6.13 link proof can satisfy a required proof task', () => {
  let s = startTodaySession(createInitialMobileLoopState());
  s = addLinkProof(s, 'proof', 'https://example.com/evidence');
  s = markTaskDone(s, 'proof');
  assert.equal(s.session.taskState.proof.done, true);
  const collected = collectSubmittedProof(s.session);
  assert.ok(collected.some(p => p.type === 'link' && p.url === 'https://example.com/evidence'));
});

/* ── 3. Day-log repository ── */

test('Phase 6.13 dayLogRepository exposes get/upsert/list and is DI-driven', async () => {
  const store = {};
  const gateway = {
    getUserDoc: async (uid, sub, id) => (store[`${uid}/${sub}/${id}`] ? { id, data: store[`${uid}/${sub}/${id}`] } : null),
    setUserDoc: async (uid, sub, id, data) => { store[`${uid}/${sub}/${id}`] = data; return { id }; },
    listUserDocs: async (uid, sub) => Object.entries(store)
      .filter(([k]) => k.startsWith(`${uid}/${sub}/`))
      .map(([k, v]) => ({ id: k, data: v })),
  };
  const repo = createDayLogRepository({ gateway });
  for (const m of ['getDayLog', 'upsertDayLog', 'listRecentDayLogs']) assert.equal(typeof repo[m], 'function');

  const dayLog = buildDayLogPayload(finishedSession(), { pathId: 'p1', uid: 'u1', dayNumber: 1 });
  await repo.upsertDayLog({ pathId: 'p1', uid: 'u1', dayNumber: 1, dayLog });
  await repo.upsertDayLog({ pathId: 'p1', uid: 'u1', dayNumber: 1, dayLog }); // idempotent
  assert.equal(Object.keys(store).length, 1, 'no duplicate doc on re-sync');
  const got = await repo.getDayLog({ pathId: 'p1', uid: 'u1', dayNumber: 1 });
  assert.equal(got.completedTaskCount, 4);
});

test('Phase 6.13 dayLogRepository refuses to write another user day log', async () => {
  const gateway = { getUserDoc: async () => null, setUserDoc: async () => ({}), listUserDocs: async () => [] };
  const repo = createDayLogRepository({ gateway });
  const dayLog = buildDayLogPayload(finishedSession(), { pathId: 'p1', uid: 'u1', dayNumber: 1 });
  await assert.rejects(() => repo.upsertDayLog({ pathId: 'p1', uid: 'attacker', dayNumber: 1, dayLog }));
});

test('Phase 6.13 dayLogRepository writes to the private user space (no public leak)', () => {
  const src = read('apps/mobile/src/services/dayLogRepository.js');
  assert.match(src, /mobileDayLogs/);
  assert.match(src, /users\/\{uid\}|getUserDoc|setUserDoc/);
  assert.doesNotMatch(src, /publicProgress/);
});

/* ── 4. Public progress mappers + repository ── */

test('Phase 6.13 public summary excludes private proof, reflection and evidence', () => {
  const dayLog = buildDayLogPayload(finishedSession(), { pathId: 'p1', uid: 'u1', dayNumber: 1 });
  const summary = buildPublicSummary(dayLog, { uid: 'u1', pathTitle: 'My path', publicCaption: 'went well' });
  const json = JSON.stringify(summary);
  assert.doesNotMatch(json, /wrote my proof|private reflection|reflections|evidenceUrl|downloadURL|storagePath/i);
  assert.equal(summary.tasksCompleted, 4);
  assert.equal(summary.proofSubmittedCount, 1);
  assert.equal(summary.publicSummary, 'went well');
});

test('Phase 6.13 publish request is the minimal web-safe contract body', () => {
  const dayLog = buildDayLogPayload(finishedSession(), { pathId: 'p1', uid: 'u1', dayNumber: 2 });
  const body = buildPublishRequest(dayLog, { publicCaption: 'hi' });
  assert.deepEqual(Object.keys(body).sort(), ['dayNumber', 'pathId', 'publicCaption']);
  assert.equal(body.dayNumber, 2);
  assert.doesNotMatch(JSON.stringify(body), /proof|reflection|evidence/i);
});

test('Phase 6.13 publish repository uses the existing publish-progress endpoint with fake fetch', async () => {
  const calls = [];
  const apiClient = { post: async (endpoint, body) => { calls.push({ endpoint, body }); return { ok: true }; } };
  const repo = createMobilePublicProgressRepository({ apiClient });
  const dayLog = buildDayLogPayload(finishedSession(), { pathId: 'p1', uid: 'u1', dayNumber: 1 });
  const res = await repo.publish({ dayLog, publicCaption: 'done' });
  assert.equal(res.ok, true);
  assert.equal(calls[0].endpoint, '/api/publish-progress');
  assert.equal(calls[0].body.pathId, 'p1');
  // Re-publish same day → same minimal body (idempotent/update-oriented).
  await repo.publish({ dayLog, publicCaption: 'done' });
  assert.equal(calls[1].body.dayNumber, calls[0].body.dayNumber);
});

test('Phase 6.13 publish repository maps 401 to a safe sign-in message', async () => {
  const apiClient = { post: async () => { const e = new Error('x'); e.status = 401; throw e; } };
  const repo = createMobilePublicProgressRepository({ apiClient });
  const dayLog = buildDayLogPayload(finishedSession(), { pathId: 'p1', uid: 'u1', dayNumber: 1 });
  const res = await repo.publish({ dayLog });
  assert.equal(res.ok, false);
  assert.match(res.message, /sign in/i);
});

/* ── 5. Sync status ── */

test('Phase 6.13 sync status transitions are coherent', () => {
  assert.equal(deriveSyncStatus({ finished: false }), SYNC_STATUS.LOCAL_ONLY);
  assert.equal(deriveSyncStatus({ finished: true }), SYNC_STATUS.READY_TO_SYNC);
  assert.equal(deriveSyncStatus({ finished: true, synced: true }), SYNC_STATUS.PUBLISH_AVAILABLE);
  assert.equal(deriveSyncStatus({ published: true }), SYNC_STATUS.PUBLISHED);
  assert.equal(canPublish(SYNC_STATUS.READY_TO_SYNC), false);
  assert.equal(canPublish(SYNC_STATUS.PUBLISH_AVAILABLE), true);
});

/* ── 6. Completion / Today / Roadmap UI (source-level) ── */

test('Phase 6.13 CompletionResultScreen shows sync banner and gated publish card', () => {
  const src = read('apps/mobile/src/screens/CompletionResultScreen.js');
  assert.match(src, /MobileSyncBanner/);
  assert.match(src, /MobilePublishProgressCard/);
  assert.match(src, /canPublish/);
  assert.doesNotMatch(src, /verified/i);
});

test('Phase 6.13 MobileSyncBanner gates state and never auto-syncs', () => {
  const src = read('apps/mobile/src/components/MobileSyncBanner.js');
  assert.match(src, /Sync day|Retry sync/);
  assert.match(src, /isSyncing/);
});

test('Phase 6.13 MobilePublishProgressCard shares result not private proof', () => {
  const src = read('apps/mobile/src/components/MobilePublishProgressCard.js');
  assert.match(src, /not your private proof text/i);
  assert.doesNotMatch(src, /verified/i);
});

test('Phase 6.13 TodayScreen shows sync status without claiming synced prematurely', () => {
  const src = read('apps/mobile/src/screens/TodayScreen.js');
  assert.match(src, /syncStatus/);
  assert.match(src, /MobileSyncStatusPill/);
});

test('Phase 6.13 PathRoadmapScreen shows synced state without inventing progress', () => {
  const src = read('apps/mobile/src/screens/PathRoadmapScreen.js');
  assert.match(src, /activeDaySynced/);
  assert.match(src, /no invented progress/i);
});

test('Phase 6.13 DailyFocusScreen supports text/link proof, one task at a time', () => {
  const src = read('apps/mobile/src/screens/DailyFocusScreen.js');
  assert.match(src, /MobileProofInput/);
  assert.match(src, /getCurrentTask/);
  assert.doesNotMatch(src, /\.tasks\.map\s*\(/);
});

/* ── 7. No forbidden behavior ── */

test('Phase 6.13 no media/camera/audio/storage packages or imports in mobile', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // Camera/audio/document-picker/media-library/notifications/admin stay banned.
  // (Media upload via expo-image-picker/expo-file-system + Storage arrives in 6.16.)
  for (const banned of [
    'expo-camera', 'expo-document-picker', 'expo-av',
    'expo-media-library', 'firebase-admin',
  ]) {
    assert.equal(deps[banned], undefined, banned + ' must not be added');
  }
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /expo-camera|expo-av|CameraView/, file + ' uses camera/audio capture');
    assert.doesNotMatch(src, /from\s+['"]firebase-admin/, file);
  }
});

test('Phase 6.13 no screen calls fetch directly; no comments/reactions/moderation writes', () => {
  for (const file of walk(resolve(mobile, 'src/screens'))) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(/, file + ' calls fetch');
    assert.doesNotMatch(src, /react-progress|comment-progress|report-progress|report-path/i, file);
  }
});

test('Phase 6.13 no fake-economy/social copy and proof never called verified', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /leaderboard|\bfollowers?\b|hearts|gems|\blives\b|\bshop\b|proof verified/i, file);
  }
});

test('Phase 6.13 proof repository builds private submitted proof, rejects invalid links', () => {
  const repo = createMobileProofRepository();
  const text = repo.buildProof({ taskId: 't', type: 'text', body: 'x' });
  assert.equal(text.privacy, 'private');
  assert.equal(text.verified, false);
  const bad = repo.buildProof({ taskId: 't', type: 'link', url: 'nope' });
  assert.equal(bad.invalid, true);
});

/* ── 8. Firestore rules unchanged / relied upon ── */

test('Phase 6.13 relies on existing Firestore rules (no broad changes)', () => {
  const rules = read('firestore.rules');
  // Private user space is owner-only (used for mobile day logs).
  assert.match(rules, /match \/users\/\{uid\}\/\{document=\*\*\}/);
  assert.match(rules, /request\.auth\.uid == uid/);
  // Public progress remains server-only for client writes.
  assert.match(rules, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
  // Server-managed stats remain denied to clients.
  assert.match(rules, /match \/participantStats\/\{uid\}\s*\{\s*allow read, write: if false/);
});

/* ── 9. Docs ── */

test('Phase 6.13 documentation exists and references the phase', () => {
  assert.ok(existsSync(resolve(root, 'docs/mobile-day-sync-proof-public-progress.md')));
  assert.match(read('README.md'), /Phase 6\.13/);
  assert.match(read('apps/mobile/README.md'), /day sync|public progress/i);
  const doc = read('docs/mobile-day-sync-proof-public-progress.md');
  assert.match(doc, /6\.14/);
  assert.match(doc, /6\.15/);
  assert.match(doc, /sanitiz/i);
});
