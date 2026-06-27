// ── views/evidence-intelligence-panel.js ────────────────────────────────────
// Pure HTML render for the Evidence Intelligence card (Progress / Proof archive /
// Roadmap). Shows coverage, gaps, pending uploads, anchor coverage, strengths and
// recommendations — with the required disclaimer. Never renders private proof
// bodies, raw evidence URLs, storage paths or localUri, and never calls evidence
// "verified".

import { esc } from '../helpers.js';
import { evidenceIntelligenceDisclaimer } from '../evidence-intelligence-policy.js';

const INSIGHT_LABELS = {
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

const RECOMMENDATION_LABELS = {
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

export function evidenceInsightLabel(type) { return INSIGHT_LABELS[type] || 'Evidence insight'; }
export function evidenceRecommendationLabel(type) { return RECOMMENDATION_LABELS[type] || 'Improve your proof'; }

function sourceBadge(source) {
  const label = source === 'ai_assisted' ? 'AI-assisted' : 'From your activity';
  return '<span class="aurora-evidence-source" data-source="' + esc(source || 'deterministic') + '">' + esc(label) + '</span>';
}

// Compact evidence intelligence card. `draft` is a normalized evidence insight
// draft (or null → renders nothing).
export function renderEvidenceIntelligencePanel({ draft = null, pathId = '' } = {}) {
  if (!draft || (!Array.isArray(draft.insights) && !Array.isArray(draft.recommendations))) return '';
  const insights = Array.isArray(draft.insights) ? draft.insights : [];
  const recs = Array.isArray(draft.recommendations) ? draft.recommendations : [];
  if (!insights.length && !recs.length) return '';
  const topInsights = insights.slice(0, 4);
  const topRecs = recs.slice(0, 3);
  return '<section class="aurora-evidence-card" aria-label="Evidence intelligence" data-path-id="' + esc(pathId || draft.pathId || '') + '">'
    + '<header class="aurora-evidence-head">'
    + '<span class="aurora-evidence-kicker">Evidence intelligence</span>'
    + sourceBadge(draft.source)
    + '</header>'
    + '<p class="aurora-evidence-summary">' + esc(draft.summary || '') + '</p>'
    + (topInsights.length
      ? '<ul class="aurora-evidence-insights">'
        + topInsights.map(i => '<li class="aurora-evidence-insight" data-insight-type="' + esc(i.type) + '">'
          + '<span class="aurora-evidence-insight-label">' + esc(evidenceInsightLabel(i.type)) + '</span>'
          + (i.reason ? '<span class="aurora-evidence-insight-why">' + esc(i.reason) + '</span>' : '')
          + '</li>').join('')
        + '</ul>'
      : '')
    + (topRecs.length
      ? '<ul class="aurora-evidence-recs">'
        + topRecs.map(r => '<li class="aurora-evidence-rec" data-rec-type="' + esc(r.type) + '">'
          + '<span class="aurora-evidence-rec-label">' + esc(evidenceRecommendationLabel(r.type)) + '</span>'
          + (r.reason ? '<span class="aurora-evidence-rec-why">' + esc(r.reason) + '</span>' : '')
          + '</li>').join('')
        + '</ul>'
      : '')
    + '<div class="aurora-evidence-actions">'
    + '<button type="button" class="aurora-evidence-review" data-action="review-evidence-insight" data-insight-id="' + esc(draft.id) + '">Review</button>'
    + '<button type="button" class="aurora-evidence-dismiss" data-action="dismiss-evidence-insight" data-insight-id="' + esc(draft.id) + '">Dismiss</button>'
    + '</div>'
    + '<p class="aurora-evidence-disclaimer">' + esc(evidenceIntelligenceDisclaimer()) + '</p>'
    + '</section>';
}

export default { renderEvidenceIntelligencePanel, evidenceInsightLabel, evidenceRecommendationLabel };
