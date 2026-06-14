import Anthropic from '@anthropic-ai/sdk';
import {
  briefFromPrompt, mergeBriefPreservingConfirmed, mergeClarificationAnswers,
  normalizeBriefAssumptions, normalizeClarifyingQuestions, normalizeConfirmedBrief,
} from '../src/ai-builder-model.js';
import { apiError, methodNotAllowed, sendApiError } from './_lib/errors.js';
import { boundedArray, boundedText, requireJsonBody } from './_lib/http.js';
import { runProviderRequest } from './_lib/provider.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { requireAuth } from './_lib/require-auth.js';

const PATH_TYPES = ['skill', 'habit', 'challenge', 'fitness', 'creative_project', 'business', 'academic', 'spiritual/devotional', 'content', 'custom'];
const INTENSITIES = ['light', 'moderate', 'intense'];
const CADENCE_TYPES = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval', 'once', 'sequential'];
const TOOL_NAME = 'interpret_goal_brief';
const MAX_JSON_BYTES = 64 * 1024;
const INTERPRET_TIMEOUT_MS = 28_000;

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
  required:['id', 'targetField', 'prompt', 'required', 'reason'],
  properties:{
    id:{ type:'string' },
    targetField:{ type:'string', enum:['currentBaseline', 'desiredOutcome', 'durationDays', 'availableTime', 'constraints', 'scheduleNotes', 'evidencePreferences', 'resources'] },
    prompt:{ type:'string' }, required:{ type:'boolean' }, reason:{ type:'string' },
  },
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
      'knownTasks', 'coreCommitments', 'milestones', 'constraints', 'resourcesMentioned',
      'evidencePreference', 'suggestedEvidenceTypes', 'progressiveTargets', 'assumptions',
      'materialGaps', 'clarifyingQuestions', 'confidence', 'readyToGenerate',
    ],
    properties:{
      summary:{ type:'string' }, goal:{ type:'string' }, goalCategory:{ type:'string' },
      pathType:{ type:'string', enum:PATH_TYPES }, currentStage:nullableString, desiredEndState:nullableString,
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
      required:true,
      reason:'This information materially changes the roadmap.',
    }));
  }
  if(brief.materialGaps.length) brief.readyToGenerate = false;
  return brief;
}

function normalizeAnswers(value){
  const items = boundedArray(value, 'answers', 8);
  return Object.fromEntries(items.map((item, index) => {
    const id = boundedText(item?.id || `question-${index + 1}`, 'answer id', 100, { required:true });
    return [id, {
      targetField:boundedText(item?.targetField, 'answer target field', 80),
      value:boundedText(item?.value ?? item?.answer, 'answer', 700, { required:true }),
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
    'Do not ask questions merely because an optional field is empty. A simple, specific goal may proceed directly to review.',
    'For vague goals, identify materialGaps and provide stable question ids, target fields, and concise reasons.',
    'On the final clarification round, turn only remaining non-critical uncertainty into visible structured assumptions with accepted false.',
    'Never mark an AI assumption accepted. The user must accept, edit, or remove it in the review UI.',
    'The previousBrief already contains deterministic user answers and confirmed fields. Preserve them exactly.',
    'Do not silently infer beginner level, moderate intensity, or any other material value.',
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

export async function callAnthropic(input, signal){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) throw apiError('provider_unavailable', 'Anthropic is not configured.', 503);
  const anthropic = new Anthropic({ apiKey });
  try{
    const message = await anthropic.messages.create({
      model:process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens:4000,
      temperature:0.2,
      system:'Interpret goals into neutral, goal-specific briefs. Preserve confirmed user fields. Never invent hidden material assumptions, fake citations, or web research.',
      tools:[GOAL_BRIEF_TOOL],
      tool_choice:{ type:'tool', name:TOOL_NAME },
      messages:[{ role:'user', content:buildPrompt(input) }],
    }, { signal });
    return extractBriefInput(message);
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
    if(req.method !== 'POST') return methodNotAllowed(res);
    try{
      const auth = await authenticate(req);
      const body = requireJsonBody(req, MAX_JSON_BYTES);
      const input = normalizeBody(body);
      if(!input.roughGoal && !input.previousBrief.goal){
        throw apiError('invalid_request', 'Add rough goal notes before clarifying.', 400);
      }
      await rateLimit(auth.uid, 'interpret');
      const raw = await runProvider(req, INTERPRET_TIMEOUT_MS, signal => provider(input, signal));
      const brief = mergeBriefPreservingConfirmed(input.previousBrief, normalizeBrief(raw));
      return res.status(200).json({ ok:true, brief, source:'anthropic', message:"Here's what I understood. Review and answer anything material that is missing." });
    }catch(error){
      return sendApiError(res, error);
    }
  };
}

export default createInterpretGoalHandler();
