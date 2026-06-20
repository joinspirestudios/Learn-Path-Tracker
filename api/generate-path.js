import Anthropic from '@anthropic-ai/sdk';
import {
  normalizeConfirmedBrief, unacceptedMaterialAssumptions, validatePhase55Brief,
} from '../src/ai-builder-model.js';
import { intensityPolicySummary } from '../src/intensity-policy.js';
import { safeExternalUrl } from '../src/urls.js';
import { createRouteLogger, elapsedMs, requestBodyBytes, usageFromMessage } from './_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from './_lib/errors.js';
import { boundedArray, boundedText, requireJsonBody } from './_lib/http.js';
import { runProviderRequest } from './_lib/provider.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { requireAuth } from './_lib/require-auth.js';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const INTENSITIES = ['soft', 'balanced', 'intensive'];
const PATH_TYPES = ['skill', 'habit', 'challenge', 'fitness', 'creative_project', 'business', 'academic', 'spiritual/devotional', 'content', 'custom'];
const CADENCE_TYPES = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval', 'once', 'sequential'];
const RECURRING_CADENCES = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval'];
const TASK_MODES = ['fixed_recurring', 'progressive_recurring', 'one_off', 'sequential_learning'];
const PROGRESSION_CURVES = ['linear', 'gradual', 'stepped', 'custom'];
const AI_PROGRESSION_CURVES = [...PROGRESSION_CURVES, 'none'];
const TOOL_NAME = 'create_learning_path';
const MAX_JSON_BYTES = 96 * 1024;
export const AI_SUPPORTING_TASK_LIMIT = 40;
export const GENERATE_TIMEOUT_MS = 180_000;

export const PATH_DRAFT_TOOL = {
  name:TOOL_NAME,
  description:'Create a compact supporting roadmap specification. Do not repeat confirmed Core Commitments.',
  strict:true,
  input_schema:{
    type:'object',
    additionalProperties:false,
    required:['title', 'description', 'sections', 'tasks', 'previewTitle', 'previewDescription', 'notes'],
    properties:{
      title:{ type:'string', description:'Concise roadmap title. The server keeps the confirmed goal and duration.' },
      description:{ type:'string', description:'Concise editable description derived from the confirmed brief.' },
      sections:{
        description:'Roadmap phases. Keep this compact, usually 3 to 6 sections.',
        type:'array',
        items:{
          type:'object', additionalProperties:false,
          required:['title', 'description', 'order'],
          properties:{
            title:{ type:'string' },
            description:{ type:'string' },
            order:{ type:'number', description:'Zero-based display order.' },
          },
        },
      },
      tasks:{
        description:'Supporting task definitions only. Do not create one task per day and do not repeat confirmed Core Commitments. Use at most 40 items.',
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
            startDay:{ type:'number', description:'Use 1 when the task starts at the beginning.' },
            endDay:{ type:'number', description:'Use 0 when not applicable. Recurring tasks may use the final day.' },
            unlockDay:{ type:'number', description:'Use 0 for recurring tasks. One-off tasks use the day they unlock.' },
            daysOfWeek:{ type:'array', items:{ type:'string' } },
            timesPerWeek:{ type:'number', description:'Use 0 when not applicable.' },
            intervalDays:{ type:'number', description:'Use 0 when not applicable.' },
            scheduledDay:{ type:'number', description:'Use 0 when not applicable.' },
            progressionMetric:{ type:'string', description:'Use an empty string when not applicable.' },
            progressionUnit:{ type:'string', description:'Use an empty string when not applicable.' },
            startValue:{ type:'number', description:'Use 0 when not applicable.' },
            targetValue:{ type:'number', description:'Use 0 when not applicable.' },
            progressionCurve:{ type:'string', enum:AI_PROGRESSION_CURVES },
            progressionNotes:{ type:'string', description:'Use an empty string when not applicable.' },
            evidenceRequired:{ type:'boolean' },
            resourceUrl:{ type:'string', description:'Use an empty string unless the user supplied a relevant HTTP or HTTPS URL.' },
            order:{ type:'number', description:'Zero-based display order.' },
          },
        },
      },
      previewTitle:{ type:'string' },
      previewDescription:{ type:'string' },
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
  const structuredResources = confirmedBrief.structuredResources || { courses:[], books:[], programmes:[] };
  return {
    goal:text(confirmedBrief.goal || confirmedBrief.interpretedGoal).slice(0, 700),
    durationDays:suppliedDuration,
    durationWasProvided:!!suppliedDuration,
    deadline:cleanNullableText(confirmedBrief.deadline, 40),
    currentLevel:cleanChoice(confirmedBrief.currentLevel, LEVELS, null),
    intensity:cleanChoice(confirmedBrief.intensity, INTENSITIES, null),
    pathType,
    domainProfile:confirmedBrief.domainProfile || { primary:'general', detected:[], confidence:'low' },
    structuredResources,
    fitnessContext:confirmedBrief.fitnessContext || null,
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
    intensity:confirmedBrief.intensity,
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
    domainProfile:confirmedBrief.domainProfile,
    structuredResources:confirmedBrief.structuredResources,
    fitnessContext:confirmedBrief.fitnessContext,
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
  if(body.aiBrief != null){
    const aiBrief = normalizeConfirmedBrief(body.aiBrief);
    if(JSON.stringify(aiBrief) !== JSON.stringify(confirmedBrief)){
      throw apiError('conflicting_brief_data', 'Conflicting AI brief data was supplied.', 400);
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

function resourcesFromStructured(input){
  const structured = input.structuredResources || {};
  const items = [
    ...(Array.isArray(structured.courses) ? structured.courses : []),
    ...(Array.isArray(structured.books) ? structured.books : []),
    ...(Array.isArray(structured.programmes) ? structured.programmes : []),
  ];
  return items.map((item, index) => ({
    title:text(item.title || item.url || `Resource ${index + 1}`).slice(0, 100),
    url:cleanUrl(item.url) || '',
    description:text([
      item.type ? `${item.type} resource` : 'User-provided resource',
      item.fixedSequence === true ? 'fixed sequence' : '',
      item.currentPosition?.label || item.currentPosition || '',
      item.pageCount ? `${item.pageCount} pages` : '',
      item.notes || item.studyIntention || item.assignmentNotes || '',
    ].filter(Boolean).join(' - ')).slice(0, 300),
  })).filter(item => item.title || item.url || item.description).slice(0, 12);
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
    resources:[...resourcesFromStructured(input), ...parseResources(`${input.resourceLinks || ''} ${input.existingResources || ''}`)].slice(0, 12),
    notes,
  }, input, source);
}

function normalizeTaskMode(value, scheduleType){
  if(TASK_MODES.includes(value)) return value;
  if(scheduleType === 'sequential') return 'sequential_learning';
  return RECURRING_CADENCES.includes(scheduleType) ? 'fixed_recurring' : 'one_off';
}

function normalizeProgressionCurve(value, taskMode){
  if(value == null || value === '' || value === 'none') return null;
  if(PROGRESSION_CURVES.includes(value)) return value;
  return taskMode === 'progressive_recurring' ? 'gradual' : null;
}

function generationValidationError(reason, message = 'The roadmap response could not be validated. Your confirmed brief is still saved.', status = 502){
  return apiError('invalid_provider_response', message, status, { validationReason:reason });
}

function neutralNumber(value, min = null, max = null){
  const number = Number(value);
  if(!Number.isFinite(number) || number === 0) return null;
  return Math.max(min == null ? number : min, Math.min(max == null ? number : max, number));
}

function normalizeSections(rawSections, durationDays){
  if(rawSections != null && !Array.isArray(rawSections)){
    throw generationValidationError('invalid_sections_shape');
  }
  const sections = (Array.isArray(rawSections) ? rawSections : []).slice(0, 12).map((section, index) => {
    if(!section || typeof section !== 'object' || Array.isArray(section)){
      throw generationValidationError('invalid_sections_shape');
    }
    return {
      title:text(section.title, `Section ${index + 1}`).slice(0, 100),
      description:text(section.description).slice(0, 500),
      order:Number.isFinite(Number(section.order)) ? Number(section.order) : index,
    };
  }).filter(section => section.title);
  if(!sections.length){
    if(durationDays > 45){
      sections.push(
        { title:'Foundation', description:'Set up the repeatable rhythm and start safely.', order:0 },
        { title:'Build', description:'Keep the confirmed commitments moving with steady progression.', order:1 },
        { title:'Complete and review', description:'Review adherence and prepare the next step.', order:2 },
      );
    }else{
      sections.push({ title:'Foundation', description:'Start here.', order:0 });
    }
  }
  return sections.sort((a, b) => a.order - b.order);
}

function ensureSection(sections, title, description = ''){
  if(sections.some(section => section.title === title)) return sections;
  return [{ title, description, order:-1 }, ...sections].map((section, index) => ({ ...section, order:index }));
}

function sectionForTask(task, sections, startDay, durationDays){
  const sectionNames = new Set(sections.map(section => section.title));
  if(sectionNames.has(task.sectionTitle)) return task.sectionTitle;
  const index = Math.min(sections.length - 1, Math.floor((startDay - 1) / Math.max(1, Math.ceil(durationDays / sections.length))));
  return sections[index]?.title || 'Foundation';
}

function normalizeSupportingTask(task, index, sections, durationDays){
  if(!task || typeof task !== 'object' || Array.isArray(task)){
    throw generationValidationError('invalid_task_shape');
  }
  const title = text(task.title).slice(0, 140);
  if(!title) throw generationValidationError('invalid_task_shape');
  const scheduleType = cleanChoice(task.scheduleType, CADENCE_TYPES, null);
  if(!scheduleType) throw generationValidationError('invalid_schedule');
  const recurring = RECURRING_CADENCES.includes(scheduleType);
  const startDay = clamp(task.startDay || task.unlockDay || task.scheduledDay || 1, 1, durationDays, 1);
  const endDay = recurring
    ? clamp(neutralNumber(task.endDay, startDay, durationDays) || durationDays, startDay, durationDays, durationDays)
    : null;
  const unlockDay = recurring ? null : clamp(neutralNumber(task.unlockDay, 1, durationDays) || neutralNumber(task.scheduledDay, 1, durationDays) || startDay, 1, durationDays, startDay);
  const taskMode = normalizeTaskMode(task.taskMode, scheduleType);
  return {
    title,
    description:text(task.description).slice(0, 500),
    sectionTitle:sectionForTask(task, sections, startDay, durationDays),
    scheduleType,
    taskMode,
    startDay,
    endDay,
    unlockDay,
    daysOfWeek:(Array.isArray(task.daysOfWeek) ? task.daysOfWeek : []).map(day => text(day).toLowerCase()).filter(Boolean).slice(0, 7),
    timesPerWeek:neutralNumber(task.timesPerWeek, 1, 7),
    intervalDays:neutralNumber(task.intervalDays, 1, 365),
    scheduledDay:neutralNumber(task.scheduledDay, 1, durationDays) || unlockDay,
    progressionMetric:cleanNullableText(task.progressionMetric, 80),
    progressionUnit:cleanNullableText(task.progressionUnit, 40),
    startValue:neutralNumber(task.startValue),
    targetValue:neutralNumber(task.targetValue),
    progressionCurve:normalizeProgressionCurve(task.progressionCurve, taskMode),
    progressionNotes:cleanNullableText(task.progressionNotes, 300),
    evidenceRequired:!!task.evidenceRequired,
    resourceUrl:cleanUrl(task.resourceUrl),
    order:Number.isFinite(Number(task.order)) ? Number(task.order) : index,
  };
}

function normalizeSupportingTasks(rawTasks, sections, durationDays){
  if(rawTasks == null) return [];
  if(!Array.isArray(rawTasks)) throw generationValidationError('invalid_tasks_shape');
  if(rawTasks.length > AI_SUPPORTING_TASK_LIMIT) throw generationValidationError('too_many_tasks');
  return rawTasks.map((task, index) => normalizeSupportingTask(task, index, sections, durationDays))
    .filter(task => task.title)
    .sort((a, b) => a.order - b.order);
}

function reviewMilestones(durationDays, sections, startOrder = 0){
  const days = [];
  const reviewEvery = durationDays >= 90 ? 30 : durationDays >= 45 ? 15 : 7;
  for(let day = reviewEvery; day < durationDays; day += reviewEvery) days.push(day);
  days.push(durationDays);
  return [...new Set(days)].map((day, index) => ({
    title:day === durationDays ? 'Complete a final goal review' : 'Review progress and adjust the next stretch',
    description:day === durationDays
      ? 'Document the outcome, remaining gap, evidence, and next step.'
      : 'Review completed work against the confirmed goal, constraints, and target outcome.',
    sectionTitle:sectionForTask({ sectionTitle:sectionForDay(day, durationDays) }, sections, day, durationDays),
    scheduleType:'once',
    taskMode:'one_off',
    startDay:day,
    endDay:null,
    unlockDay:day,
    daysOfWeek:[],
    timesPerWeek:null,
    intervalDays:null,
    scheduledDay:day,
    progressionMetric:null,
    progressionUnit:null,
    startValue:null,
    targetValue:null,
    progressionCurve:null,
    progressionNotes:null,
    evidenceRequired:false,
    resourceUrl:null,
    order:startOrder + index,
  }));
}

function taskKey(task){
  return text(task.title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mergeTasks(commitmentTasks, supportingTasks){
  const kept = [];
  const confirmedKeys = new Set();
  commitmentTasks.forEach(task => {
    const key = taskKey(task);
    confirmedKeys.add(key);
    kept.push(task);
  });
  supportingTasks.forEach(task => {
    const key = taskKey(task);
    if(!key || confirmedKeys.has(key)) return;
    kept.push(task);
  });
  return kept.map((task, index) => ({ ...task, order:index }));
}

function rawTaskCount(raw){
  return Array.isArray(raw?.tasks) ? raw.tasks.length : 0;
}

function rawSectionCount(raw){
  return Array.isArray(raw?.sections) ? raw.sections.length : 0;
}

export function normalizeDraft(raw, input, source = 'ai'){
  if(!raw || typeof raw !== 'object' || Array.isArray(raw)) throw generationValidationError('invalid_top_level_shape');
  const durationDays = clamp(input.durationDays, 1, 365, 30);
  let sections = normalizeSections(raw.sections, durationDays);
  const commitments = normalizeCommitments(input.coreCommitments.length ? input.coreCommitments : raw.coreCommitments, input.coreCommitments);
  if(commitments.length) sections = ensureSection(sections, 'Foundation', 'Begin with the confirmed recurring commitments.');
  const commitmentTasks = commitments.map((item, index) => commitmentToTask(item, durationDays, index));
  const supportingTasks = normalizeSupportingTasks(raw.tasks, sections, durationDays);
  let recovered = false;
  let tasks = mergeTasks(commitmentTasks, supportingTasks);
  if(!supportingTasks.length && source === 'anthropic' && commitments.length && input.goal && durationDays){
    recovered = true;
    tasks = mergeTasks(commitmentTasks, reviewMilestones(durationDays, sections, commitmentTasks.length));
  }
  if(!tasks.length) throw generationValidationError('empty_tasks');
  const missingCommitment = commitmentTasks.find(task => !tasks.some(item => taskKey(item) === taskKey(task)));
  if(missingCommitment) throw generationValidationError('missing_confirmed_commitment');
  return {
    title:text(raw.title, titleFromGoal(input.goal)).slice(0, 100),
    description:text(raw.description, input.description || input.goal).slice(0, 1000),
    goal:text(input.goal).slice(0, 800),
    category:text(input.pathType).slice(0, 80),
    durationDays,
    durationLabel:text(raw.durationLabel, `${durationDays} days`).slice(0, 80),
    difficulty:input.currentLevel || null,
    intensity:input.intensity || null,
    previewTitle:text(raw.previewTitle, raw.title || titleFromGoal(input.goal)).slice(0, 100),
    previewDescription:text(raw.previewDescription, raw.description || input.goal).slice(0, 500),
    visibility:input.visibility,
    coreCommitments:commitments,
    sections:sections.map((section, index) => ({ ...section, order:index })),
    tasks,
    resources:[...resourcesFromStructured(input), ...parseResources(`${input.resourceLinks || ''} ${input.existingResources || ''}`)].slice(0, 12),
    notes:(Array.isArray(raw.notes) ? raw.notes : []).map(note => text(note).slice(0, 300)).filter(Boolean).slice(0, 10),
    source:recovered ? 'anthropic_recovered' : source,
  };
}

export function buildPrompt(input){
  const intensityPolicy = intensityPolicySummary(input.intensity || 'balanced');
  return [
    'Use the create_learning_path tool and return no prose or markdown.',
    'Return a compact supporting roadmap specification. The server owns the confirmed goal, duration, visibility, resources, and Core Commitments.',
    'Do not include or rewrite Core Commitments in the tool output. They will be converted into tasks deterministically by the server.',
    'Generate reusable supporting task definitions, not one task per calendar day.',
    `Keep supporting tasks between 6 and 30 when useful and never above ${AI_SUPPORTING_TASK_LIMIT}.`,
    'Never insert generic fitness, diet, reading, sleep, deep-work, posting, or wellness habits unless the user goal or confirmed commitments call for them.',
    'Use sections for phases and tasks for supporting milestones, progression work, implementation checks, and review points.',
    'Treat confirmedBrief as the user-confirmed source of truth. Never overwrite its confirmedFields.',
    'Use the supplied confirmed duration. Do not insert a hidden default duration, level, or intensity.',
    'Use intensity as a concrete policy, not display metadata.',
    `Confirmed intensity policy: ${intensityPolicy}`,
    'Soft means fewer daily tasks, more recovery/flexible days, simpler resources, lower daily time load, more optional stretch work, lighter evidence expectations, and a pass threshold around 55%.',
    'Balanced means moderate daily task load, steady progression, clear required work, reasonable optional stretch work, standard evidence expectations, and a pass threshold around 65%.',
    'Intensive means higher daily task load, more focused progression, deeper resources, more output-oriented tasks, stronger proof expectations, fewer low-effort days, and a pass threshold around 75%, while staying achievable and safe.',
    'Intensity should shape number of tasks per day, estimated daily time, task difficulty, optional/stretch work, resource depth, evidence strictness, progression pace, and recovery/flex days.',
    'Intensity must never override safety boundaries, fixed challenge rules, confirmed resources, fixed course or programme sequence, explicit availability, or accepted constraints.',
    'For course goals, organize the confirmed course from current progress. Do not invent lesson names, module titles, or course content.',
    'For book goals, keep reading or study work within confirmed page scope and current progress. Do not invent chapters or editions.',
    'For fitness goals, respect baseline, frequency, session length, recovery, limitations, and safety notes. Do not provide diagnosis or guarantees.',
    'For existing programmes, preserve the programme structure and make supporting tasks secondary.',
    'Only use assumptions whose accepted flag is true. Do not introduce material assumptions that were not reviewed.',
    'Support daily, weekdays, selected_days, times_per_week, weekly, interval, once, and sequential schedules. Preserve legacy daily and once behavior.',
    'Use recurring schedules instead of creating one task per day. Use sequential for ordered learning and once for milestones or deliverables.',
    'Use neutral values for unused fields: 0 for unused numbers, empty string for unused strings, [] for unused arrays, and "none" for unused progressionCurve.',
    'Use progressive_recurring only when a measurable practice should grow over time; otherwise use fixed_recurring.',
    'Honor includeTasks and excludeTasks. Respect preferredSchedule and deadline.',
    'Use only user-provided resource URLs when relevant. Never invent URLs, citations, or web research.',
    'Set evidenceRequired only when proof directly supports the goal or confirmed evidence preferences.',
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

function contentBlockTypes(message){
  return (Array.isArray(message?.content) ? message.content : [])
    .map(block => text(block?.type || 'unknown', 'unknown').slice(0, 40))
    .filter(Boolean);
}

function expectedToolUse(message){
  const blocks = Array.isArray(message && message.content) ? message.content : [];
  return blocks.find(block => block && block.type === 'tool_use' && block.name === TOOL_NAME);
}

function stopReasonDetails(message, validationReason){
  return {
    stopReason:text(message?.stop_reason),
    contentBlockTypes:contentBlockTypes(message),
    toolUseFound:!!expectedToolUse(message),
    validationReason,
  };
}

export function validateGenerationStopReason(message){
  const stopReason = text(message?.stop_reason);
  if(stopReason === 'tool_use') return;
  if(stopReason === 'max_tokens'){
    throw apiError(
      'provider_output_truncated',
      "Claude's roadmap was cut off before it finished. Your confirmed brief is still saved. Please regenerate.",
      502,
      stopReasonDetails(message, 'truncated_output')
    );
  }
  if(stopReason === 'model_context_window_exceeded'){
    throw apiError(
      'provider_context_limit',
      'The roadmap request was too large to complete in one response. Your confirmed brief is still saved.',
      502,
      stopReasonDetails(message, 'context_limit')
    );
  }
  if(stopReason === 'refusal'){
    throw apiError(
      'provider_refusal',
      'Claude could not generate this roadmap as written. Review the brief and try again.',
      422,
      stopReasonDetails(message, 'refusal')
    );
  }
  throw apiError(
    'missing_tool_use',
    'Claude did not return the required roadmap format. Your confirmed brief is still saved. Please regenerate.',
    502,
    stopReasonDetails(message, stopReason ? 'unexpected_stop_reason' : 'missing_stop_reason')
  );
}

function extractDraftInput(message){
  validateGenerationStopReason(message);
  const blocks = Array.isArray(message && message.content) ? message.content : [];
  const toolUse = expectedToolUse(message);
  if(toolUse && toolUse.input && typeof toolUse.input === 'object') return toolUse.input;
  const textContent = blocks.filter(block => block && block.type === 'text').map(block => block.text || '').join('\n');
  if(text(textContent)) return parseJsonTextFallback(textContent);
  throw apiError(
    'missing_tool_use',
    'Claude did not return the required roadmap format. Your confirmed brief is still saved. Please regenerate.',
    502,
    stopReasonDetails(message, 'missing_tool_use')
  );
}

function mapAnthropicError(error){
  if(error?.code === 'provider_timeout') return error;
  const status = Number(error && (error.status || error.statusCode));
  const type = text(error && (error.type || (error.error && error.error.type)));
  if(status === 429 || /rate_limit|quota/i.test(type)) return apiError('provider_unavailable', 'The AI service is rate limited. Try again later.', 503);
  if(status === 401 || status === 403 || /auth|permission/i.test(type)) return apiError('provider_unavailable', 'The AI service is not available because server credentials were rejected.', 503);
  return apiError('provider_unavailable', 'The AI service is temporarily unavailable. Try again later.', 503);
}

export async function callAnthropic(input, signal, client = null){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey && !client) throw apiError('provider_unavailable', 'Anthropic is not configured.', 503);
  const anthropic = client || new Anthropic({ apiKey });
  let message;
  try{
    const stream = anthropic.messages.stream({
      model:process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens:12000,
      temperature:0.35,
      system:'You generate safe, goal-specific, editable path drafts. Use the create_learning_path tool. Never add unrelated generic habits. Do not return prose, markdown, fake citations, or claims of web research.',
      tools:[PATH_DRAFT_TOOL],
      tool_choice:{ type:'tool', name:TOOL_NAME },
      messages:[{ role:'user', content:buildPrompt(input) }],
    }, { signal });
    message = await stream.finalMessage();
  }catch(e){
    if(signal?.aborted) throw e;
    throw mapAnthropicError(e);
  }
  const raw = extractDraftInput(message);
  const usage = usageFromMessage(message);
  if(raw && typeof raw === 'object'){
    Object.defineProperty(raw, '__provider', {
      value:{
        ...usage,
        stopReason:text(message?.stop_reason),
        contentBlockTypes:contentBlockTypes(message),
        toolUseFound:!!expectedToolUse(message),
        rawTaskCount:rawTaskCount(raw),
        rawSectionCount:rawSectionCount(raw),
      },
      enumerable:false,
    });
  }
  if(raw && typeof raw === 'object' && (usage.inputTokens != null || usage.outputTokens != null)){
    Object.defineProperty(raw, '__usage', { value:usage, enumerable:false });
  }
  return raw;
}

export function createGeneratePathHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  provider = callAnthropic,
  runProvider = runProviderRequest,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('generate-path', requestId);
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    setPrivateNoStore(res, requestId);
    log.event('generate_request_started', {
      model,
      requestBodyBytes:requestBodyBytes(req),
      timeoutMs:GENERATE_TIMEOUT_MS,
    });
    if(req.method !== 'POST'){
      res.setHeader('Allow', 'POST');
      log.event('generate_response_sent', { status:405, code:'method_not_allowed', result:'error' });
      return sendApiError(res, apiError('method_not_allowed', 'POST only.', 405), requestId);
    }
    try{
      const auth = await authenticate(req);
      log.event('generate_auth_complete', { result:'ok' });
      const body = requireJsonBody(req, MAX_JSON_BYTES);
      log.event('generate_request_validated', {
        requestBodyBytes:requestBodyBytes(req, body),
        result:'ok',
      });
      if(!body.confirmedBrief || typeof body.confirmedBrief !== 'object'){
        throw apiError('brief_not_confirmed', 'Review and confirm your path brief before generating the roadmap.', 400);
      }
      validateConfirmedBriefInput(body.confirmedBrief);
      const confirmedBrief = normalizeConfirmedBrief(body.confirmedBrief);
      rejectConflictingLegacyFields(body, confirmedBrief);
      const phase55Error = validatePhase55Brief(confirmedBrief)[0];
      if(phase55Error){
        throw apiError('brief_not_confirmed', phase55Error.message, 400, { field:phase55Error.field });
      }
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
      log.event('generate_rate_limit_complete', { result:'ok' });
      const providerStartedAt = Date.now();
      log.event('generate_provider_started', {
        model,
        timeoutMs:GENERATE_TIMEOUT_MS,
        durationDays:input.durationDays,
      });
      let raw;
      try{
        raw = await runProvider(req, GENERATE_TIMEOUT_MS, signal => provider(input, signal));
        log.event('generate_provider_completed', {
          model,
          providerElapsedMs:elapsedMs(providerStartedAt),
          timeoutMs:GENERATE_TIMEOUT_MS,
          durationDays:input.durationDays,
          stopReason:raw?.__provider?.stopReason,
          contentBlockTypes:raw?.__provider?.contentBlockTypes,
          toolUseFound:raw?.__provider?.toolUseFound,
          inputTokens:raw?.__provider?.inputTokens,
          outputTokens:raw?.__provider?.outputTokens,
          result:'ok',
        });
      }catch(error){
        if(error?.code === 'provider_timeout'){
          log.event('generate_provider_timeout', {
            model,
            providerElapsedMs:elapsedMs(providerStartedAt),
            timeoutMs:GENERATE_TIMEOUT_MS,
            providerStatus:504,
            durationDays:input.durationDays,
            result:'timeout',
          }, 'warn');
        }
        if(['provider_output_truncated', 'provider_context_limit', 'provider_refusal', 'missing_tool_use'].includes(error?.code)){
          log.event('generate_validation_failed', {
            stopReason:error.details?.stopReason,
            contentBlockTypes:error.details?.contentBlockTypes,
            toolUseFound:error.details?.toolUseFound,
            validationReason:error.details?.validationReason,
            result:'error',
          }, 'warn');
        }
        throw error;
      }
      let draft;
      log.event('generate_validation_started', {
        rawTaskCount:rawTaskCount(raw),
        rawSectionCount:rawSectionCount(raw),
        result:'ok',
      });
      try{ draft = normalizeDraft(raw, input, 'anthropic'); }
      catch(error){
        log.event('generate_validation_failed', {
          rawTaskCount:rawTaskCount(raw),
          rawSectionCount:rawSectionCount(raw),
          validationReason:error?.details?.validationReason || 'invalid_top_level_shape',
          result:'error',
        }, 'warn');
        throw error instanceof Error && error.code ? error : generationValidationError('invalid_top_level_shape');
      }
      log.event('generate_response_sent', { status:200, result:'ok' });
      const recovered = draft.source === 'anthropic_recovered';
      return sendPrivateJson(res, 200, {
        ok:true,
        draft,
        source:draft.source || 'anthropic',
        message:recovered
          ? "Claude's supporting roadmap was incomplete, so a safe editable draft was recovered from your confirmed commitments."
          : 'Claude draft generated. Review before saving.',
      }, requestId);
    }catch(error){
      log.event('generate_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'provider_timeout' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createGeneratePathHandler();
