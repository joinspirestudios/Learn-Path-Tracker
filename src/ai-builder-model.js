import { safeExternalUrl } from './urls.js';

export const AI_PATH_TYPES = [
  'auto', 'skill', 'habit', 'challenge', 'fitness', 'creative_project',
  'business', 'academic', 'spiritual/devotional', 'content', 'custom',
];

export const AI_CADENCE_TYPES = [
  'daily', 'weekdays', 'selected_days', 'times_per_week',
  'weekly', 'interval', 'once', 'sequential',
];

export const AI_TASK_MODES = [
  'fixed_recurring', 'progressive_recurring', 'one_off', 'sequential_learning',
];

export const AI_PROGRESSION_CURVES = ['linear', 'gradual', 'stepped', 'custom'];

export const AI_DOMAIN_TYPES = ['general', 'course', 'book', 'fitness'];

export const AI_DOMAIN_CONFIDENCE = ['low', 'medium', 'high'];

export const AI_INTENSITY_LEVELS = ['soft', 'balanced', 'intensive'];

export const AI_INTENSITY_DETAILS = {
  soft:'Lower load, more recovery, fewer required tasks, and lighter evidence expectations.',
  balanced:'Steady load, practical progression, regular recovery, and evidence where it helps the goal.',
  intensive:'Higher load, more frequent work, tighter milestones, and stronger proof expectations where safe.',
};

export const AI_BUILD_PHASES = [
  'goal', 'interpreting', 'clarifying', 'rhythm', 'brief',
  'generating', 'preview', 'saving', 'ready', 'error',
];

export const AI_GUIDED_STAGES = ['Goal', 'Details', 'Plan', 'Preview', 'Ready'];

export const AI_QUESTION_TYPES = [
  'single_select', 'multi_select', 'short_text', 'long_text', 'number',
  'duration', 'date', 'days_of_week', 'time_availability', 'yes_no', 'resource',
];

export const MAX_AI_CLARIFICATION_ROUNDS = 2;

export const AI_REQUEST_KINDS = ['voice', 'interpret', 'generate'];

function cleanText(value, max = 300){
  return String(value == null ? '' : value).trim().slice(0, max);
}

function cleanNumber(value, min = 0, max = 10000){
  if(value == null || value === '') return null;
  const number = Number(value);
  if(!Number.isFinite(number)) return null;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function cleanArray(value, maxItems = 16, maxText = 500){
  return (Array.isArray(value) ? value : [])
    .map(item => cleanText(item, maxText))
    .filter(Boolean)
    .slice(0, maxItems);
}

const ANSWER_TARGETS = new Set([
  'currentBaseline', 'desiredOutcome', 'durationDays', 'availableTime',
  'constraints', 'scheduleNotes', 'evidencePreferences', 'resources',
  'intensity', 'courseResource', 'bookResource', 'programmeResource',
  'fitnessContext',
]);

const LEGACY_INTENSITY_MAP = {
  light:'soft',
  moderate:'balanced',
  intense:'intensive',
};

const DOMAIN_HINTS = {
  course:/\b(course|lesson|module|class|certification|curriculum|instructor|udemy|coursera|edx|skillshare|bootcamp)\b/i,
  book:/\b(book|pages?|chapter|author|edition|read and study|study a)\b/i,
  fitness:/\b(run|running|5k|10k|15k|marathon|gym|workout|strength|mobility|train|training|athletic|cycling|swim|baseline)\b/i,
  programme:/\b(programme|program|coach|coach-created|fixed plan|training plan|challenge)\b/i,
};

export function normalizeIntensity(value){
  const key = cleanText(value, 40).toLowerCase();
  return AI_INTENSITY_LEVELS.includes(key) ? key : (LEGACY_INTENSITY_MAP[key] || 'balanced');
}

export function intensityLabel(value){
  const normalized = normalizeIntensity(value);
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeDomainValue(value){
  const normalized = cleanText(value, 40).toLowerCase().replace('reading', 'book');
  return AI_DOMAIN_TYPES.includes(normalized) ? normalized : 'general';
}

function domainSignalsFromText(textValue = ''){
  const text = cleanText(textValue, 4000);
  const detected = [];
  if(DOMAIN_HINTS.course.test(text)) detected.push('course');
  if(DOMAIN_HINTS.book.test(text) && !/\bread\b.{0,40}\b(each|every|daily|habit)\b/i.test(text)) detected.push('book');
  if(DOMAIN_HINTS.fitness.test(text)) detected.push('fitness');
  return detected;
}

export function normalizeDomainProfile(raw = {}, goalText = ''){
  const supplied = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const detected = [...new Set([
    ...(Array.isArray(supplied.detected) ? supplied.detected.map(normalizeDomainValue) : []),
    ...domainSignalsFromText(goalText),
  ].filter(value => value && value !== 'general'))].slice(0, 4);
  let primary = normalizeDomainValue(supplied.primary);
  if(primary === 'general' && detected.length === 1) primary = detected[0];
  if(primary !== 'general' && !detected.includes(primary)) detected.unshift(primary);
  const confidence = AI_DOMAIN_CONFIDENCE.includes(supplied.confidence) ? supplied.confidence : (detected.length ? 'medium' : 'low');
  return { primary, detected:[...new Set(detected)].slice(0, 4), confidence };
}

function stableResourceId(type, raw = {}, index = 0){
  const base = cleanText(raw.id, 80)
    || [type, raw.title, raw.url, raw.platform, raw.author, raw.name, index + 1].filter(Boolean).join('-');
  return cleanText(base, 120).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `${type}-${index + 1}`;
}

function boolOrNull(value){
  if(value === true || value === 'true' || value === 'yes' || value === 'fixed') return true;
  if(value === false || value === 'false' || value === 'no' || value === 'flexible') return false;
  return null;
}

function cleanDate(value){
  const cleaned = cleanText(value, 60);
  return /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : cleaned;
}

export function normalizeCourseResource(raw = {}, index = 0){
  const source = typeof raw === 'string' ? { title:raw } : (raw || {});
  return {
    id:stableResourceId('course', source, index),
    type:'course',
    title:cleanText(source.title || source.name, 160),
    instructor:cleanText(source.instructor, 120),
    platform:cleanText(source.platform, 120),
    url:safeExternalUrl(source.url) || '',
    currentPosition:{
      label:cleanText(source.currentPosition?.label || source.currentModule || source.currentLesson || source.currentPosition, 160),
      index:cleanNumber(source.currentPosition?.index ?? source.currentIndex, 0, 10000),
    },
    totalUnits:cleanNumber(source.totalUnits ?? source.totalModules ?? source.totalLessons, 1, 10000),
    typicalLessonMinutes:cleanNumber(source.typicalLessonMinutes ?? source.lessonMinutes, 1, 1440),
    hasAssignments:boolOrNull(source.hasAssignments),
    assignmentNotes:cleanText(source.assignmentNotes || source.assignments, 400),
    targetCompletionDate:cleanDate(source.targetCompletionDate || source.deadline),
    fixedSequence:boolOrNull(source.fixedSequence),
    notes:cleanText(source.notes, 500),
  };
}

export function normalizeBookResource(raw = {}, index = 0){
  const source = typeof raw === 'string' ? { title:raw } : (raw || {});
  return {
    id:stableResourceId('book', source, index),
    type:'book',
    title:cleanText(source.title || source.name, 160),
    author:cleanText(source.author, 120),
    edition:cleanText(source.edition, 80),
    pageCount:cleanNumber(source.pageCount ?? source.pages, 1, 100000),
    currentPage:cleanNumber(source.currentPage, 0, 100000),
    targetCompletionDate:cleanDate(source.targetCompletionDate || source.deadline),
    studyIntention:cleanText(source.studyIntention || source.intention, 220),
    notesOrExercises:cleanText(source.notesOrExercises || source.exercises || source.notes, 400),
    pagesPerSession:cleanNumber(source.pagesPerSession, 1, 10000),
    minutesPerSession:cleanNumber(source.minutesPerSession, 1, 1440),
    format:cleanText(source.format, 80),
  };
}

export function normalizeProgrammeResource(raw = {}, index = 0){
  const source = typeof raw === 'string' ? { title:raw } : (raw || {});
  return {
    id:stableResourceId('programme', source, index),
    type:'programme',
    title:cleanText(source.title || source.name, 160),
    source:cleanText(source.source || source.creator || source.coach, 160),
    url:safeExternalUrl(source.url) || '',
    fixedSequence:boolOrNull(source.fixedSequence ?? source.fixed),
    currentPosition:cleanText(source.currentPosition || source.currentWeek || source.currentDay, 160),
    totalUnits:cleanNumber(source.totalUnits ?? source.totalWeeks ?? source.totalDays, 1, 10000),
    notes:cleanText(source.notes || source.description, 700),
  };
}

function dedupeResources(items){
  const seen = new Set();
  return items.filter(item => {
    const key = [item.type, item.title?.toLowerCase(), item.url?.toLowerCase(), item.author?.toLowerCase()].filter(Boolean).join('|') || item.id;
    if(seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeStructuredResources(raw = {}){
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    courses:dedupeResources((Array.isArray(source.courses) ? source.courses : []).map(normalizeCourseResource).filter(item => item.title || item.url || item.notes)).slice(0, 6),
    books:dedupeResources((Array.isArray(source.books) ? source.books : []).map(normalizeBookResource).filter(item => item.title || item.author || item.pageCount)).slice(0, 6),
    programmes:dedupeResources((Array.isArray(source.programmes || source.programs) ? (source.programmes || source.programs) : []).map(normalizeProgrammeResource).filter(item => item.title || item.notes || item.url)).slice(0, 6),
  };
}

export function normalizeFitnessContext(raw = {}){
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const context = {
    activity:cleanText(raw.activity, 120),
    baseline:cleanText(raw.baseline || raw.currentBaseline, 220),
    target:cleanText(raw.target || raw.desiredOutcome, 220),
    frequencyPerWeek:cleanNumber(raw.frequencyPerWeek ?? raw.sessionsPerWeek, 0, 14),
    sessionMinutes:cleanNumber(raw.sessionMinutes ?? raw.minutesPerSession, 0, 300),
    equipment:cleanText(raw.equipment, 220),
    limitations:cleanText(raw.limitations || raw.constraints, 400),
    safetyNotes:cleanText(raw.safetyNotes, 400),
  };
  return Object.values(context).some(value => value != null && value !== '') ? context : null;
}

function normalizeQuestionOption(raw = {}, index = 0){
  const source = typeof raw === 'string' ? { label:raw, value:raw } : (raw || {});
  const label = cleanText(source.label ?? source.value, 120);
  return {
    id:cleanText(source.id, 80) || `option-${index + 1}`,
    label,
    value:cleanText(source.value ?? source.label, 300) || label,
  };
}

export function normalizeBriefAssumption(raw = {}, index = 0){
  const source = typeof raw === 'string' ? { text:raw } : (raw || {});
  const field = cleanText(source.field || source.targetField, 80);
  return {
    id:cleanText(source.id, 100) || `assumption-${index + 1}`,
    field,
    text:cleanText(source.text || source.label || source.value, 300),
    accepted:source.accepted === true,
    source:['ai', 'user', 'system'].includes(source.source) ? source.source : 'ai',
    material:source.material !== false,
  };
}

export function normalizeBriefAssumptions(value){
  return (Array.isArray(value) ? value : [])
    .map(normalizeBriefAssumption)
    .filter(item => item.text)
    .slice(0, 16);
}

export function normalizeClarifyingQuestion(raw = {}, index = 0){
  const source = typeof raw === 'string' ? { prompt:raw } : (raw || {});
  const targetField = ANSWER_TARGETS.has(source.targetField) ? source.targetField : '';
  const options = (Array.isArray(source.options) ? source.options : [])
    .map(normalizeQuestionOption)
    .filter(option => option.label)
    .slice(0, 8);
  let type = AI_QUESTION_TYPES.includes(source.type) ? source.type : '';
  if(!type) type = options.length ? 'single_select' : 'long_text';
  return {
    id:cleanText(source.id, 100) || `question-${targetField || index + 1}`,
    targetField,
    prompt:cleanText(source.prompt || source.question, 260),
    supportingText:cleanText(source.supportingText || source.helpText, 300),
    type,
    required:source.required !== false,
    reason:cleanText(source.reason || source.materialReason, 300),
    materialReason:cleanText(source.materialReason || source.reason, 300),
    options,
    allowCustomAnswer:source.allowCustomAnswer !== false && ['single_select', 'multi_select'].includes(type),
  };
}

export function normalizeClarifyingQuestions(value){
  return (Array.isArray(value) ? value : [])
    .map(normalizeClarifyingQuestion)
    .filter(item => item.prompt)
    .slice(0, 5);
}

function legacyCommitment(value, index){
  return {
    id:`legacy-${index + 1}`,
    title:cleanText(value, 140),
    description:'',
    required:true,
    cadence:{ type:'daily', daysOfWeek:[], timesPerWeek:null, intervalDays:null, scheduledDay:null },
    estimatedMinutes:null,
    evidenceType:'',
    reason:'',
  };
}

export function normalizeCommitmentCadence(raw = {}){
  const source = typeof raw === 'string' ? { type:raw } : (raw || {});
  const type = AI_CADENCE_TYPES.includes(source.type) ? source.type : 'weekly';
  return {
    type,
    daysOfWeek:(Array.isArray(source.daysOfWeek) ? source.daysOfWeek : [])
      .map(day => cleanText(day, 12).toLowerCase())
      .filter(Boolean)
      .slice(0, 7),
    timesPerWeek:cleanNumber(source.timesPerWeek, 1, 7),
    intervalDays:cleanNumber(source.intervalDays, 1, 365),
    scheduledDay:cleanNumber(source.scheduledDay, 1, 365),
  };
}

export function normalizeCoreCommitment(raw = {}, index = 0){
  if(typeof raw === 'string') return legacyCommitment(raw, index);
  const title = cleanText(raw.title || raw.text, 140);
  return {
    id:cleanText(raw.id, 80) || `commitment-${index + 1}`,
    title,
    description:cleanText(raw.description, 500),
    required:raw.required !== false,
    cadence:normalizeCommitmentCadence(raw.cadence || raw.scheduleType || raw.schedule),
    estimatedMinutes:cleanNumber(raw.estimatedMinutes, 0, 1440),
    evidenceType:cleanText(raw.evidenceType, 80),
    reason:cleanText(raw.reason, 300),
  };
}

export function normalizeCoreCommitments(value, legacy = []){
  const source = Array.isArray(value) && value.length
    ? value
    : (Array.isArray(legacy) ? legacy : []);
  return source
    .map(normalizeCoreCommitment)
    .filter(commitment => commitment.title)
    .slice(0, 16);
}

export function emptyCoreCommitment(index = 0){
  return normalizeCoreCommitment({
    id:`commitment-${Date.now().toString(36)}-${index}`,
    title:'',
    required:true,
    cadence:{ type:'weekly' },
  }, index);
}

export function aiPromptDefaults(){
  return {
    goal:'',
    durationDays:null,
    deadline:'',
    currentLevel:'',
    currentStage:'',
    desiredEndState:'',
    baseline:'',
    targetOutcome:'',
    constraints:'',
    preferredSchedule:'',
    existingResources:'',
    intensity:'',
    pathType:'auto',
    resourceLinks:'',
    dailyTime:'',
    evidenceStyle:'',
    includeTasks:'',
    excludeTasks:'',
    visibility:'private',
    description:'',
    coreCommitments:[],
    assumptions:[],
    progressiveTargets:[],
    clarifiedBrief:null,
    confirmedBrief:null,
  };
}

export function isMeaningfulAIGoal(value){
  const cleaned = cleanText(value, 4000);
  return cleaned.length >= 3 && /[a-z0-9]{2}/i.test(cleaned);
}

export function routeInterpretedBrief(brief = {}, clarificationRound = 0){
  const questions = Array.isArray(brief.clarifyingQuestions)
    ? normalizeClarifyingQuestions(brief.clarifyingQuestions)
    : [];
  if(brief.readyToGenerate || !questions.length || clarificationRound >= MAX_AI_CLARIFICATION_ROUNDS){
    return 'reviewing';
  }
  return 'clarifying';
}

export function creationStageForPhase(phase = 'goal'){
  if(['goal', 'interpreting'].includes(phase)) return 'Goal';
  if(phase === 'clarifying') return 'Details';
  if(['rhythm', 'brief', 'generating'].includes(phase)) return 'Plan';
  if(['preview', 'saving'].includes(phase)) return 'Preview';
  if(phase === 'ready') return 'Ready';
  return 'Goal';
}

export function answerValueForQuestion(questionInput = {}, answer = {}){
  const question = normalizeClarifyingQuestion(questionInput);
  if(answer == null) return '';
  if(typeof answer !== 'object') return cleanText(answer, 700);
  const selected = Array.isArray(answer.selected) ? answer.selected : (answer.selected ? [answer.selected] : []);
  const values = selected.map(id => question.options.find(option => option.id === id)?.value || id).filter(Boolean);
  const custom = cleanText(answer.custom ?? answer.value ?? answer.answer, 700);
  return [...values, custom].filter(Boolean).join('; ').slice(0, 700);
}

export function cadenceLabel(cadenceInput = {}){
  const cadence = normalizeCommitmentCadence(cadenceInput);
  if(cadence.type === 'daily') return 'Every day';
  if(cadence.type === 'weekdays') return 'On weekdays';
  if(cadence.type === 'selected_days'){
    const days = cadence.daysOfWeek.map(day => day.slice(0, 3)).join(', ');
    return days ? `On ${days}` : 'On selected days';
  }
  if(cadence.type === 'times_per_week') return `${cadence.timesPerWeek || 1} ${cadence.timesPerWeek === 1 ? 'time' : 'times'} each week`;
  if(cadence.type === 'weekly') return 'Once each week';
  if(cadence.type === 'interval') return `Every ${cadence.intervalDays || 2} days`;
  if(cadence.type === 'once') return cadence.scheduledDay ? `Once on day ${cadence.scheduledDay}` : 'One time';
  if(cadence.type === 'sequential') return cadence.scheduledDay ? `In sequence from day ${cadence.scheduledDay}` : 'In sequence';
  return 'Flexible schedule';
}

export function commitmentSummary(commitmentInput = {}, index = 0){
  const commitment = normalizeCoreCommitment(commitmentInput, index);
  const time = commitment.estimatedMinutes ? `${commitment.estimatedMinutes} minutes` : '';
  return {
    title:commitment.title,
    rhythm:[time, cadenceLabel(commitment.cadence)].filter(Boolean).join(' - '),
    required:commitment.required,
  };
}

export function assumptionsForFinalClarification(brief = {}){
  const assumptions = normalizeBriefAssumptions(brief.assumptions);
  const missing = Array.isArray(brief.missingCriticalInfo) ? brief.missingCriticalInfo : [];
  missing.forEach((item, index) => {
    const note = `Review needed: ${cleanText(item, 180)}`;
    if(note !== 'Review needed: ' && !assumptions.some(entry => entry.text === note)){
      assumptions.push(normalizeBriefAssumption({
        id:`assumption-review-${index + 1}`,
        text:note,
        accepted:false,
        source:'system',
        material:true,
      }, assumptions.length));
    }
  });
  return assumptions.slice(0, 16);
}

export function unacceptedMaterialAssumptions(brief = {}){
  return normalizeBriefAssumptions(brief.assumptions)
    .filter(item => item.material && !item.accepted);
}

export function normalizeConfirmedBrief(input = {}){
  const defaults = aiBriefDefaults();
  const currentBaseline = cleanText(input.currentBaseline ?? input.currentStage, 700);
  const desiredOutcome = cleanText(input.desiredOutcome ?? input.desiredEndState, 700);
  const availableTime = cleanText(input.availableTime ?? input.dailyTimeAvailable, 120);
  const evidencePreferences = cleanText(input.evidencePreferences ?? input.evidencePreference, 220);
  const resources = cleanArray(input.resources ?? input.resourcesMentioned, 12, 300);
  const goal = cleanText(input.goal ?? input.interpretedGoal, 700);
  const domainProfile = normalizeDomainProfile(input.domainProfile, [goal, input.summary, currentBaseline, desiredOutcome, resources.join(' ')].filter(Boolean).join(' '));
  const structuredResources = normalizeStructuredResources(input.structuredResources || input.resourceProfile || {});
  const fitnessContext = normalizeFitnessContext(input.fitnessContext);
  if(!structuredResources.courses.length && domainProfile.detected.includes('course') && resources.length){
    structuredResources.courses = resources.slice(0, 3).map((item, index) => normalizeCourseResource(item, index));
  }
  if(!structuredResources.books.length && domainProfile.detected.includes('book') && resources.length){
    structuredResources.books = resources.slice(0, 3).map((item, index) => normalizeBookResource(item, index));
  }
  if(!structuredResources.programmes.length && (DOMAIN_HINTS.programme.test(goal) || DOMAIN_HINTS.programme.test(resources.join(' ')))){
    structuredResources.programmes = resources.slice(0, 3).map((item, index) => normalizeProgrammeResource(item, index));
  }
  return {
    ...defaults,
    summary:cleanText(input.summary, 700),
    goal,
    interpretedGoal:cleanText(input.interpretedGoal ?? input.goal, 700),
    goalCategory:cleanText(input.goalCategory, 100),
    pathType:AI_PATH_TYPES.includes(input.pathType) && input.pathType !== 'auto' ? input.pathType : 'custom',
    domainProfile,
    structuredResources,
    fitnessContext,
    currentLevel:['beginner', 'intermediate', 'advanced'].includes(input.currentLevel) ? input.currentLevel : '',
    currentBaseline,
    currentStage:currentBaseline,
    desiredOutcome,
    desiredEndState:desiredOutcome,
    durationDays:cleanNumber(input.durationDays, 1, 365),
    recommendedDurationReason:cleanText(input.recommendedDurationReason, 400),
    intensity:normalizeIntensity(input.intensity),
    availableTime,
    dailyTimeAvailable:availableTime,
    estimatedDailyMinutes:cleanNumber(input.estimatedDailyMinutes, 0, 1440),
    estimatedWeeklyHours:input.estimatedWeeklyHours == null || input.estimatedWeeklyHours === ''
      ? null
      : Math.max(0, Math.min(168, Number(input.estimatedWeeklyHours) || 0)),
    deadline:cleanText(input.deadline, 60),
    scheduleNotes:cleanText(input.scheduleNotes, 500),
    description:cleanText(input.description, 700),
    requestedTasks:cleanText(input.requestedTasks ?? input.includeTasks, 1200),
    excludedTasks:cleanText(input.excludedTasks ?? input.excludeTasks, 1200),
    knownTasks:cleanArray(input.knownTasks, 16, 180),
    coreCommitments:normalizeCoreCommitments(input.coreCommitments, input.nonNegotiables),
    milestones:cleanArray(input.milestones, 16, 260),
    constraints:cleanArray(input.constraints, 12, 260),
    resources,
    resourcesMentioned:resources,
    evidencePreferences,
    evidencePreference:evidencePreferences,
    suggestedEvidenceTypes:cleanArray(input.suggestedEvidenceTypes, 12, 120),
    progressiveTargets:(Array.isArray(input.progressiveTargets) ? input.progressiveTargets : []).slice(0, 8),
    assumptions:normalizeBriefAssumptions(input.assumptions),
    materialGaps:cleanArray(input.materialGaps ?? input.missingCriticalInfo, 10, 180),
    missingCriticalInfo:cleanArray(input.materialGaps ?? input.missingCriticalInfo, 10, 180),
    clarifyingQuestions:normalizeClarifyingQuestions(input.clarifyingQuestions),
    answerMap:input.answerMap && typeof input.answerMap === 'object' ? { ...input.answerMap } : {},
    confirmedFields:cleanArray(input.confirmedFields, 32, 80),
    confidence:Math.max(0, Math.min(1, Number(input.confidence) || 0)),
    readyToGenerate:input.readyToGenerate === true,
    briefConfirmed:input.briefConfirmed === true,
    confirmedAt:cleanText(input.confirmedAt, 60) || null,
  };
}

function setAnswerTarget(brief, targetField, value){
  const cleaned = cleanText(value, 700);
  if(!cleaned || !ANSWER_TARGETS.has(targetField)) return;
  if(targetField === 'currentBaseline') brief.currentBaseline = brief.currentStage = cleaned;
  if(targetField === 'desiredOutcome') brief.desiredOutcome = brief.desiredEndState = cleaned;
  if(targetField === 'durationDays') brief.durationDays = cleanNumber(cleaned, 1, 365);
  if(targetField === 'availableTime') brief.availableTime = brief.dailyTimeAvailable = cleaned;
  if(targetField === 'scheduleNotes') brief.scheduleNotes = cleaned;
  if(targetField === 'evidencePreferences') brief.evidencePreferences = brief.evidencePreference = cleaned;
  if(targetField === 'constraints') brief.constraints = cleanArray([...brief.constraints, cleaned], 12, 260);
  if(targetField === 'resources') brief.resources = brief.resourcesMentioned = cleanArray([...brief.resources, cleaned], 12, 300);
  if(targetField === 'intensity') brief.intensity = normalizeIntensity(cleaned);
  if(targetField === 'courseResource'){
    brief.structuredResources.courses = dedupeResources([...brief.structuredResources.courses, normalizeCourseResource(cleaned, brief.structuredResources.courses.length)]).slice(0, 6);
    brief.resources = brief.resourcesMentioned = cleanArray([...brief.resources, cleaned], 12, 300);
    brief.domainProfile = normalizeDomainProfile({ ...brief.domainProfile, detected:[...brief.domainProfile.detected, 'course'] }, brief.goal);
  }
  if(targetField === 'bookResource'){
    brief.structuredResources.books = dedupeResources([...brief.structuredResources.books, normalizeBookResource(cleaned, brief.structuredResources.books.length)]).slice(0, 6);
    brief.resources = brief.resourcesMentioned = cleanArray([...brief.resources, cleaned], 12, 300);
    brief.domainProfile = normalizeDomainProfile({ ...brief.domainProfile, detected:[...brief.domainProfile.detected, 'book'] }, brief.goal);
  }
  if(targetField === 'programmeResource'){
    brief.structuredResources.programmes = dedupeResources([...brief.structuredResources.programmes, normalizeProgrammeResource(cleaned, brief.structuredResources.programmes.length)]).slice(0, 6);
    brief.resources = brief.resourcesMentioned = cleanArray([...brief.resources, cleaned], 12, 300);
  }
  if(targetField === 'fitnessContext'){
    const next = normalizeFitnessContext({ ...(brief.fitnessContext || {}), baseline:cleaned, limitations:cleaned });
    brief.fitnessContext = next;
    brief.constraints = cleanArray([...brief.constraints, cleaned], 12, 260);
    brief.domainProfile = normalizeDomainProfile({ ...brief.domainProfile, detected:[...brief.domainProfile.detected, 'fitness'] }, brief.goal);
  }
}

export function mergeClarificationAnswers(briefInput = {}, answers = {}){
  const brief = normalizeConfirmedBrief(briefInput);
  const questions = normalizeClarifyingQuestions(brief.clarifyingQuestions);
  const source = Array.isArray(answers)
    ? Object.fromEntries(answers.map((item, index) => [item.id || questions[index]?.id || `question-${index + 1}`, item]))
    : (answers || {});
  questions.forEach(question => {
    const raw = source[question.id];
    const value = cleanText(typeof raw === 'object' ? raw.value ?? raw.answer : raw, 700);
    if(!value) return;
    const targetField = (typeof raw === 'object' && ANSWER_TARGETS.has(raw.targetField))
      ? raw.targetField
      : question.targetField;
    brief.answerMap[question.id] = { targetField, value };
    setAnswerTarget(brief, targetField, value);
    if(targetField && !brief.confirmedFields.includes(targetField)) brief.confirmedFields.push(targetField);
  });
  return brief;
}

function confirmedValue(brief, field){
  if(field === 'currentBaseline') return brief.currentBaseline;
  if(field === 'desiredOutcome') return brief.desiredOutcome;
  if(field === 'availableTime') return brief.availableTime;
  if(field === 'evidencePreferences') return brief.evidencePreferences;
  if(field === 'resources') return brief.resources;
  if(field === 'courseResource') return brief.structuredResources?.courses;
  if(field === 'bookResource') return brief.structuredResources?.books;
  if(field === 'programmeResource') return brief.structuredResources?.programmes;
  if(field === 'fitnessContext') return brief.fitnessContext;
  return brief[field];
}

export function mergeBriefPreservingConfirmed(baseInput = {}, proposedInput = {}){
  const base = normalizeConfirmedBrief(baseInput);
  const proposed = normalizeConfirmedBrief({ ...base, ...proposedInput });
  base.confirmedFields.forEach(field => {
    const value = confirmedValue(base, field);
    if(value == null || value === '') return;
    if(field === 'constraints') proposed.constraints = [...base.constraints];
    else if(field === 'resources') proposed.resources = proposed.resourcesMentioned = [...base.resources];
    else if(field === 'courseResource') proposed.structuredResources.courses = [...base.structuredResources.courses];
    else if(field === 'bookResource') proposed.structuredResources.books = [...base.structuredResources.books];
    else if(field === 'programmeResource') proposed.structuredResources.programmes = [...base.structuredResources.programmes];
    else if(field === 'fitnessContext') proposed.fitnessContext = base.fitnessContext ? { ...base.fitnessContext } : null;
    else setAnswerTarget(proposed, field, value);
    if(!ANSWER_TARGETS.has(field)) proposed[field] = Array.isArray(value) ? [...value] : value;
  });
  proposed.confirmedFields = [...new Set([...base.confirmedFields, ...proposed.confirmedFields])];
  proposed.answerMap = { ...base.answerMap, ...proposed.answerMap };
  return proposed;
}

export function briefFromPrompt(prompt = {}){
  const confirmedFields = [];
  const mark = (field, value) => { if(value != null && value !== '' && (!Array.isArray(value) || value.length)) confirmedFields.push(field); };
  mark('goal', prompt.goal);
  if(prompt.pathType && prompt.pathType !== 'auto') mark('pathType', prompt.pathType);
  mark('durationDays', prompt.durationDays);
  mark('currentBaseline', prompt.currentStage || prompt.baseline);
  mark('desiredOutcome', prompt.desiredEndState || prompt.targetOutcome);
  mark('availableTime', prompt.dailyTime);
  mark('constraints', prompt.constraints);
  mark('scheduleNotes', prompt.preferredSchedule);
  mark('evidencePreferences', prompt.evidenceStyle);
  mark('resources', prompt.existingResources || prompt.resourceLinks);
  mark('intensity', prompt.intensity);
  if(prompt.structuredResources) mark('structuredResources', prompt.structuredResources);
  if(prompt.fitnessContext) mark('fitnessContext', prompt.fitnessContext);
  mark('currentLevel', prompt.currentLevel);
  mark('coreCommitments', prompt.coreCommitments);
  mark('description', prompt.description);
  mark('requestedTasks', prompt.includeTasks);
  mark('excludedTasks', prompt.excludeTasks);
  return normalizeConfirmedBrief({
    goal:prompt.goal,
    interpretedGoal:prompt.goal,
    pathType:prompt.pathType,
    durationDays:prompt.durationDays,
    currentBaseline:prompt.currentStage || prompt.baseline,
    desiredOutcome:prompt.desiredEndState || prompt.targetOutcome,
    availableTime:prompt.dailyTime,
    constraints:cleanArray(String(prompt.constraints || '').split(/\r?\n/), 12, 260),
    scheduleNotes:prompt.preferredSchedule,
    evidencePreferences:prompt.evidenceStyle,
    resources:cleanArray(String(prompt.existingResources || prompt.resourceLinks || '').split(/\r?\n/), 12, 300),
    intensity:prompt.intensity,
    structuredResources:prompt.structuredResources,
    fitnessContext:prompt.fitnessContext,
    currentLevel:prompt.currentLevel,
    coreCommitments:prompt.coreCommitments,
    description:prompt.description,
    requestedTasks:prompt.includeTasks,
    excludedTasks:prompt.excludeTasks,
    confirmedFields,
  });
}

export function confirmBrief(briefInput = {}){
  const brief = normalizeConfirmedBrief(briefInput);
  brief.briefConfirmed = true;
  brief.confirmedAt = new Date().toISOString();
  return brief;
}

export function createAIRequestState(){
  return Object.fromEntries(AI_REQUEST_KINDS.map(kind => [kind, {
    token:0,
    controller:null,
    loading:false,
  }]));
}

export function hasActiveAIRequest(requests = {}){
  return AI_REQUEST_KINDS.some(kind => requests?.[kind]?.loading === true);
}

export function canStartAIRequest(state = {}){
  return !hasActiveAIRequest(state.requests)
    && !state.loading
    && !state.clarifyLoading
    && !['interpreting', 'generating'].includes(state.phase);
}

export function beginAIRequest(requests, kind, controller = null){
  if(!AI_REQUEST_KINDS.includes(kind)) throw new Error('Unknown AI request kind.');
  const slot = requests[kind] || { token:0, controller:null, loading:false };
  slot.controller?.abort?.();
  slot.token += 1;
  slot.controller = controller;
  slot.loading = true;
  requests[kind] = slot;
  return slot.token;
}

export function finishAIRequest(requests, kind, token){
  const slot = requests?.[kind];
  if(!slot || slot.token !== token) return false;
  slot.controller = null;
  slot.loading = false;
  return true;
}

export function cancelAIRequests(requests = {}){
  AI_REQUEST_KINDS.forEach(kind => {
    const slot = requests[kind] || { token:0, controller:null, loading:false };
    slot.controller?.abort?.();
    slot.token += 1;
    slot.controller = null;
    slot.loading = false;
    requests[kind] = slot;
  });
  return requests;
}

export function recoverAIBuilderState(state = {}, error = '', phase = 'error'){
  return {
    ...state,
    phase,
    error:cleanText(error, 500),
    loading:false,
    clarifyLoading:false,
  };
}

export function aiBriefDefaults(){
  return {
    summary:'',
    goal:'',
    goalCategory:'',
    pathType:'custom',
    currentLevel:'',
    currentStage:'',
    desiredEndState:'',
    durationDays:null,
    recommendedDurationReason:'',
    intensity:'',
    dailyTimeAvailable:'',
    estimatedDailyMinutes:null,
    estimatedWeeklyHours:null,
    deadline:'',
    scheduleNotes:'',
    description:'',
    requestedTasks:'',
    excludedTasks:'',
    knownTasks:[],
    coreCommitments:[],
    milestones:[],
    constraints:[],
    resourcesMentioned:[],
    domainProfile:{ primary:'general', detected:[], confidence:'low' },
    structuredResources:{ courses:[], books:[], programmes:[] },
    fitnessContext:null,
    evidencePreference:'',
    suggestedEvidenceTypes:[],
    progressiveTargets:[],
    assumptions:[],
    materialGaps:[],
    missingCriticalInfo:[],
    clarifyingQuestions:[],
    answerMap:{},
    confirmedFields:[],
    confidence:0,
    readyToGenerate:false,
    briefConfirmed:false,
    confirmedAt:null,
  };
}
