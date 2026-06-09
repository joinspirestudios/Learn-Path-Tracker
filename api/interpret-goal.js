import Anthropic from '@anthropic-ai/sdk';

const PATH_TYPES = ['skill', 'habit', 'challenge', 'fitness', 'content', 'business', 'spiritual/devotional', 'custom'];
const INTENSITIES = ['light', 'moderate', 'intense'];
const TOOL_NAME = 'interpret_goal_brief';

const GOAL_BRIEF_TOOL = {
  name: TOOL_NAME,
  description: 'Extract a structured goal brief and useful clarifying questions for the Learn Path Tracker app.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'summary', 'goal', 'pathType', 'currentStage', 'desiredEndState',
      'durationDays', 'intensity', 'dailyTimeAvailable', 'knownTasks',
      'nonNegotiables', 'constraints', 'resourcesMentioned',
      'evidencePreference', 'progressiveTargets', 'assumptions',
      'missingCriticalInfo', 'clarifyingQuestions', 'confidence',
      'readyToGenerate',
    ],
    properties: {
      summary: { type: 'string' },
      goal: { type: 'string' },
      pathType: { type: 'string', enum: PATH_TYPES },
      currentStage: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      desiredEndState: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      durationDays: { anyOf: [{ type: 'number', minimum: 1, maximum: 365 }, { type: 'null' }] },
      intensity: { anyOf: [{ type: 'string', enum: INTENSITIES }, { type: 'null' }] },
      dailyTimeAvailable: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      knownTasks: { type: 'array', items: { type: 'string' } },
      nonNegotiables: { type: 'array', items: { type: 'string' } },
      constraints: { type: 'array', items: { type: 'string' } },
      resourcesMentioned: { type: 'array', items: { type: 'string' } },
      evidencePreference: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      progressiveTargets: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['area', 'currentValue', 'targetValue', 'unit', 'notes'],
          properties: {
            area: { type: 'string' },
            currentValue: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            targetValue: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            unit: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          },
        },
      },
      assumptions: { type: 'array', items: { type: 'string' } },
      missingCriticalInfo: { type: 'array', items: { type: 'string' } },
      clarifyingQuestions: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      readyToGenerate: { type: 'boolean' },
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

function cleanNumber(value, min = null, max = null){
  if(value == null || value === '') return null;
  const n = Number(value);
  if(!Number.isFinite(n)) return null;
  let out = n;
  if(min != null) out = Math.max(min, out);
  if(max != null) out = Math.min(max, out);
  return Math.round(out);
}

function cleanDecimal(value, min = null, max = null){
  if(value == null || value === '') return null;
  const n = Number(value);
  if(!Number.isFinite(n)) return null;
  let out = n;
  if(min != null) out = Math.max(min, out);
  if(max != null) out = Math.min(max, out);
  return out;
}

function cleanArray(value, maxItems = 10, maxText = 180){
  return (Array.isArray(value) ? value : [])
    .map(item => text(item).slice(0, maxText))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeBrief(raw){
  if(!raw || typeof raw !== 'object') throw codedError('Claude returned a goal brief that could not be validated. Please try again.', 'invalid_goal_brief', 502);
  const durationDays = cleanNumber(raw.durationDays, 1, 365);
  const confidence = cleanDecimal(raw.confidence, 0, 1);
  const brief = {
    summary: text(raw.summary).slice(0, 700),
    goal: text(raw.goal).slice(0, 700),
    pathType: cleanChoice(raw.pathType, PATH_TYPES, 'custom'),
    currentStage: nullableText(raw.currentStage, 700),
    desiredEndState: nullableText(raw.desiredEndState, 700),
    durationDays,
    intensity: cleanChoice(raw.intensity, INTENSITIES, null),
    dailyTimeAvailable: nullableText(raw.dailyTimeAvailable, 120),
    knownTasks: cleanArray(raw.knownTasks, 16),
    nonNegotiables: cleanArray(raw.nonNegotiables, 16),
    constraints: cleanArray(raw.constraints, 12),
    resourcesMentioned: cleanArray(raw.resourcesMentioned, 12, 260),
    evidencePreference: nullableText(raw.evidencePreference, 220),
    progressiveTargets: (Array.isArray(raw.progressiveTargets) ? raw.progressiveTargets : []).slice(0, 8).map(target => ({
      area: text(target.area).slice(0, 100),
      currentValue: cleanDecimal(target.currentValue),
      targetValue: cleanDecimal(target.targetValue),
      unit: nullableText(target.unit, 40),
      notes: nullableText(target.notes, 240),
    })).filter(target => target.area || target.notes),
    assumptions: cleanArray(raw.assumptions, 10, 240),
    missingCriticalInfo: cleanArray(raw.missingCriticalInfo, 10, 180),
    clarifyingQuestions: cleanArray(raw.clarifyingQuestions, 5, 220),
    confidence: confidence == null ? 0 : confidence,
    readyToGenerate: !!raw.readyToGenerate,
  };
  if(!brief.goal && brief.summary) brief.goal = brief.summary;
  if(!brief.summary && brief.goal) brief.summary = brief.goal;
  if(!brief.goal) throw codedError('Add more goal detail before clarifying.', 'missing_goal_text', 400);
  if(!brief.desiredEndState && !brief.missingCriticalInfo.includes('target outcome')){
    brief.missingCriticalInfo.push('target outcome');
  }
  if(!brief.durationDays && !brief.missingCriticalInfo.includes('duration')){
    brief.missingCriticalInfo.push('duration');
  }
  if(brief.missingCriticalInfo.length && !brief.clarifyingQuestions.length){
    brief.clarifyingQuestions = brief.missingCriticalInfo.slice(0, 5).map(item => 'What should I assume for ' + item + '?');
  }
  if(brief.missingCriticalInfo.length) brief.readyToGenerate = false;
  return brief;
}

function normalizeBody(body = {}){
  return {
    roughGoal: text(body.roughGoal || body.goal).slice(0, 4000),
    context: body.context && typeof body.context === 'object' ? body.context : {},
    previousBrief: body.previousBrief && typeof body.previousBrief === 'object' ? body.previousBrief : null,
    answers: Array.isArray(body.answers) ? body.answers.map(item => ({
      question: text(item.question).slice(0, 220),
      answer: text(item.answer).slice(0, 700),
    })).filter(item => item.question || item.answer).slice(0, 8) : [],
  };
}

function buildPrompt(input){
  return [
    'Use the interpret_goal_brief tool.',
    'Do not return prose or markdown.',
    'Extract useful intent from scattered, emotional, incomplete, or mixed goal notes.',
    'Do not invent critical details confidently.',
    'If current stage is missing, add it to missingCriticalInfo or make a clearly labeled conservative assumption.',
    'If target outcome is missing, ask a clarifying question.',
    'If duration is missing, ask a clarifying question or suggest a reasonable default as an assumption.',
    'Capture progressive targets such as "1km to 15km" in progressiveTargets.',
    'Capture fixed daily tasks in nonNegotiables.',
    'If not enough information exists, set readyToGenerate false and include 2-5 useful clarifying questions.',
    'Confidence must be from 0 to 1.',
    'Do not claim web research, deep research, citations, or source verification.',
    'If previousBrief and answers are provided, merge the answers into the updated brief.',
    'Input: ' + JSON.stringify(input),
  ].join('\n');
}

function codedError(message, code, status = 400){
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function parseJsonTextFallback(content){
  let trimmed = text(content);
  if(!trimmed) throw codedError('Claude returned an empty response.', 'empty_ai_response', 502);
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if(first >= 0 && last > first) trimmed = trimmed.slice(first, last + 1);
  try{
    return JSON.parse(trimmed);
  }catch(e){
    throw codedError('Claude returned invalid JSON while clarifying. Please try again.', 'invalid_ai_json', 502);
  }
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
  if(status === 401 || status === 403 || /auth|permission/i.test(type)){
    return codedError('Anthropic authentication failed. Check the server API key.', 'anthropic_auth_error', status || 401);
  }
  if(status === 429 || /rate_limit|quota/i.test(type)){
    return codedError('Anthropic rate limit or quota reached. Please retry later.', 'anthropic_rate_limited', 429);
  }
  if(status >= 500 || /api_error|overloaded/i.test(type)){
    return codedError('Anthropic service error. Please retry later.', 'anthropic_server_error', status || 502);
  }
  return codedError('Goal clarification failed. Please retry.', 'anthropic_generation_failed', status || 502);
}

async function callAnthropic(input){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) throw codedError('Anthropic is not configured. Clarifying goals requires Claude.', 'missing_anthropic_config', 503);
  const anthropic = new Anthropic({ apiKey });
  let message;
  try{
    message = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens: 3000,
      temperature: 0.2,
      system: 'You clarify messy user goals into structured briefs for a progressive proof-of-growth roadmap app. You must use the interpret_goal_brief tool. Do not return prose, markdown, fake citations, or claims of real web research.',
      tools: [GOAL_BRIEF_TOOL],
      tool_choice: { type:'tool', name:TOOL_NAME },
      messages: [
        { role:'user', content: buildPrompt(input) },
      ],
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
    if(!input.roughGoal && !input.previousBrief){
      return res.status(400).json({ ok:false, code:'missing_goal_text', message:'Add rough goal notes before clarifying.' });
    }
    let raw;
    try{
      raw = await callAnthropic(input);
    }catch(e){
      return res.status(e.status || 502).json({
        ok:false,
        code:e.code || 'anthropic_generation_failed',
        message:e.message || 'Goal clarification failed. Please try again.',
      });
    }
    const brief = normalizeBrief(raw);
    return res.status(200).json({ ok:true, brief, source:'anthropic', message:"Here's what I understood. Review and answer anything missing." });
  }catch(e){
    return res.status(e.status || 400).json({ ok:false, code:e.code || 'invalid_request', message:e.message || 'Could not clarify this goal.' });
  }
}
