// ── evidence-vision-policy.js ───────────────────────────────────────────────
// Safe boundaries for Gemini Vision evidence understanding. Pure. Vision analysis
// requires explicit user action + consent, is private by default, never
// publishes, never changes proof visibility, and requires the Phase 8.1 review
// workflow before any sharing.

import {
  EVIDENCE_VISION_TASK_ALIGNMENTS, EVIDENCE_VISION_UNCERTAINTIES,
  EVIDENCE_VISION_SCHEMA_VERSION, scrubVisionText, evidenceVisionSignalsForAdaptivePlanning,
} from './evidence-vision-model.js';

const IMAGE_MIME_RE = /^image\/(jpeg|png|webp)$/i;

// Analysis is allowed only for a signed-in user on image proof they own.
export function canAnalyzeEvidenceImage({ user, evidence, path } = {}) {
  const uid = user && (user.uid || user.id);
  if (!uid) return false;
  const e = evidence && typeof evidence === 'object' ? evidence : {};
  const isImage = IMAGE_MIME_RE.test(String(e.fileType || e.mimeType || ''))
    || e.kind === 'image' || e.proofType === 'image';
  if (!isImage) return false;
  return !!(path && (path.id || typeof path === 'string'));
}

// Image proof always requires explicit consent before analysis.
export function evidenceVisionRequiresConsent() {
  return true;
}

export function evidenceVisionConsentCopy() {
  return 'Analyze this proof image with AI? Vision insights are private by default and help describe what the image appears to show. They do not verify that the activity happened.';
}

export function evidenceVisionDisclaimer() {
  return 'Vision insights describe what an image appears to show. They do not verify that an activity happened.';
}

// All vision observations require review before they can be shared.
export function visionObservationRequiresReview() {
  return true;
}

// Vision may feed adaptive planning only as safe aggregate/context signals.
export function visionObservationCanFeedAdaptivePlanning(observation = {}) {
  const signals = evidenceVisionSignalsForAdaptivePlanning(observation);
  // Never pass raw fields; only the small label/boolean set is allowed.
  const allowed = ['needsMoreContext', 'taskAlignment', 'suggestedCaptionAvailable', 'evidenceSignalCount', 'uncertainty'];
  return Object.keys(signals).every(k => allowed.includes(k));
}

// Drop unsafe/unknown fields from an observation; reframe any verification
// language; never keep raw image URLs/storage paths/localUri, identity claims or
// sensitive-trait claims.
export function sanitizeVisionObservation(observation = {}) {
  const o = observation && typeof observation === 'object' ? observation : {};
  return {
    imageObservation: scrubVisionText(o.imageObservation, 600),
    evidenceSignals: (Array.isArray(o.evidenceSignals) ? o.evidenceSignals : []).map(s => scrubVisionText(s, 60)).filter(Boolean).slice(0, 12),
    needsMoreContext: o.needsMoreContext === true,
    suggestedCaption: scrubVisionText(o.suggestedCaption, 160),
    taskAlignment: EVIDENCE_VISION_TASK_ALIGNMENTS.includes(o.taskAlignment) ? o.taskAlignment : 'unknown',
    uncertainty: EVIDENCE_VISION_UNCERTAINTIES.includes(o.uncertainty) ? o.uncertainty : 'unknown',
    publicSafeSummary: scrubVisionText(o.publicSafeSummary, 200),
    schemaVersion: Number(o.schemaVersion) || EVIDENCE_VISION_SCHEMA_VERSION,
  };
}

export default {
  canAnalyzeEvidenceImage,
  evidenceVisionRequiresConsent,
  evidenceVisionConsentCopy,
  evidenceVisionDisclaimer,
  visionObservationRequiresReview,
  visionObservationCanFeedAdaptivePlanning,
  sanitizeVisionObservation,
};
