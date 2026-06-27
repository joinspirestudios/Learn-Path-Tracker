import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildEvidenceContext, buildEvidenceInsights, buildEvidenceRecommendations,
  analyzeEvidenceCoverage, analyzePendingEvidence, analyzeEvidenceGaps, analyzeAnchorEvidence,
  analyzeEvidenceQuality, analyzePublicEvidenceReadiness, evidenceQualityTier, evidenceIsPublicSafe,
} from '../src/evidence-intelligence-model.js';
import {
  canAnalyzeEvidence, canPublishEvidenceInsight, evidenceInsightRequiresUserReview,
  sanitizeEvidenceInsight, evidenceIntelligenceDisclaimer,
} from '../src/evidence-intelligence-policy.js';
import {
  sanitizeEvidenceContextForModel, containsForbiddenContent,
} from '../server/evidence-intelligence-sanitizer.js';
import {
  buildEvidenceInsightDraft, normalizeEvidenceInsightDraft, dismissEvidenceInsightDraft,
  reviewEvidenceInsightDraft, EVIDENCE_DRAFT_STATUSES,
} from '../src/evidence-intelligence-drafts.js';
import { createAnalyzeEvidenceHandler } from '../server/api-handlers/analyze-evidence.js';
import aiRouter from '../api/ai.js';
import { renderEvidenceIntelligencePanel } from '../src/views/evidence-intelligence-panel.js';
import { renderEvidenceInsightReview } from '../src/views/evidence-insight-review.js';

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

const path = {
  id: 'p1', title: 'Daily Writing', category: 'creative', visibility: 'public',
  weeks: [{ tasks: [
    { id: 'write', title: 'Write', required: true, anchor: true, evidenceRequired: true },
    { id: 'edit', title: 'Edit', required: false },
  ] }],
};
function dayLogs() {
  return {
    1: { dayNumber: 1, completionScore: 80, requiredCompleted: 1, requiredTotal: 1, anchorSatisfied: true, evidenceRequired: 1 },
    2: { dayNumber: 2, completionScore: 60, requiredCompleted: 1, requiredTotal: 1, anchorSatisfied: false, evidenceRequired: 1 },
    3: { dayNumber: 3, completionScore: 70, requiredCompleted: 1, requiredTotal: 1, anchorSatisfied: false, evidenceRequired: 1 },
  };
}
// Proof: an uploaded image on day1 (no caption), a pending image on day2, a link
// without context, and a short note. Anchor task 'write' gets little proof.
function proof() {
  return [
    { id: 'a', pathId: 'p1', dayNumber: 1, taskId: 'edit', evidenceType: 'file', fileType: 'image/png', storagePath: 'users/u/proofMedia/p1/day-1/edit/a', status: 'submitted' },
    { id: 'b', pathId: 'p1', dayNumber: 2, taskId: 'write', evidenceType: 'file', fileType: 'image/png', status: 'pending' },
    { id: 'c', pathId: 'p1', dayNumber: 3, taskId: 'edit', evidenceType: 'url', evidenceUrl: 'https://example.com/x', status: 'submitted' },
    { id: 'd', pathId: 'p1', dayNumber: 3, taskId: 'edit', note: 'did it', status: 'submitted' },
  ];
}

/* ── 1. Model ── */

test('Phase 8.0 buildEvidenceContext normalizes proof by upload state + day', () => {
  const ctx = buildEvidenceContext({ path, dayLogs: dayLogs(), proofSubmissions: proof(), currentDayNumber: 4 });
  assert.equal(ctx.evidence.length, 4);
  assert.equal(ctx.pendingEvidence.length, 1); // pending image not uploaded
  assert.equal(ctx.uploadedEvidence.length, 3);
  assert.ok(ctx.anchorTaskIds.has('write'));
  // Pending uploads never count as uploaded.
  assert.equal(ctx.uploadedEvidence.some(r => r.id === 'b'), false);
});

test('Phase 8.0 pending/gap/anchor/quality analyzers detect from real data only', () => {
  const ctx = buildEvidenceContext({ path, dayLogs: dayLogs(), proofSubmissions: proof(), currentDayNumber: 4 });
  const pending = analyzePendingEvidence(ctx);
  assert.equal(pending.some(i => i.type === 'pending_upload'), true);
  assert.equal(analyzeAnchorEvidence(ctx)?.type, 'missing_anchor_proof');
  const quality = analyzeEvidenceQuality(ctx);
  assert.equal(quality.some(i => i.type === 'link_without_context'), true);
  // No proof at all → no fabricated insights.
  const empty = buildEvidenceContext({ path, dayLogs: {}, proofSubmissions: [], currentDayNumber: 1 });
  assert.equal(buildEvidenceInsights(empty).length, 0);
});

test('Phase 8.0 recommendations are deterministic, explained, no fake data', () => {
  const ctx = buildEvidenceContext({ path, dayLogs: dayLogs(), proofSubmissions: proof(), currentDayNumber: 4 });
  const recs = buildEvidenceRecommendations(ctx);
  assert.ok(recs.length > 0);
  for (const r of recs) {
    assert.equal(r.source, 'deterministic');
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0);
  }
  assert.equal(recs.some(r => r.type === 'resolve_pending_upload'), true);
});

test('Phase 8.0 quality tier + public-safe never claim verified', () => {
  assert.ok(['strong', 'developing', 'thin'].includes(evidenceQualityTier({ path, proofSubmissions: proof() })));
  // public-safe requires public visibility + a caption/desc; a private image is not.
  assert.equal(evidenceIsPublicSafe({ visibility: 'private', publicCaption: 'x', pathVisibility: 'public' }), false);
  assert.equal(evidenceIsPublicSafe({ publicVisible: true, publicCaption: 'A clear caption', pathVisibility: 'public' }), true);
});

/* ── 2. Policy ── */

test('Phase 8.0 policy: advisory, disclaimer present, review required, never verified', () => {
  assert.equal(canAnalyzeEvidence({ uid: 'u', path }), true);
  assert.equal(canAnalyzeEvidence({ uid: '', path }), false);
  assert.equal(evidenceInsightRequiresUserReview(), true);
  assert.match(evidenceIntelligenceDisclaimer(), /does not verify/i);
});

test('Phase 8.0 policy sanitizer strips "verified" claim + private fields', () => {
  const dirty = {
    insights: [{ type: 'proof_gap', reason: 'This proof is verified at https://x/evidence' }],
    recommendations: [{ type: 'add_short_caption', reason: 'see gs://bucket/x and a@b.com', source: 'deterministic' }],
    summary: 'Your proof is verified.',
    publicSafeSummary: 'verified record at users/u/proofMedia/x',
  };
  const safe = sanitizeEvidenceInsight(dirty);
  const json = JSON.stringify(safe);
  assert.doesNotMatch(json, /verified|https:\/\/|gs:\/\/|proofMedia|a@b\.com/);
});

test('Phase 8.0 policy: publishing requires reviewed status + safe summary', () => {
  assert.equal(canPublishEvidenceInsight({ status: 'draft', publicSafeSummary: 'ok' }), false);
  assert.equal(canPublishEvidenceInsight({ status: 'reviewed', summary: 's', publicSafeSummary: 'Your documentation is looking strong.' }), true);
});

/* ── 3. Sanitizer (AI) ── */

test('Phase 8.0 AI sanitizer strips proof bodies/urls/storage/localUri/tokens; keeps aggregates + domain', () => {
  const ctx = buildEvidenceContext({ path, dayLogs: dayLogs(), proofSubmissions: proof(), currentDayNumber: 4 });
  // Inject private fields to prove they are stripped.
  ctx.evidence[0].storagePath = 'users/u/proofMedia/x';
  ctx.evidence[0].evidenceUrl = 'https://secret/x';
  const safe = sanitizeEvidenceContextForModel({ context: ctx, tasks: path.weeks[0].tasks, insights: buildEvidenceInsights(ctx) });
  assert.equal(containsForbiddenContent(safe), false);
  const json = JSON.stringify(safe);
  assert.doesNotMatch(json, /storagePath|evidenceUrl|proofMedia|https:\/\//);
  assert.equal(safe.uploadedCount, 3);
  assert.equal(safe.anchorTaskCount, 1);
});

test('Phase 8.0 containsForbiddenContent flags leaks', () => {
  assert.equal(containsForbiddenContent({ storagePath: 'x' }), true);
  assert.equal(containsForbiddenContent({ evidenceUrl: 'https://x' }), true);
  assert.equal(containsForbiddenContent({ ok: 'clean' }), false);
});

/* ── 4. Drafts ── */

test('Phase 8.0 draft schema + statuses + dismiss/review; public-safe summary has no private data', () => {
  const ctx = buildEvidenceContext({ path, dayLogs: dayLogs(), proofSubmissions: proof(), currentDayNumber: 4 });
  const draft = buildEvidenceInsightDraft({ uid: 'u1', pathId: 'p1', currentDayNumber: 4, insights: buildEvidenceInsights(ctx), recommendations: buildEvidenceRecommendations(ctx) });
  for (const k of ['id', 'uid', 'pathId', 'source', 'status', 'currentDayNumber', 'insights', 'recommendations', 'summary', 'publicSafeSummary', 'createdAt', 'updatedAt', 'reviewedAt', 'dismissedAt', 'schemaVersion']) {
    assert.ok(k in draft, 'draft has ' + k);
  }
  assert.ok(EVIDENCE_DRAFT_STATUSES.includes(draft.status));
  assert.equal(dismissEvidenceInsightDraft(draft).status, 'dismissed');
  assert.equal(reviewEvidenceInsightDraft(draft).status, 'reviewed');
  assert.doesNotMatch(JSON.stringify(draft), /storagePath|evidenceUrl|proofMedia|verified/);
  assert.equal(normalizeEvidenceInsightDraft(draft).id, draft.id);
});

/* ── 5. API / router ── */

function recorder() {
  return { statusCode: 200, headers: {}, payload: null, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(v) { this.payload = v; return v; } };
}
function fakeAdminDb() {
  const docs = new Map();
  function docRef(p) {
    return { path: p, collection(n) { return colRef(p + '/' + n); }, async get() { const d = docs.get(p); return { exists: d != null, data: () => d }; }, async set(data) { docs.set(p, data); } };
  }
  function colRef(p) { return { path: p, doc(id) { return docRef(p + '/' + id); }, async get() { return { docs: [] }; } }; }
  return { collection(n) { return colRef(n); }, _docs: docs };
}

test('Phase 8.0 analyze-evidence requires auth; unknown route 404', async () => {
  const req = (route) => ({ method: 'POST', query: { route }, url: '/api/ai?route=' + route, headers: { 'content-type': 'application/json' }, body: {} });
  const res = recorder();
  await aiRouter(req('analyze-evidence'), res);
  assert.equal(res.statusCode, 401);
  const res2 = recorder();
  await aiRouter(req('nope'), res2);
  assert.equal(res2.statusCode, 404);
});

test('Phase 8.0 analyze-evidence returns deterministic draft (AI unavailable), never publishes', async () => {
  const handler = createAnalyzeEvidenceHandler({ authenticate: async () => ({ uid: 'u1' }), rateLimit: async () => {}, db: fakeAdminDb(), env: {} });
  const res = recorder();
  await handler({
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: { pathId: 'p1', context: { pathTitle: 'X', pathVisibility: 'public', currentDayNumber: 4, dayLogs: dayLogs(), proofSubmissions: proof(), tasks: path.weeks[0].tasks } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.source, 'deterministic');
  assert.equal(res.payload.aiAvailable, false);
  assert.equal(res.payload.published, false);
  assert.ok(res.payload.draft && Array.isArray(res.payload.draft.insights));
  assert.doesNotMatch(JSON.stringify(res.payload), /storagePath|evidenceUrl|proofMedia/);
});

test('Phase 8.0 analyze-evidence is rate-limited and POST-only', async () => {
  let limited = false;
  const handler = createAnalyzeEvidenceHandler({ authenticate: async () => ({ uid: 'u1' }), rateLimit: async () => { limited = true; }, db: fakeAdminDb(), env: {} });
  await handler({ method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: { pathId: 'p1' } }, recorder());
  assert.equal(limited, true);
  const getRes = recorder();
  await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, body: {} }, getRes);
  assert.equal(getRes.statusCode, 405);
});

test('Phase 8.0 no new top-level API route files; AI router owns analyze-evidence; functions < 12', () => {
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_')).map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  assert.match(read('api/ai.js'), /analyze-evidence/);
  assert.ok(Object.keys(JSON.parse(read('vercel.json')).functions || {}).length < 12);
});

/* ── 6. Web UI ── */

test('Phase 8.0 web panel + review render with disclaimer and no private data', () => {
  const ctx = buildEvidenceContext({ path, dayLogs: dayLogs(), proofSubmissions: proof(), currentDayNumber: 4 });
  const draft = buildEvidenceInsightDraft({ uid: 'u1', pathId: 'p1', currentDayNumber: 4, insights: buildEvidenceInsights(ctx), recommendations: buildEvidenceRecommendations(ctx) });
  const panel = renderEvidenceIntelligencePanel({ draft });
  assert.match(panel, /Evidence intelligence/);
  assert.match(panel, /data-action="review-evidence-insight"/);
  assert.match(panel, /does not verify/i);
  const review = renderEvidenceInsightReview({ draft });
  assert.match(review, /Make your next proof stronger|What your evidence shows/);
  assert.match(review, /data-action="dismiss-evidence-insight"/);
  assert.doesNotMatch(panel + review, /storagePath|proofMedia|idToken|\bverified\b/i);
});

test('Phase 8.0 web Progress renders evidence panel injection + main.js wires actions', () => {
  assert.match(read('src/views.js'), /evidenceIntelligencePanelHTML/);
  assert.match(read('src/main.js'), /handleEvidenceAction/);
  assert.match(read('src/main.js'), /review-evidence-insight/);
});

/* ── 7. Mobile ── */

test('Phase 8.0 mobile evidence files exist; never auto-publish; no admin import', () => {
  for (const rel of [
    'src/core/mobileEvidenceIntelligence.js', 'src/services/mobileEvidenceIntelligenceRepository.js',
    'src/components/MobileEvidenceInsightCard.js', 'src/screens/EvidenceInsightsScreen.js',
  ]) {
    assert.equal(existsSync(resolve(mobile, rel)), true, rel);
  }
  assert.match(read('apps/mobile/src/components/MobileEvidenceInsightCard.js'), /Review on web/);
  for (const file of walk(resolve(mobile, 'src'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /from\s+['"]firebase-admin/, file);
  }
});

test('Phase 8.0 mobile evidence module does not touch Daily Focus core loop', () => {
  const src = read('apps/mobile/src/core/mobileEvidenceIntelligence.js');
  assert.doesNotMatch(src, /markTaskDone|finishMobileDay|addUploadedMediaProof/);
});

/* ── 8. Firestore rules ── */

test('Phase 8.0 firestore rules cover owner-only evidenceInsights; public denied', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /evidenceInsights/);
  assert.match(rules, /match \/users\/\{uid\}\/\{document=\*\*\}/);
  assert.match(rules, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
  assert.match(rules, /adaptivePlans/); // 7.0 still documented
});

test('Phase 8.0 storage rules unchanged shape (no new upload scope)', () => {
  assert.doesNotMatch(read('storage.rules'), /evidenceInsight|match \/\{allPaths=\*\*\}/);
});

/* ── 9. Phase 7.0 regression ── */

test('Phase 8.0 Phase 7.0 adaptive planning remains intact', () => {
  for (const rel of [
    'src/adaptive-planning-model.js', 'src/adaptive-planning-policy.js',
    'server/api-handlers/adapt-path.js', 'server/adaptive-planning-sanitizer.js',
    'tests/phase-7.0-rolling-adaptive-planning.test.js',
  ]) assert.equal(existsSync(resolve(root, rel)), true, rel);
  assert.match(read('api/ai.js'), /adapt-path/);
  assert.match(read('server/api-handlers/adapt-path.js'), /applied:\s*false/);
  const sanitizer = read('server/adaptive-planning-sanitizer.js');
  for (const k of ['proofBody', 'reflection', 'evidenceUrl', 'storagePath']) assert.match(sanitizer, new RegExp(k));
  assert.match(read('package.json'), /phase-7\.0-rolling-adaptive-planning\.test\.js/);
});

/* ── 10. No forbidden behavior ── */

test('Phase 8.0 no verification/fraud/social/economy/analytics/OCR added', () => {
  const files = [
    'src/evidence-intelligence-model.js', 'src/evidence-intelligence-policy.js', 'src/evidence-intelligence-db.js',
    'src/evidence-intelligence-context.js', 'src/evidence-intelligence-drafts.js',
    'src/views/evidence-intelligence-panel.js', 'src/views/evidence-insight-review.js',
    'server/evidence-intelligence-service.js', 'server/evidence-intelligence-sanitizer.js',
    'server/api-handlers/analyze-evidence.js',
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(src, /fraud|truth score|credibility score|fake detector|\bfollowers?\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy/i, rel);
    assert.doesNotMatch(src, /tesseract|ocr|computer.?vision|twilio|sendgrid|mailgun|@segment|mixpanel|amplitude\.com|google-analytics|gtag\(/i, rel);
  }
  assert.equal(JSON.parse(read('package.json')).dependencies['firebase-admin'], '13.10.0');
});

test('Phase 8.0 UI/model never assert proof is verified', () => {
  const ctx = buildEvidenceContext({ path, dayLogs: dayLogs(), proofSubmissions: proof(), currentDayNumber: 4 });
  const text = JSON.stringify(buildEvidenceInsights(ctx)) + JSON.stringify(buildEvidenceRecommendations(ctx));
  assert.doesNotMatch(text, /\bverified\b|\bcertified\b|\bfraud\b/i);
});
