import Anthropic from '@anthropic-ai/sdk';

const PATH_TYPES = ['skill', 'habit', 'challenge', 'fitness', 'creative_project', 'business', 'academic', 'spiritual/devotional', 'content', 'custom'];
const INTENSITIES = ['light', 'moderate', 'intense'];
const CADENCE_TYPES = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval', 'once', 'sequential'];
const TOOL_NAME = 'interpret_goal_brief';

const nullableNumber = { anyOf:[{ type:'number' }, { type:'null' }] };
const nullableString = { anyOf:[{ type:'string' }, { type:'null' }] };
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

const GOAL_BRIEF_TOOL = {
  name:TOOL_NAME,
  description:'Interpret a goal into a neutral, structured brief and goal-specific core commitments.',
  input_schema:{
    type:'object',
    additionalProperties:false,
    required:[
      'summary', 'goal', 'goalCategory', 'pathType', 'currentStage', 'desiredEndState',
      'durationDays', 'recommendedDurationReason', 'intensity', 'dailyTimeAvailable',
      'estimatedDailyMinutes', 'estimatedWeeklyHours', 'deadline', 'scheduleNotes',
      'knownTasks', 'coreCommitments', 'milestones', 'constraints', 'resourcesMentioned',
      'evidencePreference', 'suggestedEvidenceTypes', 'progressiveTargets', 'assumptions',
      'missingCriticalInfo', 'clarifyingQuestions', 'confidence', 'readyToGenerate',
    ],
    properties:{
      summary:{ type:'string' },
      goal:{ type:'string' },
      goalCategory:{ type:'string' },
      pathType:{ type:'string', enum:PATH_TYPES },
      currentStage:nullableString,
      desiredEndState:nullableString,
      durationDays:{ anyOf:[{ type:'number', minimum:1, maximum:365 }, { type:'null' }] },
      recommendedDurationReason:{ type:'string' },
      intensity:{ anyOf:[{ type:'string', enum:INTENSITIES }, { type:'null' }] },
      dailyTimeAvailable:nullableString,
      estimatedDailyMinutes:nullableNumber,
      estimatedWeeklyHours:nullableNumber,
      deadline:nullableString,
      scheduleNotes:{ type:'string' },
      knownTasks:{ type:'array', items:{ type:'string' } },
      coreCommitments:{ type:'array', items:commitmentSchema },
      milestones:{ type:'array', items:{ type:'string' } },
      constraints:{ type:'array', items:{ type:'string' } },
      resourcesMentioned:{ type:'array', items:{ type:'string' } },
      evidencePreference:nullableString,
      suggestedEvidenceTypes:{ type:'array', items:{ type:'string' } },
      progressiveTargets:{
        type:'array',
        items:{
          type:'object', additionalProperties:false,
          required:['area', 'currentValue', 'targetValue', 'unit', 'notes'],
          properties:{
            area:{ type:'string' }, currentValue:nullableNumber, targetValue:nullableNumber,
            unit:nullableString, notes:nullableString,
          },
        },
      },
      assumptions:{ type:'array', items:{ type:'string' } },
      missingCriticalInfo:{ type:'array', items:{ type:'string' } },
      clarifyingQuestions:{ type:'array', items:{ type:'string' } },
      confidence:{ type:'number', minimum:0, maximum:1 },
      readyToGenerate:{ type:'boolean' },
    },
  },
};

function text(value, fallback = ''){
  return String(value == null ? fallback : value).trim();
}

function nullableText(value, max = 500){
  const cleaned = text(value).slice(0, max);
  return cleaned || null;
}

function cleanChoice(value, allowed, fallback = null){
  return allowed.includes(value) ? value : fallback;
}

function cleanNumber(value, min = null, max = null, round = true){
  if(value == null || value === '') return null;
  const number = Number(value);
  if(!Number.isFinite(number)) return null;
  const bounded = Math.max(min == null ? number : min, Math.min(max == null ? number : max, number));
  return round ? Math.round(bounded) : bounded;
}

function cleanArray(value, maxItems = 10, maxText = 180){
  return (Array.isArray(value) ? value : []).map(item => text(item).slice(0, maxText)).filter(Boolean).slice(0, maxItems);
}

function normalizeCadence(raw = {}){
  const source = typeof raw === 'string' ? { type:raw } : (raw || {});
  return {
    type:cleanChoice(source.type, CADENCE_TYPES, 'weekly'),
    daysOfWeek:(Array.isArray(source.daysOfWeek) ? source.daysOfWeek : []).map(day => text(day).toLowerCase()).filter(Boolean).slice(0, 7),
    timesPerWeek:cleanNumber(source.timesPerWeek, 1, 7),
    intervalDays:cleanNumber(source.intervalDays, 1, 365),
    scheduledDay:cleanNumber(source.scheduledDay, 1, 365),
  };
}

function normalizeCommitments(value, legacy = []){
  const source = Array.isArray(value) && value.length ? value : (Array.isArray(legacy) ? legacy : []);
  return source.map((raw, index) => {
    if(typeof raw === 'string') raw = { title:raw, required:true, cadence:{ type:'daily' } };
    raw = raw || {};
    return {
      id:text(raw.id, `commitment-${index + 1}`).slice(0, 80),
      title:text(raw.title || raw.text).slice(0, 140),
      description:text(raw.description).slice(0, 500),
      required:raw.required !== false,
      cadence:normalizeCadence(raw.cadence || raw.scheduleType || raw.schedule),
      estimatedMinutes:cleanNumber(raw.estimatedMinutes, 0, 1440),
      evidenceType:nullableText(raw.evidenceType, 80) || '',
      reason:text(raw.reason).slice(0, 300),
    };
  }).filter(item => item.title).slice(0, 16);
}

function codedError(message, code, status = 400){
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function normalizeBrief(raw){
  if(!raw || typeof raw !== 'object') throw codedError('Claude returned a goal brief that could not be validated. Please try again.', 'invalid_goal_brief', 502);
  const brief = {
    summary:text(raw.summary).slice(0, 700),
    goal:text(raw.goal).slice(0, 700),
    goalCategory:text(raw.goalCategory).slice(0, 100),
    pathType:cleanChoice(raw.pathType, PATH_TYPES, 'custom'),
    currentStage:nullableText(raw.currentStage, 700),
    desiredEndState:nullableText(raw.desiredEndState, 700),
    durationDays:cleanNumber(raw.durationDays, 1, 365),
    recommendedDurationReason:text(raw.recommendedDurationReason).slice(0, 400),
    intensity:cleanChoice(raw.intensity, INTENSITIES, null),
    dailyTimeAvailable:nullableText(raw.dailyTimeAvailable, 120),
    estimatedDailyMinutes:cleanNumber(raw.estimatedDailyMinutes, 0, 1440),
    estimatedWeeklyHours:cleanNumber(raw.estimatedWeeklyHours, 0, 168, false),
    deadline:nullableText(raw.deadline, 60),
    scheduleNotes:text(raw.scheduleNotes).slice(0, 500),
    knownTasks:cleanArray(raw.knownTasks, 16),
    coreCommitments:normalizeCommitments(raw.coreCommitments, raw.nonNegotiables),
    milestones:cleanArray(raw.milestones, 16, 260),
    constraints:cleanArray(raw.constraints, 12, 260),
    resourcesMentioned:cleanArray(raw.resourcesMentioned, 12, 300),
    evidencePreference:nullableText(raw.evidencePreference, 220),
    suggestedEvidenceTypes:cleanArray(raw.suggestedEvidenceTypes, 12, 120),
    progressiveTargets:(Array.isArray(raw.progressiveTargets) ? raw.progressiveTargets : []).slice(0, 8).map(target => ({
      area:text(target.area).slice(0, 100),
      currentValue:cleanNumber(target.currentValue, null, null, false),
      targetValue:cleanNumber(target.targetValue, null, null, false),
      unit:nullableText(target.unit, 40),
      notes:nullableText(target.notes, 240),
    })).filter(target => target.area || target.notes),
    assumptions:cleanArray(raw.assumptions, 10, 260),
    missingCriticalInfo:cleanArray(raw.missingCriticalInfo, 10, 180),
    clarifyingQuestions:cleanArray(raw.clarifyingQuestions, 5, 240),
    confidence:cleanNumber(raw.confidence, 0, 1, false) || 0,
    readyToGenerate:!!raw.readyToGenerate,
  };
  if(!brief.goal && brief.summary) brief.goal = brief.summary;
  if(!brief.summary && brief.goal) brief.summary = brief.goal;
  if(!brief.goal) throw codedError('Add more goal detail before clarifying.', 'missing_goal_text', 400);
  if(!brief.desiredEndState && !brief.missingCriticalInfo.includes('target outcome')) brief.missingCriticalInfo.push('target outcome');
  if(!brief.durationDays && !brief.missingCriticalInfo.includes('duration')) brief.missingCriticalInfo.push('duration');
  if(brief.missingCriticalInfo.length && !brief.clarifyingQuestions.length){
    brief.clarifyingQuestions = brief.missingCriticalInfo.slice(0, 5).map(item => `What should I assume for ${item}?`);
  }
  if(brief.missingCriticalInfo.length) brief.readyToGenerate = false;
  return brief;
}

function normalizeBody(body = {}){
  return {
    roughGoal:text(body.roughGoal || body.goal).slice(0, 4000),
    context:body.context && typeof body.context === 'object' ? body.context : {},
    previousBrief:body.previousBrief && typeof body.previousBrief === 'object' ? body.previousBrief : null,
    answers:(Array.isArray(body.answers) ? body.answers : []).map(item => ({
      question:text(item.question).slice(0, 240),
      answer:text(item.answer).slice(0, 700),
    })).filter(item => item.question || item.answer).slice(0, 8),
  };
}

function buildPrompt(input){
  return [
    'Use the interpret_goal_brief tool and return no prose or markdown.',
    'Interpret the user goal without assuming it is a fitness challenge, habit challenge, content challenge, or 75-day program.',
    'Classify the goal category and path type from the actual request. Recommend a realistic duration and explain the recommendation.',
    'Infer estimated time only when useful. Capture deadlines and preferred schedules.',
    'Propose a small set of coreCommitments that directly advance this specific goal. Never add generic reading, exercise, diet, sleep, posting, or deep-work commitments unless the goal calls for them.',
    'Each commitment needs a useful cadence: daily, weekdays, selected_days, times_per_week, weekly, interval, once, or sequential.',
    'Use sequential for ordered curriculum work, once for milestones, and recurring cadences only when repetition is actually useful.',
    'Capture measurable progression in progressiveTargets and meaningful checkpoints in milestones.',
    'Respect explicitly supplied commitments, constraints, resources, evidence preferences, duration, deadline, and schedule.',
    'If current stage or target outcome is missing, ask a concise clarifying question or make a conservative labeled assumption.',
    'If duration is absent, recommend one instead of automatically asking, unless the goal is too ambiguous to estimate responsibly.',
    'Set readyToGenerate false only when missing information would materially change the plan. Include no more than five useful questions.',
    'Do not claim web research, citations, source verification, or inspection of linked resources.',
    'If previousBrief and answers are present, merge the answers into the updated brief.',
    `Input: ${JSON.stringify(input)}`,
  ].join('\n');
}

function parseJsonTextFallback(content){
  let trimmed = text(content);
  if(!trimmed) throw codedError('Claude returned an empty response.', 'empty_ai_response', 502);
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if(first >= 0 && last > first) trimmed = trimmed.slice(first, last + 1);
  try{ return JSON.parse(trimmed); }
  catch(e){ throw codedError('Claude returned invalid JSON while clarifying. Please try again.', 'invalid_ai_json', 502); }
}

function extractBriefInput(message){
  const blocks = Array.isArray(message && message.content) ? message.content : [];
  const toolUse = blocks.find(block => block && block.type === 'tool_use' && block.name === TOOL_NAME);
  if(toolUse && toolUse.input && typeof toolUse.input === 'object') return toolUse.input;
  const textContent = blocks.filter(block => block && block.type === 'text').map(block => block.text || '').join('\n');
  if(text(textContent)) return parseJsonTextFallback(textContent);
  throw codedError('Claude did not return the required structured goal brief. Please try again.', 'missing_tool_use', 502);
}

function mapAnthropicError(error){
  const status = Number(error && (error.status || error.statusCode));
  const type = text(error && (error.type || (error.error && error.error.type)));
  if(status === 401 || status === 403 || /auth|permission/i.test(type)) return codedError('Anthropic authentication failed. Check the server API key.', 'anthropic_auth_error', status || 401);
  if(status === 429 || /rate_limit|quota/i.test(type)) return codedError('Anthropic rate limit or quota reached. Please retry later.', 'anthropic_rate_limited', 429);
  if(status >= 500 || /api_error|overloaded/i.test(type)) return codedError('Anthropic service error. Please retry later.', 'anthropic_server_error', status || 502);
  return codedError('Goal clarification failed. Please retry.', 'anthropic_generation_failed', status || 502);
}

async function callAnthropic(input){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) throw codedError('Anthropic is not configured. Clarifying goals requires Claude.', 'missing_anthropic_config', 503);
  const anthropic = new Anthropic({ apiKey });
  let message;
  try{
    message = await anthropic.messages.create({
      model:process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens:4000,
      temperature:0.2,
      system:'You interpret any kind of user goal into a neutral, goal-specific brief. Use the interpret_goal_brief tool. Never impose unrelated generic habits or a fixed challenge template. Do not return prose, markdown, fake citations, or claims of web research.',
      tools:[GOAL_BRIEF_TOOL],
      tool_choice:{ type:'tool', name:TOOL_NAME },
      messages:[{ role:'user', content:buildPrompt(input) }],
    });
  }catch(e){
    throw mapAnthropicError(e);
  }
  return extractBriefInput(message);
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok:false, message:'POST only.' });
  }
  try{
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const input = normalizeBody(body);
    if(!input.roughGoal && !input.previousBrief) return res.status(400).json({ ok:false, code:'missing_goal_text', message:'Add rough goal notes before clarifying.' });
    let raw;
    try{ raw = await callAnthropic(input); }
    catch(e){
      return res.status(e.status || 502).json({ ok:false, code:e.code || 'anthropic_generation_failed', message:e.message || 'Goal clarification failed. Please try again.' });
    }
    const brief = normalizeBrief(raw);
    return res.status(200).json({ ok:true, brief, source:'anthropic', message:"Here's what I understood. Review and answer anything missing." });
  }catch(e){
    return res.status(e.status || 400).json({ ok:false, code:e.code || 'invalid_request', message:e.message || 'Could not clarify this goal.' });
  }
}
