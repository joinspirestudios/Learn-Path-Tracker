// ── views/adaptive-planning-panel.js ────────────────────────────────────────
// Pure HTML render for the adaptive planning card (Today / Roadmap / Progress).
// Renders supportive, explainable recommendation summaries only — never private
// proof bodies, raw evidence URLs, or storage paths. Never auto-applies.

import { esc } from '../helpers.js';
import { scoreRecommendationPriority, adaptivePlanSummary } from '../adaptive-planning-model.js';

const RECOMMENDATION_LABELS = {
  reduce_task_load: 'Reduce task load',
  split_task: 'Split this task',
  move_task_forward: 'Move this task forward',
  convert_to_smaller_version: 'Try a lighter version',
  protect_anchor_task: 'Keep the anchor task',
  add_recovery_day: 'Add a recovery day',
  repeat_missed_anchor: 'Recover missed work',
  lower_intensity_temporarily: 'Lower intensity for now',
  increase_intensity_if_consistently_strong: 'Keep the plan (or step up)',
  resolve_pending_uploads: 'Finish your pending uploads',
  keep_plan_unchanged: 'Keep the plan unchanged',
};

export function recommendationLabel(type) {
  return RECOMMENDATION_LABELS[type] || 'Adjust upcoming days';
}

function sourceBadge(source) {
  const label = source === 'ai_assisted' ? 'AI-assisted' : (source === 'manual' ? 'Manual' : 'Suggested');
  return '<span class="aurora-adapt-source" data-source="' + esc(source || 'deterministic') + '">' + esc(label) + '</span>';
}

// Compact card for surfaces like Today. `draft` is a normalized adaptation draft
// (or null). Shows a summary + top recommendations + review/dismiss actions.
export function renderAdaptivePlanningPanel({ draft = null, pathId = '' } = {}) {
  if (!draft || !Array.isArray(draft.recommendations) || !draft.recommendations.length) return '';
  const recs = [...draft.recommendations].sort((a, b) => scoreRecommendationPriority(b) - scoreRecommendationPriority(a));
  const onlyKeep = recs.length === 1 && recs[0].type === 'keep_plan_unchanged';
  const top = recs.slice(0, 3);
  return '<section class="aurora-adapt-card" aria-label="Adaptive planning" data-path-id="' + esc(pathId || draft.pathId || '') + '">'
    + '<header class="aurora-adapt-head">'
    + '<span class="aurora-adapt-kicker">Adjust upcoming days</span>'
    + sourceBadge(draft.source)
    + '</header>'
    + '<p class="aurora-adapt-summary">' + esc(draft.summary || adaptivePlanSummary(recs)) + '</p>'
    + '<ul class="aurora-adapt-list">'
    + top.map(r => '<li class="aurora-adapt-item" data-rec-type="' + esc(r.type) + '">'
      + '<span class="aurora-adapt-rec-label">' + esc(recommendationLabel(r.type)) + '</span>'
      + (r.reason ? '<span class="aurora-adapt-rec-why">' + esc(r.reason) + '</span>' : '')
      + '</li>').join('')
    + '</ul>'
    + '<div class="aurora-adapt-actions">'
    + (onlyKeep ? '' : '<button type="button" class="aurora-adapt-review" data-action="review-adaptation" data-draft-id="' + esc(draft.id) + '">Review draft</button>')
    + '<button type="button" class="aurora-adapt-dismiss" data-action="dismiss-adaptation" data-draft-id="' + esc(draft.id) + '">Dismiss</button>'
    + '</div>'
    + '</section>';
}

export default { renderAdaptivePlanningPanel, recommendationLabel };
