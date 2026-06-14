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

export const AI_BUILD_PHASES = [
  'input', 'interpreting', 'clarifying', 'reviewing',
  'generating', 'complete', 'error',
];

export const MAX_AI_CLARIFICATION_ROUNDS = 2;

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
]);

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
  return {
    id:cleanText(source.id, 100) || `question-${targetField || index + 1}`,
    targetField,
    prompt:cleanText(source.prompt || source.question, 260),
    required:source.required !== false,
    reason:cleanText(source.reason, 300),
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
  return {
    ...defaults,
    summary:cleanText(input.summary, 700),
    goal:cleanText(input.goal ?? input.interpretedGoal, 700),
    interpretedGoal:cleanText(input.interpretedGoal ?? input.goal, 700),
    goalCategory:cleanText(input.goalCategory, 100),
    pathType:AI_PATH_TYPES.includes(input.pathType) && input.pathType !== 'auto' ? input.pathType : 'custom',
    currentLevel:['beginner', 'intermediate', 'advanced'].includes(input.currentLevel) ? input.currentLevel : '',
    currentBaseline,
    currentStage:currentBaseline,
    desiredOutcome,
    desiredEndState:desiredOutcome,
    durationDays:cleanNumber(input.durationDays, 1, 365),
    recommendedDurationReason:cleanText(input.recommendedDurationReason, 400),
    intensity:['light', 'moderate', 'intense'].includes(input.intensity) ? input.intensity : '',
    availableTime,
    dailyTimeAvailable:availableTime,
    estimatedDailyMinutes:cleanNumber(input.estimatedDailyMinutes, 0, 1440),
    estimatedWeeklyHours:input.estimatedWeeklyHours == null || input.estimatedWeeklyHours === ''
      ? null
      : Math.max(0, Math.min(168, Number(input.estimatedWeeklyHours) || 0)),
    deadline:cleanText(input.deadline, 60),
    scheduleNotes:cleanText(input.scheduleNotes, 500),
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
  mark('currentLevel', prompt.currentLevel);
  mark('coreCommitments', prompt.coreCommitments);
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
    currentLevel:prompt.currentLevel,
    coreCommitments:prompt.coreCommitments,
    confirmedFields,
  });
}

export function confirmBrief(briefInput = {}){
  const brief = normalizeConfirmedBrief(briefInput);
  brief.briefConfirmed = true;
  brief.confirmedAt = new Date().toISOString();
  return brief;
}

export function canStartAIRequest(state = {}){
  return !state.loading
    && !state.clarifyLoading
    && !['interpreting', 'generating'].includes(state.phase);
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
    knownTasks:[],
    coreCommitments:[],
    milestones:[],
    constraints:[],
    resourcesMentioned:[],
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
