import {
  completionTierForScore, policyForIntensity,
} from './intensity-policy.js';

const SESSION_PHASES = new Set([
  'agenda',
  'evidence-preparation',
  'task',
  'task-evidence',
  'partial-summary',
  'completion-check',
  'complete',
  'error',
]);

export function taskIdFor(task, index = 0){
  return String(task?.id || `task:${index}`);
}

export function taskTitle(task){
  return String(task?.title || task?.text || 'Task');
}

export function isOptionalTask(task){
  return task?.required === false || task?.optional === true;
}

export function isRequiredTask(task){
  return !isOptionalTask(task);
}

export function taskNeedsEvidence(task){
  return !!task?.evidenceRequired;
}

export function isAnchorTask(task){
  return !!(task?.anchor || task?.core || task?.critical || task?.completionCritical);
}

function asArray(value){
  return Array.isArray(value) ? value.map(String) : [];
}

function asSet(value){
  return new Set(asArray(value));
}

export function normalizeSessionPhase(value, fallback = 'agenda'){
  return SESSION_PHASES.has(value) ? value : fallback;
}

export function orderedSessionTasks(tasks = []){
  return [...tasks].map((task, index) => ({ task, index, id:taskIdFor(task, index) }))
    .sort((a, b) => {
      const byRequired = Number(isOptionalTask(a.task)) - Number(isOptionalTask(b.task));
      if(byRequired) return byRequired;
      const byOrder = Number(a.task?.order ?? a.index) - Number(b.task?.order ?? b.index);
      return byOrder || a.index - b.index;
    });
}

export function taskEvidenceSubmissions(evidenceSubmissions = [], taskId){
  return (Array.isArray(evidenceSubmissions) ? evidenceSubmissions : [])
    .filter(item => String(item?.taskId || '') === String(taskId));
}

export function taskIsCompleted(task, dayLog = {}, evidenceSubmissions = [], index = 0){
  const id = taskIdFor(task, index);
  const completed = asSet(dayLog.completedTaskIds);
  const verified = asSet(dayLog.verifiedTaskIds);
  if(taskNeedsEvidence(task)){
    return verified.has(id);
  }
  return completed.has(id);
}

export function taskIsOptionalSkipped(task, dayLog = {}, index = 0){
  return isOptionalTask(task) && asSet(dayLog.optionalSkippedTaskIds).has(taskIdFor(task, index));
}

export function taskIsPending(task, dayLog = {}, index = 0){
  return asSet(dayLog.pendingTaskIds).has(taskIdFor(task, index));
}

export function taskIsResolved(task, dayLog = {}, evidenceSubmissions = [], index = 0){
  if(taskIsCompleted(task, dayLog, evidenceSubmissions, index)) return true;
  return taskIsOptionalSkipped(task, dayLog, index);
}

export function taskState(task, dayLog = {}, evidenceSubmissions = [], index = 0){
  const id = taskIdFor(task, index);
  const completed = taskIsCompleted(task, dayLog, evidenceSubmissions, index);
  const skipped = taskIsOptionalSkipped(task, dayLog, index);
  const pending = taskIsPending(task, dayLog, index);
  const evidenceCount = taskEvidenceSubmissions(evidenceSubmissions, id).length;
  return {
    id,
    required:isRequiredTask(task),
    optional:isOptionalTask(task),
    needsEvidence:taskNeedsEvidence(task),
    anchor:isAnchorTask(task),
    completed,
    skipped,
    pending,
    resolved:completed || skipped,
    evidenceCount,
  };
}

export function sessionTaskStates(tasks = [], dayLog = {}, evidenceSubmissions = []){
  return orderedSessionTasks(tasks).map(item => ({
    ...item,
    state:taskState(item.task, dayLog, evidenceSubmissions, item.index),
  }));
}

export function sessionProgress(tasks = [], dayLog = {}, evidenceSubmissions = []){
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  const score = dailyCompletionScore(tasks, dayLog, evidenceSubmissions);
  const required = states.filter(item => item.state.required);
  const optional = states.filter(item => item.state.optional);
  const requiredResolved = required.filter(item => item.state.resolved).length;
  const optionalCompleted = optional.filter(item => item.state.completed).length;
  const optionalSkipped = optional.filter(item => item.state.skipped).length;
  const requiredTotal = required.length;
  const optionalTotal = optional.length;
  const percent = requiredTotal
    ? Math.round((requiredResolved / requiredTotal) * 100)
    : (states.length ? 100 : 0);
  return {
    ...score,
    requiredTotal,
    requiredResolved,
    optionalTotal,
    optionalCompleted,
    optionalSkipped,
    optionalResolved:optionalCompleted + optionalSkipped,
    total:states.length,
    completed:states.filter(item => item.state.completed).length,
    pendingRequired:required.filter(item => !item.state.resolved).length,
    pendingOptional:optional.filter(item => !item.state.resolved).length,
    evidenceRequired:states.filter(item => item.state.needsEvidence).length,
    percent:score.totalWeight ? score.score : percent,
    requiredPercent:percent,
  };
}

export function dailyCompletionScore(tasks = [], dayLog = {}, evidenceSubmissions = [], options = {}){
  const policy = policyForIntensity(options.intensity || dayLog?.intensity);
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  let completedWeight = 0;
  let totalWeight = 0;
  let requiredCompleted = 0;
  let requiredTotal = 0;
  let optionalCompleted = 0;
  let optionalTotal = 0;
  let evidenceCompleted = 0;
  let evidenceRequired = 0;
  let anchorTotal = 0;
  let anchorCompleted = 0;
  states.forEach(item => {
    const weight = item.state.optional ? 0.5 : 1;
    totalWeight += weight;
    if(item.state.required) requiredTotal += 1;
    if(item.state.optional) optionalTotal += 1;
    if(item.state.needsEvidence) evidenceRequired += 1;
    if(isAnchorTask(item.task)){
      anchorTotal += 1;
      if(item.state.completed) anchorCompleted += 1;
    }
    if(!item.state.completed) return;
    completedWeight += weight;
    if(item.state.required) requiredCompleted += 1;
    if(item.state.optional) optionalCompleted += 1;
    if(item.state.needsEvidence) evidenceCompleted += 1;
  });
  const score = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  const anchorSatisfied = anchorTotal === 0 || anchorCompleted === anchorTotal;
  const baseTier = completionTierForScore(score, policy);
  const thresholdMet = score >= policy.passThreshold;
  const tier = thresholdMet && !anchorSatisfied ? 'blocked_anchor' : baseTier;
  return {
    score,
    percent:score,
    completedWeight,
    totalWeight,
    passThreshold:policy.passThreshold,
    strongThreshold:policy.strongThreshold,
    perfectThreshold:policy.perfectThreshold,
    participationThreshold:policy.participationThreshold,
    tier,
    canComplete:states.length > 0 && thresholdMet && anchorSatisfied,
    canRecordAttempt:score > 0,
    anchorSatisfied,
    anchorTotal,
    anchorCompleted,
    requiredCompleted,
    requiredTotal,
    optionalCompleted,
    optionalTotal,
    evidenceCompleted,
    evidenceRequired,
    intensity:policy.id,
  };
}

export function completionScoreMetadata(score = {}){
  return {
    completionScore:score.score,
    completionTier:score.tier,
    passThreshold:score.passThreshold,
    intensity:score.intensity,
    anchorSatisfied:score.anchorSatisfied,
    completedWeight:score.completedWeight,
    totalWeight:score.totalWeight,
    requiredCompleted:score.requiredCompleted,
    requiredTotal:score.requiredTotal,
    optionalCompleted:score.optionalCompleted,
    optionalTotal:score.optionalTotal,
    evidenceCompleted:score.evidenceCompleted,
    evidenceRequired:score.evidenceRequired,
  };
}

export function canCompleteDailySession(tasks = [], dayLog = {}, evidenceSubmissions = [], options = {}){
  return dailyCompletionScore(tasks, dayLog, evidenceSubmissions, options).canComplete;
}

export function firstUnresolvedTaskId(tasks = [], dayLog = {}, evidenceSubmissions = [], optionalOnly = false){
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  const unresolved = states.find(item => !item.state.resolved && (optionalOnly ? item.state.optional : item.state.required));
  return unresolved?.id || null;
}

export function nextUnresolvedTaskId(tasks = [], dayLog = {}, evidenceSubmissions = [], afterTaskId = null){
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions).filter(item => !item.state.resolved);
  if(!states.length) return null;
  const pendingRequired = states.find(item => item.state.required);
  const pendingOptional = states.find(item => item.state.optional);
  if(!afterTaskId) return (pendingRequired || pendingOptional)?.id || null;
  const currentIndex = states.findIndex(item => item.id === afterTaskId);
  const after = currentIndex >= 0 ? states.slice(currentIndex + 1) : states;
  return (after.find(item => item.state.required) || after.find(item => item.state.optional) || pendingRequired || pendingOptional)?.id || null;
}

export function resumeTaskId(tasks = [], dayLog = {}, evidenceSubmissions = []){
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  const lastActive = String(dayLog?.lastActiveTaskId || '');
  if(lastActive){
    const active = states.find(item => item.id === lastActive && !item.state.resolved);
    if(active) return active.id;
  }
  return firstUnresolvedTaskId(tasks, dayLog, evidenceSubmissions)
    || firstUnresolvedTaskId(tasks, dayLog, evidenceSubmissions, true);
}

export function pendingTaskIds(tasks = [], dayLog = {}, evidenceSubmissions = []){
  return sessionTaskStates(tasks, dayLog, evidenceSubmissions)
    .filter(item => item.state.pending && !item.state.resolved)
    .map(item => item.id);
}

export function agendaSummary(tasks = [], dayLog = {}, evidenceSubmissions = []){
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  const progress = sessionProgress(tasks, dayLog, evidenceSubmissions);
  const estimatedMinutes = states.reduce((sum, item) => {
    const minutes = Number(item.task?.estimatedMinutes ?? item.task?.durationMinutes ?? item.task?.minutes ?? 0);
    return sum + (Number.isFinite(minutes) && minutes > 0 ? minutes : 0);
  }, 0);
  return {
    ...progress,
    estimatedMinutes,
    requiredPreview:states.filter(item => item.state.required).slice(0, 6).map(item => taskTitle(item.task)),
    optionalPreview:states.filter(item => item.state.optional).slice(0, 4).map(item => taskTitle(item.task)),
    hasMoreRequired:states.filter(item => item.state.required).length > 6,
    hasMoreOptional:states.filter(item => item.state.optional).length > 4,
  };
}

export function evidenceSummary(tasks = []){
  const evidenceTasks = orderedSessionTasks(tasks)
    .filter(item => taskNeedsEvidence(item.task))
    .map(item => ({
      id:item.id,
      title:taskTitle(item.task),
      type:taskEvidenceLabel(item.task),
    }));
  return {
    count:evidenceTasks.length,
    tasks:evidenceTasks,
  };
}

export function taskEvidenceLabel(task){
  if(task?.evidenceType) return String(task.evidenceType);
  if(task?.evidenceRequired) return 'URL or supported file proof';
  return 'No proof required';
}

export function effortLabel(minutes){
  const n = Number(minutes || 0);
  if(!Number.isFinite(n) || n <= 0) return '';
  const hours = Math.floor(n / 60);
  const mins = n % 60;
  if(hours && mins) return `${hours} hr ${mins} min`;
  if(hours) return `${hours} hr`;
  return `${mins} min`;
}

export function encouragementForProgress(percent){
  const p = Number(percent || 0);
  if(p <= 0) return 'Ready when you are.';
  if(p < 40) return 'Good start. Keep going.';
  if(p < 70) return 'You are making progress.';
  if(p < 100) return 'You are nearly there.';
  return 'Today is fully documented.';
}

export function completionTierCopy(score = {}){
  const tier = score.tier || 'not_started';
  if(tier === 'blocked_anchor') return 'One core task is still unfinished. Complete it to pass the day.';
  if(tier === 'perfect') return 'Perfect day. Every commitment is documented.';
  if(tier === 'strong') return 'Strong day. You went beyond the minimum today.';
  if(tier === 'passed') return 'Day passed. You did enough meaningful work to keep this journey moving.';
  if(tier === 'attempted') return 'You showed up today. This is recorded, but you need a little more progress to complete the day.';
  if(tier === 'in_progress') return 'Good start. Keep going until the day has enough meaningful work.';
  return 'Ready when you are.';
}

export function focusModeDefaults(overrides = {}){
  return {
    pathId:'',
    dayNumber:null,
    taskIndex:0,
    mode:'focus',
    feedback:null,
    lastActionAt:0,
    ...overrides,
  };
}

export function recommendedFocusTaskIndex(tasks = [], dayLog = {}, evidenceSubmissions = []){
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  if(!states.length) return 0;
  const priorities = [
    item => item.state.anchor && !item.state.resolved,
    item => item.state.required && !item.state.resolved,
    item => item.state.needsEvidence && !item.state.completed,
    item => item.state.optional && !item.state.resolved,
  ];
  for(const predicate of priorities){
    const index = states.findIndex(predicate);
    if(index >= 0) return index;
  }
  return states.length;
}

export function normalizeDailyFocusState(value = {}, context = {}){
  const taskCount = sessionTaskStates(context.tasks || [], context.dayLog || {}, context.evidenceSubmissions || []).length;
  const sameTarget = value?.pathId === context.pathId && Number(value?.dayNumber) === Number(context.dayNumber);
  const recommended = recommendedFocusTaskIndex(context.tasks || [], context.dayLog || {}, context.evidenceSubmissions || []);
  const rawIndex = sameTarget ? Number(value?.taskIndex) : recommended;
  const maxIndex = Math.max(0, taskCount);
  const taskIndex = Number.isFinite(rawIndex)
    ? Math.min(maxIndex, Math.max(0, Math.floor(rawIndex)))
    : recommended;
  return focusModeDefaults({
    pathId:String(context.pathId || value?.pathId || ''),
    dayNumber:context.dayNumber == null ? (value?.dayNumber ?? null) : Number(context.dayNumber),
    taskIndex,
    mode:value?.mode === 'overview' ? 'overview' : 'focus',
    feedback:typeof value?.feedback === 'string' ? value.feedback.slice(0, 240) : null,
    lastActionAt:Number.isFinite(Number(value?.lastActionAt)) ? Number(value.lastActionAt) : 0,
  });
}

export function currentFocusTask(tasks = [], dayLog = {}, evidenceSubmissions = [], focusState = {}){
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  if(!states.length) return null;
  const index = Math.min(states.length - 1, Math.max(0, Math.floor(Number(focusState?.taskIndex || 0))));
  return { ...states[index], focusIndex:index, total:states.length };
}

export function taskFocusStatus(item = {}, score = {}){
  const state = item.state || {};
  if(state.skipped) return 'skipped optional';
  if(state.completed && state.needsEvidence) return 'proof saved';
  if(state.completed) return 'completed';
  if(state.needsEvidence) return state.evidenceCount ? 'proof needed' : 'proof needed';
  if(state.pending) return 'in progress';
  if(state.anchor && score.tier === 'blocked_anchor') return 'blocked';
  return 'not started';
}

export function focusFeedbackForAction(action, score = {}, item = {}){
  if(score.tier === 'blocked_anchor') return 'Your score is high enough, but a core task is still unfinished.';
  if(action === 'proof-needed') return 'This task needs proof before it can count.';
  if(action === 'proof-saved') return 'Proof saved. This task now counts.';
  if(action === 'skip-optional') return 'Optional task skipped. It will not add to your score.';
  if(action === 'not-done') return 'Saved for later. This task is still waiting for meaningful work.';
  if(score.canComplete) return 'You have done enough meaningful work to complete today.';
  if(action === 'done') return 'Task counted toward today\'s score.';
  if(item?.state?.needsEvidence && !item?.state?.completed) return 'This task needs proof before it can count.';
  return encouragementForProgress(score.score);
}

export function saveStateLabel(saveState){
  return ({
    idle:'',
    saving:'Saving...',
    saved:'Saved',
    local:'Saved locally - waiting to sync',
    error:'Could not sync',
  })[saveState] || '';
}

export function deriveDailySessionState({
  pathId,
  dayNumber,
  tasks = [],
  dayLog = {},
  evidenceSubmissions = [],
  saveState = 'idle',
  error = '',
  intensity = 'balanced',
} = {}){
  const progress = dailyCompletionScore(tasks, dayLog, evidenceSubmissions, { intensity });
  const ordered = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  const currentTaskId = resumeTaskId(tasks, dayLog, evidenceSubmissions);
  let phase = normalizeSessionPhase(dayLog?.sessionViewState, 'agenda');
  if(dayLog?.status === 'completed') phase = 'complete';
  else if(!tasks.length) phase = 'error';
  else if(phase === 'task-evidence' && !currentTaskId) phase = 'completion-check';
  else if((phase === 'task' || phase === 'partial-summary') && !currentTaskId){
    phase = canCompleteDailySession(tasks, dayLog, evidenceSubmissions, { intensity }) ? 'completion-check' : 'partial-summary';
  }
  return {
    pathId,
    dayNumber:Number(dayNumber || dayLog?.dayNumber || 1),
    phase,
    orderedTaskIds:ordered.map(item => item.id),
    currentTaskId,
    lastActiveTaskId:dayLog?.lastActiveTaskId || null,
    pendingTaskIds:pendingTaskIds(tasks, dayLog, evidenceSubmissions),
    completedTaskIds:asArray(dayLog.completedTaskIds),
    optionalSkippedTaskIds:asArray(dayLog.optionalSkippedTaskIds),
    sessionStartedAt:dayLog?.sessionStartedAt || null,
    lastUpdatedAt:dayLog?.sessionLastActiveAt || dayLog?.updatedAt || null,
    progress,
    saveState,
    error,
  };
}
