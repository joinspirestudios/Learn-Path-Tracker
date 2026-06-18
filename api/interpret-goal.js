import Anthropic from '@anthropic-ai/sdk';
import {
  AI_ANSWER_TARGETS, briefFromPrompt, mergeBriefPreservingConfirmed, mergeClarificationAnswers,
  normalizeBriefAssumptions, normalizeClarifyingQuestions, normalizeConfirmedBrief,
} from '../src/ai-builder-model.js';
import { createRouteLogger, elapsedMs, requestBodyBytes, usageFromMessage } from './_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from './_lib/errors.js';
import { boundedArray, boundedText, requireJsonBody } from './_lib/http.js';
import { runProviderRequest } from './_lib/provider.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { requireAuth } from './_lib/require-auth.js';

const PATH_TYPES = ['skill', 'habit', 'challenge', 'fitness', 'creative_project', 'business', 'academic', 'spiritual/devotional', 'content', 'custom'];
const INTENSITIES = ['soft', 'balanced', 'intensive'];
const DOMAINS = ['general', 'course', 'book', 'fitness'];
const DOMAIN_CONFIDENCE = ['low', 'medium', 'high'];
const CADENCE_TYPES = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval', 'once', 'sequential'];
const QUESTION_TYPES = ['single_select', 'multi_select', 'short_text', 'long_text', 'number', 'duration', 'date', 'days_of_week', 'time_availability', 'yes_no', 'resource'];
const TOOL_NAME = 'interpret_goal_brief';
const MAX_JSON_BYTES = 64 * 1024;
export const INTERPRET_TIMEOUT_MS = 90_000;

const nullableNumber = { anyOf:[{ type:'number' }, { type:'null' }] };
const nullableString = { anyOf:[{ type:'string' }, { type:'null' }] };
const cadenceSchema = {
  type:'object', additionalProperties:false,
  required:['type', 'daysOfWeek', 'timesPerWeek', 'intervalDays', 'scheduledDay'],
  properties:{
    type:{ type:'string', enum:CADENCE_TYPES },
    daysOfWeek:{ type:'array', items:{ type:'string' } },
    timesPerWeek:nullableNumber, intervalDays:nullableNumber, scheduledDay:nullableNumber,
  },
};
const commitmentSchema = {
  type:'object', additionalProperties:false,
  required:['title', 'description', 'required', 'cadence', 'estimatedMinutes', 'evidenceType', 'reason'],
  properties:{
    title:{ type:'string' }, description:{ type:'string' }, required:{ type:'boolean' },
    cadence:cadenceSchema, estimatedMinutes:nullableNumber, evidenceType:nullableString, reason:{ type:'string' },
  },
};
const assumptionSchema = {
  type:'object', additionalProperties:false,
  required:['id', 'field', 'text', 'accepted', 'source', 'material'],
  properties:{
    id:{ type:'string' }, field:{ type:'string' }, text:{ type:'string' },
    accepted:{ type:'boolean' }, source:{ type:'string', enum:['ai', 'user', 'system'] }, material:{ type:'boolean' },
  },
};
const questionSchema = {
  type:'object', additionalProperties:false,
  required:['id', 'targetField', 'prompt', 'supportingText', 'type', 'required', 'materialReason', 'options', 'allowCustomAnswer'],
  properties:{
    id:{ type:'string' },
    targetField:{ type:'string', enum:AI_ANSWER_TARGETS },
    prompt:{ type:'string' }, supportingText:{ type:'string' }, type:{ type:'string', enum:QUESTION_TYPES },
    required:{ type:'boolean' }, materialReason:{ type:'string' },
    options:{
      type:'array', items:{
        type:'object', additionalProperties:false,
        required:['id', 'label', 'value'],
        properties:{ id:{ type:'string' }, label:{ type:'string' }, value:{ type:'string' } },
      },
    },
    allowCustomAnswer:{ type:'boolean' },
  },
};

const domainProfileSchema = {
  type:'object', additionalProperties:false,
  required:['primary', 'detected', 'confidence'],
  properties:{
    primary:{ type:'string', enum:DOMAINS },
    detected:{ type:'array', items:{ type:'string', enum:DOMAINS } },
    confidence:{ type:'string', enum:DOMAIN_CONFIDENCE },
  },
};

const courseResourceSchema = {
  type:'object', additionalProperties:false,
  required:['id', 'type', 'title', 'instructor', 'platform', 'url', 'currentPosition', 'totalUnits', 'typicalLessonMinutes', 'hasAssignments', 'assignmentNotes', 'targetCompletionDate', 'fixedSequence', 'notes'],
  properties:{
    id:{ type:'string' }, type:{ type:'string', enum:['course'] }, title:{ type:'string' }, instructor:{ type:'string' }, platform:{ type:'string' }, url:{ type:'string' },
    currentPosition:{
      type:'object', additionalProperties:false, required:['label', 'index'],
      properties:{ label:{ type:'string' }, index:nullableNumber },
    },
    totalUnits:nullableNumber, typicalLessonMinutes:nullableNumber,
    hasAssignments:{ anyOf:[{ type:'boolean' }, { type:'null' }] },
    assignmentNotes:{ type:'string' }, targetCompletionDate:{ type:'string' },
    fixedSequence:{ anyOf:[{ type:'boolean' }, { type:'null' }] },
    notes:{ type:'string' },
  },
};

const bookResourceSchema = {
  type:'object', additionalProperties:false,
  required:['id', 'type', 'title', 'author', 'edition', 'pageCount', 'currentPage', 'targetCompletionDate', 'studyIntention', 'notesOrExercises', 'pagesPerSession', 'minutesPerSession', 'format'],
  properties:{
    id:{ type:'string' }, type:{ type:'string', enum:['book'] }, title:{ type:'string' }, author:{ type:'string' }, edition:{ type:'string' },
    pageCount:nullableNumber, currentPage:nullableNumber, targetCompletionDate:{ type:'string' },
    studyIntention:{ type:'string' }, notesOrExercises:{ type:'string' },
    pagesPerSession:nullableNumber, minutesPerSession:nullableNumber, format:{ type:'string' },
  },
};

const programmeResourceSchema = {
  type:'object', additionalProperties:false,
  required:['id', 'type', 'title', 'source', 'url', 'fixedSequence', 'currentPosition', 'totalUnits', 'notes'],
  properties:{
    id:{ type:'string' }, type:{ type:'string', enum:['programme'] }, title:{ type:'string' }, source:{ type:'string' }, url:{ type:'string' },
    fixedSequence:{ anyOf:[{ type:'boolean' }, { type:'null' }] },
    currentPosition:{ type:'string' }, totalUnits:nullableNumber, notes:{ type:'string' },
  },
};

const structuredResourcesSchema = {
  type:'object', additionalProperties:false,
  required:['courses', 'books', 'programmes'],
  properties:{
    courses:{ type:'array', items:courseResourceSchema },
    books:{ type:'array', items:bookResourceSchema },
    programmes:{ type:'array', items:programmeResourceSchema },
  },
};

const fitnessContextSchema = {
  anyOf:[
    { type:'null' },
    {
      type:'object', additionalProperties:false,
      required:['activity', 'baseline', 'target', 'frequencyPerWeek', 'sessionMinutes', 'equipment', 'limitations', 'safetyNotes'],
      properties:{
        activity:{ type:'string' }, baseline:{ type:'string' }, target:{ type:'string' },
        frequencyPerWeek:nullableNumber, sessionMinutes:nullableNumber,
        equipment:{ type:'string' }, limitations:{ type:'string' }, safetyNotes:{ type:'string' },
      },
    },
  ],
};

const GOAL_BRIEF_TOOL = {
  name:TOOL_NAME,
  description:'Interpret a goal into a neutral structured brief and ask only material questions.',
  input_schema:{
    type:'object', additionalProperties:false,
    required:[
      'summary', 'goal', 'goalCategory', 'pathType', 'currentStage', 'desiredEndState',
      'durationDays', 'recommendedDurationReason', 'intensity', 'dailyTimeAvailable',
      'estimatedDailyMinutes', 'estimatedWeeklyHours', 'deadline', 'scheduleNotes',
      'domainProfile', 'structuredResources', 'fitnessContext',
      'knownTasks', 'coreCommitments', 'milestones', 'constraints', 'resourcesMentioned',
      'evidencePreference', 'suggestedEvidenceTypes', 'progressiveTargets', 'assumptions',
      'materialGaps', 'clarifyingQuestions', 'confidence', 'readyToGenerate',
    ],
    properties:{
      summary:{ type:'string' }, goal:{ type:'string' }, goalCategory:{ type:'string' },
      pathType:{ type:'string', enum:PATH_TYPES }, currentStage:nullableString, desiredEndState:nullableString,
      domainProfile:domainProfileSchema,
      structuredResources:structuredResourcesSchema,
      fitnessContext:fitnessContextSchema,
      durationDays:{ anyOf:[{ type:'number', minimum:1, maximum:365 }, { type:'null' }] },
      recommendedDurationReason:{ type:'string' },
      intensity:{ anyOf:[{ type:'string', enum:INTENSITIES }, { type:'null' }] },
      dailyTimeAvailable:nullableString, estimatedDailyMinutes:nullableNumber, estimatedWeeklyHours:nullableNumber,
      deadline:nullableString, scheduleNotes:{ type:'string' }, knownTasks:{ type:'array', items:{ type:'string' } },
      coreCommitments:{ type:'array', items:commitmentSchema }, milestones:{ type:'array', items:{ type:'string' } },
      constraints:{ type:'array', items:{ type:'string' } }, resourcesMentioned:{ type:'array', items:{ type:'string' } },
      evidencePreference:nullableString, suggestedEvidenceTypes:{ type:'array', items:{ type:'string' } },
      progressiveTargets:{
        type:'array', items:{
          type:'object', additionalProperties:false,
          required:['area', 'currentValue', 'targetValue', 'unit', 'notes'],
          properties:{ area:{ type:'string' }, currentValue:nullableNumber, targetValue:nullableNumber, unit:nullableString, notes:nullableString },
        },
      },
      assumptions:{ type:'array', items:assumptionSchema },
      materialGaps:{ type:'array', items:{ type:'string' } },
      clarifyingQuestions:{ type:'array', items:questionSchema },
      confidence:{ type:'number', minimum:0, maximum:1 }, readyToGenerate:{ type:'boolean' },
    },
  },
};

function text(value, fallback = ''){
  return String(value == null ? fallback : value).trim();
}

function cleanNumber(value, min = null, max = null, round = true){
  if(value == null || value === '') return null;
  const number = Number(value);
  if(!Number.isFinite(number)) return null;
  const bounded = Math.max(min == null ? number : min, Math.min(max == null ? number : max, number));
  return round ? Math.round(bounded) : bounded;
}

function cleanArray(value, maxItems = 10, maxText = 260){
  return (Array.isArray(value) ? value : []).map(item => text(item).slice(0, maxText)).filter(Boolean).slice(0, maxItems);
}

export function normalizeBrief(raw = {}){
  const brief = normalizeConfirmedBrief({
    ...raw,
    materialGaps:cleanArray(raw.materialGaps ?? raw.missingCriticalInfo, 10, 180),
    assumptions:normalizeBriefAssumptions(raw.assumptions),
    clarifyingQuestions:normalizeClarifyingQuestions(raw.clarifyingQuestions),
  });
  brief.summary = text(raw.summary).slice(0, 700) || brief.goal;
  brief.goal = text(raw.goal).slice(0, 700) || brief.summary;
  brief.interpretedGoal = brief.goal;
  brief.confidence = cleanNumber(raw.confidence, 0, 1, false) || 0;
  brief.readyToGenerate = raw.readyToGenerate === true;
  if(!brief.goal) throw apiError('invalid_provider_response', 'The AI returned an incomplete goal brief. Please retry.', 502);
  if(brief.materialGaps.length && !brief.clarifyingQuestions.length){
    brief.clarifyingQuestions = brief.materialGaps.slice(0, 5).map((gap, index) => ({
      id:`question-gap-${index + 1}`,
      targetField:'constraints',
      prompt:`What should the roadmap account for regarding ${gap}?`,
      supportingText:'Share only what would change the plan.',
      type:'long_text',
      required:true,
      materialReason:'This information materially changes the roadmap.',
      options:[],
      allowCustomAnswer:false,
    }));
  }
  if(brief.materialGaps.length) brief.readyToGenerate = false;
  return brief;
}

function normalizeAnswerPayload(value){
  if(value == null) return '';
  if(typeof value !== 'object') return boundedText(value, 'answer', 700, { required:true });
  let serialized = '';
  try{ serialized = JSON.stringify(value); }
  catch(error){ throw apiError('invalid_request', 'Answer must be valid JSON.', 400); }
  if(serialized.length > 4096) throw apiError('invalid_request', 'Answer is too large.', 400);
  return JSON.parse(serialized);
}

function normalizeAnswers(value){
  const items = boundedArray(value, 'answers', 8);
  return Object.fromEntries(items.map((item, index) => {
    const id = boundedText(item?.id || `question-${index + 1}`, 'answer id', 100, { required:true });
    return [id, {
      targetField:boundedText(item?.targetField, 'answer target field', 80),
      value:normalizeAnswerPayload(item?.value ?? item?.answer),
    }];
  }));
}

function normalizeBody(body = {}){
  const roughGoal = boundedText(body.roughGoal || body.goal, 'Goal', 4000);
  const context = body.context && typeof body.context === 'object' && !Array.isArray(body.context) ? body.context : {};
  ['goal', 'currentStage', 'desiredEndState', 'baseline', 'targetOutcome', 'constraints', 'preferredSchedule', 'existingResources', 'resourceLinks', 'includeTasks', 'excludeTasks', 'description']
    .forEach(field => { if(context[field] != null) boundedText(context[field], field, field === 'goal' ? 4000 : 1200); });
  if(context.coreCommitments != null) boundedArray(context.coreCommitments, 'coreCommitments', 16);
  const previous = body.previousBrief && typeof body.previousBrief === 'object'
    ? normalizeConfirmedBrief(body.previousBrief)
    : briefFromPrompt({ ...context, goal:roughGoal || context.goal });
  const answers = normalizeAnswers(body.answers || []);
  const mergedBrief = mergeClarificationAnswers(previous, answers);
  return {
    roughGoal,
    context,
    previousBrief:mergedBrief,
    answers:mergedBrief.answerMap,
    clarificationRound:cleanNumber(body.clarificationRound, 0, 2) || 0,
    maxClarificationRounds:cleanNumber(body.maxClarificationRounds, 1, 3) || 2,
  };
}

function buildPrompt(input){
  return [
    'Use the interpret_goal_brief tool and return no prose or markdown.',
    'Ask 2-5 questions only when an answer would materially change duration, difficulty, schedule, progression, commitments, evidence, safety, feasibility, or milestones.',
    'Detect domainProfile conservatively: primary must be one of general, course, book, fitness; preserve multiple detected signals when relevant.',
    'Use exact target fields from the schema. Prefer specific fields like course.title, course.currentPosition.index, book.pageCount, fitness.baseline, and fitness.limitations when only one value is missing.',
    'Preserve supplied courses, books, programmes, fixed sequences, page counts, current progress, baselines, frequency, limitations, and explicit constraints.',
    'Do not ask course questions for general learning goals, book questions for casual reading habits, or fitness questions without an activity/progression context.',
    'Use intensity values only as soft, balanced, or intensive. If the user has not chosen one, recommend balanced but let the user confirm it.',
    'Never replace a confirmed course, book, programme, fixed challenge rule, safety boundary, or explicit availability with your own substitute.',
    'Do not ask questions merely because an optional field is empty. A simple, specific goal may proceed directly to review.',
    'For vague goals, identify materialGaps and provide stable question ids, target fields, supporting text, types, and concise material reasons.',
    'Prefer useful single-select or multi-select choices when the likely answers are bounded. Always preserve a custom answer option when appropriate.',
    'Use short_text, long_text, number, duration, date, days_of_week, time_availability, yes_no, or resource only when that control matches the decision.',
    'On the final clarification round, turn only remaining non-critical uncertainty into visible structured assumptions with accepted false.',
    'Never mark an AI assumption accepted. The user must accept, edit, or remove it in the review UI.',
    'The previousBrief already contains deterministic user answers and confirmed fields. Preserve them exactly.',
    'Do not silently infer beginner level or any other material value.',
    'Propose only goal-specific core commitments. Do not add generic habits unrelated to the goal.',
    'Do not claim web research, citations, source verification, or inspection of linked resources.',
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
  catch(error){ throw apiError('invalid_provider_response', 'Claude returned invalid JSON. Please retry.', 502); }
}

function extractBriefInput(message){
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const toolUse = blocks.find(block => block?.type === 'tool_use' && block.name === TOOL_NAME);
  if(toolUse?.input && typeof toolUse.input === 'object') return toolUse.input;
  const textContent = blocks.filter(block => block?.type === 'text').map(block => block.text || '').join('\n');
  if(text(textContent)) return parseJsonTextFallback(textContent);
  throw apiError('invalid_provider_response', 'Claude did not return the required structured goal brief.', 502);
}

function mapAnthropicError(error){
  if(error?.code === 'provider_timeout') return error;
  const status = Number(error?.status || error?.statusCode);
  const type = text(error?.type || error?.error?.type);
  if(status === 429 || /rate_limit|quota/i.test(type)) return apiError('provider_unavailable', 'The AI service is rate limited. Try again later.', 503);
  if(status === 401 || status === 403 || /auth|permission/i.test(type)) return apiError('provider_unavailable', 'The AI service is not available because server credentials were rejected.', 503);
  return apiError('provider_unavailable', 'The AI service is temporarily unavailable. Try again later.', 503);
}

export async function callAnthropic(input, signal, client = null){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey && !client) throw apiError('provider_unavailable', 'Anthropic is not configured.', 503);
  const anthropic = client || new Anthropic({ apiKey });
  try{
    const stream = anthropic.messages.stream({
      model:process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens:4000,
      temperature:0.2,
      system:'Interpret goals into neutral, goal-specific briefs. Preserve confirmed user fields. Never invent hidden material assumptions, fake citations, or web research.',
      tools:[GOAL_BRIEF_TOOL],
      tool_choice:{ type:'tool', name:TOOL_NAME },
      messages:[{ role:'user', content:buildPrompt(input) }],
    }, { signal });
    const message = await stream.finalMessage();
    const raw = extractBriefInput(message);
    const usage = usageFromMessage(message);
    if(raw && typeof raw === 'object' && (usage.inputTokens != null || usage.outputTokens != null)){
      Object.defineProperty(raw, '__usage', { value:usage, enumerable:false });
    }
    return raw;
  }catch(error){
    if(signal?.aborted) throw error;
    throw mapAnthropicError(error);
  }
}

export function createInterpretGoalHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  provider = callAnthropic,
  runProvider = runProviderRequest,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('interpret-goal', requestId);
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    setPrivateNoStore(res, requestId);
    log.event('interpret_request_started', {
      model,
      requestBodyBytes:requestBodyBytes(req),
      timeoutMs:INTERPRET_TIMEOUT_MS,
    });
    if(req.method !== 'POST'){
      res.setHeader('Allow', 'POST');
      log.event('interpret_response_sent', { status:405, code:'method_not_allowed', result:'error' });
      return sendApiError(res, apiError('method_not_allowed', 'POST only.', 405), requestId);
    }
    try{
      const auth = await authenticate(req);
      log.event('interpret_auth_complete', { result:'ok' });
      const body = requireJsonBody(req, MAX_JSON_BYTES);
      const input = normalizeBody(body);
      log.event('interpret_request_validated', {
        requestBodyBytes:requestBodyBytes(req, body),
        goalCharacterCount:(input.roughGoal || input.previousBrief.goal || '').length,
        clarificationRound:input.clarificationRound,
        result:'ok',
      });
      if(!input.roughGoal && !input.previousBrief.goal){
        throw apiError('invalid_request', 'Add rough goal notes before clarifying.', 400);
      }
      await rateLimit(auth.uid, 'interpret');
      log.event('interpret_rate_limit_complete', { result:'ok' });
      const providerStartedAt = Date.now();
      log.event('interpret_provider_started', {
        model,
        timeoutMs:INTERPRET_TIMEOUT_MS,
        goalCharacterCount:(input.roughGoal || input.previousBrief.goal || '').length,
        clarificationRound:input.clarificationRound,
      });
      let raw;
      try{
        raw = await runProvider(req, INTERPRET_TIMEOUT_MS, signal => provider(input, signal));
        log.event('interpret_provider_completed', {
          model,
          providerElapsedMs:elapsedMs(providerStartedAt),
          timeoutMs:INTERPRET_TIMEOUT_MS,
          inputTokens:raw?.__usage?.inputTokens,
          outputTokens:raw?.__usage?.outputTokens,
          result:'ok',
        });
      }catch(error){
        if(error?.code === 'provider_timeout'){
          log.event('interpret_provider_timeout', {
            model,
            providerElapsedMs:elapsedMs(providerStartedAt),
            timeoutMs:INTERPRET_TIMEOUT_MS,
            providerStatus:504,
            result:'timeout',
          }, 'warn');
        }
        throw error;
      }
      const brief = mergeBriefPreservingConfirmed(input.previousBrief, normalizeBrief(raw));
      log.event('interpret_response_sent', { status:200, result:'ok' });
      return sendPrivateJson(res, 200, { ok:true, brief, source:'anthropic', message:"Here's what I understood. Review and answer anything material that is missing." }, requestId);
    }catch(error){
      log.event('interpret_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'provider_timeout' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createInterpretGoalHandler();
