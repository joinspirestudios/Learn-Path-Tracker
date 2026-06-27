// ── views/adaptive-planning-review.js ───────────────────────────────────────
// Pure HTML render for the adaptive planning review/approval surface. Shows each
// recommendation with the reason it was suggested, distinguishes deterministic
// vs AI-assisted, and requires an EXPLICIT apply click. No private data shown;
// no auto-apply.

import { esc } from '../helpers.js';
import { scoreRecommendationPriority } from '../adaptive-planning-model.js';
import { recommendationLabel } from './adaptive-planning-panel.js';

function insightRow(i) {
  return '<li class="aurora-adapt-insight" data-insight-type="' + esc(i.type) + '">' + esc(i.reason || i.type) + '</li>';
}

function reviewRow(r) {
  const aiTag = r.source === 'ai_assisted'
    ? '<span class="aurora-adapt-ai-tag">AI-assisted</span>'
    : '<span class="aurora-adapt-det-tag">Suggested from your activity</span>';
  const day = r.appliesFromDayNumber != null ? ' <span class="aurora-adapt-day">from day ' + esc(String(r.appliesFromDayNumber)) + '</span>' : '';
  return '<li class="aurora-adapt-review-item" data-rec-type="' + esc(r.type) + '">'
    + '<div class="aurora-adapt-review-head"><span class="aurora-adapt-rec-label">' + esc(recommendationLabel(r.type)) + '</span>' + aiTag + day + '</div>'
    + (r.reason ? '<p class="aurora-adapt-rec-why">' + esc(r.reason) + '</p>' : '')
    + '</li>';
}

// Full review panel for a draft. Apply is gated behind an explicit button and
// data-action; nothing is applied automatically.
export function renderAdaptivePlanningReview({ draft = null } = {}) {
  if (!draft) return '<section class="aurora-adapt-review" aria-label="Adaptive planning review"><p class="aurora-adapt-empty">No adaptation draft to review.</p></section>';
  const recs = [...(draft.recommendations || [])].sort((a, b) => scoreRecommendationPriority(b) - scoreRecommendationPriority(a));
  const onlyKeep = recs.length === 1 && recs[0].type === 'keep_plan_unchanged';
  const insights = Array.isArray(draft.insights) ? draft.insights : [];
  return '<section class="aurora-adapt-review" aria-label="Adaptive planning review" data-draft-id="' + esc(draft.id) + '">'
    + '<header class="aurora-adapt-review-header"><h2>Review suggested adjustments</h2>'
    + '<p class="aurora-adapt-review-sub">' + esc(draft.summary || '') + ' Nothing changes until you apply it.</p></header>'
    + (insights.length
      ? '<div class="aurora-adapt-why"><h3>Why this was suggested</h3><ul class="aurora-adapt-insights">' + insights.map(insightRow).join('') + '</ul></div>'
      : '')
    + '<ul class="aurora-adapt-review-list">' + recs.map(reviewRow).join('') + '</ul>'
    + '<div class="aurora-adapt-review-actions">'
    + (onlyKeep ? '' : '<button type="button" class="aurora-adapt-apply" data-action="apply-adaptation" data-draft-id="' + esc(draft.id) + '">Apply changes to upcoming days</button>')
    + '<button type="button" class="aurora-adapt-dismiss" data-action="dismiss-adaptation" data-draft-id="' + esc(draft.id) + '">Dismiss</button>'
    + '</div>'
    + '<p class="aurora-adapt-note">Applying affects only your upcoming days. Your completed and missed days are never changed.</p>'
    + '</section>';
}

export default { renderAdaptivePlanningReview };
