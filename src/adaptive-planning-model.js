// ── adaptive-planning-model.js ──────────────────────────────────────────────
// Pure rolling-adaptive-planning model. No DOM, no Firebase, no network, no AI.
// It observes a user's recent path activity, detects patterns from REAL data
// only, and produces deterministic, explainable recommendations for UPCOMING
// days. It never rewrites the past and never invents data.
//
// Language is supportive, never shaming. Recommendations always carry a `reason`
// and `source: 'deterministic'`.

export const ADAPTIVE_PLANNING_SCHEMA_VERSION = 1;

export const ADAPTIVE_INSIGHT_TYPES = [
  'missed_day_pattern',
  'low_completion_pattern',
  'anchor_task_failure',
  'proof_gap',
  'overload_risk',
  'streak_risk',
  'repeated_skipped_task',
  'strong_consistency',
  'perfect_day_pattern',
  'recovery_opportunity',
];

export const ADAPTIVE_RECOMMENDATION_TYPES = [
  'reduce_task_load',
  'split_task',
  'move_task_forward',
  'convert_to_smaller_version',
  'protect_anchor_task',
  'add_recovery_day',
  'repeat_missed_anchor',
  'lower_intensity_temporarily',
  'increase_intensity_if_consistently_strong',
  'resolve_pending_uploads',
  'keep_plan_unchanged',
];

// Tunable, well-named thresholds (no magic numbers scattered in logic).
export const ADAPTIVE_THRESHOLDS = Object.freeze({
  recentWindow: 5,
  lowCompletionPercent: 65,
  lowCompletionMinDays: 3,
  anchorMissMinCount: 2,
  proofGapMinGapPercent: 30,
  overloadRequiredTasks: 6,
  strongCompletionPercent: 90,
  strongMinDays: 3,
});

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function arr(value) {
  return Array.isArray(value) ? value : [];
}

function clampPercent(value) {
  const n = num(value, null);
  if (n == null) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

// Normalize a single day log (web or mobile shape) into a safe day record.
// Only structured progress metadata is read — never proof bodies, reflections,
// evidence URLs or storage paths.
export function normalizeDayRecord(raw = {}, dayNumberHint = null) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const dayNumber = num(source.dayNumber ?? dayNumberHint, null);
  const requiredTotal = num(source.requiredTotal, null);
  const requiredCompleted = num(source.requiredCompleted, null);
  const optionalTotal = num(source.optionalTotal, null);
  const optionalCompleted = num(source.optionalCompleted, null);
  const completionScore = clampPercent(source.completionScore);
  const proofSubmittedCount = num(source.proofSubmittedCount, null)
    ?? (Array.isArray(source.proof) ? source.proof.length : null);
  const skippedTaskIds = arr(source.optionalSkippedTaskIds).map(String);
  const frozen = source.frozenAt != null || source.frozen === true;
  const missed = source.missed === true || source.status === 'missed';
  // A day is "active" only if there is real evidence of engagement.
  const hasActivity = completionScore != null
    || (requiredCompleted != null && requiredCompleted > 0)
    || arr(source.completedTaskIds).length > 0
    || (proofSubmittedCount != null && proofSubmittedCount > 0)
    || missed || frozen;
  return {
    dayNumber,
    completionScore,
    completionTier: typeof source.completionTier === 'string' ? source.completionTier : null,
    requiredTotal,
    requiredCompleted,
    optionalTotal,
    optionalCompleted,
    anchorSatisfied: source.anchorSatisfied == null ? null : !!source.anchorSatisfied,
    proofSubmittedCount,
    proofRequiredCount: num(source.evidenceRequired, null),
    skippedTaskIds,
    frozen,
    missed,
    active: hasActivity,
  };
}

function dayLogsToRecords(dayLogs) {
  if (Array.isArray(dayLogs)) {
    return dayLogs.map((d, i) => normalizeDayRecord(d, i + 1));
  }
  if (dayLogs && typeof dayLogs === 'object') {
    return Object.entries(dayLogs).map(([key, value]) => normalizeDayRecord(value, num(key, null)));
  }
  return [];
}

function normalizeTasks(path) {
  const tasks = [];
  const weeks = arr(path && path.weeks);
  for (const week of weeks) {
    for (const task of arr(week && week.tasks)) {
      tasks.push(task);
    }
  }
  // Some paths carry a flat tasks array.
  for (const task of arr(path && path.tasks)) tasks.push(task);
  return tasks;
}

function taskIsOptional(task) {
  return task?.required === false || task?.optional === true;
}
function taskIsAnchor(task) {
  return !!(task?.anchor || task?.core || task?.critical || task?.completionCritical);
}

// Build a normalized, value-free context for the analyzers.
export function buildAdaptivePlanningContext(input = {}) {
  const path = input.path && typeof input.path === 'object' ? input.path : {};
  const records = dayLogsToRecords(input.dayLogs || input.mobileDayLogs || [])
    .filter(r => r.dayNumber != null)
    .sort((a, b) => a.dayNumber - b.dayNumber);
  const activeRecords = records.filter(r => r.active);
  const tasks = normalizeTasks(path);
  const currentDayNumber = num(input.currentDayNumber, null)
    ?? (records.length ? Math.max(...records.map(r => r.dayNumber)) + 1 : 1);
  return {
    pathId: typeof path.id === 'string' ? path.id : (typeof input.pathId === 'string' ? input.pathId : ''),
    pathTitle: typeof path.title === 'string' ? path.title : '',
    pathCategory: typeof path.category === 'string' ? path.category : '',
    pathVisibility: typeof path.visibility === 'string' ? path.visibility : '',
    isOwner: input.isOwner === true,
    intensity: ['soft', 'balanced', 'intensive'].includes(input.intensity) ? input.intensity : null,
    currentDayNumber,
    records,
    activeRecords,
    recentRecords: activeRecords.slice(-ADAPTIVE_THRESHOLDS.recentWindow),
    taskCount: tasks.length,
    requiredTaskCount: tasks.filter(t => !taskIsOptional(t)).length,
    anchorTaskCount: tasks.filter(taskIsAnchor).length,
    pendingProofCount: Math.max(0, num(input.pendingProofCount, 0) || 0),
    streakFreezeAvailable: input.streakFreezeAvailable === true,
    currentStreak: Math.max(0, num(input.currentStreak, 0) || 0),
  };
}

function insight(type, detail) {
  return { type, ...detail };
}

// ── Analyzers (each returns an insight or null; only from real data) ──

export function analyzeCompletionPattern(context = {}) {
  const recent = arr(context.recentRecords).filter(r => r.completionScore != null);
  if (recent.length < ADAPTIVE_THRESHOLDS.lowCompletionMinDays) return null;
  const low = recent.filter(r => r.completionScore < ADAPTIVE_THRESHOLDS.lowCompletionPercent);
  if (low.length >= ADAPTIVE_THRESHOLDS.lowCompletionMinDays) {
    const avg = Math.round(recent.reduce((s, r) => s + r.completionScore, 0) / recent.length);
    return insight('low_completion_pattern', {
      days: low.map(r => r.dayNumber),
      averageCompletion: avg,
      reason: `Your last ${recent.length} active days averaged ${avg}% completion, with ${low.length} below ${ADAPTIVE_THRESHOLDS.lowCompletionPercent}%.`,
    });
  }
  return null;
}

export function analyzeMissedDayPattern(context = {}) {
  const missed = arr(context.activeRecords).filter(r => r.missed);
  if (!missed.length) return null;
  const recentMissed = missed.filter(r => arr(context.recentRecords).some(rr => rr.dayNumber === r.dayNumber));
  if (!recentMissed.length) return null;
  return insight('missed_day_pattern', {
    days: recentMissed.map(r => r.dayNumber),
    reason: `You missed ${recentMissed.length} recent day${recentMissed.length > 1 ? 's' : ''}.`,
  });
}

export function analyzeProofPattern(context = {}) {
  const recent = arr(context.recentRecords).filter(r => r.proofRequiredCount != null && r.proofRequiredCount > 0);
  if (recent.length < ADAPTIVE_THRESHOLDS.lowCompletionMinDays) return null;
  // Days where proof was required but fewer proofs were submitted than required.
  const gaps = recent.filter(r => (r.proofSubmittedCount ?? 0) < r.proofRequiredCount);
  if (gaps.length >= ADAPTIVE_THRESHOLDS.lowCompletionMinDays) {
    return insight('proof_gap', {
      days: gaps.map(r => r.dayNumber),
      reason: `Proof-required tasks went unproven on ${gaps.length} recent days.`,
    });
  }
  return null;
}

export function analyzeAnchorTaskPattern(context = {}) {
  if (!context.anchorTaskCount) return null;
  const recent = arr(context.recentRecords).filter(r => r.anchorSatisfied != null);
  const misses = recent.filter(r => r.anchorSatisfied === false);
  if (misses.length >= ADAPTIVE_THRESHOLDS.anchorMissMinCount) {
    return insight('anchor_task_failure', {
      days: misses.map(r => r.dayNumber),
      reason: `Your anchor task slipped on ${misses.length} recent days.`,
    });
  }
  return null;
}

export function analyzeStreakRisk(context = {}) {
  // Only flag risk from REAL data: an active streak + a recent missed day or a
  // current pending-proof block that risks an incomplete day.
  if (!context.currentStreak) return null;
  const lastActive = arr(context.activeRecords).slice(-1)[0];
  const missedRecently = arr(context.recentRecords).some(r => r.missed);
  if (missedRecently || (lastActive && lastActive.completionScore != null && lastActive.completionScore < ADAPTIVE_THRESHOLDS.lowCompletionPercent)) {
    return insight('streak_risk', {
      currentStreak: context.currentStreak,
      freezeAvailable: !!context.streakFreezeAvailable,
      reason: `You have a ${context.currentStreak}-day streak that is at risk.`,
    });
  }
  return null;
}

export function analyzeTaskOverload(context = {}) {
  if (!context.requiredTaskCount || context.requiredTaskCount < ADAPTIVE_THRESHOLDS.overloadRequiredTasks) return null;
  const recent = arr(context.recentRecords).filter(r => r.completionScore != null);
  const struggling = recent.filter(r => r.completionScore < ADAPTIVE_THRESHOLDS.lowCompletionPercent).length;
  if (struggling >= 2) {
    return insight('overload_risk', {
      requiredTaskCount: context.requiredTaskCount,
      reason: `Each day asks for ${context.requiredTaskCount} required tasks, and recent days were hard to finish.`,
    });
  }
  return null;
}

export function analyzeRepeatedSkippedTask(context = {}) {
  const counts = new Map();
  for (const r of arr(context.recentRecords)) {
    for (const id of arr(r.skippedTaskIds)) counts.set(id, (counts.get(id) || 0) + 1);
  }
  const repeated = [...counts.entries()].filter(([, c]) => c >= ADAPTIVE_THRESHOLDS.anchorMissMinCount).map(([id]) => id);
  if (!repeated.length) return null;
  return insight('repeated_skipped_task', {
    taskIds: repeated,
    reason: `Some optional tasks were skipped repeatedly in recent days.`,
  });
}

export function analyzeStrongConsistency(context = {}) {
  const recent = arr(context.recentRecords).filter(r => r.completionScore != null);
  if (recent.length < ADAPTIVE_THRESHOLDS.strongMinDays) return null;
  const strong = recent.filter(r => r.completionScore >= ADAPTIVE_THRESHOLDS.strongCompletionPercent);
  if (strong.length >= ADAPTIVE_THRESHOLDS.strongMinDays && strong.length === recent.length) {
    const perfect = recent.every(r => r.completionScore >= 100);
    return insight(perfect ? 'perfect_day_pattern' : 'strong_consistency', {
      days: strong.map(r => r.dayNumber),
      reason: perfect
        ? `You completed ${recent.length} recent days at 100%.`
        : `You finished ${strong.length} recent days at ${ADAPTIVE_THRESHOLDS.strongCompletionPercent}%+ completion.`,
    });
  }
  return null;
}

export function analyzeRecoveryOpportunity(context = {}) {
  const lastActive = arr(context.activeRecords).slice(-1)[0];
  if (lastActive && lastActive.missed && context.streakFreezeAvailable) {
    return insight('recovery_opportunity', {
      day: lastActive.dayNumber,
      reason: `You missed day ${lastActive.dayNumber} but a streak freeze is available.`,
    });
  }
  return null;
}

// Aggregate all insights (real data only).
export function buildAdaptiveInsights(context = {}) {
  return [
    analyzeMissedDayPattern(context),
    analyzeCompletionPattern(context),
    analyzeProofPattern(context),
    analyzeAnchorTaskPattern(context),
    analyzeStreakRisk(context),
    analyzeTaskOverload(context),
    analyzeRepeatedSkippedTask(context),
    analyzeStrongConsistency(context),
    analyzeRecoveryOpportunity(context),
  ].filter(Boolean);
}

function rec(type, detail) {
  return {
    type,
    source: 'deterministic',
    appliesFromDayNumber: detail.appliesFromDayNumber ?? null,
    ...detail,
  };
}

// Deterministic recommendations derived from insights. Always explainable.
export function buildAdaptiveRecommendations(context = {}, options = {}) {
  const insights = arr(options.insights).length ? options.insights : buildAdaptiveInsights(context);
  const from = num(context.currentDayNumber, 1);
  const out = [];
  const has = (t) => insights.some(i => i.type === t);
  const get = (t) => insights.find(i => i.type === t);

  if (context.pendingProofCount > 0) {
    out.push(rec('resolve_pending_uploads', {
      appliesFromDayNumber: from,
      reason: `You have ${context.pendingProofCount} proof upload${context.pendingProofCount > 1 ? 's' : ''} pending. Resolve them before adding more work.`,
    }));
  }
  if (has('overload_risk')) {
    out.push(rec('reduce_task_load', { appliesFromDayNumber: from, reason: get('overload_risk').reason, relatedInsight: 'overload_risk' }));
  }
  if (has('low_completion_pattern')) {
    out.push(rec('convert_to_smaller_version', { appliesFromDayNumber: from, reason: 'Heavier tasks have been harder to finish lately. Try a lighter version for the next few days.', relatedInsight: 'low_completion_pattern' }));
    out.push(rec('lower_intensity_temporarily', { appliesFromDayNumber: from, reason: 'A temporary lighter intensity can make tomorrow easier to complete.', relatedInsight: 'low_completion_pattern' }));
  }
  if (has('anchor_task_failure')) {
    out.push(rec('protect_anchor_task', { appliesFromDayNumber: from, reason: 'Your anchor task keeps slipping. Move it earlier in the day.', relatedInsight: 'anchor_task_failure' }));
    out.push(rec('split_task', { appliesFromDayNumber: from, reason: 'Splitting the anchor task into smaller steps can help it land.', relatedInsight: 'anchor_task_failure' }));
  }
  if (has('proof_gap')) {
    out.push(rec('convert_to_smaller_version', { appliesFromDayNumber: from, reason: 'Proof-required tasks are slipping. A simpler proof option can help.', relatedInsight: 'proof_gap' }));
  }
  if (has('repeated_skipped_task')) {
    out.push(rec('move_task_forward', { appliesFromDayNumber: from, reason: 'Some optional tasks are skipped repeatedly. Move or simplify them.', relatedInsight: 'repeated_skipped_task' }));
  }
  if (has('recovery_opportunity')) {
    out.push(rec('add_recovery_day', { appliesFromDayNumber: from, reason: get('recovery_opportunity').reason, relatedInsight: 'recovery_opportunity' }));
  } else if (has('missed_day_pattern')) {
    out.push(rec('repeat_missed_anchor', { appliesFromDayNumber: from, reason: 'You missed recent work. Repeat the key task to recover.', relatedInsight: 'missed_day_pattern' }));
  }
  if (has('streak_risk')) {
    out.push(rec('protect_anchor_task', { appliesFromDayNumber: from, reason: get('streak_risk').reason + ' Keep the anchor task to protect it.', relatedInsight: 'streak_risk' }));
  }
  if (has('perfect_day_pattern') || has('strong_consistency')) {
    out.push(rec('increase_intensity_if_consistently_strong', { appliesFromDayNumber: from, reason: (get('perfect_day_pattern') || get('strong_consistency')).reason + ' You could keep the plan or try a small step up.', relatedInsight: 'strong_consistency' }));
  }
  if (!out.length) {
    out.push(rec('keep_plan_unchanged', { appliesFromDayNumber: from, reason: 'Your recent activity looks steady. Keep the plan unchanged for now.' }));
  }
  // De-duplicate by type, keeping the first (highest-context) reason.
  const seen = new Set();
  return out.filter(r => (seen.has(r.type) ? false : seen.add(r.type)));
}

const PRIORITY_BY_TYPE = {
  resolve_pending_uploads: 100,
  protect_anchor_task: 90,
  reduce_task_load: 85,
  add_recovery_day: 80,
  repeat_missed_anchor: 78,
  convert_to_smaller_version: 70,
  split_task: 65,
  lower_intensity_temporarily: 60,
  move_task_forward: 55,
  increase_intensity_if_consistently_strong: 40,
  keep_plan_unchanged: 10,
};

export function scoreRecommendationPriority(recommendation = {}) {
  return PRIORITY_BY_TYPE[recommendation.type] || 50;
}

export function groupRecommendationsByDay(recommendations = []) {
  const byDay = {};
  for (const r of arr(recommendations)) {
    const day = r.appliesFromDayNumber == null ? 'next' : String(r.appliesFromDayNumber);
    (byDay[day] = byDay[day] || []).push(r);
  }
  return byDay;
}

export function adaptivePlanSummary(recommendations = []) {
  const list = arr(recommendations);
  if (!list.length) return 'No adjustments suggested.';
  if (list.length === 1 && list[0].type === 'keep_plan_unchanged') {
    return 'Your plan looks steady — no changes suggested.';
  }
  const sorted = [...list].sort((a, b) => scoreRecommendationPriority(b) - scoreRecommendationPriority(a));
  const top = sorted.filter(r => r.type !== 'keep_plan_unchanged').slice(0, 3);
  return `${top.length} suggested adjustment${top.length > 1 ? 's' : ''} for your upcoming days.`;
}

export default {
  ADAPTIVE_PLANNING_SCHEMA_VERSION,
  ADAPTIVE_INSIGHT_TYPES,
  ADAPTIVE_RECOMMENDATION_TYPES,
  ADAPTIVE_THRESHOLDS,
  normalizeDayRecord,
  buildAdaptivePlanningContext,
  analyzeCompletionPattern,
  analyzeMissedDayPattern,
  analyzeProofPattern,
  analyzeAnchorTaskPattern,
  analyzeStreakRisk,
  analyzeTaskOverload,
  analyzeRepeatedSkippedTask,
  analyzeStrongConsistency,
  analyzeRecoveryOpportunity,
  buildAdaptiveInsights,
  buildAdaptiveRecommendations,
  scoreRecommendationPriority,
  groupRecommendationsByDay,
  adaptivePlanSummary,
};
