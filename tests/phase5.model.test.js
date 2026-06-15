import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  MAX_AI_CLARIFICATION_ROUNDS, aiPromptDefaults, answerValueForQuestion,
  cadenceLabel, canStartAIRequest, commitmentSummary, creationStageForPhase,
  isMeaningfulAIGoal, normalizeClarifyingQuestions, normalizeCoreCommitments,
  recoverAIBuilderState, routeInterpretedBrief,
} from '../src/ai-builder-model.js';
import { getTasksForDay } from '../src/journey.js';
import { platformToLocalPath, resolveCreatorName } from '../src/platform.js';
import { TEMPLATES } from '../src/templates.js';
import { basicStarterDraft, createGeneratePathHandler, normalizeDraft, normalizePrompt } from '../api/generate-path.js';

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
    confirmedBrief:{
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
    },
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
  const input = normalizePrompt({ confirmedBrief:{ goal:'Practice guitar', durationDays:21 } });
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
    const draft = basicStarterDraft(normalizePrompt({ confirmedBrief:{
      goal,
      durationDays,
      coreCommitments:[{ title, required:true, cadence:{ type:cadence } }],
    } }));
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

test('AI builder renders only Basic starter and Build with AI entry actions', () => {
  const source = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  assert.match(source, />Basic starter</);
  assert.match(source, /id=\"aiBuild\"/);
  assert.match(source, />Build with AI</);
  const goalStep = source.slice(source.indexOf('function goalStepHTML'), source.indexOf('function processingStepHTML'));
  assert.match(goalStep, /What do you want to achieve/);
  assert.doesNotMatch(goalStep, /aiDuration/);
  assert.doesNotMatch(goalStep, /aiVisibility/);
  assert.doesNotMatch(goalStep, /commitmentsHTML/);
  assert.doesNotMatch(source, />Interpret goal</);
  assert.doesNotMatch(source, />Fast generate without interpretation</);
  assert.doesNotMatch(source, />Fast generate from current inputs</);
});

test('guided clarification questions preserve choices and custom answers', () => {
  const [question] = normalizeClarifyingQuestions([{
    id:'current-level', targetField:'currentBaseline', prompt:'Where are you with French?',
    supportingText:'This changes the starting difficulty.', type:'single_select', required:true,
    materialReason:'Changes the starting level.', allowCustomAnswer:true,
    options:[{ id:'zero', label:'Starting from zero', value:'Complete beginner' }],
  }]);
  assert.equal(question.type, 'single_select');
  assert.equal(question.options[0].label, 'Starting from zero');
  assert.equal(question.materialReason, 'Changes the starting level.');
  assert.equal(answerValueForQuestion(question, { selected:['zero'], custom:'Can read simple words' }), 'Complete beginner; Can read simple words');
});

test('guided creation phases map to one canonical progress model', () => {
  assert.equal(creationStageForPhase('goal'), 'Goal');
  assert.equal(creationStageForPhase('clarifying'), 'Details');
  assert.equal(creationStageForPhase('rhythm'), 'Plan');
  assert.equal(creationStageForPhase('preview'), 'Preview');
  assert.equal(creationStageForPhase('ready'), 'Ready');
});

test('recommended rhythm uses natural-language cadence summaries', () => {
  assert.equal(cadenceLabel({ type:'times_per_week', timesPerWeek:3 }), '3 times each week');
  assert.equal(cadenceLabel({ type:'selected_days', daysOfWeek:['monday', 'wednesday'] }), 'On mon, wed');
  const summary = commitmentSummary({ title:'Speaking practice', cadence:{ type:'weekly' }, estimatedMinutes:20 }, 0);
  assert.equal(summary.rhythm, '20 minutes - Once each week');
});

test('meaningful goal validation rejects blank and accidental input', () => {
  assert.equal(isMeaningfulAIGoal(''), false);
  assert.equal(isMeaningfulAIGoal(' x '), false);
  assert.equal(isMeaningfulAIGoal('I want to learn French'), true);
});

test('vague interpreted goals enter clarification while detailed goals enter review', () => {
  const vagueFrench = {
    readyToGenerate:false,
    clarifyingQuestions:['What is your current French level?', 'How much time can you practise?'],
  };
  const detailedFrench = { readyToGenerate:true, clarifyingQuestions:[] };
  const vagueFitness = {
    readyToGenerate:false,
    clarifyingQuestions:['What is your baseline?', 'What equipment is available?'],
  };
  const detailedRunning = { readyToGenerate:true, clarifyingQuestions:[] };
  assert.equal(routeInterpretedBrief(vagueFrench, 0), 'clarifying');
  assert.equal(routeInterpretedBrief(detailedFrench, 0), 'reviewing');
  assert.equal(routeInterpretedBrief(vagueFitness, 0), 'clarifying');
  assert.equal(routeInterpretedBrief(detailedRunning, 0), 'reviewing');
  assert.equal(routeInterpretedBrief(vagueFrench, MAX_AI_CLARIFICATION_ROUNDS), 'reviewing');
});

test('duplicate AI requests are blocked while interpretation or generation is active', () => {
  assert.equal(canStartAIRequest({ phase:'input', loading:false, clarifyLoading:false }), true);
  assert.equal(canStartAIRequest({ phase:'interpreting', loading:false, clarifyLoading:true }), false);
  assert.equal(canStartAIRequest({ phase:'generating', loading:true, clarifyLoading:false }), false);
});

test('recoverable AI errors preserve form, brief, answers, and commitments', () => {
  const state = {
    phase:'interpreting',
    prompt:{ goal:'Learn French', coreCommitments:[{ title:'Speaking practice' }] },
    brief:{ goal:'Learn French' },
    clarifyingAnswers:{ 0:'A1' },
    loading:false,
    clarifyLoading:true,
  };
  const recovered = recoverAIBuilderState(state, 'Try again.', 'clarifying');
  assert.equal(recovered.phase, 'clarifying');
  assert.equal(recovered.prompt, state.prompt);
  assert.equal(recovered.brief, state.brief);
  assert.equal(recovered.clarifyingAnswers, state.clarifyingAnswers);
  assert.equal(recovered.clarifyLoading, false);
});

test('the canonical Build with AI handler interprets before generation and Basic starter stays local', () => {
  const source = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const buildHandler = source.slice(source.indexOf('async function handleBuildWithAI'), source.indexOf('async function requestGoalInterpretation'));
  const basicHandler = source.slice(source.indexOf('function createBasicDraft'), source.indexOf('async function generateRoadmapFromBrief'));
  const generationHandler = source.slice(source.indexOf('async function generateRoadmapFromBrief'), source.indexOf('async function saveGeneratedPath'));
  assert.match(buildHandler, /requestGoalInterpretation\(false\)/);
  assert.doesNotMatch(buildHandler, /\/api\/generate-path/);
  assert.match(basicHandler, /localGeneratedDraft\(prompt\)/);
  assert.doesNotMatch(basicHandler, /fetch\(/);
  assert.match(generationHandler, /aiBuilder\.phase !== 'brief'/);
  assert.match(generationHandler, /confirmBrief\(brief\)/);
  assert.match(generationHandler, /confirmedBrief,/);
  assert.match(generationHandler, /\/api\/generate-path/);
});

test('clarification updates send the previous brief and preserved answers back through interpretation', () => {
  const source = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const interpretationHandler = source.slice(source.indexOf('async function requestGoalInterpretation'), source.indexOf('function createBasicDraft'));
  assert.match(interpretationHandler, /previousBrief:builder\.brief \|\| briefFromPrompt/);
  assert.match(interpretationHandler, /answers,/);
  assert.match(interpretationHandler, /builder\.clarificationRound \+= 1/);
  assert.match(interpretationHandler, /MAX_AI_CLARIFICATION_ROUNDS/);
});

test('generation API rejects requests that did not confirm an interpreted brief', async () => {
  let statusCode = 200;
  let payload = null;
  const response = {
    setHeader(){},
    status(code){ statusCode = code; return this; },
    json(value){ payload = value; return value; },
  };
  const generatePathHandler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'user-a' }),
    rateLimit:async () => {},
    provider:async () => { throw new Error('Provider must not be called.'); },
  });
  await generatePathHandler({
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body:{ goal:'A vague goal' },
  }, response);
  assert.equal(statusCode, 400);
  assert.equal(payload.code, 'brief_not_confirmed');
});
