// ── views/evidence-insight-review.js ────────────────────────────────────────
// Pure HTML render for the Evidence Intelligence review surface. Shows each
// insight + the reason, the recommendations, the public-safe summary, the
// required disclaimer, and explicit review/dismiss actions. No private proof,
// raw URLs, or storage paths; never asserts an activity happened.

import { esc } from '../helpers.js';
import { evidenceIntelligenceDisclaimer } from '../evidence-intelligence-policy.js';
import { evidenceInsightLabel, evidenceRecommendationLabel } from './evidence-intelligence-panel.js';

function insightRow(i) {
  return '<li class="aurora-evidence-review-insight" data-insight-type="' + esc(i.type) + '">'
    + '<span class="aurora-evidence-insight-label">' + esc(evidenceInsightLabel(i.type)) + '</span>'
    + (i.reason ? '<p class="aurora-evidence-insight-why">' + esc(i.reason) + '</p>' : '')
    + '</li>';
}

function recRow(r) {
  const tag = r.source === 'ai_assisted'
    ? '<span class="aurora-evidence-ai-tag">AI-assisted</span>'
    : '<span class="aurora-evidence-det-tag">From your activity</span>';
  return '<li class="aurora-evidence-review-rec" data-rec-type="' + esc(r.type) + '">'
    + '<div class="aurora-evidence-review-rec-head"><span class="aurora-evidence-rec-label">' + esc(evidenceRecommendationLabel(r.type)) + '</span>' + tag + '</div>'
    + (r.reason ? '<p class="aurora-evidence-rec-why">' + esc(r.reason) + '</p>' : '')
    + '</li>';
}

export function renderEvidenceInsightReview({ draft = null } = {}) {
  if (!draft) return '<section class="aurora-evidence-review" aria-label="Evidence insight review"><p class="aurora-evidence-empty">No evidence insight to review.</p></section>';
  const insights = Array.isArray(draft.insights) ? draft.insights : [];
  const recs = Array.isArray(draft.recommendations) ? draft.recommendations : [];
  return '<section class="aurora-evidence-review" aria-label="Evidence insight review" data-insight-id="' + esc(draft.id) + '">'
    + '<header class="aurora-evidence-review-header"><h2>Understand your evidence</h2>'
    + '<p class="aurora-evidence-review-sub">' + esc(draft.summary || '') + '</p></header>'
    + (insights.length
      ? '<div class="aurora-evidence-why"><h3>What your evidence shows</h3><ul class="aurora-evidence-review-insights">' + insights.map(insightRow).join('') + '</ul></div>'
      : '')
    + (recs.length
      ? '<div class="aurora-evidence-improve"><h3>Make your next proof stronger</h3><ul class="aurora-evidence-review-recs">' + recs.map(recRow).join('') + '</ul></div>'
      : '')
    + (draft.publicSafeSummary
      ? '<div class="aurora-evidence-public"><h3>Public-safe summary</h3><p class="aurora-evidence-public-summary">' + esc(draft.publicSafeSummary) + '</p></div>'
      : '')
    + '<div class="aurora-evidence-review-actions">'
    + '<button type="button" class="aurora-evidence-reviewed" data-action="mark-evidence-insight-reviewed" data-insight-id="' + esc(draft.id) + '">Mark reviewed</button>'
    + '<button type="button" class="aurora-evidence-dismiss" data-action="dismiss-evidence-insight" data-insight-id="' + esc(draft.id) + '">Dismiss</button>'
    + '</div>'
    + '<p class="aurora-evidence-disclaimer">' + esc(evidenceIntelligenceDisclaimer()) + '</p>'
    + '</section>';
}

export default { renderEvidenceInsightReview };
