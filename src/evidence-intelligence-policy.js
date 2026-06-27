// ── evidence-intelligence-policy.js ─────────────────────────────────────────
// Safe boundaries for Evidence Intelligence. Pure. Evidence analysis is ADVISORY,
// never verification. Public-safe summaries can never include private proof
// bodies, raw evidence URLs, storage paths, downloadURL, or localUri. Pending/
// failed uploads never count as uploaded evidence.

import {
  EVIDENCE_INSIGHT_TYPES, EVIDENCE_RECOMMENDATION_TYPES, EVIDENCE_INTELLIGENCE_SCHEMA_VERSION,
} from './evidence-intelligence-model.js';

export function canAnalyzeEvidence({ uid, path } = {}) {
  // Any signed-in user may analyze evidence for a path they can access. The
  // server enforces auth + that the data loaded is the caller's own.
  return !!uid && !!(path && (path.id || typeof path === 'string'));
}

// Only insights that are inherently public-safe (no private fields) and explicitly
// reviewed may ever be published. Phase 8.0 never auto-publishes.
export function canPublishEvidenceInsight(insight = {}) {
  const i = insight && typeof insight === 'object' ? insight : {};
  if (i.status !== 'reviewed') return false;
  const safe = sanitizeEvidenceInsight(i);
  // A published insight must carry only a public-safe summary, no recommendations
  // that reference private artifacts, and never a "verified" claim.
  return !!safe.publicSafeSummary && !/verified|certified/i.test(safe.publicSafeSummary);
}

// All evidence insight application/publication requires explicit user review.
export function evidenceInsightRequiresUserReview() {
  return true;
}

const PRIVATE_FIELD_RE = /storagePath|downloadURL|downloadUrl|localUri|fileUri|evidenceUrl|proofBody|proofText|reflection|idToken|password|"?token"?|p256dh/i;

function scrubText(value, max = 300) {
  return String(value == null ? '' : value)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/gs:\/\/\S+/gi, '')
    .replace(/file:\/\/\/\S+/gi, '')
    .replace(/users\/[^\s]*\/proofMedia\/\S+/gi, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '')
    // Never let the word "verified" stand as a claim.
    .replace(/\bverified\b/gi, 'submitted')
    .replace(/\bcertified\b/gi, 'submitted')
    .replace(/\s+/g, ' ').trim().slice(0, max);
}

// Drop unknown/unsafe fields from an insight record; scrub free text. Keeps only
// the structured, public-safe shape.
export function sanitizeEvidenceInsight(insight = {}) {
  const i = insight && typeof insight === 'object' ? insight : {};
  const insights = (Array.isArray(i.insights) ? i.insights : []).map(x => ({
    type: EVIDENCE_INSIGHT_TYPES.includes(x && x.type) ? x.type : 'proof_gap',
    reason: scrubText(x && x.reason, 280),
  })).filter(x => EVIDENCE_INSIGHT_TYPES.includes(x.type));
  const recommendations = (Array.isArray(i.recommendations) ? i.recommendations : []).map(x => ({
    type: EVIDENCE_RECOMMENDATION_TYPES.includes(x && x.type) ? x.type : 'improve_tomorrow_proof_prompt',
    reason: scrubText(x && x.reason, 280),
    source: ['deterministic', 'ai_assisted', 'manual'].includes(x && x.source) ? x.source : 'deterministic',
  })).filter(x => EVIDENCE_RECOMMENDATION_TYPES.includes(x.type));
  return {
    insights,
    recommendations,
    summary: scrubText(i.summary, 200),
    publicSafeSummary: scrubText(i.publicSafeSummary, 200),
    schemaVersion: Number(i.schemaVersion) || EVIDENCE_INTELLIGENCE_SCHEMA_VERSION,
  };
}

// A short, safe label describing public-safety of an evidence artifact.
export function evidencePublicSafetyLabel(evidence = {}) {
  const e = evidence && typeof evidence === 'object' ? evidence : {};
  if (e.visibility === 'private' || e.publicVisible === false) return 'private';
  if (e.publicVisible === true || e.visibility === 'public') return 'public-safe';
  return 'private-by-default';
}

// Whether a value is safe to include in any public-facing output.
export function isPublicSafeValue(value) {
  return !PRIVATE_FIELD_RE.test(JSON.stringify(value == null ? '' : value));
}

export function evidenceIntelligenceDisclaimer() {
  return 'Evidence Intelligence helps you understand your documentation patterns. It does not verify that an activity happened.';
}

export default {
  canAnalyzeEvidence,
  canPublishEvidenceInsight,
  evidenceInsightRequiresUserReview,
  sanitizeEvidenceInsight,
  evidencePublicSafetyLabel,
  isPublicSafeValue,
  evidenceIntelligenceDisclaimer,
};
