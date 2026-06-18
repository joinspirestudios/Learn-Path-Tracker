import test from 'node:test';
import assert from 'node:assert/strict';

import {
  agendaSummary, canCompleteDailySession, deriveDailySessionState,
  encouragementForProgress, evidenceSummary, nextUnresolvedTaskId,
  orderedSessionTasks, pendingTaskIds, resumeTaskId, sessionProgress,
  sessionTaskStates, taskEvidenceLabel,
} from '../src/daily-session-model.js';

const tasks = [
  { id:'optional-review', title:'Review notes', required:false, order:0 },
  { id:'read', title:'Read 10 pages', required:true, order:1 },
  { id:'proof', title:'Upload workout proof', required:true, evidenceRequired:true, evidenceType:'photo', order:2 },
  { id:'stretch', title:'Stretch', required:false, order:3 },
];

test('daily session orders required tasks before optional tasks while preserving order within each group', () => {
  assert.deepEqual(orderedSessionTasks(tasks).map(item => item.id), ['read', 'proof', 'optional-review', 'stretch']);
});

test('progress uses resolved required tasks only and keeps optional counts separate', () => {
  const progress = sessionProgress(tasks, {
    completedTaskIds:['read', 'stretch'],
    verifiedTaskIds:[],
    optionalSkippedTaskIds:['optional-review'],
  });
  assert.equal(progress.requiredTotal, 2);
  assert.equal(progress.requiredResolved, 1);
  assert.equal(progress.optionalCompleted, 1);
  assert.equal(progress.optionalSkipped, 1);
  assert.equal(progress.percent, 50);
  assert.equal(canCompleteDailySession(tasks, { completedTaskIds:['read', 'stretch'], optionalSkippedTaskIds:['optional-review'] }), false);
});

test('required evidence task is not eligible until canonical verified task state exists', () => {
  const dayLog = { completedTaskIds:['read', 'proof'], verifiedTaskIds:[] };
  const evidence = [{ taskId:'proof', evidenceUrl:'https://example.com/proof.jpg' }];
  assert.equal(canCompleteDailySession(tasks, dayLog, evidence), false);
  assert.equal(canCompleteDailySession(tasks, { ...dayLog, verifiedTaskIds:['proof'] }, evidence), true);
});

test('not done yet keeps a required task pending and next selection advances without resolving it', () => {
  const dayLog = { pendingTaskIds:['read'], completedTaskIds:[], verifiedTaskIds:[] };
  assert.deepEqual(pendingTaskIds(tasks, dayLog), ['read']);
  assert.equal(nextUnresolvedTaskId(tasks, dayLog, [], 'read'), 'proof');
  assert.equal(sessionProgress(tasks, dayLog).percent, 0);
});

test('last active unresolved task is resumed before first unresolved required task', () => {
  const dayLog = { lastActiveTaskId:'proof', completedTaskIds:['read'], verifiedTaskIds:[] };
  assert.equal(resumeTaskId(tasks, dayLog), 'proof');
  assert.equal(resumeTaskId(tasks, { completedTaskIds:['read'], verifiedTaskIds:['proof'] }), 'optional-review');
});

test('optional skipped tasks are resolved but do not count as completed work', () => {
  const states = sessionTaskStates(tasks, {
    completedTaskIds:['read'],
    verifiedTaskIds:['proof'],
    optionalSkippedTaskIds:['stretch'],
  });
  const skipped = states.find(item => item.id === 'stretch');
  assert.equal(skipped.state.resolved, true);
  assert.equal(skipped.state.completed, false);
  assert.equal(canCompleteDailySession(tasks, {
    completedTaskIds:['read'],
    verifiedTaskIds:['proof'],
    optionalSkippedTaskIds:['stretch'],
  }), true);
});

test('zero required days avoid division by zero and can complete according to optional-day policy', () => {
  const optionalOnly = [{ id:'bonus', title:'Bonus review', required:false }];
  const progress = sessionProgress(optionalOnly, {});
  assert.equal(progress.requiredTotal, 0);
  assert.equal(progress.percent, 100);
  assert.equal(canCompleteDailySession(optionalOnly, {}), true);
});

test('legacy day logs derive correct completion state from existing completed and verified arrays', () => {
  const legacy = { completedTaskIds:['read'], verifiedTaskIds:['proof'], status:'active' };
  assert.equal(canCompleteDailySession(tasks, legacy), true);
  const state = deriveDailySessionState({ pathId:'p1', dayNumber:4, tasks, dayLog:legacy });
  assert.equal(state.phase, 'agenda');
  assert.equal(state.progress.percent, 100);
});

test('completed legacy day derives complete phase instead of restarting the session', () => {
  const state = deriveDailySessionState({
    pathId:'p1',
    dayNumber:2,
    tasks,
    dayLog:{ status:'completed', completedTaskIds:['read'], verifiedTaskIds:['proof'] },
  });
  assert.equal(state.phase, 'complete');
});

test('agenda and evidence summaries expose counts, effort, previews, and labels', () => {
  const summary = agendaSummary([
    { id:'a', title:'A', required:true, estimatedMinutes:20 },
    { id:'b', title:'B', required:false, estimatedMinutes:10 },
    { id:'c', title:'C', required:true, evidenceRequired:true, evidenceType:'screenshot' },
  ]);
  assert.equal(summary.requiredTotal, 2);
  assert.equal(summary.optionalTotal, 1);
  assert.equal(summary.evidenceRequired, 1);
  assert.equal(summary.estimatedMinutes, 30);
  assert.deepEqual(summary.requiredPreview, ['A', 'C']);
  assert.equal(evidenceSummary([{ id:'c', title:'C', evidenceRequired:true, evidenceType:'screenshot' }]).tasks[0].type, 'screenshot');
  assert.equal(taskEvidenceLabel({ evidenceRequired:true }), 'URL or supported file proof');
});

test('encouragement copy follows progress thresholds without overstating progress', () => {
  assert.equal(encouragementForProgress(0), 'Ready when you are.');
  assert.equal(encouragementForProgress(25), 'Good start. Keep going.');
  assert.equal(encouragementForProgress(55), 'You are making progress.');
  assert.equal(encouragementForProgress(80), 'You are nearly there.');
  assert.equal(encouragementForProgress(100), 'Today is fully documented.');
});
