// Mobile Evidence Intelligence (pure). The mobile skin displays evidence insight
// DRAFTS produced by the server (deterministic, optionally AI-assisted). It never
// publishes, never claims "verified", and never surfaces private proof. This
// module normalizes a draft for display. No web/DOM imports.

export const MOBILE_EVIDENCE_INSIGHT_LABELS = {
  proof_gap: 'Proof gaps',
  pending_upload: 'Pending uploads',
  failed_upload: 'Failed uploads',
  missing_anchor_proof: 'Anchor proof coverage',
  weak_text_proof: 'Short text proof',
  link_without_context: 'Links need context',
  image_without_caption: 'Images need captions',
  strong_multimodal_proof: 'Strong documentation',
  duplicate_link_pattern: 'Repeated link source',
  duplicate_text_pattern: 'Repeated text proof',
  stale_repeated_proof: 'Repeated proof',
  high_coverage_streak: 'Evidence coverage',
  public_story_ready: 'Public story ready',
  public_story_needs_context: 'Public story needs context',
  private_only_evidence: 'Private evidence',
};

export const MOBILE_EVIDENCE_RECOMMENDATION_LABELS = {
  add_short_caption: 'Add a short caption',
  attach_image_proof: 'Attach image proof',
  resolve_pending_upload: 'Finish pending uploads',
  add_context_to_link: 'Add context to links',
  document_anchor_task_first: 'Document the anchor task first',
  mark_sensitive_proof_private: 'Keep sensitive proof private',
  publish_public_safe_summary: 'Publish a public-safe summary',
  keep_proof_private: 'Your proof stays private',
  improve_tomorrow_proof_prompt: 'Improve tomorrow’s proof',
};

export function evidenceInsightLabel(type) { return MOBILE_EVIDENCE_INSIGHT_LABELS[type] || 'Evidence insight'; }
export function evidenceRecommendationLabel(type) { return MOBILE_EVIDENCE_RECOMMENDATION_LABELS[type] || 'Improve your proof'; }

function str(value, max = 300) { return String(value == null ? '' : value).slice(0, max); }

export function normalizeMobileEvidenceDraft(raw = {}) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const insights = (Array.isArray(d.insights) ? d.insights : []).map(i => ({
    type: str(i && i.type, 60), reason: str(i && i.reason, 280),
  })).filter(i => i.type);
  const recommendations = (Array.isArray(d.recommendations) ? d.recommendations : []).map(r => ({
    type: str(r && r.type, 60), reason: str(r && r.reason, 280),
    source: ['deterministic', 'ai_assisted', 'manual'].includes(r && r.source) ? r.source : 'deterministic',
  })).filter(r => r.type);
  return {
    id: str(d.id, 200),
    pathId: str(d.pathId, 120),
    source: ['deterministic', 'ai_assisted', 'manual'].includes(d.source) ? d.source : 'deterministic',
    status: ['draft', 'reviewed', 'dismissed', 'archived'].includes(d.status) ? d.status : 'draft',
    summary: str(d.summary, 200),
    insights,
    recommendations,
  };
}

export function topMobileEvidenceRecommendations(draft, n = 3) {
  const d = normalizeMobileEvidenceDraft(draft);
  return d.recommendations.slice(0, Math.max(0, n));
}

export function mobileEvidenceSummary(draft) {
  const d = normalizeMobileEvidenceDraft(draft);
  if (d.summary) return d.summary;
  if (!d.insights.length && !d.recommendations.length) return 'No evidence insights yet.';
  return `${d.insights.length} evidence insight${d.insights.length === 1 ? '' : 's'} for your proof.`;
}

export const MOBILE_EVIDENCE_DISCLAIMER = 'Evidence Intelligence helps you understand your documentation patterns. It does not verify that an activity happened.';

export default {
  MOBILE_EVIDENCE_INSIGHT_LABELS,
  MOBILE_EVIDENCE_RECOMMENDATION_LABELS,
  MOBILE_EVIDENCE_DISCLAIMER,
  evidenceInsightLabel,
  evidenceRecommendationLabel,
  normalizeMobileEvidenceDraft,
  topMobileEvidenceRecommendations,
  mobileEvidenceSummary,
};
