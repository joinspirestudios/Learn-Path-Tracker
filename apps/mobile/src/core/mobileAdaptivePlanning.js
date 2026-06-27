// Mobile adaptive planning (pure). The mobile skin displays adaptation DRAFTS
// produced by the server (deterministic, optionally AI-assisted). It never
// applies changes and never rewrites the past. This module normalizes a draft
// for display and produces supportive labels/summaries. No web/DOM imports.

export const MOBILE_ADAPTIVE_RECOMMENDATION_LABELS = {
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

const PRIORITY = {
  resolve_pending_uploads: 100, protect_anchor_task: 90, reduce_task_load: 85,
  add_recovery_day: 80, repeat_missed_anchor: 78, convert_to_smaller_version: 70,
  split_task: 65, lower_intensity_temporarily: 60, move_task_forward: 55,
  increase_intensity_if_consistently_strong: 40, keep_plan_unchanged: 10,
};

export function recommendationLabel(type) {
  return MOBILE_ADAPTIVE_RECOMMENDATION_LABELS[type] || 'Adjust upcoming days';
}

export function recommendationPriority(rec) {
  return PRIORITY[rec && rec.type] || 50;
}

function str(value, max = 300) {
  return String(value == null ? '' : value).slice(0, max);
}

// Normalize a server draft for safe display (drops anything unexpected; never
// surfaces private fields — server already sanitizes).
export function normalizeMobileDraft(raw = {}) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const recommendations = (Array.isArray(d.recommendations) ? d.recommendations : []).map(r => ({
    type: str(r && r.type, 60),
    source: ['deterministic', 'ai_assisted', 'manual'].includes(r && r.source) ? r.source : 'deterministic',
    reason: str(r && r.reason, 300),
    appliesFromDayNumber: Number.isFinite(Number(r && r.appliesFromDayNumber)) ? Math.floor(Number(r.appliesFromDayNumber)) : null,
  })).filter(r => r.type);
  return {
    id: str(d.id, 200),
    pathId: str(d.pathId, 120),
    source: ['deterministic', 'ai_assisted', 'manual'].includes(d.source) ? d.source : 'deterministic',
    status: ['draft', 'reviewed', 'applied', 'dismissed', 'expired'].includes(d.status) ? d.status : 'draft',
    summary: str(d.summary, 200),
    insights: (Array.isArray(d.insights) ? d.insights : []).map(i => ({ type: str(i && i.type, 60), reason: str(i && i.reason, 300) })).filter(i => i.type),
    recommendations,
  };
}

export function topMobileRecommendations(draft, n = 3) {
  const d = normalizeMobileDraft(draft);
  return [...d.recommendations].sort((a, b) => recommendationPriority(b) - recommendationPriority(a)).slice(0, Math.max(0, n));
}

export function mobileAdaptiveSummary(draft) {
  const d = normalizeMobileDraft(draft);
  if (!d.recommendations.length) return 'No adjustments suggested.';
  if (d.summary) return d.summary;
  const top = d.recommendations.filter(r => r.type !== 'keep_plan_unchanged');
  return top.length ? `${top.length} suggested adjustment${top.length > 1 ? 's' : ''} for your upcoming days.` : 'Your plan looks steady — no changes suggested.';
}

export default {
  MOBILE_ADAPTIVE_RECOMMENDATION_LABELS,
  recommendationLabel,
  recommendationPriority,
  normalizeMobileDraft,
  topMobileRecommendations,
  mobileAdaptiveSummary,
};
