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
  };
}

export function isMeaningfulAIGoal(value){
  const cleaned = cleanText(value, 4000);
  return cleaned.length >= 3 && /[a-z0-9]{2}/i.test(cleaned);
}

export function routeInterpretedBrief(brief = {}, clarificationRound = 0){
  const questions = Array.isArray(brief.clarifyingQuestions)
    ? brief.clarifyingQuestions.filter(question => cleanText(question, 240))
    : [];
  if(brief.readyToGenerate || !questions.length || clarificationRound >= MAX_AI_CLARIFICATION_ROUNDS){
    return 'reviewing';
  }
  return 'clarifying';
}

export function assumptionsForFinalClarification(brief = {}){
  const assumptions = Array.isArray(brief.assumptions) ? [...brief.assumptions] : [];
  const missing = Array.isArray(brief.missingCriticalInfo) ? brief.missingCriticalInfo : [];
  missing.forEach(item => {
    const note = `Review needed: ${cleanText(item, 180)}`;
    if(note !== 'Review needed: ' && !assumptions.includes(note)) assumptions.push(note);
  });
  return assumptions.slice(0, 16);
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
    missingCriticalInfo:[],
    clarifyingQuestions:[],
    confidence:0,
    readyToGenerate:false,
  };
}
