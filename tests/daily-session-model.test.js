import test from 'node:test';
import assert from 'node:assert/strict';

import {
  agendaSummary, canCompleteDailySession, deriveDailySessionState,
  completionScoreMetadata, completionTierCopy, dailyCompletionScore,
  encouragementForProgress, evidenceSummary, nextUnresolvedTaskId,
  orderedSessionTasks, pendingTaskIds, resumeTaskId, sessionProgress,
  sessionTaskStates, taskEvidenceLabel,
} from '../src/daily-session-model.js';
import { dailySessionHTML } from '../src/views/daily-session.js';

const tasks = [
  { id:'optional-review', title:'Review notes', required:false, order:0 },
  { id:'read', title:'Read 10 pages', required:true, order:1 },
  { id:'proof', title:'Upload workout proof', required:true, evidenceRequired:true, evidenceType:'photo', order:2 },
  { id:'stretch', title:'Stretch', required:false, order:3 },
];

test('daily session orders required tasks before optional tasks while preserving order within each group', () => {
  assert.deepEqual(orderedSessionTasks(tasks).map(item => item.id), ['read', 'proof', 'optional-review', 'stretch']);
});

test('progress uses weighted completed work and keeps optional counts separate', () => {
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
  assert.equal(dailyCompletionScore(tasks, dayLog, evidence).evidenceCompleted, 0);
  assert.equal(dailyCompletionScore(tasks, { ...dayLog, verifiedTaskIds:['proof'] }, evidence).evidenceCompleted, 1);
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
  assert.equal(dailyCompletionScore(tasks, {
    completedTaskIds:['read'],
    verifiedTaskIds:['proof'],
    optionalSkippedTaskIds:['stretch'],
  }).optionalCompleted, 0);
  assert.equal(canCompleteDailySession(tasks, {
    completedTaskIds:['read'],
    verifiedTaskIds:['proof'],
    optionalSkippedTaskIds:['stretch'],
  }), true);
});

test('zero required days avoid division by zero and still require meaningful optional work', () => {
  const optionalOnly = [{ id:'bonus', title:'Bonus review', required:false }];
  const progress = sessionProgress(optionalOnly, {});
  assert.equal(progress.requiredTotal, 0);
  assert.equal(progress.percent, 0);
  assert.equal(canCompleteDailySession(optionalOnly, {}), false);
  assert.equal(canCompleteDailySession(optionalOnly, { completedTaskIds:['bonus'] }), true);
});

test('legacy day logs derive correct completion state from existing completed and verified arrays', () => {
  const legacy = { completedTaskIds:['read'], verifiedTaskIds:['proof'], status:'active' };
  assert.equal(canCompleteDailySession(tasks, legacy), true);
  const state = deriveDailySessionState({ pathId:'p1', dayNumber:4, tasks, dayLog:legacy });
  assert.equal(state.phase, 'agenda');
  assert.equal(state.progress.percent, 67);
});

test('daily scoring supports flexible thresholds by intensity', () => {
  const flexibleTasks = [
    { id:'a', required:true },
    { id:'b', required:true },
    { id:'c', required:true },
    { id:'d', required:true },
  ];
  const log = { completedTaskIds:['a', 'b', 'c'] };
  assert.equal(dailyCompletionScore(flexibleTasks, log, [], { intensity:'soft' }).score, 75);
  assert.equal(canCompleteDailySession(flexibleTasks, log, [], { intensity:'soft' }), true);
  assert.equal(canCompleteDailySession(flexibleTasks, log, [], { intensity:'balanced' }), true);
  assert.equal(canCompleteDailySession(flexibleTasks, log, [], { intensity:'intensive' }), true);
  const lower = { completedTaskIds:['a', 'b'] };
  assert.equal(canCompleteDailySession(flexibleTasks, lower, [], { intensity:'soft' }), false);
  assert.equal(dailyCompletionScore(flexibleTasks, lower, [], { intensity:'soft' }).tier, 'attempted');
});

test('anchor task blocks completion even when score passes threshold', () => {
  const anchorTasks = [
    { id:'anchor', required:true, anchor:true },
    { id:'b', required:true },
    { id:'c', required:true },
    { id:'d', required:true },
  ];
  const log = { completedTaskIds:['b', 'c', 'd'] };
  const score = dailyCompletionScore(anchorTasks, log, [], { intensity:'balanced' });
  assert.equal(score.score, 75);
  assert.equal(score.tier, 'blocked_anchor');
  assert.equal(score.canComplete, false);
  assert.match(completionTierCopy(score), /core task/i);
});

test('strong and perfect tiers remain distinct from passed days', () => {
  const simple = [
    { id:'a', required:true },
    { id:'b', required:true },
    { id:'c', required:true },
    { id:'d', required:true },
  ];
  assert.equal(dailyCompletionScore(simple, { completedTaskIds:['a', 'b', 'c'] }, [], { intensity:'balanced' }).tier, 'passed');
  assert.equal(dailyCompletionScore(simple, { completedTaskIds:['a', 'b', 'c', 'd'] }, [], { intensity:'balanced' }).tier, 'perfect');
  assert.equal(dailyCompletionScore(simple, { completedTaskIds:['a', 'b', 'c', 'd'] }, [], { intensity:'intensive' }).tier, 'perfect');
  const five = [...simple, { id:'e', required:true }];
  assert.equal(dailyCompletionScore(five, { completedTaskIds:['a', 'b', 'c', 'd'] }, [], { intensity:'soft' }).tier, 'strong');
});

test('completion score metadata is safe aggregate day-log data', () => {
  const score = dailyCompletionScore(tasks, { completedTaskIds:['read'], verifiedTaskIds:['proof'] }, [], { intensity:'balanced' });
  assert.deepEqual(completionScoreMetadata(score), {
    completionScore:67,
    completionTier:'passed',
    passThreshold:65,
    intensity:'balanced',
    anchorSatisfied:true,
    completedWeight:2,
    totalWeight:3,
    requiredCompleted:2,
    requiredTotal:2,
    optionalCompleted:0,
    optionalTotal:2,
    evidenceCompleted:1,
    evidenceRequired:1,
  });
});

test('daily session UI shows score, thresholds, tier copy and completion button rules', () => {
  const passHtml = dailySessionHTML({
    dayNumber:1,
    tasks,
    intensity:'balanced',
    dayLog:{ dayNumber:1, sessionViewState:'completion-check', completedTaskIds:['read'], verifiedTaskIds:['proof'] },
  });
  assert.match(passHtml, /Score/);
  assert.match(passHtml, /Pass score/);
  assert.match(passHtml, /Day passed/);
  assert.match(passHtml, /Complete Day - 67%/);
  assert.doesNotMatch(passHtml, /Everything required is documented/);

  const lowHtml = dailySessionHTML({
    dayNumber:1,
    tasks,
    intensity:'balanced',
    dayLog:{ dayNumber:1, sessionViewState:'completion-check', completedTaskIds:['read'] },
  });
  assert.doesNotMatch(lowHtml, /id="completeDay"/);
  assert.match(lowHtml, /Finish more work/);

  const blockedHtml = dailySessionHTML({
    dayNumber:1,
    tasks:[{ id:'anchor', title:'Core', required:true, anchor:true }, { id:'b', title:'B', required:true }, { id:'c', title:'C', required:true }],
    intensity:'balanced',
    dayLog:{ dayNumber:1, sessionViewState:'completion-check', completedTaskIds:['b', 'c'] },
  });
  assert.match(blockedHtml, /One core task is still unfinished/);
  assert.match(blockedHtml, /Complete core task first/);
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
