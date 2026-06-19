import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  AI_INTENSITY_DETAILS, AI_INTENSITY_LEVELS,
  MAX_AI_CLARIFICATION_ROUNDS, aiPromptDefaults, answerValueForQuestion,
  answerPayloadForQuestion,
  cadenceLabel, canStartAIRequest, commitmentSummary, creationStageForPhase,
  isMeaningfulAIGoal, normalizeClarifyingQuestions, normalizeCoreCommitments,
  mergeBriefPreservingConfirmed, mergeClarificationAnswers, normalizeConfirmedBrief, normalizeDomainProfile,
  normalizeIntensity, normalizeStructuredResources, recoverAIBuilderState, routeInterpretedBrief,
  validatePhase55Brief,
} from '../src/ai-builder-model.js';
import { getTasksForDay } from '../src/journey.js';
import {
  canJoinPath, canPreviewPath, normalizePathStats, platformToLocalPath,
  resolveCreatorName,
} from '../src/platform.js';
import { TEMPLATES } from '../src/templates.js';
import { basicStarterDraft, createGeneratePathHandler, normalizeDraft, normalizePrompt } from '../api/generate-path.js';

test('generic AI builder defaults are neutral', () => {
  const defaults = aiPromptDefaults();
  assert.equal(defaults.durationDays, null);
  assert.equal(defaults.pathType, 'auto');
  assert.deepEqual(defaults.coreCommitments, []);
});

test('Phase 5.5 domain model defaults and intensity values are canonical', () => {
  const brief = normalizeConfirmedBrief({ goal:'Learn Blender' });
  assert.deepEqual(AI_INTENSITY_LEVELS, ['soft', 'balanced', 'intensive']);
  assert.equal(brief.intensity, 'balanced');
  assert.equal(brief.domainProfile.primary, 'general');
  assert.deepEqual(brief.structuredResources, { courses:[], books:[], programmes:[] });
  assert.equal(normalizeIntensity('light'), 'soft');
  assert.equal(normalizeIntensity('moderate'), 'balanced');
  assert.equal(normalizeIntensity('intense'), 'intensive');
  assert.match(AI_INTENSITY_DETAILS.soft, /recovery/i);
});

test('domain detection preserves course, book, fitness, and multi-domain signals conservatively', () => {
  assert.equal(normalizeDomainProfile({}, 'I want to finish my design course').primary, 'course');
  assert.equal(normalizeDomainProfile({}, 'I want to study a 420-page book').primary, 'book');
  assert.equal(normalizeDomainProfile({}, 'I can run 1 km and want to reach 15 km').primary, 'fitness');
  const multi = normalizeDomainProfile({}, 'Complete a running course and prepare for a 5 km race');
  assert.deepEqual(multi.detected.sort(), ['course', 'fitness']);
  assert.equal(normalizeDomainProfile({}, 'I want to learn Blender').primary, 'general');
  assert.equal(normalizeDomainProfile({}, 'I want to train my dog').primary, 'general');
  assert.equal(normalizeDomainProfile({}, 'Build high-converting landing pages').primary, 'general');
});

test('structured resources normalize, dedupe, sanitize URLs, and preserve fixed sequences', () => {
  const resources = normalizeStructuredResources({
    courses:[
      { title:'UI Design Course', url:'https://example.com/course', currentPosition:{ label:'Module 3', index:3 }, totalUnits:12, fixedSequence:true },
      { title:'UI Design Course', url:'https://example.com/course' },
      { title:'Unsafe', url:'javascript:alert(1)' },
    ],
    books:[{ title:'Design Book', pageCount:420, currentPage:40, studyIntention:'Take notes' }],
    programmes:[{ title:'Coach plan', fixedSequence:true, notes:'Keep the order.' }],
  });
  assert.equal(resources.courses.length, 2);
  assert.equal(resources.courses[0].currentPosition.index, 3);
  assert.equal(resources.courses[0].fixedSequence, true);
  assert.equal(resources.courses[1].url, '');
  assert.equal(resources.books[0].pageCount, 420);
  assert.equal(resources.programmes[0].fixedSequence, true);
});

test('confirmed domain resources cannot be overwritten by a later provider brief', () => {
  const base = normalizeConfirmedBrief({
    goal:'Finish a course',
    structuredResources:{ courses:[{ title:'Original Course', fixedSequence:true }] },
    confirmedFields:['courseResource'],
  });
  const merged = mergeBriefPreservingConfirmed(base, {
    structuredResources:{ courses:[{ title:'Different Course', fixedSequence:false }] },
  });
  assert.equal(merged.structuredResources.courses[0].title, 'Original Course');
  assert.equal(merged.structuredResources.courses[0].fixedSequence, true);
});

test('structured clarification answers merge into precise domain fields', () => {
  const brief = normalizeConfirmedBrief({
    goal:'Finish a course and keep running safely',
    clarifyingQuestions:[
      { id:'course', targetField:'courseResource', prompt:'Which course?', type:'resource' },
      { id:'module', targetField:'course.currentPosition.index', prompt:'Current module?', type:'number' },
      { id:'total', targetField:'course.totalUnits', prompt:'Total modules?', type:'number' },
      { id:'fixed', targetField:'course.fixedSequence', prompt:'Fixed order?', type:'yes_no' },
      { id:'baseline', targetField:'fitness.baseline', prompt:'Baseline?', type:'short_text' },
    ],
  });
  const merged = mergeClarificationAnswers(brief, {
    course:{ targetField:'courseResource', value:{ title:'Design Course', url:'https://example.com/course', notes:'Use supplied order' } },
    module:{ targetField:'course.currentPosition.index', value:3 },
    total:{ targetField:'course.totalUnits', value:12 },
    fixed:{ targetField:'course.fixedSequence', value:'yes' },
    baseline:{ targetField:'fitness.baseline', value:'Run 1 km comfortably' },
  });
  assert.equal(merged.structuredResources.courses[0].title, 'Design Course');
  assert.equal(merged.structuredResources.courses[0].currentPosition.index, 3);
  assert.equal(merged.structuredResources.courses[0].totalUnits, 12);
  assert.equal(merged.structuredResources.courses[0].fixedSequence, true);
  assert.equal(merged.fitnessContext.baseline, 'Run 1 km comfortably');
  assert.equal(merged.fitnessContext.limitations, '');
  assert.deepEqual(merged.constraints, []);
});

test('fitness limitations merge separately from fitness baseline', () => {
  const brief = normalizeConfirmedBrief({
    goal:'Run safely',
    clarifyingQuestions:[
      { id:'limits', targetField:'fitness.limitations', prompt:'Limitations?', type:'short_text' },
    ],
  });
  const merged = mergeClarificationAnswers(brief, {
    limits:{ targetField:'fitness.limitations', value:'No hills this month' },
  });
  assert.equal(merged.fitnessContext.baseline, '');
  assert.equal(merged.fitnessContext.limitations, 'No hills this month');
  assert.deepEqual(merged.constraints, ['No hills this month']);
});

test('resource answer payload preserves structured objects while display remains readable', () => {
  const [question] = normalizeClarifyingQuestions([{
    id:'course', targetField:'courseResource', prompt:'Which course?', type:'resource',
  }]);
  const answer = { title:'Course A', url:'https://example.com/a', notes:'Module 2' };
  assert.deepEqual(answerPayloadForQuestion(question, answer), answer);
  assert.equal(answerValueForQuestion(question, answer), 'Course A - https://example.com/a - Module 2');
});

test('Phase 5.5 validation rejects impossible progress and unsafe fitness load', () => {
  const errors = validatePhase55Brief({
    goal:'Finish course and train',
    structuredResources:{
      courses:[{ title:'Course', currentPosition:{ index:14 }, totalUnits:12 }],
      books:[{ title:'Book', currentPage:520, pageCount:420 }],
    },
    fitnessContext:{ activity:'running', frequencyPerWeek:9, sessionMinutes:360 },
  });
  assert.ok(errors.some(error => error.field === 'course.currentPosition.index'));
  assert.ok(errors.some(error => error.field === 'book.currentPage'));
  assert.ok(errors.some(error => error.field === 'fitness.frequencyPerWeek'));
  assert.ok(errors.some(error => error.field === 'fitness.sessionMinutes'));
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

test('generation prompt carries Phase 5.5 domain resources, fitness context, and intensity', () => {
  const input = normalizePrompt({
    confirmedBrief:normalizeConfirmedBrief({
      goal:'Run from 1 km to 15 km while following a course',
      durationDays:84,
      intensity:'intensive',
      domainProfile:{ primary:'fitness', detected:['fitness', 'course'], confidence:'high' },
      structuredResources:{ courses:[{ title:'Running Course', fixedSequence:true, currentPosition:{ label:'Week 2', index:2 } }] },
      fitnessContext:{ activity:'running', baseline:'1 km', target:'15 km', frequencyPerWeek:3, sessionMinutes:45, limitations:'No injury reported' },
    }),
  });
  assert.equal(input.intensity, 'intensive');
  assert.equal(input.domainProfile.primary, 'fitness');
  assert.equal(input.structuredResources.courses[0].title, 'Running Course');
  assert.equal(input.fitnessContext.baseline, '1 km');
  const draft = basicStarterDraft(input);
  assert.equal(draft.resources[0].title, 'Running Course');
  assert.equal(draft.intensity, 'intensive');
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

test('Phase 5.7 platform visibility and stats model supports joinable public pages', () => {
  const viewer = { uid:'viewer' };
  const owner = { uid:'owner' };
  const publicPath = {
    ownerId:'owner', visibility:'public', previewEnabled:true,
    stats:{ joinedCount:4, activeThisWeek:'bad', completedCount:-1, proofSubmissionCount:0 },
  };
  const unlistedPath = { ownerId:'owner', visibility:'unlisted', previewEnabled:false };
  const privatePath = { ownerId:'owner', visibility:'private', previewEnabled:false };
  assert.equal(canPreviewPath(publicPath, null), true);
  assert.equal(canPreviewPath(unlistedPath, null), true);
  assert.equal(canPreviewPath(privatePath, viewer), false);
  assert.equal(canJoinPath(publicPath, null, viewer), true);
  assert.equal(canJoinPath(unlistedPath, null, viewer), true);
  assert.equal(canJoinPath(privatePath, null, viewer), false);
  assert.equal(canJoinPath(publicPath, null, owner), false);
  assert.equal(canJoinPath(publicPath, { uid:'viewer', role:'viewer' }, viewer), false);
  assert.deepEqual(normalizePathStats(publicPath.stats), {
    joinedCount:4,
    activeThisWeek:0,
    completedCount:0,
    proofSubmissionCount:0,
    publicProgressCount:0,
    updatedAt:null,
  });
  assert.equal(normalizePathStats(null, { joinedCount:'9' }).joinedCount, 9);
  assert.equal(normalizePathStats({ joinedCount:'nope' }).joinedCount, 0);
});

test('public page rendering source includes join/share states and sanitized progress timelines', () => {
  const source = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  assert.match(source, /Sign in to join this path/);
  assert.match(source, /Join this path/);
  assert.match(source, /Joining\.\.\./);
  assert.match(source, /Open my path/);
  assert.match(source, /Start Day 1/);
  assert.match(source, /Copy share link/);
  assert.match(source, /Be one of the first to join this path/);
  assert.match(source, /The source path remains owned by/);
  assert.match(source, /includes creator constraints/);
  assert.match(source, /Recent public progress/);
  assert.match(source, /Sanitized learner updates/);
  assert.doesNotMatch(source, /Add comment|Send cheer|React to progress/i);
});

test('discoverable source excludes unlisted/private paths while public cards can show joined count', () => {
  const source = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const showBlock = source.slice(source.indexOf('function shouldShowUserPath'), source.indexOf('function pathCardBlurb'));
  const cardBlock = source.slice(source.indexOf('function pathCardBlurb'), source.indexOf('async function importLocalPath'));
  assert.match(showBlock, /def\.visibility === 'public'/);
  assert.match(showBlock, /def\.discoverable !== false/);
  assert.doesNotMatch(showBlock, /unlisted/);
  assert.match(cardBlock, /joined/);
  assert.match(cardBlock, /normalizePathStats/);
});

test('normalized generated drafts preserve selected-days task settings', () => {
  const input = normalizePrompt({ confirmedBrief:{ goal:'Practice guitar', durationDays:21 } });
  const draft = normalizeDraft({
    title:'Guitar practice', description:'', goal:'Practice guitar', category:'skill',
    durationDays:21, durationLabel:'21 days', difficulty:'beginner', intensity:'balanced',
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
  assert.match(source, /data-goal-suggestion/);
  assert.match(source, /AI_ROTATING_GOAL_EXAMPLES/);
  assert.match(source, /stopAIExampleRotation\(true\)/);
  assert.match(source, /prefers-reduced-motion: reduce|prefers-reduced-motion:reduce/);
  assert.match(source, /name=\"aiIntensityChoice\"/);
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
  assert.match(basicHandler, /createLocalGeneratedDraft\(prompt\)/);
  assert.match(source, /localGeneratedDraft as createLocalGeneratedDraft/);
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
