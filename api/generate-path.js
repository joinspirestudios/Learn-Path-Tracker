import Anthropic from '@anthropic-ai/sdk';
import { normalizeConfirmedBrief, unacceptedMaterialAssumptions } from '../src/ai-builder-model.js';
import { safeExternalUrl } from '../src/urls.js';
import { apiError, methodNotAllowed, sendApiError, sendPrivateJson, setPrivateNoStore } from './_lib/errors.js';
import { boundedArray, boundedText, requireJsonBody } from './_lib/http.js';
import { runProviderRequest } from './_lib/provider.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { requireAuth } from './_lib/require-auth.js';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const INTENSITIES = ['light', 'moderate', 'intense'];
const PATH_TYPES = ['skill', 'habit', 'challenge', 'fitness', 'creative_project', 'business', 'academic', 'spiritual/devotional', 'content', 'custom'];
const CADENCE_TYPES = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval', 'once', 'sequential'];
const RECURRING_CADENCES = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval'];
const TASK_MODES = ['fixed_recurring', 'progressive_recurring', 'one_off', 'sequential_learning'];
const PROGRESSION_CURVES = ['linear', 'gradual', 'stepped', 'custom'];
const TOOL_NAME = 'create_learning_path';
const MAX_JSON_BYTES = 96 * 1024;
const GENERATE_TIMEOUT_MS = 55_000;

const nullableNumber = { anyOf: [{ type:'number' }, { type:'null' }] };
const nullableString = { anyOf: [{ type:'string' }, { type:'null' }] };
const cadenceSchema = {
  type:'object',
  additionalProperties:false,
  required:['type', 'daysOfWeek', 'timesPerWeek', 'intervalDays', 'scheduledDay'],
  properties:{
    type:{ type:'string', enum:CADENCE_TYPES },
    daysOfWeek:{ type:'array', items:{ type:'string' } },
    timesPerWeek:nullableNumber,
    intervalDays:nullableNumber,
    scheduledDay:nullableNumber,
  },
};

const commitmentSchema = {
  type:'object',
  additionalProperties:false,
  required:['title', 'description', 'required', 'cadence', 'estimatedMinutes', 'evidenceType', 'reason'],
  properties:{
    title:{ type:'string' },
    description:{ type:'string' },
    required:{ type:'boolean' },
    cadence:cadenceSchema,
    estimatedMinutes:nullableNumber,
    evidenceType:nullableString,
    reason:{ type:'string' },
  },
};

const PATH_DRAFT_TOOL = {
  name:TOOL_NAME,
  description:'Create a structured, goal-specific path draft for the Learn Path Tracker app.',
  input_schema:{
    type:'object',
    additionalProperties:false,
    required:[
      'title', 'description', 'goal', 'category', 'durationDays', 'durationLabel',
      'difficulty', 'intensity', 'previewTitle', 'previewDescription',
      'coreCommitments', 'sections', 'tasks', 'resources', 'notes',
    ],
    properties:{
      title:{ type:'string' },
      description:{ type:'string' },
      goal:{ type:'string' },
      category:{ type:'string' },
      durationDays:{ type:'number', minimum:1, maximum:365 },
      durationLabel:{ type:'string' },
      difficulty:{ anyOf:[{ type:'string', enum:LEVELS }, { type:'null' }] },
      intensity:{ anyOf:[{ type:'string', enum:INTENSITIES }, { type:'null' }] },
      previewTitle:{ type:'string' },
      previewDescription:{ type:'string' },
      coreCommitments:{ type:'array', items:commitmentSchema },
      sections:{
        type:'array',
        items:{
          type:'object', additionalProperties:false,
          required:['title', 'description', 'order'],
          properties:{ title:{ type:'string' }, description:{ type:'string' }, order:{ type:'number' } },
        },
      },
      tasks:{
        type:'array',
        items:{
          type:'object',
          additionalProperties:false,
          required:[
            'title', 'description', 'sectionTitle', 'scheduleType', 'startDay',
            'endDay', 'unlockDay', 'daysOfWeek', 'timesPerWeek', 'intervalDays',
            'scheduledDay', 'taskMode', 'progressionMetric', 'progressionUnit',
            'startValue', 'targetValue', 'progressionCurve', 'progressionNotes',
            'evidenceRequired', 'resourceUrl', 'order',
          ],
          properties:{
            title:{ type:'string' },
            description:{ type:'string' },
            sectionTitle:{ type:'string' },
            scheduleType:{ type:'string', enum:CADENCE_TYPES },
            taskMode:{ type:'string', enum:TASK_MODES },
            startDay:{ type:'number' },
            endDay:nullableNumber,
            unlockDay:nullableNumber,
            daysOfWeek:{ type:'array', items:{ type:'string' } },
            timesPerWeek:nullableNumber,
            intervalDays:nullableNumber,
            scheduledDay:nullableNumber,
            progressionMetric:nullableString,
            progressionUnit:nullableString,
            startValue:nullableNumber,
            targetValue:nullableNumber,
            progressionCurve:{ anyOf:[{ type:'string', enum:PROGRESSION_CURVES }, { type:'null' }] },
            progressionNotes:nullableString,
            evidenceRequired:{ type:'boolean' },
            resourceUrl:nullableString,
            order:{ type:'number' },
          },
        },
      },
      resources:{
        type:'array',
        items:{
          type:'object', additionalProperties:false,
          required:['title', 'url', 'description'],
          properties:{ title:{ type:'string' }, url:nullableString, description:{ type:'string' } },
        },
      },
      notes:{ type:'array', items:{ type:'string' } },
    },
  },
};

function clamp(n, min, max, fallback = min){
  n = Number(n);
  if(!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function text(value, fallback = ''){
  return String(value == null ? fallback : value).trim();
}

function cleanUrl(value){
  return safeExternalUrl(value);
}

function cleanChoice(value, allowed, fallback){
  return allowed.includes(value) ? value : fallback;
}

function cleanNullableText(value, max = 160){
  const cleaned = text(value).slice(0, max);
  return cleaned || null;
}

function cleanNullableNumber(value, min = null, max = null){
  if(value == null || value === '') return null;
  const number = Number(value);
  if(!Number.isFinite(number)) return null;
  return Math.max(min == null ? number : min, Math.min(max == null ? number : max, number));
}

function validateConfirmedBriefInput(raw = {}){
  const textLimits = {
    goal:700, interpretedGoal:700, summary:700, currentBaseline:700,
    currentStage:700, desiredOutcome:700, desiredEndState:700,
    availableTime:120, dailyTimeAvailable:120, scheduleNotes:500,
    evidencePreferences:220, evidencePreference:220,
  };
  Object.entries(textLimits).forEach(([field, max]) => {
    if(raw[field] != null) boundedText(raw[field], field, max);
  });
  const arrayLimits = {
    constraints:12, coreCommitments:16, milestones:16, resources:12,
    resourcesMentioned:12, assumptions:16, progressiveTargets:8,
    knownTasks:16, suggestedEvidenceTypes:12, confirmedFields:32,
  };
  Object.entries(arrayLimits).forEach(([field, max]) => {
    if(raw[field] != null) boundedArray(raw[field], field, max);
  });
}

function normalizeCadence(raw = {}){
  const source = typeof raw === 'string' ? { type:raw } : (raw || {});
  return {
    type:cleanChoice(source.type, CADENCE_TYPES, 'weekly'),
    daysOfWeek:(Array.isArray(source.daysOfWeek) ? source.daysOfWeek : []).map(day => text(day).toLowerCase()).filter(Boolean).slice(0, 7),
    timesPerWeek:cleanNullableNumber(source.timesPerWeek, 1, 7),
    intervalDays:cleanNullableNumber(source.intervalDays, 1, 365),
    scheduledDay:cleanNullableNumber(source.scheduledDay, 1, 365),
  };
}

function normalizeCommitment(raw, index = 0){
  if(typeof raw === 'string') raw = { title:raw, required:true, cadence:{ type:'daily' } };
  raw = raw || {};
  return {
    id:text(raw.id, `commitment-${index + 1}`).slice(0, 80),
    title:text(raw.title || raw.text).slice(0, 140),
    description:text(raw.description).slice(0, 500),
    required:raw.required !== false,
    cadence:normalizeCadence(raw.cadence || raw.scheduleType || raw.schedule),
    estimatedMinutes:cleanNullableNumber(raw.estimatedMinutes, 0, 1440),
    evidenceType:cleanNullableText(raw.evidenceType, 80) || '',
    reason:text(raw.reason).slice(0, 300),
  };
}

function normalizeCommitments(value, legacy = []){
  const source = Array.isArray(value) && value.length ? value : (Array.isArray(legacy) ? legacy : []);
  return source.map(normalizeCommitment).filter(item => item.title).slice(0, 16);
}

export function normalizePrompt(body = {}){
  const confirmedBrief = normalizeConfirmedBrief(body.confirmedBrief || {});
  const suppliedDuration = cleanNullableNumber(confirmedBrief.durationDays, 1, 365);
  const rawType = confirmedBrief.pathType;
  const pathType = rawType === 'auto' ? 'custom' : cleanChoice(rawType, PATH_TYPES, 'custom');
  const coreCommitments = normalizeCommitments(
    confirmedBrief.coreCommitments,
    confirmedBrief.nonNegotiables
  );
  return {
    goal:text(confirmedBrief.goal || confirmedBrief.interpretedGoal).slice(0, 700),
    durationDays:suppliedDuration,
    durationWasProvided:!!suppliedDuration,
    deadline:cleanNullableText(confirmedBrief.deadline, 40),
    currentLevel:cleanChoice(confirmedBrief.currentLevel, LEVELS, null),
    intensity:cleanChoice(confirmedBrief.intensity, INTENSITIES, null),
    pathType,
    preferredSchedule:text(confirmedBrief.scheduleNotes).slice(0, 500),
    resourceLinks:confirmedBrief.resources.map(cleanUrl).filter(Boolean).join('\n').slice(0, 1200),
    currentStage:text(confirmedBrief.currentBaseline).slice(0, 700),
    desiredEndState:text(confirmedBrief.desiredOutcome).slice(0, 700),
    baseline:text(confirmedBrief.currentBaseline).slice(0, 700),
    targetOutcome:text(confirmedBrief.desiredOutcome).slice(0, 700),
    constraints:confirmedBrief.constraints.join('\n').slice(0, 1200),
    existingResources:confirmedBrief.resources.join('\n').slice(0, 1200),
    dailyTime:text(confirmedBrief.availableTime).slice(0, 120),
    evidenceStyle:text(confirmedBrief.evidencePreferences).slice(0, 220),
    includeTasks:text(confirmedBrief.requestedTasks).slice(0, 1200),
    excludeTasks:text(confirmedBrief.excludedTasks).slice(0, 1200),
    visibility:['private', 'unlisted', 'public'].includes(body.saveOptions?.visibility) ? body.saveOptions.visibility : 'private',
    description:text(confirmedBrief.description).slice(0, 700),
    coreCommitments,
    assumptions:confirmedBrief.assumptions,
    progressiveTargets:(Array.isArray(confirmedBrief.progressiveTargets) ? confirmedBrief.progressiveTargets : []).slice(0, 8).map(target => ({
      area:text(target.area).slice(0, 100),
      currentValue:cleanNullableNumber(target.currentValue),
      targetValue:cleanNullableNumber(target.targetValue),
      unit:cleanNullableText(target.unit, 40),
      notes:cleanNullableText(target.notes, 240),
    })).filter(target => target.area || target.notes),
    confirmedBrief,
    clarifiedBrief:confirmedBrief,
  };
}

function comparable(value){
  if(value == null) return '';
  if(typeof value === 'string') return value.trim();
  if(typeof value === 'number' || typeof value === 'boolean') return String(value);
  if(Array.isArray(value) && value.every(item => ['string', 'number', 'boolean'].includes(typeof item))){
    return value.map(item => String(item).trim()).filter(Boolean).join('\n');
  }
  try{ return JSON.stringify(value); }
  catch(error){ return text(value); }
}

function rejectConflictingLegacyFields(body, confirmedBrief){
  const mappings = {
    goal:confirmedBrief.goal,
    interpretedGoal:confirmedBrief.interpretedGoal,
    currentLevel:confirmedBrief.currentLevel,
    currentBaseline:confirmedBrief.currentBaseline,
    desiredOutcome:confirmedBrief.desiredOutcome,
    goalCategory:confirmedBrief.goalCategory,
    pathType:confirmedBrief.pathType,
    durationDays:confirmedBrief.durationDays,
    availableTime:confirmedBrief.availableTime,
    constraints:confirmedBrief.constraints,
    coreCommitments:confirmedBrief.coreCommitments,
    milestones:confirmedBrief.milestones,
    evidencePreferences:confirmedBrief.evidencePreferences,
    scheduleNotes:confirmedBrief.scheduleNotes,
    resources:confirmedBrief.resources,
    description:confirmedBrief.description,
    resourceLinks:confirmedBrief.resources,
    requestedTasks:confirmedBrief.requestedTasks,
    includeTasks:confirmedBrief.requestedTasks,
    excludedTasks:confirmedBrief.excludedTasks,
    excludeTasks:confirmedBrief.excludedTasks,
    assumptions:confirmedBrief.assumptions,
    confirmedFields:confirmedBrief.confirmedFields,
    briefConfirmed:confirmedBrief.briefConfirmed,
  };
  Object.entries(mappings).forEach(([legacyField, canonicalValue]) => {
    if(body[legacyField] == null || body[legacyField] === '') return;
    if(comparable(body[legacyField]) !== comparable(canonicalValue)){
      throw apiError('conflicting_brief_data', `Conflicting ${legacyField} data was supplied outside confirmedBrief.`, 400);
    }
  });
  if(body.clarifiedBrief != null){
    const legacyBrief = normalizeConfirmedBrief(body.clarifiedBrief);
    if(JSON.stringify(legacyBrief) !== JSON.stringify(confirmedBrief)){
      throw apiError('conflicting_brief_data', 'Conflicting legacy brief data was supplied.', 400);
    }
  }
  if(body.visibility != null && body.visibility !== ''){
    const canonicalVisibility = body.saveOptions?.visibility || 'private';
    if(body.visibility !== canonicalVisibility){
      throw apiError('conflicting_brief_data', 'Conflicting visibility data was supplied outside saveOptions.', 400);
    }
  }
}

function titleFromGoal(goal){
  const cleaned = text(goal, 'New learning path').replace(/^i want to\s+/i, '').replace(/\.$/, '');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function sectionForDay(day, durationDays){
  if(day <= Math.ceil(durationDays * 0.33)) return 'Foundation';
  if(day <= Math.ceil(durationDays * 0.66)) return 'Build';
  return 'Complete and review';
}

function commitmentToTask(commitment, durationDays, order){
  const cadence = normalizeCadence(commitment.cadence);
  const recurring = RECURRING_CADENCES.includes(cadence.type);
  const day = clamp(cadence.scheduledDay || 1, 1, durationDays, 1);
  return {
    title:commitment.title,
    description:commitment.description || commitment.reason || 'Complete this goal-specific commitment.',
    sectionTitle:'Foundation',
    scheduleType:cadence.type,
    taskMode:cadence.type === 'sequential' ? 'sequential_learning' : (recurring ? 'fixed_recurring' : 'one_off'),
    startDay:recurring ? 1 : day,
    endDay:recurring ? durationDays : null,
    unlockDay:recurring ? null : day,
    daysOfWeek:cadence.daysOfWeek,
    timesPerWeek:cadence.timesPerWeek,
    intervalDays:cadence.intervalDays,
    scheduledDay:cadence.scheduledDay || (recurring ? null : day),
    progressionMetric:null,
    progressionUnit:null,
    startValue:null,
    targetValue:null,
    progressionCurve:null,
    progressionNotes:null,
    evidenceRequired:!!commitment.evidenceType,
    resourceUrl:null,
    order,
  };
}

function parseResources(raw){
  return text(raw).split(/\s+/).map(cleanUrl).filter(Boolean).slice(0, 8).map((url, index) => ({
    title:`Resource ${index + 1}`,
    url,
    description:'User-provided resource.',
  }));
}

export function basicStarterDraft(input, source = 'fallback'){
  const durationDays = clamp(input.durationDays, 1, 365, 30);
  const title = titleFromGoal(input.goal);
  const sections = [
    { title:'Foundation', description:'Clarify the target and begin the first repeatable actions.', order:0 },
    { title:'Build', description:'Develop the work through goal-specific practice and milestones.', order:1 },
    { title:'Complete and review', description:'Finish the intended outcome and review what should continue.', order:2 },
  ];
  const commitments = input.coreCommitments.length ? input.coreCommitments : [normalizeCommitment({
    title:`Focused progress toward: ${input.goal}`,
    description:'Complete a focused session that directly advances the stated goal.',
    required:true,
    cadence:{ type:'times_per_week', timesPerWeek:3 },
    reason:'Provides a neutral starting rhythm without inventing unrelated habits.',
  })];
  const tasks = commitments.map((item, index) => commitmentToTask(item, durationDays, index));
  const reviewEvery = durationDays >= 90 ? 30 : durationDays >= 45 ? 15 : 7;
  for(let day = reviewEvery; day < durationDays; day += reviewEvery){
    tasks.push({
      title:'Review progress and adjust the next stretch',
      description:'Review completed work against the stated goal, constraints, and target outcome.',
      sectionTitle:sectionForDay(day, durationDays),
      scheduleType:'once', taskMode:'one_off', startDay:day, endDay:null, unlockDay:day,
      daysOfWeek:[], timesPerWeek:null, intervalDays:null, scheduledDay:day,
      progressionMetric:null, progressionUnit:null, startValue:null, targetValue:null,
      progressionCurve:null, progressionNotes:null, evidenceRequired:false, resourceUrl:null, order:tasks.length,
    });
  }
  tasks.push({
    title:'Complete a final goal review',
    description:'Document the outcome, remaining gap, evidence, and next step.',
    sectionTitle:'Complete and review',
    scheduleType:'once', taskMode:'one_off', startDay:durationDays, endDay:null, unlockDay:durationDays,
    daysOfWeek:[], timesPerWeek:null, intervalDays:null, scheduledDay:durationDays,
    progressionMetric:null, progressionUnit:null, startValue:null, targetValue:null,
    progressionCurve:null, progressionNotes:null, evidenceRequired:false, resourceUrl:null, order:tasks.length,
  });
  const notes = ['Basic starter template. Review and edit every recommendation before saving.'];
  if(['fitness', 'challenge'].includes(input.pathType)) notes.push('Adapt physical intensity to your health, ability, and professional guidance.');
  return normalizeDraft({
    title,
    description:input.description || input.goal,
    goal:input.goal,
    category:input.pathType,
    durationDays,
    durationLabel:`${durationDays} days`,
    difficulty:input.currentLevel || null,
    intensity:input.intensity || null,
    previewTitle:title,
    previewDescription:input.description || input.goal,
    coreCommitments:commitments,
    sections,
    tasks,
    resources:parseResources(`${input.resourceLinks || ''} ${input.existingResources || ''}`),
    notes,
  }, input, source);
}

function normalizeTaskMode(value, scheduleType){
  if(TASK_MODES.includes(value)) return value;
  if(scheduleType === 'sequential') return 'sequential_learning';
  return RECURRING_CADENCES.includes(scheduleType) ? 'fixed_recurring' : 'one_off';
}

function normalizeProgressionCurve(value, taskMode){
  if(value == null || value === '') return null;
  if(PROGRESSION_CURVES.includes(value)) return value;
  return taskMode === 'progressive_recurring' ? 'gradual' : null;
}

export function normalizeDraft(raw, input, source = 'ai'){
  if(!raw || typeof raw !== 'object') throw new Error('Generator returned an invalid draft.');
  const durationDays = clamp(raw.durationDays || input.durationDays, 1, 365, 30);
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 12).map((section, index) => ({
    title:text(section.title, `Section ${index + 1}`).slice(0, 100),
    description:text(section.description).slice(0, 500),
    order:Number.isFinite(Number(section.order)) ? Number(section.order) : index,
  })).filter(section => section.title);
  if(!sections.length) sections.push({ title:'Foundation', description:'Start here.', order:0 });
  const sectionNames = new Set(sections.map(section => section.title));
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).slice(0, 100).map((task, index) => {
    const scheduleType = cleanChoice(task.scheduleType, CADENCE_TYPES, 'once');
    const recurring = RECURRING_CADENCES.includes(scheduleType);
    const startDay = clamp(task.startDay || task.unlockDay || task.scheduledDay || 1, 1, durationDays, 1);
    const endDay = recurring ? clamp(task.endDay || durationDays, startDay, durationDays, durationDays) : null;
    const unlockDay = recurring ? null : clamp(task.unlockDay || task.scheduledDay || startDay, 1, durationDays, startDay);
    const sectionTitle = sectionNames.has(task.sectionTitle)
      ? task.sectionTitle
      : sections[Math.min(sections.length - 1, Math.floor((startDay - 1) / Math.max(1, Math.ceil(durationDays / sections.length))))].title;
    const taskMode = normalizeTaskMode(task.taskMode, scheduleType);
    return {
      title:text(task.title, `Task ${index + 1}`).slice(0, 140),
      description:text(task.description).slice(0, 500),
      sectionTitle,
      scheduleType,
      taskMode,
      startDay,
      endDay,
      unlockDay,
      daysOfWeek:(Array.isArray(task.daysOfWeek) ? task.daysOfWeek : []).map(day => text(day).toLowerCase()).filter(Boolean).slice(0, 7),
      timesPerWeek:cleanNullableNumber(task.timesPerWeek, 1, 7),
      intervalDays:cleanNullableNumber(task.intervalDays, 1, 365),
      scheduledDay:cleanNullableNumber(task.scheduledDay, 1, durationDays) || unlockDay,
      progressionMetric:cleanNullableText(task.progressionMetric, 80),
      progressionUnit:cleanNullableText(task.progressionUnit, 40),
      startValue:cleanNullableNumber(task.startValue),
      targetValue:cleanNullableNumber(task.targetValue),
      progressionCurve:normalizeProgressionCurve(task.progressionCurve, taskMode),
      progressionNotes:cleanNullableText(task.progressionNotes, 300),
      evidenceRequired:!!task.evidenceRequired,
      resourceUrl:cleanUrl(task.resourceUrl),
      order:Number.isFinite(Number(task.order)) ? Number(task.order) : index,
    };
  }).filter(task => task.title);
  if(!tasks.length) throw new Error('Generator returned no usable tasks.');
  return {
    title:text(raw.title, titleFromGoal(input.goal)).slice(0, 100),
    description:text(raw.description, input.description || input.goal).slice(0, 1000),
    goal:text(raw.goal, input.goal).slice(0, 800),
    category:text(raw.category, input.pathType).slice(0, 80),
    durationDays,
    durationLabel:text(raw.durationLabel, `${durationDays} days`).slice(0, 80),
    difficulty:cleanChoice(raw.difficulty, LEVELS, input.currentLevel || null),
    intensity:cleanChoice(raw.intensity, INTENSITIES, input.intensity || null),
    previewTitle:text(raw.previewTitle, raw.title || titleFromGoal(input.goal)).slice(0, 100),
    previewDescription:text(raw.previewDescription, raw.description || input.goal).slice(0, 500),
    visibility:input.visibility,
    coreCommitments:normalizeCommitments(raw.coreCommitments, input.coreCommitments),
    sections:sections.sort((a, b) => a.order - b.order),
    tasks:tasks.sort((a, b) => a.order - b.order),
    resources:(Array.isArray(raw.resources) ? raw.resources : []).slice(0, 12).map((resource, index) => ({
      title:text(resource.title, `Resource ${index + 1}`).slice(0, 100),
      url:cleanUrl(resource.url),
      description:text(resource.description).slice(0, 300),
    })).filter(resource => resource.title || resource.url || resource.description),
    notes:(Array.isArray(raw.notes) ? raw.notes : []).map(note => text(note).slice(0, 300)).filter(Boolean).slice(0, 10),
    source,
  };
}

function buildPrompt(input){
  return [
    'Use the create_learning_path tool and return no prose or markdown.',
    'Build a goal-agnostic but goal-specific roadmap: derive the plan only from the stated goal, confirmed core commitments, desired outcome, constraints, schedule, resources, and progressive targets.',
    'Never insert generic fitness, diet, reading, sleep, deep-work, posting, or wellness habits unless the user goal or confirmed commitments call for them.',
    'Treat coreCommitments as confirmed requirements. Preserve their cadence, required flag, estimated time, and evidence intent unless safety requires a labeled adjustment.',
    'If coreCommitments is empty, recommend only the minimum goal-specific actions needed. Do not invent a challenge ritual.',
    'Treat confirmedBrief as the user-confirmed source of truth. Never overwrite its confirmedFields.',
    'Use the supplied confirmed duration. Do not insert a hidden default duration, level, or intensity.',
    'Only use assumptions whose accepted flag is true. Do not introduce material assumptions that were not reviewed.',
    'Support daily, weekdays, selected_days, times_per_week, weekly, interval, once, and sequential schedules. Preserve legacy daily and once behavior.',
    'Use recurring schedules instead of creating one task per day. Use sequential for ordered learning and once for milestones or deliverables.',
    'Use progressive_recurring only when a measurable practice should grow over time; otherwise use fixed_recurring.',
    'Honor includeTasks and excludeTasks. Respect preferredSchedule and deadline.',
    'Use user-provided resource URLs without claiming to have opened or verified them. Never invent URLs, citations, or web research.',
    'Set evidenceRequired only when proof directly supports the goal or a confirmed commitment.',
    'For fitness or health-related goals, avoid unsafe progression and add a concise safety note.',
    'Keep the plan editable, realistic, and within 1-365 days.',
    `Input: ${JSON.stringify(input)}`,
  ].join('\n');
}

function parseJsonTextFallback(content){
  let trimmed = text(content);
  if(!trimmed) throw apiError('invalid_provider_response', 'Claude returned an empty response.', 502);
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if(first >= 0 && last > first) trimmed = trimmed.slice(first, last + 1);
  try{ return JSON.parse(trimmed); }
  catch(e){ throw apiError('invalid_provider_response', 'Claude returned invalid JSON. Please regenerate.', 502); }
}

function extractDraftInput(message){
  const blocks = Array.isArray(message && message.content) ? message.content : [];
  const toolUse = blocks.find(block => block && block.type === 'tool_use' && block.name === TOOL_NAME);
  if(toolUse && toolUse.input && typeof toolUse.input === 'object') return toolUse.input;
  const textContent = blocks.filter(block => block && block.type === 'text').map(block => block.text || '').join('\n');
  if(text(textContent)) return parseJsonTextFallback(textContent);
  throw apiError('invalid_provider_response', 'Claude did not return the required structured path draft. Please regenerate.', 502);
}

function mapAnthropicError(error){
  if(error?.code === 'provider_timeout') return error;
  const status = Number(error && (error.status || error.statusCode));
  const type = text(error && (error.type || (error.error && error.error.type)));
  if(status === 429 || /rate_limit|quota/i.test(type)) return apiError('provider_unavailable', 'The AI service is rate limited. Try again later.', 503);
  if(status === 401 || status === 403 || /auth|permission/i.test(type)) return apiError('provider_unavailable', 'The AI service is not available because server credentials were rejected.', 503);
  return apiError('provider_unavailable', 'The AI service is temporarily unavailable. Try again later.', 503);
}

export async function callAnthropic(input, signal){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) throw apiError('provider_unavailable', 'Anthropic is not configured.', 503);
  const anthropic = new Anthropic({ apiKey });
  let message;
  try{
    message = await anthropic.messages.create({
      model:process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens:7000,
      temperature:0.35,
      system:'You generate safe, goal-specific, editable path drafts. Use the create_learning_path tool. Never add unrelated generic habits. Do not return prose, markdown, fake citations, or claims of web research.',
      tools:[PATH_DRAFT_TOOL],
      tool_choice:{ type:'tool', name:TOOL_NAME },
      messages:[{ role:'user', content:buildPrompt(input) }],
    }, { signal });
  }catch(e){
    if(signal?.aborted) throw e;
    throw mapAnthropicError(e);
  }
  return extractDraftInput(message);
}

export function createGeneratePathHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  provider = callAnthropic,
  runProvider = runProviderRequest,
} = {}){
  return async function handler(req, res){
    setPrivateNoStore(res);
    if(req.method !== 'POST') return methodNotAllowed(res);
    try{
      const auth = await authenticate(req);
      const body = requireJsonBody(req, MAX_JSON_BYTES);
      if(!body.confirmedBrief || typeof body.confirmedBrief !== 'object'){
        throw apiError('brief_not_confirmed', 'Review and confirm your path brief before generating the roadmap.', 400);
      }
      validateConfirmedBriefInput(body.confirmedBrief);
      const confirmedBrief = normalizeConfirmedBrief(body.confirmedBrief);
      rejectConflictingLegacyFields(body, confirmedBrief);
      if(!confirmedBrief.briefConfirmed || !confirmedBrief.confirmedAt){
        throw apiError('brief_not_confirmed', 'Review and confirm your path brief before generating the roadmap.', 400);
      }
      if(unacceptedMaterialAssumptions(confirmedBrief).length){
        throw apiError('brief_not_confirmed', 'Accept, edit, or remove every material assumption before generating.', 400);
      }
      boundedText(confirmedBrief.goal, 'Goal', 700, { required:true });
      const input = normalizePrompt({ ...body, confirmedBrief });
      if(!input.durationWasProvided){
        throw apiError('brief_not_confirmed', 'Set a duration in the confirmed brief before generating a roadmap.', 400);
      }
      await rateLimit(auth.uid, 'generate');
      const raw = await runProvider(req, GENERATE_TIMEOUT_MS, signal => provider(input, signal));
      let draft;
      try{ draft = normalizeDraft(raw, input, 'anthropic'); }
      catch(error){ throw apiError('invalid_provider_response', 'Claude returned a path draft that could not be validated. Please regenerate.', 502); }
      return sendPrivateJson(res, 200, { ok:true, draft, source:'anthropic', message:'Claude draft generated. Review before saving.' });
    }catch(error){
      return sendApiError(res, error);
    }
  };
}

export default createGeneratePathHandler();
