// ── evidence-insight-quality.js ─────────────────────────────────────────────
// Pure helpers that rank Evidence Intelligence insights/recommendations by how
// useful and actionable they are, assign a non-shaming severity, and group them
// for display. It scores documentation usefulness only — never the user; missing
// proof is never called "failure"; users are never ranked.

const SEVERITY_BY_INSIGHT = {
  failed_upload: 'needs_attention',
  pending_upload: 'warning',
  proof_gap: 'warning',
  missing_anchor_proof: 'warning',
  public_story_needs_context: 'suggestion',
  image_without_caption: 'suggestion',
  link_without_context: 'suggestion',
  weak_text_proof: 'suggestion',
  duplicate_link_pattern: 'suggestion',
  duplicate_text_pattern: 'suggestion',
  stale_repeated_proof: 'suggestion',
  private_only_evidence: 'info',
  high_coverage_streak: 'info',
  strong_multimodal_proof: 'info',
  public_story_ready: 'info',
};

const SEVERITY_WEIGHT = { needs_attention: 100, warning: 70, suggestion: 40, info: 10 };

const DISPLAY_GROUP_BY_INSIGHT = {
  high_coverage_streak: 'Coverage',
  proof_gap: 'Coverage',
  missing_anchor_proof: 'Anchor proof',
  pending_upload: 'Pending uploads',
  failed_upload: 'Pending uploads',
  weak_text_proof: 'Weak context',
  link_without_context: 'Weak context',
  image_without_caption: 'Weak context',
  public_story_ready: 'Public story',
  public_story_needs_context: 'Public story',
  strong_multimodal_proof: 'Consistency',
  duplicate_link_pattern: 'Consistency',
  duplicate_text_pattern: 'Consistency',
  stale_repeated_proof: 'Consistency',
  private_only_evidence: 'Privacy',
};

const RECOMMENDATION_WEIGHT = {
  resolve_pending_upload: 100,
  document_anchor_task_first: 90,
  attach_image_proof: 80,
  add_short_caption: 70,
  add_context_to_link: 65,
  improve_tomorrow_proof_prompt: 50,
  publish_public_safe_summary: 45,
  mark_sensitive_proof_private: 60,
  keep_proof_private: 30,
};

export function evidenceInsightSeverity(insight = {}) {
  return SEVERITY_BY_INSIGHT[insight && insight.type] || 'info';
}

export function evidenceInsightDisplayGroup(insight = {}) {
  return DISPLAY_GROUP_BY_INSIGHT[insight && insight.type] || 'Coverage';
}

// Higher = more important to act on now. Never a user-facing "score".
export function evidenceInsightPriority(insight = {}) {
  return SEVERITY_WEIGHT[evidenceInsightSeverity(insight)] || 10;
}

// A 0–100 usefulness signal for ordering only (never shown as a user score).
export function scoreEvidenceInsightUsefulness(insight = {}) {
  const base = evidenceInsightPriority(insight);
  const hasReason = insight && typeof insight.reason === 'string' && insight.reason.length > 0 ? 5 : 0;
  return Math.min(100, base + hasReason);
}

export function rankEvidenceRecommendations(recommendations = []) {
  const list = Array.isArray(recommendations) ? recommendations.slice() : [];
  return list.sort((a, b) => {
    const wa = RECOMMENDATION_WEIGHT[a && a.type] || 50;
    const wb = RECOMMENDATION_WEIGHT[b && b.type] || 50;
    return wb - wa;
  });
}

export function evidenceInsightHasActionableRecommendation(insight = {}, recommendations = []) {
  const list = Array.isArray(recommendations) ? recommendations : [];
  const t = insight && insight.type;
  const map = {
    pending_upload: 'resolve_pending_upload',
    failed_upload: 'resolve_pending_upload',
    missing_anchor_proof: 'document_anchor_task_first',
    proof_gap: 'attach_image_proof',
    image_without_caption: 'add_short_caption',
    link_without_context: 'add_context_to_link',
    public_story_needs_context: 'add_short_caption',
    public_story_ready: 'publish_public_safe_summary',
  };
  const wanted = map[t];
  return wanted ? list.some(r => r && r.type === wanted) : list.length > 0;
}

// Group insights into the display buckets, each sorted by priority desc.
export function groupEvidenceInsights(insights = []) {
  const groups = {};
  for (const i of Array.isArray(insights) ? insights : []) {
    const g = evidenceInsightDisplayGroup(i);
    (groups[g] = groups[g] || []).push(i);
  }
  for (const g of Object.keys(groups)) {
    groups[g].sort((a, b) => evidenceInsightPriority(b) - evidenceInsightPriority(a));
  }
  return groups;
}

export default {
  evidenceInsightSeverity,
  evidenceInsightDisplayGroup,
  evidenceInsightPriority,
  scoreEvidenceInsightUsefulness,
  rankEvidenceRecommendations,
  evidenceInsightHasActionableRecommendation,
  groupEvidenceInsights,
};
