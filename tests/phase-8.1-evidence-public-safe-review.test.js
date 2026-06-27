import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evidenceReviewStatus, normalizeEvidenceReviewState, markEvidenceDraftReviewed,
  dismissEvidenceDraft, archiveEvidenceDraft, evidenceReviewActionsForDraft,
  evidenceDraftCanBePubliclySummarized, EVIDENCE_REVIEW_STATUSES,
} from '../src/evidence-review-model.js';
import {
  stripUnsafeEvidenceFields, publicSafeEvidenceSummary, publicSafeEvidenceInsight,
  publicSafeEvidenceRecommendation, evidenceContainsUnsafePublicData, evidenceSummarySafetyReport,
} from '../src/evidence-public-safety.js';
import {
  evidenceInsightSeverity, evidenceInsightDisplayGroup, evidenceInsightPriority,
  rankEvidenceRecommendations, evidenceInsightHasActionableRecommendation, groupEvidenceInsights,
} from '../src/evidence-insight-quality.js';
import { EVIDENCE_QA_FIXTURES, evidenceQaFixtureByName } from '../src/views/evidence-qa-fixtures.js';
import { renderEvidencePublicReviewPanel } from '../src/views/evidence-public-review-panel.js';
import { buildEvidenceContext, buildEvidenceInsights, buildEvidenceRecommendations } from '../src/evidence-intelligence-model.js';
import { buildEvidenceInsightDraft } from '../src/evidence-intelligence-drafts.js';
import { createAnalyzeEvidenceHandler } from '../server/api-handlers/analyze-evidence.js';
import {
  mobileEvidenceReviewState, mobileEvidenceReviewStatus,
} from '../apps/mobile/src/core/mobileEvidenceReview.js';

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

function draftFromFixture(name) {
  const f = evidenceQaFixtureByName(name);
  const ctx = buildEvidenceContext({ path: f.path, dayLogs: f.enrollment.dayLogs, proofSubmissions: f.proofSubmissions, currentDayNumber: 4 });
  const insights = buildEvidenceInsights(ctx);
  return buildEvidenceInsightDraft({ uid: 'u1', pathId: f.path.id, currentDayNumber: 4, insights, recommendations: buildEvidenceRecommendations(ctx, { insights }) });
}

/* ── 1. Review model ── */

test('Phase 8.1 review status normalizes; new/needs_review/reviewed/dismissed/archived', () => {
  assert.equal(evidenceReviewStatus({ insights: [{ type: 'proof_gap' }] }), 'needs_review');
  assert.equal(evidenceReviewStatus({}), 'new');
  assert.equal(evidenceReviewStatus({ status: 'reviewed' }), 'reviewed');
  assert.equal(evidenceReviewStatus({ reviewedAt: Date.now() }), 'reviewed');
  assert.equal(evidenceReviewStatus({ status: 'dismissed' }), 'dismissed');
  assert.equal(evidenceReviewStatus({ status: 'archived' }), 'archived');
  for (const s of ['new', 'needs_review', 'reviewed', 'dismissed', 'archived']) assert.ok(EVIDENCE_REVIEW_STATUSES.includes(s));
  const view = normalizeEvidenceReviewState({ id: 'x', insights: [{ type: 'proof_gap' }] });
  assert.equal(view.needsReview, true);
});

test('Phase 8.1 mark reviewed does not publish; dismiss keeps proof; archive keeps visibility', () => {
  const draft = { id: 'd', status: 'draft', insights: [{ type: 'proof_gap' }], publicSafeSummary: 'ok' };
  const reviewed = markEvidenceDraftReviewed(draft);
  assert.equal(reviewed.status, 'reviewed');
  assert.equal('published' in reviewed, false);
  // dismiss/archive never carry a proof-deletion or visibility flag.
  const dismissed = dismissEvidenceDraft(draft);
  assert.equal(dismissed.status, 'dismissed');
  assert.doesNotMatch(JSON.stringify(dismissed), /deleteProof|removeProof|visibility/i);
  const archived = archiveEvidenceDraft(draft);
  assert.equal(archived.status, 'archived');
  assert.doesNotMatch(JSON.stringify(archived), /visibility|publicVisible/i);
});

test('Phase 8.1 review actions by status; public summary only after review', () => {
  assert.deepEqual(evidenceReviewActionsForDraft({ insights: [{ type: 'proof_gap' }] }).sort(), ['dismiss', 'mark-reviewed', 'refresh']);
  assert.equal(evidenceDraftCanBePubliclySummarized({ status: 'draft', publicSafeSummary: 'x' }), false);
  assert.equal(evidenceDraftCanBePubliclySummarized({ status: 'reviewed', publicSafeSummary: 'x' }), true);
  assert.ok(evidenceReviewActionsForDraft({ status: 'reviewed', publicSafeSummary: 'x' }).includes('copy-public-safe-summary'));
});

/* ── 2. Public safety ── */

test('Phase 8.1 stripUnsafeEvidenceFields removes all private fields', () => {
  const dirty = {
    dayNumber: 1, taskTitle: 'Write',
    proofBody: 'x', reflection: 'x', evidenceUrl: 'https://x', downloadURL: 'https://y',
    storagePath: 'users/u/proofMedia/x', localUri: 'file:///tmp/x', base64: 'AAAA',
    token: 't', idToken: 't', password: 'p', email: 'a@b.com', pushSubscription: {},
  };
  const safe = stripUnsafeEvidenceFields(dirty);
  for (const k of ['proofBody', 'reflection', 'evidenceUrl', 'downloadURL', 'storagePath', 'localUri', 'base64', 'token', 'idToken', 'password', 'email', 'pushSubscription']) {
    assert.equal(k in safe, false, k + ' must be removed');
  }
  assert.equal(safe.dayNumber, 1);
  assert.ok(safe.__unsafeRemoved.includes('storagePath'));
});

test('Phase 8.1 publicSafeEvidenceSummary keeps safe aggregates, never URL/storage/localUri', () => {
  const summary = publicSafeEvidenceSummary({
    dayNumber: 2, taskTitle: 'Edit', proofType: 'image', proofStatus: 'uploaded', proofCount: 3,
    coverageRate: 80, publicVisible: true, publicCaption: 'A page',
    evidenceUrl: 'https://x', storagePath: 'users/u/proofMedia/x', localUri: 'file:///x',
  });
  assert.equal(summary.dayNumber, 2);
  assert.equal(summary.proofType, 'image');
  assert.equal(evidenceContainsUnsafePublicData(summary), false);
  assert.doesNotMatch(JSON.stringify(summary), /https:\/\/|proofMedia|storagePath|localUri|file:\/\//);
});

test('Phase 8.1 safety report flags reviewRequired + private content', () => {
  const report = evidenceSummarySafetyReport({ taskTitle: 'X', storagePath: 'users/u/proofMedia/x', evidenceUrl: 'https://x' });
  assert.equal(report.reviewRequired, true);
  assert.equal(report.containsPrivateEvidence, true);
  assert.equal(report.containsExternalUrl, true);
  assert.equal(report.containsStorageReference, true);
  assert.ok(report.unsafeFieldsRemoved.includes('storagePath'));
  const clean = evidenceSummarySafetyReport({ taskTitle: 'X', dayNumber: 1, proofType: 'note' });
  assert.equal(clean.publicSafe, true);
  // publicSafeEvidenceInsight/Recommendation never carry private data or "verified".
  assert.doesNotMatch(JSON.stringify(publicSafeEvidenceInsight({ type: 'proof_gap', reason: 'verified at https://x' })), /verified|https:\/\//);
  assert.doesNotMatch(JSON.stringify(publicSafeEvidenceRecommendation({ type: 'add_short_caption', body: 'see gs://x' })), /gs:\/\//);
});

/* ── 3. Insight quality ── */

test('Phase 8.1 recommendations ranked; insights grouped; missing proof not "failure"', () => {
  const recs = rankEvidenceRecommendations([{ type: 'improve_tomorrow_proof_prompt' }, { type: 'resolve_pending_upload' }]);
  assert.equal(recs[0].type, 'resolve_pending_upload');
  assert.equal(evidenceInsightSeverity({ type: 'failed_upload' }), 'needs_attention');
  assert.equal(evidenceInsightSeverity({ type: 'high_coverage_streak' }), 'info');
  assert.equal(evidenceInsightDisplayGroup({ type: 'missing_anchor_proof' }), 'Anchor proof');
  assert.equal(evidenceInsightDisplayGroup({ type: 'private_only_evidence' }), 'Privacy');
  assert.ok(evidenceInsightPriority({ type: 'failed_upload' }) > evidenceInsightPriority({ type: 'high_coverage_streak' }));
  const groups = groupEvidenceInsights([{ type: 'proof_gap' }, { type: 'pending_upload' }]);
  assert.deepEqual(Object.keys(groups).sort(), ['Coverage', 'Pending uploads']);
  assert.equal(evidenceInsightHasActionableRecommendation({ type: 'pending_upload' }, [{ type: 'resolve_pending_upload' }]), true);
});

test('Phase 8.1 quality module produces no credibility/truth/fraud score', () => {
  const src = read('src/evidence-insight-quality.js');
  assert.doesNotMatch(src, /credibility|truth score|\bfraud\b|\bverified\b/i);
});

/* ── 4. Deterministic recommendations (via QA fixtures) ── */

test('Phase 8.1 fixtures drive specific deterministic recommendations', () => {
  const recOf = (name) => {
    const f = evidenceQaFixtureByName(name);
    const ctx = buildEvidenceContext({ path: f.path, dayLogs: f.enrollment.dayLogs, proofSubmissions: f.proofSubmissions, currentDayNumber: 4 });
    return buildEvidenceRecommendations(ctx).map(r => r.type);
  };
  assert.ok(recOf('Image proof without caption').includes('add_short_caption'));
  assert.ok(recOf('Link proof without context').includes('add_context_to_link'));
  assert.ok(recOf('Anchor task with missing proof').includes('document_anchor_task_first'));
  assert.ok(recOf('Image proof pending upload').includes('resolve_pending_upload'));
  // Fixtures exist for all required cases and carry no private/raw production data.
  assert.ok(EVIDENCE_QA_FIXTURES.length >= 12);
  assert.doesNotMatch(JSON.stringify(EVIDENCE_QA_FIXTURES), /firebasestorage|googleusercontent|file:\/\/\/|data:image|eyJ/);
});

/* ── 5. Web review UI ── */

test('Phase 8.1 review panel renders status, public-safe vs private, actions, disclaimer; no unsafe fields', () => {
  const draft = draftFromFixture('Image proof without caption');
  const html = renderEvidencePublicReviewPanel({ draft });
  assert.match(html, /Evidence review/);
  assert.match(html, /Private insight/);
  assert.match(html, /Public-safe summary draft/);
  assert.match(html, /Review before sharing/);
  assert.match(html, /data-action="mark-evidence-insight-reviewed"/);
  assert.match(html, /data-action="dismiss-evidence-insight"/);
  assert.match(html, /data-action="refresh-evidence-insight"/);
  assert.match(html, /does not verify that an activity happened/i);
  assert.doesNotMatch(html, /storagePath|localUri|proofMedia|idToken|\bverified\b/i);
});

test('Phase 8.1 copy public-safe summary action only when reviewed', () => {
  const draft = draftFromFixture('Strong multimodal proof');
  const newPanel = renderEvidencePublicReviewPanel({ draft });
  assert.doesNotMatch(newPanel, /data-action="copy-public-safe-summary"/);
  const reviewed = renderEvidencePublicReviewPanel({ draft: { ...draft, status: 'reviewed', reviewedAt: Date.now() } });
  assert.match(reviewed, /data-action="copy-public-safe-summary"/);
});

test('Phase 8.1 web wires the new review actions in main.js', () => {
  const main = read('src/main.js');
  assert.match(main, /archive-evidence-insight/);
  assert.match(main, /copy-public-safe-summary/);
  // mark reviewed never publishes.
  assert.match(main, /Nothing was published/);
  assert.match(read('src/views.js'), /renderEvidencePublicReviewPanel/);
});

/* ── 6. Server ── */

function recorder() {
  return { statusCode: 200, headers: {}, payload: null, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(v) { this.payload = v; return v; } };
}
function fakeAdminDb() {
  const docs = new Map();
  function docRef(p) { return { path: p, collection(n) { return colRef(p + '/' + n); }, async get() { const d = docs.get(p); return { exists: d != null, data: () => d }; }, async set(data) { docs.set(p, data); } }; }
  function colRef(p) { return { path: p, doc(id) { return docRef(p + '/' + id); }, async get() { return { docs: [] }; } }; }
  return { collection(n) { return colRef(n); }, _docs: docs };
}

test('Phase 8.1 analyze-evidence returns safetyReport + publicSafeSummary + reviewRequired; never raw state/unsafe', async () => {
  const handler = createAnalyzeEvidenceHandler({ authenticate: async () => ({ uid: 'u1' }), rateLimit: async () => {}, db: fakeAdminDb(), env: {} });
  const res = recorder();
  const f = evidenceQaFixtureByName('Image proof without caption');
  await handler({
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: { pathId: 'qa-path', context: { pathTitle: 'X', pathVisibility: 'public', currentDayNumber: 4, dayLogs: f.enrollment.dayLogs, proofSubmissions: f.proofSubmissions, tasks: f.path.weeks[0].tasks } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.payload.safetyReport);
  assert.equal(res.payload.reviewRequired, true);
  assert.equal('publicSafeSummary' in res.payload, true);
  assert.equal(res.payload.published, false);
  const json = JSON.stringify(res.payload);
  assert.doesNotMatch(json, /proofMedia|storagePath|localUri|evidenceUrl|enrollments|"state"/);
});

/* ── 7. Mobile ── */

test('Phase 8.1 mobile review card + core exist; render no private fields; never verified', () => {
  assert.equal(existsSync(resolve(mobile, 'src/core/mobileEvidenceReview.js')), true);
  assert.equal(existsSync(resolve(mobile, 'src/components/MobileEvidenceReviewCard.js')), true);
  const state = mobileEvidenceReviewState({ insights: [{ type: 'proof_gap' }], publicSafeSummary: 'A clear summary.' });
  assert.equal(state.hasPublicSafeSummary, true);
  assert.equal(mobileEvidenceReviewStatus({ status: 'reviewed' }), 'reviewed');
  for (const rel of ['src/components/MobileEvidenceReviewCard.js', 'src/screens/EvidenceInsightsScreen.js', 'src/core/mobileEvidenceReview.js']) {
    const src = readFileSync(resolve(mobile, rel), 'utf8');
    assert.doesNotMatch(src, /storagePath|localUri|downloadURL|idToken|\bverified\b/i, rel);
    assert.doesNotMatch(src, /publishInsight|publishEvidence/i, rel);
  }
});

/* ── 8. Public progress boundary ── */

test('Phase 8.1 evidence insights do not leak into public progress automatically', () => {
  // Public progress publishing never references evidence insight drafts.
  assert.doesNotMatch(read('server/api-handlers/publish-progress.js'), /evidenceInsight|evidence-intelligence|analyze-evidence/i);
  assert.doesNotMatch(read('src/public-progress.js'), /evidenceInsight|evidenceInsightDraft/i);
  // The draft schema is not a public progress entry shape.
  const draft = draftFromFixture('Text proof only');
  assert.equal('visibility' in draft, false);
});

/* ── 9. Regression ── */

test('Phase 8.1 prior phase tests registered; admin pinned; functions < 12; routers intact', () => {
  const pkg = read('package.json');
  for (const t of ['phase-8.0.1-evidence-intelligence-runtime-source-repair', 'phase-8.0-evidence-intelligence', 'phase-7.0-rolling-adaptive-planning', 'phase-6.18.1-web-notification-preferences-signout-repair']) {
    assert.match(pkg, new RegExp(t.replace(/\./g, '\\.')));
  }
  assert.equal(JSON.parse(pkg).dependencies['firebase-admin'], '13.10.0');
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_')).map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  assert.ok(Object.keys(JSON.parse(read('vercel.json')).functions || {}).length < 12);
});

/* ── 10. No forbidden behavior ── */

test('Phase 8.1 no Gemini/OCR/vision/Perplexity/fraud/social/economy/analytics added', () => {
  const files = [
    'src/evidence-review-model.js', 'src/evidence-public-safety.js', 'src/evidence-insight-quality.js',
    'src/views/evidence-public-review-panel.js', 'src/views/evidence-qa-fixtures.js',
    'server/evidence-intelligence-service.js', 'server/api-handlers/analyze-evidence.js',
    'apps/mobile/src/core/mobileEvidenceReview.js', 'apps/mobile/src/components/MobileEvidenceReviewCard.js',
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(src, /gemini|perplexity|tesseract|\bocr\b|computer.?vision|\bfraud\b|truth score|credibility/i, rel);
    assert.doesNotMatch(src, /\bfollowers?\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy|twilio|sendgrid|@segment|mixpanel|google-analytics|gtag\(/i, rel);
  }
  for (const file of walk(resolve(mobile, 'src'))) assert.doesNotMatch(readFileSync(file, 'utf8'), /from\s+['"]firebase-admin/, file);
});
