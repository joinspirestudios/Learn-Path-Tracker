import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  flattenEvidenceSubmissionBuckets, collectEvidenceSubmissionsForEnrollment,
  collectEvidenceSubmissionsForPath, buildEvidenceContextForPath,
} from '../src/evidence-intelligence-context.js';
import { buildEvidenceInsights } from '../src/evidence-intelligence-model.js';
import { createAnalyzeEvidenceHandler } from '../server/api-handlers/analyze-evidence.js';

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

// Nested web cache: evidenceSubmissions[enrollmentId][submissionId].
function nestedCache() {
  return {
    enr_p1: {
      s1: { id: 's1', pathId: 'p1', dayNumber: 1, taskId: 'write', evidenceType: 'file', fileType: 'image/png', storagePath: 'users/u/proofMedia/p1/d1/write/s1', status: 'submitted' },
      s2: { id: 's2', pathId: 'p1', dayNumber: 2, taskId: 'edit', evidenceType: 'url', evidenceUrl: 'https://example.com/x', status: 'submitted' },
    },
    enr_p2: {
      s3: { id: 's3', pathId: 'p2', dayNumber: 1, taskId: 't', note: 'other path', status: 'submitted' },
    },
  };
}
const enrollments = { enr_p1: { id: 'enr_p1', pathId: 'p1' }, enr_p2: { id: 'enr_p2', pathId: 'p2' } };

/* ── 1. Flattening ── */

test('Phase 8.0.1 flatten handles nested enrollment buckets', () => {
  const flat = flattenEvidenceSubmissionBuckets(nestedCache());
  assert.equal(flat.length, 3);
  assert.deepEqual(flat.map(s => s.id).sort(), ['s1', 's2', 's3']);
});

test('Phase 8.0.1 flatten handles flat maps and arrays', () => {
  const flatMap = { s1: { id: 's1', pathId: 'p1' }, s2: { id: 's2', pathId: 'p1' } };
  assert.equal(flattenEvidenceSubmissionBuckets(flatMap).length, 2);
  const arr = [{ id: 's1', pathId: 'p1' }, { id: 's2', pathId: 'p1' }];
  assert.equal(flattenEvidenceSubmissionBuckets(arr).length, 2);
  assert.deepEqual(flattenEvidenceSubmissionBuckets({}), []);
});

test('Phase 8.0.1 flatten de-duplicates by id', () => {
  const dup = { a: { x: { id: 's1', pathId: 'p1' } }, b: { y: { id: 's1', pathId: 'p1' } } };
  assert.equal(flattenEvidenceSubmissionBuckets(dup).length, 1);
});

/* ── 2. Collection ── */

test('Phase 8.0.1 collectForPath returns real nested proof for the active path only', () => {
  const p1 = collectEvidenceSubmissionsForPath({ evidenceSubmissions: nestedCache(), enrollments, pathId: 'p1' });
  assert.deepEqual(p1.map(s => s.id).sort(), ['s1', 's2']);
  // Never returns another path's proof.
  assert.equal(p1.some(s => s.pathId === 'p2'), false);
});

test('Phase 8.0.1 collectForEnrollment returns proof for that enrollment', () => {
  const got = collectEvidenceSubmissionsForEnrollment({ evidenceSubmissions: nestedCache(), enrollmentId: 'enr_p1' });
  assert.deepEqual(got.map(s => s.id).sort(), ['s1', 's2']);
  assert.deepEqual(collectEvidenceSubmissionsForEnrollment({ evidenceSubmissions: nestedCache(), enrollmentId: 'missing' }), []);
});

test('Phase 8.0.1 collected proof feeds the evidence model (real proof, not buckets)', () => {
  const proofSubmissions = collectEvidenceSubmissionsForPath({ evidenceSubmissions: nestedCache(), enrollments, pathId: 'p1' });
  const path = { id: 'p1', title: 'P', visibility: 'private', weeks: [{ tasks: [{ id: 'write', anchor: true, evidenceRequired: true }, { id: 'edit', required: false }] }] };
  const ctx = buildEvidenceContextForPath({ path, enrollment: { dayLogs: {} }, proofSubmissions, currentDayNumber: 3 });
  assert.equal(ctx.evidence.length, 2);
  assert.equal(ctx.uploadedEvidence.length, 2);
});

/* ── 3. Runtime integration (main.js) ── */

test('Phase 8.0.1 refreshEvidenceInsight uses the collection helper, not bucket filtering', () => {
  const main = read('src/main.js');
  assert.match(main, /collectEvidenceSubmissionsForPath/);
  // The buggy outer-bucket filter is gone.
  assert.doesNotMatch(main, /Object\.values\([^)]*evidenceSubmissions[^)]*\)\s*\n?\s*\.filter\(p => p && p\.pathId/);
  assert.match(main, /refresh-evidence-insight/);
});

/* ── 4. Server source repair ── */

function recorder() {
  return { statusCode: 200, headers: {}, payload: null, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(v) { this.payload = v; return v; } };
}
// Fake admin db with mobileDayLogs + state/main containing nested web proof.
function fakeAdminDb({ mobileDocs = [], stateDoc = null } = {}) {
  const writes = new Map();
  function docRef(path, seedDoc) {
    return {
      path,
      collection(name) { return colRef(path + '/' + name); },
      async get() {
        if (seedDoc !== undefined) return { exists: seedDoc != null, data: () => seedDoc };
        const d = writes.get(path); return { exists: d != null, data: () => d };
      },
      async set(data) { writes.set(path, data); },
    };
  }
  function colRef(path) {
    return {
      path,
      doc(id) {
        if (path === 'users/u1/state' && id === 'main') return docRef(path + '/' + id, stateDoc);
        return docRef(path + '/' + id);
      },
      async get() {
        if (path === 'users/u1/mobileDayLogs') return { docs: mobileDocs.map(d => ({ data: () => d })) };
        return { docs: [] };
      },
    };
  }
  return { collection(n) { return colRef(n); }, _writes: writes };
}

test('Phase 8.0.1 analyze-evidence uses mobile day log proof', async () => {
  const db = fakeAdminDb({ mobileDocs: [{ pathId: 'p1', dayNumber: 1, proof: [{ id: 'm1', taskId: 'write', type: 'image', storagePath: 'users/u/proofMedia/x', submitted: true }] }] });
  const handler = createAnalyzeEvidenceHandler({ authenticate: async () => ({ uid: 'u1' }), rateLimit: async () => {}, db, env: {} });
  const res = recorder();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: { pathId: 'p1', context: { pathTitle: 'X', currentDayNumber: 2, tasks: [{ id: 'write', anchor: true, evidenceRequired: true }] } } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.published, false);
  // Never leaks storage paths in the response.
  assert.doesNotMatch(JSON.stringify(res.payload), /proofMedia|storagePath|users\/u\/proof/);
});

test('Phase 8.0.1 analyze-evidence uses user state evidenceSubmissions when present', async () => {
  const stateDoc = {
    evidenceSubmissions: { enr_p1: { s1: { id: 's1', pathId: 'p1', dayNumber: 1, taskId: 'write', evidenceType: 'url', evidenceUrl: 'https://x/y', status: 'submitted' } } },
    enrollments: { enr_p1: { id: 'enr_p1', pathId: 'p1' } },
  };
  const db = fakeAdminDb({ mobileDocs: [], stateDoc });
  const handler = createAnalyzeEvidenceHandler({ authenticate: async () => ({ uid: 'u1' }), rateLimit: async () => {}, db, env: {} });
  const res = recorder();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: { pathId: 'p1', context: { pathTitle: 'X', currentDayNumber: 2 } } }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.payload.draft);
  // Never returns raw state or raw evidence URL.
  const json = JSON.stringify(res.payload);
  assert.doesNotMatch(json, /https:\/\/x\/y|evidenceUrl|enrollments|"state"/);
});

test('Phase 8.0.1 analyze-evidence falls back to client context; auth + rate-limited; POST-only', async () => {
  let limited = false;
  const handler = createAnalyzeEvidenceHandler({ authenticate: async () => ({ uid: 'u1' }), rateLimit: async () => { limited = true; }, db: fakeAdminDb({}), env: {} });
  const res = recorder();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: { pathId: 'p1', context: { pathTitle: 'X', proofSubmissions: [{ id: 'c1', pathId: 'p1', dayNumber: 1, taskId: 'write', evidenceType: 'file', fileType: 'image/png', status: 'submitted' }], tasks: [{ id: 'write', anchor: true }] } } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(limited, true);
  const get = recorder();
  await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, body: {} }, get);
  assert.equal(get.statusCode, 405);
});

/* ── 5. Mobile safety ── */

test('Phase 8.0.1 mobile evidence repo sends only safe context; no private fields', () => {
  const repo = read('apps/mobile/src/services/mobileEvidenceIntelligenceRepository.js');
  assert.doesNotMatch(repo, /localUri|downloadURL|storagePath|base64|idToken/i);
  const app = read('apps/mobile/src/app/MobileApp.js');
  // The mobile evidence fetch context carries only safe fields.
  assert.match(app, /evidenceRepo\.fetchInsight/);
  assert.doesNotMatch(app, /fetchInsight\([^)]*localUri/s);
});

test('Phase 8.0.1 mobile evidence screen renders no private fields and never "verified"', () => {
  const screen = read('apps/mobile/src/screens/EvidenceInsightsScreen.js');
  const card = read('apps/mobile/src/components/MobileEvidenceInsightCard.js');
  for (const src of [screen, card]) {
    assert.doesNotMatch(src, /storagePath|localUri|downloadURL|idToken/i);
    assert.doesNotMatch(src, /\bverified\b/i);
  }
});

/* ── 6. Safety copy ── */

test('Phase 8.0.1 disclaimer preserved; UI never claims verification', () => {
  assert.match(read('src/evidence-intelligence-policy.js'), /does not verify/i);
  for (const rel of ['src/views/evidence-intelligence-panel.js', 'src/views/evidence-insight-review.js']) {
    assert.doesNotMatch(read(rel), /\bverified\b|\bcertified\b|truth score|fraud/i);
  }
});

/* ── 7. Regression ── */

test('Phase 8.0.1 prior phase tests remain registered; admin pinned; functions < 12', () => {
  const pkg = read('package.json');
  assert.match(pkg, /phase-8\.0-evidence-intelligence\.test\.js/);
  assert.match(pkg, /phase-7\.0-rolling-adaptive-planning\.test\.js/);
  assert.match(pkg, /phase-6\.18\.1-web-notification-preferences-signout-repair\.test\.js/);
  assert.equal(JSON.parse(pkg).dependencies['firebase-admin'], '13.10.0');
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_')).map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
});

/* ── 8. No forbidden behavior ── */

test('Phase 8.0.1 no OCR/fraud/social/economy/analytics added in evidence-intelligence modules', () => {
  // The 8.0.x evidence-intelligence modules add no vision. (Gemini Vision is a
  // separate, opt-in Phase 8.2 layer — see tests/phase-8.2; main.js hosts that
  // controller, so it is not scanned for the word "vision" here.)
  const files = [
    'src/evidence-intelligence-context.js',
    'server/evidence-intelligence-service.js', 'server/api-handlers/analyze-evidence.js',
    'src/views/evidence-intelligence-panel.js',
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(src, /tesseract|\bocr\b|computer.?vision|gemini|fraud|truth score|credibility score|\bfollowers?\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy/i, rel);
    assert.doesNotMatch(src, /twilio|sendgrid|mailgun|@segment|mixpanel|amplitude\.com|google-analytics|gtag\(/i, rel);
  }
});

test('Phase 8.0.1 firestore owner-only + storage unchanged shape', () => {
  assert.match(read('firestore.rules'), /match \/users\/\{uid\}\/\{document=\*\*\}/);
  assert.doesNotMatch(read('storage.rules'), /match \/\{allPaths=\*\*\}/);
});
