import test from 'node:test';
import assert from 'node:assert/strict';

import {
  agendaSummary, canCompleteDailySession, deriveDailySessionState,
  completionScoreMetadata, completionTierCopy, dailyCompletionScore,
  currentFocusTask, encouragementForProgress, evidenceSummary, focusFeedbackForAction,
  nextUnresolvedTaskId, normalizeDailyFocusState, orderedSessionTasks,
  pendingTaskIds, recommendedFocusTaskIndex, resumeTaskId, sessionProgress,
  sessionTaskStates, taskEvidenceLabel,
} from '../src/daily-session-model.js';
import { dailySessionHTML, focusScreenHTML } from '../src/views/daily-session.js';

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
  assert.match(passHtml, /Focus mode/);
  assert.match(passHtml, /Today&apos;s progress/);
  assert.doesNotMatch(passHtml, /Pass mark/);
  assert.match(passHtml, /Day status/);
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
  assert.match(blockedHtml, /core task is still unfinished/);
  assert.match(blockedHtml, /Complete core task first/);
});

test('focus mode state defaults safely and normalizes invalid task indexes', () => {
  const focus = normalizeDailyFocusState({
    pathId:'old',
    dayNumber:9,
    taskIndex:99,
    mode:'not-real',
    feedback:'x'.repeat(300),
  }, {
    pathId:'p1',
    dayNumber:1,
    tasks,
    dayLog:{ completedTaskIds:['read'], verifiedTaskIds:['proof'] },
    evidenceSubmissions:[],
  });
  assert.equal(focus.pathId, 'p1');
  assert.equal(focus.dayNumber, 1);
  assert.equal(focus.mode, 'focus');
  assert.equal(focus.taskIndex, 2);
  assert.equal(focus.feedback.length, 240);

  const clamped = normalizeDailyFocusState({ pathId:'p1', dayNumber:1, taskIndex:999, mode:'overview' }, {
    pathId:'p1',
    dayNumber:1,
    tasks,
    dayLog:{},
    evidenceSubmissions:[],
  });
  assert.equal(clamped.taskIndex, tasks.length);
  assert.equal(clamped.mode, 'overview');
});

test('focus task selection prioritizes unfinished core, required, evidence, then optional work', () => {
  const focusTasks = [
    { id:'optional', title:'Optional', required:false, order:0 },
    { id:'core', title:'Core', required:true, anchor:true, order:1 },
    { id:'required', title:'Required', required:true, order:2 },
    { id:'proof', title:'Proof', required:false, evidenceRequired:true, order:3 },
  ];
  assert.equal(recommendedFocusTaskIndex(focusTasks, {}), 0);
  assert.equal(currentFocusTask(focusTasks, {}, [], normalizeDailyFocusState({}, {
    pathId:'p1', dayNumber:1, tasks:focusTasks, dayLog:{}, evidenceSubmissions:[],
  })).id, 'core');

  const coreDone = { completedTaskIds:['core'] };
  assert.equal(currentFocusTask(focusTasks, coreDone, [], normalizeDailyFocusState({}, {
    pathId:'p1', dayNumber:1, tasks:focusTasks, dayLog:coreDone, evidenceSubmissions:[],
  })).id, 'required');

  const requiredDone = { completedTaskIds:['core', 'required'] };
  assert.equal(currentFocusTask(focusTasks, requiredDone, [], normalizeDailyFocusState({}, {
    pathId:'p1', dayNumber:1, tasks:focusTasks, dayLog:requiredDone, evidenceSubmissions:[],
  })).id, 'proof');

  const allDone = { completedTaskIds:['core', 'required', 'optional'], verifiedTaskIds:['proof'] };
  assert.equal(recommendedFocusTaskIndex(focusTasks, allDone, [{ taskId:'proof' }]), focusTasks.length);
});

test('focus mode renders one task, badges, navigation, feedback and overview switch', () => {
  const html = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks:[{ id:'core', title:'Core task', required:true, anchor:true, evidenceRequired:true }],
    dayLog:{ dayNumber:1 },
    focusState:{ pathId:'p1', dayNumber:1, taskIndex:0, mode:'focus', feedback:'Task counted toward today\'s score.' },
  });
  assert.match(html, /Guided proof-of-growth session/);
  assert.match(html, /Task 1 of 1/);
  assert.match(html, /Core task/);
  assert.match(html, /Proof required/);
  assert.match(html, /Add proof/);
  assert.match(html, /Overview/);
  assert.match(html, /Task counted toward today&#39;s score/);
  assert.doesNotMatch(html.match(/daily-task-card[\s\S]*?<\/section>/)?.[0] || '', /Review notes/);
});

test('overview mode still renders the task list and can jump back to focus', () => {
  const html = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks,
    dayLog:{ dayNumber:1 },
    focusState:{ pathId:'p1', dayNumber:1, taskIndex:0, mode:'overview' },
  });
  assert.match(html, /Overview mode/);
  assert.match(html, /Full day scan/);
  assert.match(html, /data-session-action="focus-task"/);
  assert.match(html, /Read 10 pages/);
  assert.match(html, /Upload workout proof/);
});

test('focus feedback copy covers proof, optional, threshold and anchor states', () => {
  assert.match(focusFeedbackForAction('done', dailyCompletionScore(tasks, {}, [])), /Task counted/);
  assert.match(focusFeedbackForAction('proof-needed', dailyCompletionScore(tasks, {}, [])), /needs proof/);
  assert.match(focusFeedbackForAction('proof-saved', dailyCompletionScore(tasks, { completedTaskIds:['read'], verifiedTaskIds:['proof'] }, [])), /Proof saved/);
  assert.match(focusFeedbackForAction('skip-optional', dailyCompletionScore(tasks, {}, [])), /will not add/);
  assert.match(focusFeedbackForAction('done', dailyCompletionScore(tasks, { completedTaskIds:['read'], verifiedTaskIds:['proof'] }, [])), /done enough/);
  const blocked = dailyCompletionScore([{ id:'a', anchor:true }, { id:'b' }, { id:'c' }], { completedTaskIds:['b', 'c'] }, []);
  assert.match(focusFeedbackForAction('done', blocked), /core task/);
});

test('completion result screen distinguishes passed, strong, perfect, and incomplete attempts', () => {
  const passed = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks,
    dayLog:{ dayNumber:1, status:'completed', completedTaskIds:['read'], verifiedTaskIds:['proof'] },
  });
  assert.match(passed, /Result/);
  assert.match(passed, /Day passed/);
  assert.match(passed, /67%/);
  assert.match(passed, /65%/);
  assert.doesNotMatch(passed, /https:\/\/private/);

  const strong = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks:[{ id:'a' }, { id:'b' }, { id:'c' }, { id:'d' }, { id:'e' }],
    intensity:'soft',
    dayLog:{ dayNumber:1, status:'completed', completedTaskIds:['a', 'b', 'c', 'd'] },
  });
  assert.match(strong, /Strong day/);

  const perfect = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks:[{ id:'a' }, { id:'b' }],
    dayLog:{ dayNumber:1, status:'completed', completedTaskIds:['a', 'b'] },
  });
  assert.match(perfect, /Perfect day/);

  const low = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks,
    dayLog:{ dayNumber:1, completedTaskIds:['read'] },
  });
  assert.doesNotMatch(low, /Result/);
  assert.doesNotMatch(low, /id="completeDay"/);
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

test('pre-completion UI does not prominently show pass mark or threshold percentage', () => {
  const focusHtml = dailySessionHTML({
    dayNumber:1,
    tasks,
    intensity:'balanced',
    dayLog:{ dayNumber:1, completedTaskIds:['read'] },
  });
  assert.doesNotMatch(focusHtml, /Pass mark/);
  assert.doesNotMatch(focusHtml, /Pass score/);
  assert.match(focusHtml, /Today&apos;s progress/);

  const agendaHtml = dailySessionHTML({
    dayNumber:1,
    tasks,
    intensity:'balanced',
    dayLog:{ dayNumber:1 },
    focusState:{ mode:'overview' },
  });
  assert.doesNotMatch(agendaHtml, /Pass mark/);
  assert.doesNotMatch(agendaHtml, /Pass score/);
});

test('passThreshold remains in scoring engine and day log metadata after completion', () => {
  const score = dailyCompletionScore(tasks, { completedTaskIds:['read'], verifiedTaskIds:['proof'] }, [], { intensity:'balanced' });
  assert.equal(score.passThreshold, 65);
  const metadata = completionScoreMetadata(score);
  assert.equal(metadata.passThreshold, 65);
});

test('result screen shows score and tier but threshold only in result context', () => {
  const resultHtml = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks,
    dayLog:{ dayNumber:1, status:'completed', completedTaskIds:['read'], verifiedTaskIds:['proof'] },
  });
  assert.match(resultHtml, /Result/);
  assert.match(resultHtml, /67%/);
  assert.match(resultHtml, /Threshold/);
  assert.match(resultHtml, /65%/);
  assert.doesNotMatch(resultHtml, /Pass mark/);
});

test('threshold-reached copy appears when session is eligible for completion', () => {
  const score = dailyCompletionScore(tasks, { completedTaskIds:['read'], verifiedTaskIds:['proof'] }, [], { intensity:'balanced' });
  assert.equal(score.canComplete, true);
  assert.match(focusFeedbackForAction('done', score), /done enough meaningful work/);
});

test('complete day still appears only when scoring permits', () => {
  const canComplete = canCompleteDailySession(tasks, { completedTaskIds:['read'], verifiedTaskIds:['proof'] }, [], { intensity:'balanced' });
  assert.equal(canComplete, true);
  const cannotComplete = canCompleteDailySession(tasks, { completedTaskIds:['read'] }, [], { intensity:'balanced' });
  assert.equal(cannotComplete, false);
});

test('dedicated focus screen renders back to roadmap link and path title', () => {
  const html = focusScreenHTML({
    pathId:'p1',
    pathTitle:'My Learning Path',
    dayNumber:3,
    roadmapHash:'#/path/p1/plan/roadmap/day/3',
    tasks:[{ id:'core', title:'Core task', required:true }],
    dayLog:{ dayNumber:3 },
    focusState:{ pathId:'p1', dayNumber:3, taskIndex:0, mode:'focus' },
  });
  assert.match(html, /daily-focus-screen/);
  assert.match(html, /focusBackToRoadmap/);
  assert.match(html, /Back to roadmap/);
  assert.match(html, /My Learning Path/);
  assert.match(html, /Day 3/);
  assert.match(html, /Core task/);
  assert.doesNotMatch(html, /Pass mark/);
});

test('overview mode remains available inside dedicated focus screen', () => {
  const html = focusScreenHTML({
    pathId:'p1',
    pathTitle:'Test',
    dayNumber:1,
    roadmapHash:'#/path/p1/plan',
    tasks,
    dayLog:{ dayNumber:1 },
    focusState:{ pathId:'p1', dayNumber:1, taskIndex:0, mode:'overview' },
  });
  assert.match(html, /Overview mode/);
  assert.match(html, /Full day scan/);
  assert.match(html, /focusBackToRoadmap/);
});
