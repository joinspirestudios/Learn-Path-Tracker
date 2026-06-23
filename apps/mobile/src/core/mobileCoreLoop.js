// Mobile core-loop model — pure JavaScript.
//
// Drives the local Today -> Daily Focus -> Completion Result flow with no React,
// no React Native, no Firebase, no API calls, no environment reads, and no side
// effects. All updates are immutable: input state is never mutated in place.
//
// Local-only: there is no backend sync here. Proof/reflection text is stored in
// memory only and is never logged or sent anywhere in Phase 6.11.

import {
  MOBILE_SESSION_STATUS,
  localDemoPath,
  localDemoTasks,
  createInitialTaskState,
} from './mobileSessionState.js';
import { computeMobileScore, mobileCompletionTier } from './mobileScoring.js';
import { isValidProofUrl } from './mobileProofMappers.js';

function cloneTaskState(taskState) {
  const next = {};
  for (const [id, st] of Object.entries(taskState)) {
    next[id] = { ...st };
  }
  return next;
}

function cloneState(state) {
  return {
    ...state,
    path: { ...state.path },
    tasks: state.tasks.map(t => ({ ...t })),
    session: {
      ...state.session,
      taskState: cloneTaskState(state.session.taskState),
    },
  };
}

function indexOfTask(state, taskId) {
  return state.tasks.findIndex(t => t.id === taskId);
}

export function createInitialMobileLoopState(options = {}) {
  const path = options.path || localDemoPath();
  const tasks = options.tasks || localDemoTasks();
  return {
    path,
    tasks,
    session: {
      status: MOBILE_SESSION_STATUS.NOT_STARTED,
      startedAt: null,
      finishedAt: null,
      currentTaskIndex: 0,
      taskState: createInitialTaskState(tasks),
    },
  };
}

export function getTodaySummary(state) {
  const score = computeMobileScore(state.tasks, state.session.taskState);
  const proofNeeded = state.tasks.filter(t => {
    const st = state.session.taskState[t.id] || {};
    return t.requiresProof && !st.done;
  }).length;
  return {
    pathTitle: state.path.title,
    dayNumber: state.path.dayNumber,
    local: state.path.local === true,
    status: state.session.status,
    totalTasks: state.tasks.length,
    completedTasks: score.completed,
    proofNeeded,
    proofSubmitted: score.proofSubmitted,
  };
}

// Deterministic CTA decision for the Today screen, derived from session status.
//   not_started -> Start today
//   in_progress -> Continue day
//   finished    -> View result
export function todayCta(state) {
  const status = state.session.status;
  if (status === MOBILE_SESSION_STATUS.FINISHED) {
    return { label: 'View result', action: 'result' };
  }
  if (status === MOBILE_SESSION_STATUS.IN_PROGRESS) {
    return { label: 'Continue day', action: 'continue' };
  }
  return { label: 'Start today', action: 'start' };
}

export function startTodaySession(state, now = Date.now()) {
  if (state.session.status === MOBILE_SESSION_STATUS.FINISHED) return state;
  const next = cloneState(state);
  next.session.status = MOBILE_SESSION_STATUS.IN_PROGRESS;
  next.session.startedAt = state.session.startedAt || now;
  next.session.currentTaskIndex = state.session.currentTaskIndex || 0;
  return next;
}

export function startTask(state, taskId) {
  const idx = indexOfTask(state, taskId);
  if (idx < 0) return state;
  const next = cloneState(state);
  next.session.currentTaskIndex = idx;
  return next;
}

export function getCurrentTask(state) {
  const idx = Math.min(
    Math.max(0, state.session.currentTaskIndex),
    Math.max(0, state.tasks.length - 1),
  );
  const task = state.tasks[idx] || null;
  if (!task) return null;
  return {
    ...task,
    index: idx,
    total: state.tasks.length,
    position: idx + 1,
    state: state.session.taskState[task.id] || { done: false, proofText: '', reflection: '' },
  };
}

export function taskRequiresProofText(state, taskId) {
  const task = state.tasks[indexOfTask(state, taskId)];
  return !!(task && task.requiresProof);
}

export function addTextProof(state, taskId, proofText) {
  const idx = indexOfTask(state, taskId);
  if (idx < 0) return state;
  const next = cloneState(state);
  const id = state.tasks[idx].id;
  next.session.taskState[id] = {
    ...next.session.taskState[id],
    proofText: String(proofText == null ? '' : proofText),
  };
  return next;
}

export function addLinkProof(state, taskId, url) {
  const idx = indexOfTask(state, taskId);
  if (idx < 0) return state;
  const next = cloneState(state);
  const id = state.tasks[idx].id;
  next.session.taskState[id] = {
    ...next.session.taskState[id],
    proofUrl: String(url == null ? '' : url),
  };
  return next;
}

export function addTaskReflection(state, taskId, reflection) {
  const idx = indexOfTask(state, taskId);
  if (idx < 0) return state;
  const next = cloneState(state);
  const id = state.tasks[idx].id;
  next.session.taskState[id] = {
    ...next.session.taskState[id],
    reflection: String(reflection == null ? '' : reflection),
  };
  return next;
}

// Marks a task done. If the task requires text proof and none is stored (nor
// supplied in payload), the task is NOT marked done and state is returned
// unchanged — proof is required first.
export function markTaskDone(state, taskId, payload = {}) {
  const idx = indexOfTask(state, taskId);
  if (idx < 0) return state;
  const task = state.tasks[idx];
  const id = task.id;
  const existing = state.session.taskState[id] || {};
  const proofText = payload.proofText != null ? String(payload.proofText) : existing.proofText || '';
  const proofUrl = payload.proofUrl != null ? String(payload.proofUrl) : existing.proofUrl || '';
  const reflection = payload.reflection != null ? String(payload.reflection) : existing.reflection || '';

  // A proof task needs either non-empty text proof or a valid link proof.
  if (task.requiresProof && !String(proofText).trim() && !isValidProofUrl(proofUrl)) {
    return state;
  }

  const next = cloneState(state);
  next.session.taskState[id] = { ...existing, done: true, proofText, proofUrl, reflection };
  if (state.session.status === MOBILE_SESSION_STATUS.NOT_STARTED) {
    next.session.status = MOBILE_SESSION_STATUS.IN_PROGRESS;
  }
  return next;
}

export function markTaskNotDone(state, taskId) {
  const idx = indexOfTask(state, taskId);
  if (idx < 0) return state;
  const next = cloneState(state);
  const id = state.tasks[idx].id;
  next.session.taskState[id] = { ...next.session.taskState[id], done: false };
  return next;
}

export function goToNextTask(state) {
  const next = cloneState(state);
  next.session.currentTaskIndex = Math.min(
    state.tasks.length - 1,
    state.session.currentTaskIndex + 1,
  );
  return next;
}

export function goToPreviousTask(state) {
  const next = cloneState(state);
  next.session.currentTaskIndex = Math.max(0, state.session.currentTaskIndex - 1);
  return next;
}

// Eligible to finish once at least one task is done (mirrors "you don't need
// 100% to complete a day").
export function canFinishMobileDay(state) {
  const score = computeMobileScore(state.tasks, state.session.taskState);
  return score.completed > 0;
}

export function finishMobileDay(state, now = Date.now()) {
  const next = cloneState(state);
  next.session.status = MOBILE_SESSION_STATUS.FINISHED;
  next.session.finishedAt = now;
  return next;
}

export function getCompletionSummary(state) {
  const score = computeMobileScore(state.tasks, state.session.taskState);
  const tier = mobileCompletionTier(score);
  return {
    pathTitle: state.path.title,
    dayNumber: state.path.dayNumber,
    local: state.path.local === true,
    status: state.session.status,
    score: score.score,
    tier,
    totalTasks: score.total,
    completedTasks: score.completed,
    proofSubmitted: score.proofSubmitted, // submitted, not verified
    reflectionCount: score.reflectionCount,
  };
}

export { MOBILE_SESSION_STATUS };

export default {
  createInitialMobileLoopState,
  getTodaySummary,
  todayCta,
  addLinkProof,
  startTodaySession,
  startTask,
  getCurrentTask,
  taskRequiresProofText,
  addTextProof,
  addTaskReflection,
  markTaskDone,
  markTaskNotDone,
  goToNextTask,
  goToPreviousTask,
  canFinishMobileDay,
  finishMobileDay,
  getCompletionSummary,
  MOBILE_SESSION_STATUS,
};
