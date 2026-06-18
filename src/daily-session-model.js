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
  return {
    id,
    required:isRequiredTask(task),
    optional:isOptionalTask(task),
    needsEvidence:taskNeedsEvidence(task),
    completed,
    skipped,
    pending,
    resolved:completed || skipped,
    evidenceCount:taskEvidenceSubmissions(evidenceSubmissions, id).length,
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
    percent,
  };
}

export function canCompleteDailySession(tasks = [], dayLog = {}, evidenceSubmissions = []){
  const progress = sessionProgress(tasks, dayLog, evidenceSubmissions);
  if(!tasks.length) return false;
  if(progress.requiredTotal === 0) return true;
  return progress.requiredResolved === progress.requiredTotal;
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
} = {}){
  const progress = sessionProgress(tasks, dayLog, evidenceSubmissions);
  const ordered = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  const currentTaskId = resumeTaskId(tasks, dayLog, evidenceSubmissions);
  let phase = normalizeSessionPhase(dayLog?.sessionViewState, 'agenda');
  if(dayLog?.status === 'completed') phase = 'complete';
  else if(!tasks.length) phase = 'error';
  else if(phase === 'task-evidence' && !currentTaskId) phase = 'completion-check';
  else if((phase === 'task' || phase === 'partial-summary') && !currentTaskId){
    phase = canCompleteDailySession(tasks, dayLog, evidenceSubmissions) ? 'completion-check' : 'partial-summary';
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
