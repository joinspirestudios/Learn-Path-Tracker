// ── adaptive-planning-context.js ────────────────────────────────────────────
// Assembles an adaptive-planning context from the web app's local/cloud state
// (store-shaped data) into the pure model's expected input. No DOM/Firebase; it
// just maps existing structures and reads only structured progress metadata.

import { buildAdaptivePlanningContext, buildAdaptiveInsights, buildAdaptiveRecommendations } from './adaptive-planning-model.js';

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Map an enrollment's dayLogs object (keyed by day number) into model day logs.
// Reads only structured fields — never reflections/evidence.
export function dayLogsFromEnrollment(enrollment = {}) {
  const dayLogs = enrollment && enrollment.dayLogs && typeof enrollment.dayLogs === 'object' ? enrollment.dayLogs : {};
  const out = {};
  for (const [day, log] of Object.entries(dayLogs)) {
    const l = log && typeof log === 'object' ? log : {};
    out[day] = {
      dayNumber: num(day, null),
      completionScore: num(l.completionScore, null),
      completionTier: typeof l.completionTier === 'string' ? l.completionTier : null,
      requiredCompleted: num(l.requiredCompleted, null),
      requiredTotal: num(l.requiredTotal, null),
      optionalCompleted: num(l.optionalCompleted, null),
      optionalTotal: num(l.optionalTotal, null),
      anchorSatisfied: l.anchorSatisfied == null ? null : !!l.anchorSatisfied,
      evidenceRequired: num(l.evidenceRequired, null),
      proofSubmittedCount: num(l.evidenceCompleted, null),
      optionalSkippedTaskIds: Array.isArray(l.optionalSkippedTaskIds) ? l.optionalSkippedTaskIds : [],
      completedTaskIds: Array.isArray(l.completedTaskIds) ? l.completedTaskIds : [],
      frozenAt: l.frozenAt || null,
      missed: l.missed === true,
    };
  }
  return out;
}

// Build a full context for a path the user is doing. Accepts the path object,
// the user's enrollment, and a few runtime signals.
export function buildContextForPath({
  path = {}, enrollment = {}, currentDayNumber = null, intensity = null,
  pendingProofCount = 0, currentStreak = 0, streakFreezeAvailable = false,
  isOwner = false,
} = {}) {
  const en = enrollment && typeof enrollment === 'object' ? enrollment : {};
  return buildAdaptivePlanningContext({
    path,
    pathId: path && path.id,
    dayLogs: dayLogsFromEnrollment(en),
    currentDayNumber: num(currentDayNumber, null) ?? num(en.currentDay, null),
    intensity: intensity || en.intensity || (path && path.intensity) || null,
    pendingProofCount,
    currentStreak: num(currentStreak, 0) || num(en.currentStreak, 0) || 0,
    streakFreezeAvailable: streakFreezeAvailable || (num(en.freezeCount, 0) || 0) > 0,
    isOwner,
  });
}

// One-shot: context → insights → recommendations (deterministic).
export function buildDeterministicPlan(input = {}) {
  const context = input.context || buildContextForPath(input);
  const insights = buildAdaptiveInsights(context);
  const recommendations = buildAdaptiveRecommendations(context, { insights });
  return { context, insights, recommendations };
}

export default {
  dayLogsFromEnrollment,
  buildContextForPath,
  buildDeterministicPlan,
};
