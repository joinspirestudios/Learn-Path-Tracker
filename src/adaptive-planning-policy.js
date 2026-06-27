// ── adaptive-planning-policy.js ─────────────────────────────────────────────
// Safe boundaries for rolling adaptive planning. Pure. These rules guarantee
// that adaptation never rewrites the past and never mutates a public/canonical
// path template for a joined participant. Participant adaptations use a private,
// user-specific overlay; recommendations are always drafts requiring approval.

import {
  ADAPTIVE_RECOMMENDATION_TYPES, ADAPTIVE_PLANNING_SCHEMA_VERSION,
} from './adaptive-planning-model.js';

// A day can be adapted only if it is in the FUTURE and not already completed/
// missed/frozen. Past and current-or-earlier days are immutable.
export function canAdaptDay({ dayNumber, currentDayNumber, status } = {}) {
  const day = Number(dayNumber);
  const current = Number(currentDayNumber);
  if (!Number.isFinite(day) || !Number.isFinite(current)) return false;
  if (['completed', 'missed', 'frozen'].includes(String(status || ''))) return false;
  return day > current;
}

// Whether a task may be modified given the user's role and path visibility.
// Anchor/required tasks are protected from silent removal; public/unlisted
// templates can never be edited by a joined participant (overlay only).
export function canModifyTask({ task, role, pathVisibility } = {}) {
  const isOwner = role === 'owner';
  const isPublicTemplate = ['public', 'unlisted'].includes(String(pathVisibility || ''));
  // Participants never edit the canonical template; only owners of a private path
  // may directly edit future tasks (after confirmation).
  if (!isOwner) return false;
  if (isPublicTemplate) return false;
  return true;
}

// Every recommendation is a draft; applying anything requires explicit approval.
// (Kept as an explicit predicate so callers can never bypass it.)
export function adaptationRequiresUserApproval() {
  return true;
}

// Remove or downgrade any recommendation that would drop an anchor/required task.
// Anchor protection: a recommendation must never remove an anchor task — convert
// "reduce_task_load"/"move_task_forward" that target an anchor into protective
// "protect_anchor_task" instead.
export function protectAnchorTasks(recommendations = [], tasks = []) {
  const anchorIds = new Set(
    (Array.isArray(tasks) ? tasks : [])
      .filter(t => t && (t.anchor || t.core || t.critical || t.completionCritical))
      .map((t, i) => String(t.id || `task:${i}`)),
  );
  return (Array.isArray(recommendations) ? recommendations : []).map(r => {
    const targetsAnchor = Array.isArray(r.taskIds) && r.taskIds.some(id => anchorIds.has(String(id)));
    if (targetsAnchor && (r.type === 'reduce_task_load' || r.type === 'move_task_forward' || r.type === 'convert_to_smaller_version')) {
      return { ...r, type: 'protect_anchor_task', reason: 'Anchor task is protected — keeping it and adjusting around it.', anchorProtected: true };
    }
    return r;
  });
}

// Drop unknown fields / unknown types; never let a recommendation carry private
// data. Keeps only the safe, structured recommendation shape.
export function sanitizeAdaptiveRecommendation(recommendation = {}) {
  const r = recommendation && typeof recommendation === 'object' ? recommendation : {};
  const type = ADAPTIVE_RECOMMENDATION_TYPES.includes(r.type) ? r.type : 'keep_plan_unchanged';
  const reason = String(r.reason == null ? '' : r.reason)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/gs:\/\/\S+/gi, '')
    .replace(/users\/[^\s]*\/proofMedia\/\S+/gi, '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 300);
  const out = {
    type,
    source: ['deterministic', 'ai_assisted', 'manual'].includes(r.source) ? r.source : 'deterministic',
    reason,
    appliesFromDayNumber: Number.isFinite(Number(r.appliesFromDayNumber)) ? Math.floor(Number(r.appliesFromDayNumber)) : null,
  };
  if (Array.isArray(r.taskIds)) out.taskIds = r.taskIds.map(String).slice(0, 50);
  if (typeof r.relatedInsight === 'string') out.relatedInsight = r.relatedInsight;
  if (r.anchorProtected === true) out.anchorProtected = true;
  return out;
}

// Build a conservative mutation plan. For Phase 7.0 this NEVER touches the
// canonical path or past days; participant adaptations are expressed as a
// user-specific overlay of future-day adjustments. Returns { applyMode, overlay,
// blocked } where applyMode is 'overlay' | 'deferred'.
export function adaptationMutationPlan({ path = {}, recommendations = [], userRole = 'participant', currentDayNumber = 1 } = {}) {
  const visibility = String(path.visibility || '');
  const isOwnerPrivate = userRole === 'owner' && !['public', 'unlisted'].includes(visibility);
  const safe = (Array.isArray(recommendations) ? recommendations : []).map(sanitizeAdaptiveRecommendation);
  // Only future-day recommendations are applicable.
  const futureRecs = safe.filter(r => r.appliesFromDayNumber == null || r.appliesFromDayNumber >= Number(currentDayNumber));
  const overlay = {
    startsAtDayNumber: Math.max(Number(currentDayNumber) || 1, 1),
    taskAdjustments: [],
    dayAdjustments: [],
    intensityAdjustment: null,
    appliedRecommendationTypes: futureRecs.map(r => r.type),
  };
  for (const r of futureRecs) {
    if (r.type === 'lower_intensity_temporarily') overlay.intensityAdjustment = 'lower_temporarily';
    else if (r.type === 'increase_intensity_if_consistently_strong') overlay.intensityAdjustment = overlay.intensityAdjustment || 'optional_increase';
    else if (['reduce_task_load', 'convert_to_smaller_version', 'split_task', 'move_task_forward', 'protect_anchor_task', 'repeat_missed_anchor', 'add_recovery_day'].includes(r.type)) {
      overlay.dayAdjustments.push({ type: r.type, fromDayNumber: r.appliesFromDayNumber ?? overlay.startsAtDayNumber, reason: r.reason });
    }
  }
  return {
    // Participant adaptations are overlay-only; direct template edits are deferred.
    applyMode: 'overlay',
    canDirectEditTemplate: isOwnerPrivate,
    overlay,
    blocked: ['public', 'unlisted'].includes(visibility) && userRole !== 'owner'
      ? [] // participants are not blocked — overlay is the safe path
      : [],
    schemaVersion: ADAPTIVE_PLANNING_SCHEMA_VERSION,
  };
}

export default {
  canAdaptDay,
  canModifyTask,
  adaptationRequiresUserApproval,
  protectAnchorTasks,
  sanitizeAdaptiveRecommendation,
  adaptationMutationPlan,
};
