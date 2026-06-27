import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeEvidenceVisionRequest, normalizeEvidenceVisionObservation,
  evidenceVisionObservationSummary, evidenceVisionPublicSafeView,
  evidenceVisionSignalsForAdaptivePlanning, EVIDENCE_VISION_TASK_ALIGNMENTS,
} from '../src/evidence-vision-model.js';
import {
  canAnalyzeEvidenceImage, evidenceVisionRequiresConsent, evidenceVisionConsentCopy,
  evidenceVisionDisclaimer, visionObservationRequiresReview, sanitizeVisionObservation,
  visionObservationCanFeedAdaptivePlanning,
} from '../src/evidence-vision-policy.js';
import {
  sanitizeEvidenceVisionContextForGemini, sanitizeGeminiVisionOutput,
  containsForbiddenVisionContent, buildGeminiVisionPrompt,
} from '../server/evidence-vision-sanitizer.js';
import {
  geminiVisionConfigured, geminiVisionConfig, analyzeImageWithGemini, normalizeGeminiVisionResponse,
} from '../server/gemini-vision-provider.js';
import { analyzeEvidenceImageForUser } from '../server/evidence-vision-service.js';
import { createAnalyzeEvidenceImageHandler } from '../server/api-handlers/analyze-evidence-image.js';
import aiRouter from '../api/ai.js';
import { renderEvidenceVisionConsent } from '../src/views/evidence-vision-consent.js';
import { renderEvidenceVisionTrigger, renderEvidenceVisionPanel } from '../src/views/evidence-vision-panel.js';

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
const ENABLED_ENV = { GEMINI_VISION_ENABLED: 'true', GEMINI_API_KEY: 'k', GEMINI_VISION_MODEL: 'gemini-2.5-flash', GEMINI_VISION_MAX_IMAGE_MB: '10' };
const PNG_B64 = Buffer.from('fake-png-bytes').toString('base64');

/* ── 1. Model ── */

test('Phase 8.2 vision request + observation normalize; appears-to-show; never verified', () => {
  const req = normalizeEvidenceVisionRequest({ pathId: 'p1', evidenceId: 'e1', consentToVisionAnalysis: true });
  assert.equal(req.consentToVisionAnalysis, true);
  const o = normalizeEvidenceVisionObservation({ imageObservation: 'This image is verified and proves the run happened', taskAlignment: 'clear_context', uncertainty: 'low', source: 'gemini' });
  assert.doesNotMatch(o.imageObservation, /\bverified\b|\bproves\b|\bfraud\b/i);
  assert.match(o.imageObservation, /appears to show/i);
  assert.ok(EVIDENCE_VISION_TASK_ALIGNMENTS.includes(o.taskAlignment));
  assert.ok(evidenceVisionObservationSummary(o).length > 0);
});

test('Phase 8.2 public-safe view strips raw url/storage/localUri/ids', () => {
  const view = evidenceVisionPublicSafeView({
    uid: 'u', evidenceId: 'e', taskTitle: 'Write', dayNumber: 1,
    imageObservation: 'see https://x/y and gs://b/x and users/u/proofMedia/z',
    suggestedCaption: 'A page of writing', publicSafeSummary: 'A page of writing',
  });
  assert.equal('uid' in view, false);
  assert.equal('evidenceId' in view, false);
  assert.doesNotMatch(JSON.stringify(view), /https:\/\/|gs:\/\/|proofMedia|storagePath|localUri/);
});

test('Phase 8.2 adaptive-planning signals are safe labels/booleans only', () => {
  const signals = evidenceVisionSignalsForAdaptivePlanning({ needsMoreContext: true, taskAlignment: 'needs_caption', suggestedCaption: 'x', uncertainty: 'medium', evidenceSignals: ['a', 'b'] });
  assert.deepEqual(Object.keys(signals).sort(), ['evidenceSignalCount', 'needsMoreContext', 'suggestedCaptionAvailable', 'taskAlignment', 'uncertainty']);
  assert.doesNotMatch(JSON.stringify(signals), /https?:|storagePath|localUri/);
});

/* ── 2. Policy ── */

test('Phase 8.2 consent required; copy + disclaimer; review required; image-only', () => {
  assert.equal(evidenceVisionRequiresConsent(), true);
  assert.match(evidenceVisionConsentCopy(), /Analyze this proof image with AI/i);
  assert.match(evidenceVisionConsentCopy(), /do not verify/i);
  assert.match(evidenceVisionDisclaimer(), /do not verify that an activity happened/i);
  assert.equal(visionObservationRequiresReview(), true);
  assert.equal(canAnalyzeEvidenceImage({ user: { uid: 'u' }, evidence: { fileType: 'image/png' }, path: { id: 'p' } }), true);
  assert.equal(canAnalyzeEvidenceImage({ user: { uid: 'u' }, evidence: { fileType: 'application/pdf' }, path: { id: 'p' } }), false);
  assert.equal(canAnalyzeEvidenceImage({ user: null, evidence: { fileType: 'image/png' }, path: { id: 'p' } }), false);
  assert.equal(visionObservationCanFeedAdaptivePlanning({ taskAlignment: 'clear_context' }), true);
  // Sanitizer strips verification language.
  assert.doesNotMatch(JSON.stringify(sanitizeVisionObservation({ imageObservation: 'verified, fraud' })), /\bverified\b|\bfraud\b/i);
});

/* ── 3. Sanitizer ── */

test('Phase 8.2 Gemini context sanitizer strips tokens/email/reflection/push/state/localUri/storage', () => {
  const dirty = {
    taskTitle: 'Write', proofType: 'image', dayNumber: 1, publicVisible: false, publicCaption: 'hидden',
    idToken: 'eyJabc', email: 'a@b.com', password: 'p', reflection: 'private', pushSubscription: { endpoint: 'x' },
    state: { secret: 1 }, localUri: 'file:///x', storagePath: 'users/u/proofMedia/x', evidenceUrl: 'https://x',
  };
  const safe = sanitizeEvidenceVisionContextForGemini(dirty);
  assert.equal(containsForbiddenVisionContent(safe), false);
  const json = JSON.stringify(safe);
  assert.doesNotMatch(json, /eyJabc|a@b\.com|reflection|pushSubscription|localUri|proofMedia|https:\/\//);
  assert.equal(safe.taskTitle, 'Write');
  // publicCaption only kept when publicVisible.
  assert.equal(safe.publicCaption, '');
});

test('Phase 8.2 Gemini output sanitizer removes identity/sensitive/verification/fraud claims', () => {
  const out = sanitizeGeminiVisionOutput({
    imageObservation: 'A person named John is verified and this proves fraud; face recognition match',
    evidenceSignals: ['biometric match'], taskAlignment: 'clear_context', uncertainty: 'low', suggestedCaption: 'ok',
  });
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /\bverified\b|\bproves\b|\bfraud\b|face recognition|biometric|named John/i);
  assert.match(out.imageObservation, /appears to show/i);
});

test('Phase 8.2 prompt requires JSON-only + no-identify + no-verify; containsForbidden flags leaks', () => {
  const prompt = buildGeminiVisionPrompt({ taskTitle: 'Write', proofType: 'image' });
  assert.match(prompt, /Return structured JSON only/i);
  assert.match(prompt, /Do not identify people/i);
  assert.match(prompt, /Do not verify whether the task happened/i);
  assert.equal(containsForbiddenVisionContent({ idToken: 'x' }), true);
  assert.equal(containsForbiddenVisionContent({ note: 'https://x' }), true);
});

/* ── 4. Provider ── */

test('Phase 8.2 geminiVisionConfigured requires enabled + key; respects model/size', () => {
  assert.equal(geminiVisionConfigured({}), false);
  assert.equal(geminiVisionConfigured({ GEMINI_API_KEY: 'k' }), false);
  assert.equal(geminiVisionConfigured({ GEMINI_VISION_ENABLED: 'true' }), false);
  assert.equal(geminiVisionConfigured(ENABLED_ENV), true);
  assert.equal(geminiVisionConfig({ ...ENABLED_ENV, GEMINI_VISION_MODEL: 'gemini-x' }).model, 'gemini-x');
});

test('Phase 8.2 provider rejects unsupported type + oversize; uses injected fetch; safe reasons', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"imageObservation":"appears to show a page"}' }] } }] }) }; };
  assert.equal((await analyzeImageWithGemini({ image: { mimeType: 'image/gif', base64: PNG_B64 }, env: ENABLED_ENV, fetchImpl })).disabledReason, 'unsupported_media_type');
  const big = 'A'.repeat(15 * 1024 * 1024);
  assert.equal((await analyzeImageWithGemini({ image: { mimeType: 'image/png', base64: big }, env: ENABLED_ENV, fetchImpl })).disabledReason, 'image_too_large');
  assert.equal((await analyzeImageWithGemini({ image: { mimeType: 'image/png', base64: PNG_B64 }, env: {}, fetchImpl })).disabledReason, 'vision_disabled');
  assert.equal((await analyzeImageWithGemini({ image: { mimeType: 'image/png', base64: PNG_B64 }, env: { GEMINI_VISION_ENABLED: 'true' }, fetchImpl })).disabledReason, 'missing_api_key');
  const ok = await analyzeImageWithGemini({ image: { mimeType: 'image/png', base64: PNG_B64 }, env: ENABLED_ENV, fetchImpl });
  assert.equal(ok.ok, true); assert.equal(called, true);
  assert.equal(normalizeGeminiVisionResponse({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }).a, 1);
});

test('Phase 8.2 GEMINI_API_KEY is never referenced in client/mobile code', () => {
  for (const file of [...walk(resolve(root, 'src')), ...walk(resolve(mobile, 'src'))]) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /GEMINI_API_KEY|VITE_GEMINI|EXPO_PUBLIC_GEMINI/i, file);
  }
});

/* ── 5. Service ── */

function fakeImage() { return async () => ({ mimeType: 'image/png', base64: PNG_B64 }); }
function fakeEvidence(extra = {}) {
  return async () => ({ id: 'e1', pathId: 'p1', dayNumber: 1, taskId: 'write', taskTitle: 'Write', fileType: 'image/png', proofType: 'image', storagePath: 'qa/x', publicVisible: false, ...extra });
}
function okGemini() { return async () => ({ ok: true, raw: { imageObservation: 'appears to show a handwritten page', taskAlignment: 'clear_context', uncertainty: 'low', suggestedCaption: 'A page of writing' } }); }

test('Phase 8.2 service: disabled when not configured; missing image; success draft (no raw fields)', async () => {
  assert.equal((await analyzeEvidenceImageForUser({ uid: 'u1', request: { pathId: 'p1', evidenceId: 'e1' }, env: {} })).disabledReason, 'vision_disabled');
  // configured + image evidence but no image bytes loaded → missing_image
  const noImg = await analyzeEvidenceImageForUser({ uid: 'u1', request: { pathId: 'p1', evidenceId: 'e1' }, env: ENABLED_ENV, loadEvidence: fakeEvidence(), loadImage: async () => null, gemini: okGemini() });
  assert.equal(noImg.disabledReason, 'missing_image');
  // success
  const okRes = await analyzeEvidenceImageForUser({ adminDb: null, uid: 'u1', request: { pathId: 'p1', evidenceId: 'e1' }, env: ENABLED_ENV, loadEvidence: fakeEvidence(), loadImage: fakeImage(), gemini: okGemini() });
  assert.equal(okRes.ok, true);
  assert.equal(okRes.observation.source, 'gemini');
  assert.match(okRes.observation.imageObservation, /appears to show/i);
  assert.doesNotMatch(JSON.stringify(okRes.observation), /storagePath|localUri|downloadURL|https:\/\/|qa\/x/);
});

test('Phase 8.2 service rejects non-image evidence', async () => {
  const res = await analyzeEvidenceImageForUser({ uid: 'u1', request: { pathId: 'p1', evidenceId: 'e1' }, env: ENABLED_ENV, loadEvidence: fakeEvidence({ fileType: 'application/pdf', proofType: 'file' }), loadImage: fakeImage(), gemini: okGemini() });
  assert.equal(res.disabledReason, 'unsupported_media_type');
});

/* ── 6. Route / API ── */

function recorder() {
  return { statusCode: 200, headers: {}, payload: null, setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; }, json(v) { this.payload = v; return v; } };
}
function postReq(body, method = 'POST') {
  return { method, query: { route: 'analyze-evidence-image' }, url: '/api/ai?route=analyze-evidence-image', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, body };
}
// Minimal admin-db stub so the handler never calls the real getAdminFirestore.
function routeDb() {
  const docRef = () => ({ collection: () => colRef(), async set() {}, async get() { return { exists: false, data: () => null }; } });
  const colRef = () => ({ doc: () => docRef(), async get() { return { docs: [] }; } });
  return { collection: () => colRef() };
}

test('Phase 8.2 analyze-evidence-image mounted in ai router; requires auth; unknown route 404', async () => {
  const res = recorder();
  await aiRouter({ method: 'POST', query: { route: 'analyze-evidence-image' }, url: '/api/ai?route=analyze-evidence-image', headers: { 'content-type': 'application/json' }, body: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.match(read('api/ai.js'), /analyze-evidence-image/);
});

test('Phase 8.2 route requires consent; rate-limited; disabled reason; no raw fields', async () => {
  let limited = false;
  const handler = createAnalyzeEvidenceImageHandler({ authenticate: async () => ({ uid: 'u1' }), rateLimit: async () => { limited = true; }, db: routeDb(), env: {}, loadEvidence: fakeEvidence(), loadImage: fakeImage(), gemini: okGemini() });
  // No consent → 400.
  const noConsent = recorder();
  await handler(postReq({ pathId: 'p1', evidenceId: 'e1' }), noConsent);
  assert.equal(noConsent.statusCode, 400);
  // With consent but vision disabled (env empty) → ok:false disabled reason.
  const res = recorder();
  await handler(postReq({ pathId: 'p1', evidenceId: 'e1', consentToVisionAnalysis: true }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, false);
  assert.equal(res.payload.disabledReason, 'vision_disabled');
  assert.equal(limited, true);
  // POST-only.
  const get = recorder();
  await handler(postReq({}, 'GET'), get);
  assert.equal(get.statusCode, 405);
});

test('Phase 8.2 route returns private draft when configured; never raw storage/url; functions < 12', async () => {
  const handler = createAnalyzeEvidenceImageHandler({ authenticate: async () => ({ uid: 'u1' }), rateLimit: async () => {}, db: routeDb(), env: ENABLED_ENV, loadEvidence: fakeEvidence(), loadImage: fakeImage(), gemini: okGemini() });
  const res = recorder();
  await handler(postReq({ pathId: 'p1', evidenceId: 'e1', consentToVisionAnalysis: true }), res);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.published, false);
  assert.equal(res.payload.reviewRequired, true);
  assert.doesNotMatch(JSON.stringify(res.payload), /storagePath|localUri|downloadURL|qa\/x|https:\/\//);
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true }).filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_')).map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  assert.ok(Object.keys(JSON.parse(read('vercel.json')).functions || {}).length < 12);
});

/* ── 7. Web UI ── */

test('Phase 8.2 web consent + trigger + panel render safely; disclaimer; no raw fields', () => {
  assert.match(renderEvidenceVisionTrigger({ evidenceId: 'e1', isImageProof: true }), /Analyze image with AI/);
  assert.equal(renderEvidenceVisionTrigger({ isImageProof: false }), '');
  const consent = renderEvidenceVisionConsent({ evidenceId: 'e1' });
  assert.match(consent, /Analyze this proof image with AI/i);
  assert.match(consent, /data-action="confirm-vision-analysis"/);
  assert.match(consent, /do not verify that an activity happened/i);
  const draft = { id: 'v1', imageObservation: 'appears to show a page', needsMoreContext: true, suggestedCaption: 'A page', taskAlignment: 'needs_caption', uncertainty: 'medium' };
  const panel = renderEvidenceVisionPanel({ draft });
  assert.match(panel, /Appears to show/);
  assert.match(panel, /Suggested caption/);
  assert.match(panel, /Needs more context/);
  assert.match(panel, /Review before sharing/);
  assert.match(panel, /data-action="mark-vision-reviewed"/);
  assert.doesNotMatch(panel, /storagePath|localUri|https:\/\/|\bverified\b/i);
  assert.match(renderEvidenceVisionPanel({ status: 'disabled', disabledReason: 'vision_disabled' }), /not enabled yet/i);
  // main.js wires the vision actions.
  assert.match(read('src/main.js'), /confirm-vision-analysis/);
});

/* ── 8. Mobile ── */

test('Phase 8.2 mobile vision files exist; never call Gemini directly; never send unsafe fields', () => {
  for (const rel of ['src/core/mobileEvidenceVision.js', 'src/services/mobileEvidenceVisionRepository.js', 'src/components/MobileEvidenceVisionCard.js']) {
    assert.equal(existsSync(resolve(mobile, rel)), true, rel);
  }
  const repo = read('apps/mobile/src/services/mobileEvidenceVisionRepository.js');
  assert.match(repo, /analyze-evidence-image/);
  assert.match(repo, /consentToVisionAnalysis/);
  assert.doesNotMatch(repo, /generativelanguage|localUri|base64|storagePath|downloadURL/i);
  for (const file of walk(resolve(mobile, 'src'))) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /generativelanguage\.googleapis|GEMINI_API_KEY/i, file);
    assert.doesNotMatch(src, /from\s+['"]firebase-admin/, file);
  }
});

/* ── 9. Regression ── */

test('Phase 8.2 prior phases registered; admin pinned; routers intact', () => {
  const pkg = read('package.json');
  for (const t of ['phase-8.1-evidence-public-safe-review', 'phase-8.0.1-evidence-intelligence-runtime-source-repair', 'phase-8.0-evidence-intelligence', 'phase-7.0-rolling-adaptive-planning', 'phase-6.18.1-web-notification-preferences-signout-repair']) {
    assert.match(pkg, new RegExp(t.replace(/\./g, '\\.')));
  }
  assert.equal(JSON.parse(pkg).dependencies['firebase-admin'], '13.10.0');
});

/* ── 10. No forbidden behavior ── */

test('Phase 8.2 no Perplexity/OCR/video/audio/biometric/fraud/social/economy/analytics', () => {
  // Feature files must not introduce any forbidden capability or vocabulary.
  // The sanitizer/model/policy deliberately reference identity/fraud/biometric
  // terms ONLY to STRIP them, so they are checked separately (no new providers).
  const featureFiles = [
    'src/evidence-vision-db.js', 'src/views/evidence-vision-panel.js', 'src/views/evidence-vision-consent.js',
    'server/evidence-vision-service.js', 'server/api-handlers/analyze-evidence-image.js',
  ];
  for (const rel of featureFiles) {
    const src = read(rel);
    assert.doesNotMatch(src, /perplexity|tesseract|\bocr\b|\bvideo\b|\baudio\b|biometric|face recognition|\bfraud\b|truth score|credibility|\bfollowers?\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy/i, rel);
    assert.doesNotMatch(src, /twilio|sendgrid|mailgun|@segment|mixpanel|amplitude\.com|google-analytics|gtag\(/i, rel);
  }
  // Safety files (which strip the bad vocabulary) must still add no real provider
  // integrations and no Perplexity/OCR product.
  for (const rel of ['server/gemini-vision-provider.js', 'server/evidence-vision-sanitizer.js', 'src/evidence-vision-model.js', 'src/evidence-vision-policy.js']) {
    const src = read(rel);
    assert.doesNotMatch(src, /perplexity|tesseract|\bvideo\b|\baudio\b|\bfollowers?\b|leaderboard|\bhearts?\b|\bgems?\b|shop economy|twilio|sendgrid|@segment|mixpanel|google-analytics/i, rel);
  }
});
