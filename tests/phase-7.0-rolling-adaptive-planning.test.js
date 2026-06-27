import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildAdaptivePlanningContext, buildAdaptiveInsights, buildAdaptiveRecommendations,
  analyzeCompletionPattern, analyzeProofPattern, analyzeAnchorTaskPattern, analyzeTaskOverload,
  analyzeStrongConsistency, scoreRecommendationPriority, adaptivePlanSummary,
} from '../src/adaptive-planning-model.js';
import {
  canAdaptDay, canModifyTask, adaptationRequiresUserApproval, protectAnchorTasks,
  sanitizeAdaptiveRecommendation, adaptationMutationPlan,
} from '../src/adaptive-planning-policy.js';
import {
  sanitizeAdaptiveContextForModel, containsForbiddenContent,
} from '../server/adaptive-planning-sanitizer.js';
import {
  buildAdaptationDraft, normalizeAdaptationDraft, dismissDraft, buildOverlayFromDraft,
  ADAPTIVE_DRAFT_STATUSES,
} from '../src/adaptive-planning-drafts.js';
import { createAdaptPathHandler } from '../server/api-handlers/adapt-path.js';
import aiRouter from '../api/ai.js';
import { renderAdaptivePlanningPanel } from '../src/views/adaptive-planning-panel.js';
import { renderAdaptivePlanningReview } from '../src/views/adaptive-planning-review.js';

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

// A path with 7 required tasks (overload) and one anchor.
const overloadPath = {
  id: 'p1', title: 'Daily Writing', category: 'creative', visibility: 'public',
  weeks: [{ tasks: [
    { id: 'write', title: 'Write', required: true, anchor: true, evidenceRequired: true },
    { id: 't2', title: 'T2', required: true }, { id: 't3', title: 'T3', required: true },
    { id: 't4', title: 'T4', required: true }, { id: 't5', title: 'T5', required: true },
    { id: 't6', title: 'T6', required: true }, { id: 't7', title: 'T7', required: true },
  ] }],
};

function lowDayLogs() {
  return {
    1: { dayNumber: 1, completionScore: 50, requiredTotal: 7, requiredCompleted: 3, anchorSatisfied: false, evidenceRequired: 1, proofSubmittedCount: 0 },
    2: { dayNumber: 2, completionScore: 40, requiredTotal: 7, requiredCompleted: 2, anchorSatisfied: false, evidenceRequired: 1, proofSubmittedCount: 0 },
    3: { dayNumber: 3, completionScore: 55, requiredTotal: 7, requiredCompleted: 4, anchorSatisfied: false, evidenceRequired: 1, proofSubmittedCount: 0 },
  };
}

/* ── 1. Adaptive model ── */

test('Phase 7.0 context normalizes path/day/proof data without inventing it', () => {
  const ctx = buildAdaptivePlanningContext({ path: overloadPath, dayLogs: lowDayLogs(), currentDayNumber: 4 });
  assert.equal(ctx.requiredTaskCount, 7);
  assert.equal(ctx.anchorTaskCount, 1);
  assert.equal(ctx.currentDayNumber, 4);
  assert.equal(ctx.activeRecords.length, 3);
  // Empty input → no fabricated days.
  const empty = buildAdaptivePlanningContext({});
  assert.equal(empty.activeRecords.length, 0);
});

test('Phase 7.0 completion/proof/anchor/overload patterns detected from real data', () => {
  const ctx = buildAdaptivePlanningContext({ path: overloadPath, dayLogs: lowDayLogs(), currentDayNumber: 4 });
  assert.equal(analyzeCompletionPattern(ctx)?.type, 'low_completion_pattern');
  assert.equal(analyzeProofPattern(ctx)?.type, 'proof_gap');
  assert.equal(analyzeAnchorTaskPattern(ctx)?.type, 'anchor_task_failure');
  assert.equal(analyzeTaskOverload(ctx)?.type, 'overload_risk');
});

test('Phase 7.0 strong consistency only from strong/perfect days; no false positives', () => {
  const strong = buildAdaptivePlanningContext({
    path: overloadPath,
    dayLogs: { 1: { dayNumber: 1, completionScore: 100, requiredTotal: 7, requiredCompleted: 7 }, 2: { dayNumber: 2, completionScore: 100, requiredTotal: 7, requiredCompleted: 7 }, 3: { dayNumber: 3, completionScore: 100, requiredTotal: 7, requiredCompleted: 7 } },
    currentDayNumber: 4,
  });
  assert.equal(analyzeStrongConsistency(strong)?.type, 'perfect_day_pattern');
  // Low days never produce a strong-consistency insight.
  const low = buildAdaptivePlanningContext({ path: overloadPath, dayLogs: lowDayLogs(), currentDayNumber: 4 });
  assert.equal(analyzeStrongConsistency(low), null);
});

test('Phase 7.0 recommendations are generated, explainable and free of fake data', () => {
  const ctx = buildAdaptivePlanningContext({ path: overloadPath, dayLogs: lowDayLogs(), currentDayNumber: 4, pendingProofCount: 2 });
  const recs = buildAdaptiveRecommendations(ctx);
  assert.ok(recs.length > 0);
  for (const r of recs) {
    assert.equal(r.source, 'deterministic');
    assert.ok(typeof r.reason === 'string' && r.reason.length > 0, 'every rec has a reason');
  }
  // Pending uploads recommendation prioritized first.
  assert.equal(recs.some(r => r.type === 'resolve_pending_uploads'), true);
  assert.ok(scoreRecommendationPriority({ type: 'resolve_pending_uploads' }) > scoreRecommendationPriority({ type: 'keep_plan_unchanged' }));
  // No data → keep plan unchanged (never invents struggle).
  const calm = buildAdaptiveRecommendations(buildAdaptivePlanningContext({ path: overloadPath, dayLogs: {}, currentDayNumber: 1 }));
  assert.deepEqual(calm.map(r => r.type), ['keep_plan_unchanged']);
});

/* ── 2. Policy ── */

test('Phase 7.0 policy: only future days adaptable; past/completed/missed immutable', () => {
  assert.equal(canAdaptDay({ dayNumber: 5, currentDayNumber: 3 }), true);
  assert.equal(canAdaptDay({ dayNumber: 3, currentDayNumber: 3 }), false);
  assert.equal(canAdaptDay({ dayNumber: 2, currentDayNumber: 3 }), false);
  assert.equal(canAdaptDay({ dayNumber: 5, currentDayNumber: 3, status: 'completed' }), false);
  assert.equal(canAdaptDay({ dayNumber: 5, currentDayNumber: 3, status: 'missed' }), false);
});

test('Phase 7.0 policy: participants cannot edit public template; approval always required', () => {
  assert.equal(canModifyTask({ task: { id: 't' }, role: 'participant', pathVisibility: 'public' }), false);
  assert.equal(canModifyTask({ task: { id: 't' }, role: 'owner', pathVisibility: 'public' }), false);
  assert.equal(canModifyTask({ task: { id: 't' }, role: 'owner', pathVisibility: 'private' }), true);
  assert.equal(adaptationRequiresUserApproval(), true);
});

test('Phase 7.0 policy: anchor tasks are protected from removal', () => {
  const protectedRecs = protectAnchorTasks(
    [{ type: 'reduce_task_load', taskIds: ['write'] }],
    overloadPath.weeks[0].tasks,
  );
  assert.equal(protectedRecs[0].type, 'protect_anchor_task');
  assert.equal(protectedRecs[0].anchorProtected, true);
});

test('Phase 7.0 policy: mutation plan is overlay-only and future-day for participants', () => {
  const recs = buildAdaptiveRecommendations(buildAdaptivePlanningContext({ path: overloadPath, dayLogs: lowDayLogs(), currentDayNumber: 4 }));
  const plan = adaptationMutationPlan({ path: overloadPath, recommendations: recs, userRole: 'participant', currentDayNumber: 4 });
  assert.equal(plan.applyMode, 'overlay');
  assert.equal(plan.canDirectEditTemplate, false);
  assert.ok(plan.overlay.startsAtDayNumber >= 4);
});

/* ── 3. Sanitizer ── */

test('Phase 7.0 AI sanitizer strips proof/reflection/evidence/storage/tokens; keeps aggregates', () => {
  const dirtyContext = {
    pathTitle: 'My Path', pathCategory: 'creative', pathVisibility: 'public',
    currentDayNumber: 4, requiredTaskCount: 7, anchorTaskCount: 1,
    recentRecords: [{ dayNumber: 1, completionScore: 50, proofBody: 'secret', reflection: 'private', evidenceUrl: 'https://x/p', storagePath: 'users/u/proofMedia/x' }],
  };
  const dirtyTasks = [{ id: 'write', title: 'Write', anchor: true, proofBody: 'leak', evidenceUrl: 'https://x' }];
  const safe = sanitizeAdaptiveContextForModel({ context: dirtyContext, tasks: dirtyTasks, insights: [{ type: 'overload_risk', reason: 'x' }] });
  assert.equal(containsForbiddenContent(safe), false);
  const json = JSON.stringify(safe);
  assert.doesNotMatch(json, /secret|private|proofMedia|proofBody|reflection|evidenceUrl|storagePath/);
  // Aggregates survive.
  assert.equal(safe.requiredTaskCount, 7);
  assert.equal(safe.recentDays[0].completionScore, 50);
  assert.equal(safe.tasks[0].title, 'Write');
});

test('Phase 7.0 containsForbiddenContent flags leaks (tokens/emails/urls)', () => {
  assert.equal(containsForbiddenContent({ proofBody: 'x' }), true);
  assert.equal(containsForbiddenContent({ note: 'a@b.com' }), true);
  assert.equal(containsForbiddenContent({ ok: 'clean text' }), false);
});

/* ── 4. Drafts ── */

test('Phase 7.0 draft schema + statuses + dismiss + overlay (future-day only)', () => {
  const ctx = buildAdaptivePlanningContext({ path: overloadPath, dayLogs: lowDayLogs(), currentDayNumber: 4 });
  const draft = buildAdaptationDraft({ uid: 'u1', pathId: 'p1', currentDayNumber: 4, insights: buildAdaptiveInsights(ctx), recommendations: buildAdaptiveRecommendations(ctx) });
  for (const k of ['id', 'uid', 'pathId', 'source', 'status', 'currentDayNumber', 'insights', 'recommendations', 'summary', 'createdAt', 'updatedAt', 'appliedAt', 'schemaVersion']) {
    assert.ok(k in draft, 'draft has ' + k);
  }
  assert.equal(draft.status, 'draft');
  assert.ok(ADAPTIVE_DRAFT_STATUSES.includes(draft.status));
  assert.equal(dismissDraft(draft).status, 'dismissed');
  const overlay = buildOverlayFromDraft({ draft, path: overloadPath, userRole: 'participant' });
  assert.ok(overlay.startsAtDayNumber >= 4, 'overlay starts in the future');
  assert.equal(overlay.appliedDraftId, draft.id);
  // Draft never carries private proof.
  assert.doesNotMatch(JSON.stringify(draft), /proofBody|evidenceUrl|storagePath|reflection/);
});

test('Phase 7.0 sanitizeAdaptiveRecommendation scrubs unknown/dangerous fields', () => {
  const r = sanitizeAdaptiveRecommendation({ type: 'reduce_task_load', reason: 'see https://x/evidence and a@b.com', source: 'deterministic', secret: 'x', taskIds: ['a', 'b'] });
  assert.equal(r.type, 'reduce_task_load');
  assert.equal('secret' in r, false);
  assert.doesNotMatch(r.reason, /https:\/\/|a@b\.com/);
});

/* ── 5. API / router ── */

function recorder() {
  return { statusCode: 200, headers: {}, payload: null, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(v) { this.payload = v; return v; } };
}
function fakeAdminDb() {
  const docs = new Map();
  function docRef(path) {
    return {
      path,
      collection(name) { return colRef(path + '/' + name); },
      async get() { const d = docs.get(path); return { exists: d != null, data: () => d }; },
      async set(data) { docs.set(path, data); },
    };
  }
  function colRef(path) {
    return { path, doc(id) { return docRef(path + '/' + id); }, async get() { return { docs: [] }; } };
  }
  return { collection(name) { return colRef(name); }, _docs: docs };
}

test('Phase 7.0 adapt-path requires auth; unknown route still 404', async () => {
  const req = (route) => ({ method: 'POST', query: { route }, url: '/api/ai?route=' + route, headers: { 'content-type': 'application/json' }, body: {} });
  const res = recorder();
  await aiRouter(req('adapt-path'), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload?.error, 'unauthorized');
  const res2 = recorder();
  await aiRouter(req('missing-route'), res2);
  assert.equal(res2.statusCode, 404);
});

test('Phase 7.0 adapt-path returns a deterministic draft (AI unavailable) and never applies', async () => {
  const handler = createAdaptPathHandler({
    authenticate: async () => ({ uid: 'u1' }),
    rateLimit: async () => {},
    db: fakeAdminDb(),
    env: {}, // no ANTHROPIC_API_KEY
  });
  const res = recorder();
  await handler({
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' },
    body: { pathId: 'p1', context: { pathTitle: 'X', currentDayNumber: 4, dayLogs: lowDayLogs(), tasks: overloadPath.weeks[0].tasks } },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.source, 'deterministic');
  assert.equal(res.payload.aiAvailable, false);
  assert.equal(res.payload.applied, false);
  assert.ok(res.payload.draft && Array.isArray(res.payload.draft.recommendations));
  assert.doesNotMatch(JSON.stringify(res.payload), /proofBody|evidenceUrl|storagePath/);
});

test('Phase 7.0 adapt-path is rate-limited and POST-only', async () => {
  let limited = false;
  const handler = createAdaptPathHandler({ authenticate: async () => ({ uid: 'u1' }), rateLimit: async () => { limited = true; }, db: fakeAdminDb(), env: {} });
  const res = recorder();
  await handler({ method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body: { pathId: 'p1' } }, res);
  assert.equal(limited, true);
  const getRes = recorder();
  await handler({ method: 'GET', headers: { authorization: 'Bearer t' }, body: {} }, getRes);
  assert.equal(getRes.statusCode, 405);
});

test('Phase 7.0 no new top-level API route files; AI router owns adapt-path; functions < 12', () => {
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_')).map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  assert.match(read('api/ai.js'), /adapt-path/);
  const vercel = JSON.parse(read('vercel.json'));
  assert.ok(Object.keys(vercel.functions || {}).length < 12);
});

/* ── 6. Web UI ── */

test('Phase 7.0 web panel renders recommendations + reasons; review needs explicit apply', () => {
  const ctx = buildAdaptivePlanningContext({ path: overloadPath, dayLogs: lowDayLogs(), currentDayNumber: 4 });
  const draft = buildAdaptationDraft({ uid: 'u1', pathId: 'p1', currentDayNumber: 4, insights: buildAdaptiveInsights(ctx), recommendations: buildAdaptiveRecommendations(ctx) });
  const panel = renderAdaptivePlanningPanel({ draft });
  assert.match(panel, /Adjust upcoming days/);
  assert.match(panel, /data-action="review-adaptation"/);
  assert.match(panel, /data-action="dismiss-adaptation"/);
  const review = renderAdaptivePlanningReview({ draft });
  assert.match(review, /Why this was suggested/);
  assert.match(review, /data-action="apply-adaptation"/);
  // No auto-apply and no private data.
  assert.doesNotMatch(panel + review, /proofBody|evidenceUrl|storagePath|idToken/);
});

test('Phase 7.0 web Today renders the adaptive panel injection point', () => {
  assert.match(read('src/views.js'), /adaptivePlanningPanelHTML/);
  assert.match(read('src/main.js'), /apply-adaptation/);
});

/* ── 7. Mobile ── */

test('Phase 7.0 mobile adaptive files exist and do not auto-apply', () => {
  for (const rel of [
    'src/core/mobileAdaptivePlanning.js', 'src/services/mobileAdaptivePlanningRepository.js',
    'src/components/MobileAdaptivePlanningCard.js', 'src/screens/AdaptivePlanningScreen.js',
  ]) {
    assert.equal(existsSync(resolve(mobile, rel)), true, rel);
  }
  // Card reviews on web; never applies on mobile in 7.0.
  assert.match(read('apps/mobile/src/components/MobileAdaptivePlanningCard.js'), /Review on web/);
  for (const file of walk(resolve(mobile, 'src'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /from\s+['"]firebase-admin/, file);
  }
});

test('Phase 7.0 mobile Daily Focus is not broken (core loop untouched by adaptive code)', () => {
  // Adaptive code must not import the core loop mutators in a way that changes them.
  const card = read('apps/mobile/src/core/mobileAdaptivePlanning.js');
  assert.doesNotMatch(card, /markTaskDone|finishMobileDay|addUploadedMediaProof/);
});

/* ── 8. Firestore rules ── */

test('Phase 7.0 firestore rules cover owner-only adaptivePlans; public denied', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /adaptivePlans/);
  assert.match(rules, /match \/users\/\{uid\}\/\{document=\*\*\}/);
  assert.match(rules, /request\.auth\.uid == uid/);
  // publicProgress client writes remain denied.
  assert.match(rules, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
});

test('Phase 7.0 storage rules unchanged (no new upload scope)', () => {
  const sr = read('storage.rules');
  assert.doesNotMatch(sr, /adaptive/i);
  assert.doesNotMatch(sr, /match \/\{allPaths=\*\*\}/);
});

/* ── 9. No forbidden behavior ── */

test('Phase 7.0 no social/economy/analytics/email-SMS in new modules', () => {
  const files = [
    'src/adaptive-planning-model.js', 'src/adaptive-planning-policy.js', 'src/adaptive-planning-db.js',
    'src/adaptive-planning-context.js', 'src/adaptive-planning-drafts.js',
    'src/views/adaptive-planning-panel.js', 'src/views/adaptive-planning-review.js',
    'server/adaptive-planning-service.js', 'server/adaptive-planning-sanitizer.js',
    'server/api-handlers/adapt-path.js',
  ];
  for (const rel of files) {
    const src = read(rel);
    assert.doesNotMatch(src, /\bfollowers?\b|\bfollowing\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy/i, rel);
    assert.doesNotMatch(src, /twilio|sendgrid|mailgun|nodemailer|@segment|mixpanel|amplitude\.com|google-analytics|gtag\(/i, rel);
  }
  assert.equal(JSON.parse(read('package.json')).dependencies['firebase-admin'], '13.10.0');
});

test('Phase 7.0 recommendation copy avoids shaming language', () => {
  const ctx = buildAdaptivePlanningContext({ path: overloadPath, dayLogs: lowDayLogs(), currentDayNumber: 4, pendingProofCount: 1 });
  const text = JSON.stringify(buildAdaptiveRecommendations(ctx)) + ' ' + adaptivePlanSummary(buildAdaptiveRecommendations(ctx));
  assert.doesNotMatch(text, /\blazy\b|\bweak\b|\bfailure\b|\bpunish|\bbad performance\b/i);
});
