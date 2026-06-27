// ── evidence-vision-model.js ────────────────────────────────────────────────
// Pure model for Gemini Vision evidence understanding. No DOM/Firebase/network.
// A vision observation describes what a proof image *appears to show* — it never
// verifies an activity, never claims completion, never identifies people, never
// infers sensitive traits, never scores truth/fraud/credibility, and never
// exposes raw image URLs, storage paths or localUri in public-safe output.

export const EVIDENCE_VISION_SCHEMA_VERSION = 1;

export const EVIDENCE_VISION_SOURCES = ['gemini', 'manual', 'deterministic'];
export const EVIDENCE_VISION_STATUSES = ['draft', 'reviewed', 'dismissed', 'failed'];
export const EVIDENCE_VISION_TASK_ALIGNMENTS = ['clear_context', 'needs_caption', 'needs_better_evidence', 'unrelated_or_unclear', 'unknown'];
export const EVIDENCE_VISION_UNCERTAINTIES = ['low', 'medium', 'high', 'unknown'];

const VERIFICATION_RE = /\bverified\b|\bcertified\b|\bproves?\b|definitely happened|truth score|\bfraud\b|face match|identity match|biometric/gi;
const LEAK_PATTERNS = [
  /\bgs:\/\/\S+/gi, /\bfile:\/\/\/\S+/gi, /\bhttps?:\/\/\S+/gi,
  /\busers\/[^\s]*\/proofMedia\/\S+/gi, /\bevidence\/[^\s]+/gi, /\bdata:[^\s)]+/gi,
  /\beyJ[a-zA-Z0-9_-]{8,}\b/g, /[\w.+-]+@[\w-]+\.[\w.-]+/g,
];

function num(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function ts(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const p = Date.parse(value); return Number.isFinite(p) ? p : fallback;
}
function safeId(value, max = 200) { return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, max); }

// Scrub free text: strip URLs/storage/tokens/emails and reframe any claim that
// asserts an activity happened into neutral "appears to show" language.
export function scrubVisionText(value, max = 400) {
  let t = String(value == null ? '' : value);
  for (const p of LEAK_PATTERNS) t = t.replace(p, '');
  t = t.replace(VERIFICATION_RE, 'appears to show');
  return t.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function newVisionInsightId(now = Date.now()) {
  return 'evi_vis_' + Number(now).toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Normalize an analysis REQUEST (what the client/handler asks for). Carries only
// the identifiers needed to load the selected evidence server-side.
export function normalizeEvidenceVisionRequest(input = {}) {
  const r = input && typeof input === 'object' ? input : {};
  return {
    pathId: safeId(r.pathId, 120),
    evidenceId: safeId(r.evidenceId, 200),
    dayNumber: num(r.dayNumber, null),
    taskId: safeId(r.taskId, 120),
    consentToVisionAnalysis: r.consentToVisionAnalysis === true,
  };
}

// Normalize a vision OBSERVATION into a safe, complete record.
export function normalizeEvidenceVisionObservation(input = {}) {
  const o = input && typeof input === 'object' ? input : {};
  const now = ts(o.createdAt, Date.now());
  const signals = Array.isArray(o.evidenceSignals)
    ? o.evidenceSignals.map(s => scrubVisionText(s, 60)).filter(Boolean).slice(0, 12)
    : [];
  return {
    id: safeId(o.id) || newVisionInsightId(now),
    uid: safeId(o.uid, 128),
    pathId: safeId(o.pathId, 120),
    evidenceId: safeId(o.evidenceId, 200),
    dayNumber: num(o.dayNumber, null),
    taskId: safeId(o.taskId, 120),
    taskTitle: scrubVisionText(o.taskTitle, 120),
    source: EVIDENCE_VISION_SOURCES.includes(o.source) ? o.source : 'gemini',
    status: EVIDENCE_VISION_STATUSES.includes(o.status) ? o.status : 'draft',
    imageObservation: scrubVisionText(o.imageObservation, 600),
    evidenceSignals: signals,
    needsMoreContext: o.needsMoreContext === true,
    suggestedCaption: scrubVisionText(o.suggestedCaption, 160),
    taskAlignment: EVIDENCE_VISION_TASK_ALIGNMENTS.includes(o.taskAlignment) ? o.taskAlignment : 'unknown',
    uncertainty: EVIDENCE_VISION_UNCERTAINTIES.includes(o.uncertainty) ? o.uncertainty : 'unknown',
    safetyFlags: Array.isArray(o.safetyFlags) ? o.safetyFlags.map(f => scrubVisionText(f, 40)).filter(Boolean).slice(0, 8) : [],
    publicSafeSummary: scrubVisionText(o.publicSafeSummary, 200),
    createdAt: now,
    updatedAt: ts(o.updatedAt, now),
    schemaVersion: num(o.schemaVersion, EVIDENCE_VISION_SCHEMA_VERSION),
  };
}

export function evidenceVisionObservationSummary(observation = {}) {
  const o = normalizeEvidenceVisionObservation(observation);
  if (o.imageObservation) return o.imageObservation;
  if (o.needsMoreContext) return 'This proof image appears to need more context.';
  return 'A private vision insight for this proof image.';
}

export function evidenceVisionNeedsMoreContext(observation = {}) {
  const o = normalizeEvidenceVisionObservation(observation);
  return o.needsMoreContext || o.taskAlignment === 'needs_caption' || o.taskAlignment === 'needs_better_evidence';
}

export function evidenceVisionSuggestedCaption(observation = {}) {
  return normalizeEvidenceVisionObservation(observation).suggestedCaption;
}

// Safe aggregate/context signals that MAY feed adaptive planning later (8.3).
// No image content, no raw fields — labels/booleans only.
export function evidenceVisionSignalsForAdaptivePlanning(observation = {}) {
  const o = normalizeEvidenceVisionObservation(observation);
  return {
    needsMoreContext: o.needsMoreContext,
    taskAlignment: o.taskAlignment,
    suggestedCaptionAvailable: !!o.suggestedCaption,
    evidenceSignalCount: o.evidenceSignals.length,
    uncertainty: o.uncertainty,
  };
}

// Public-safe projection: never includes raw image URL/storage path/localUri,
// evidence ids, uid, or verification language.
export function evidenceVisionPublicSafeView(observation = {}) {
  const o = normalizeEvidenceVisionObservation(observation);
  return {
    taskTitle: o.taskTitle || undefined,
    dayNumber: o.dayNumber,
    summary: scrubVisionText(o.publicSafeSummary || o.suggestedCaption, 200),
    needsMoreContext: o.needsMoreContext,
    taskAlignment: o.taskAlignment,
  };
}

export default {
  EVIDENCE_VISION_SCHEMA_VERSION,
  EVIDENCE_VISION_SOURCES,
  EVIDENCE_VISION_STATUSES,
  EVIDENCE_VISION_TASK_ALIGNMENTS,
  EVIDENCE_VISION_UNCERTAINTIES,
  scrubVisionText,
  newVisionInsightId,
  normalizeEvidenceVisionRequest,
  normalizeEvidenceVisionObservation,
  evidenceVisionObservationSummary,
  evidenceVisionNeedsMoreContext,
  evidenceVisionSuggestedCaption,
  evidenceVisionSignalsForAdaptivePlanning,
  evidenceVisionPublicSafeView,
};
