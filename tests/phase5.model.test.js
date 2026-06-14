import test from 'node:test';
import assert from 'node:assert/strict';

import { aiPromptDefaults, normalizeCoreCommitments } from '../src/ai-builder-model.js';
import { getTasksForDay } from '../src/journey.js';
import { platformToLocalPath, resolveCreatorName } from '../src/platform.js';
import { TEMPLATES } from '../src/templates.js';
import { basicStarterDraft, normalizeDraft, normalizePrompt } from '../api/generate-path.js';

test('generic AI builder defaults are neutral', () => {
  const defaults = aiPromptDefaults();
  assert.equal(defaults.durationDays, null);
  assert.equal(defaults.pathType, 'auto');
  assert.deepEqual(defaults.coreCommitments, []);
});

test('legacy daily strings migrate into structured core commitments', () => {
  const commitments = normalizeCoreCommitments([], ['Practice scales']);
  assert.equal(commitments[0].title, 'Practice scales');
  assert.equal(commitments[0].cadence.type, 'daily');
  assert.equal(commitments[0].required, true);
});

test('generation prompt preserves confirmed commitments and expanded cadence', () => {
  const input = normalizePrompt({
    goal:'Finish a small documentary edit',
    durationDays:42,
    pathType:'creative_project',
    coreCommitments:[{
      title:'Edit two focused sessions',
      description:'Work through the current sequence.',
      required:true,
      cadence:{ type:'times_per_week', timesPerWeek:2 },
      estimatedMinutes:90,
      evidenceType:'export',
      reason:'Keeps the project moving.',
    }],
  });
  assert.equal(input.durationDays, 42);
  assert.equal(input.coreCommitments[0].cadence.type, 'times_per_week');
  assert.equal(input.coreCommitments[0].cadence.timesPerWeek, 2);
  const draft = basicStarterDraft(input);
  assert.equal(draft.coreCommitments[0].title, 'Edit two focused sessions');
  assert.equal(draft.tasks[0].scheduleType, 'times_per_week');
});

test('all supported cadence types remain usable while daily and once stay compatible', () => {
  const tasks = [
    { title:'Daily', scheduleType:'daily', startDay:1, endDay:14 },
    { title:'Weekdays', scheduleType:'weekdays', startDay:1, endDay:14 },
    { title:'Selected', scheduleType:'selected_days', daysOfWeek:['wed'], startDay:1, endDay:14 },
    { title:'Three weekly', scheduleType:'times_per_week', timesPerWeek:3, startDay:1, endDay:14 },
    { title:'Weekly', scheduleType:'weekly', startDay:1, endDay:14 },
    { title:'Interval', scheduleType:'interval', intervalDays:3, startDay:1, endDay:14 },
    { title:'Once', scheduleType:'once', unlockDay:4 },
    { title:'Sequential', scheduleType:'sequential', scheduledDay:5 },
  ];
  assert.ok(getTasksForDay(tasks, 1).some(task => task.title === 'Daily'));
  assert.ok(getTasksForDay(tasks, 3).some(task => task.title === 'Selected'));
  assert.ok(getTasksForDay(tasks, 4).some(task => task.title === 'Once'));
  assert.ok(getTasksForDay(tasks, 5).some(task => task.title === 'Sequential'));
  assert.ok(getTasksForDay(tasks, 7).some(task => task.title === 'Interval'));
});

test('creator attribution follows explicit, owner, email, and generic fallbacks', () => {
  assert.equal(resolveCreatorName({ creatorName:'Amina' }), 'Amina');
  assert.equal(resolveCreatorName({ creatorName:'Public Path', ownerId:'u1' }, { uid:'u1', displayName:'Jordan', email:'j@example.com' }), 'Jordan');
  assert.equal(resolveCreatorName({ creatorEmail:'maya@example.com' }), 'maya');
  assert.equal(resolveCreatorName({}), 'Creator');
});

test('lightweight platform summaries retain creator and task counts', () => {
  const local = platformToLocalPath({
    id:'summary-path',
    path:{
      ownerId:'owner-1', creatorId:'owner-1', creatorName:'Noor',
      title:'Summary path', goal:'Learn deliberately', visibility:'public',
      sectionCount:4, taskCount:18,
    },
    sections:[], tasks:[], childrenLoaded:false,
  });
  assert.equal(local.creatorName, 'Noor');
  assert.equal(local.sectionCount, 4);
  assert.equal(local.taskCount, 18);
});

test('normalized generated drafts preserve selected-days task settings', () => {
  const input = normalizePrompt({ goal:'Practice guitar', durationDays:21 });
  const draft = normalizeDraft({
    title:'Guitar practice', description:'', goal:'Practice guitar', category:'skill',
    durationDays:21, durationLabel:'21 days', difficulty:'beginner', intensity:'moderate',
    previewTitle:'Guitar practice', previewDescription:'', coreCommitments:[],
    sections:[{ title:'Practice', description:'', order:0 }],
    tasks:[{
      title:'Technique practice', description:'', sectionTitle:'Practice',
      scheduleType:'selected_days', startDay:1, endDay:21, unlockDay:null,
      daysOfWeek:['mon', 'wed', 'fri'], timesPerWeek:null, intervalDays:null, scheduledDay:null,
      taskMode:'fixed_recurring', progressionMetric:null, progressionUnit:null,
      startValue:null, targetValue:null, progressionCurve:null, progressionNotes:null,
      evidenceRequired:false, resourceUrl:null, order:0,
    }],
    resources:[], notes:[],
  }, input);
  assert.equal(draft.tasks[0].scheduleType, 'selected_days');
  assert.deepEqual(draft.tasks[0].daysOfWeek, ['mon', 'wed', 'fri']);
});

test('eight requested goal scenarios preserve distinct confirmed commitments without legacy challenge assumptions', () => {
  const scenarios = [
    ['Learn French in one year', 365, 'Practice French vocabulary', 'daily'],
    ['Learn Blender for product animation', 90, 'Complete a guided Blender lesson', 'times_per_week'],
    ['Build a consistent prayer habit', 30, 'Complete the scheduled prayer practice', 'daily'],
    ['Progress from running 1 km to 15 km', 120, 'Complete the planned run session', 'times_per_week'],
    ['Complete a professional design portfolio', 84, 'Complete the next portfolio milestone', 'sequential'],
    ['Publish one YouTube video every week', 90, 'Publish the weekly video', 'weekly'],
    ['Finish an online course in 12 weeks', 84, 'Complete the next course module', 'sequential'],
    ['Complete a custom 30-day personal challenge', 30, 'Complete the chosen challenge action', 'daily'],
  ];
  const forbidden = ['read 10 pages', 'run or walk 1km', 'sleep 8 hours', 'avoid soda', 'post one proof-of-work update'];
  for(const [goal, durationDays, title, cadence] of scenarios){
    const draft = basicStarterDraft(normalizePrompt({
      goal,
      durationDays,
      coreCommitments:[{ title, required:true, cadence:{ type:cadence } }],
    }));
    const serialized = JSON.stringify(draft).toLowerCase();
    forbidden.forEach(phrase => assert.equal(serialized.includes(phrase), false, `${goal} inherited ${phrase}`));
    assert.equal(draft.durationDays, durationDays);
    assert.equal(draft.tasks[0].title, title);
    assert.equal(draft.tasks[0].scheduleType, cadence);
  }
});

test('the dedicated 75-day template remains unchanged and available', () => {
  const template = TEMPLATES.find(item => item.id === 'tpl_75_hard_style');
  assert.ok(template);
  assert.equal(template.durationDays, 75);
  assert.equal(template.weeks[0].tasks.length, 7);
  assert.equal(template.weeks[0].tasks[0].text, 'Read 10 pages');
  assert.deepEqual(aiPromptDefaults().coreCommitments, []);
});
