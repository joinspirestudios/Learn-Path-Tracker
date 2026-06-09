import Anthropic from '@anthropic-ai/sdk';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const INTENSITIES = ['light', 'moderate', 'intense'];
const PATH_TYPES = ['skill', 'habit', 'challenge', 'fitness', 'content', 'business', 'spiritual/devotional', 'custom'];
const TASK_MODES = ['fixed_recurring', 'progressive_recurring', 'one_off', 'sequential_learning'];
const PROGRESSION_CURVES = ['linear', 'gradual', 'stepped', 'custom'];
const TOOL_NAME = 'create_learning_path';

const PATH_DRAFT_TOOL = {
  name: TOOL_NAME,
  description: 'Create a structured progressive learning/challenge path draft for the Learn Path Tracker app.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'title', 'description', 'goal', 'category', 'durationDays', 'durationLabel',
      'difficulty', 'intensity', 'previewTitle', 'previewDescription',
      'sections', 'tasks', 'resources', 'notes',
    ],
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      goal: { type: 'string' },
      category: { type: 'string' },
      durationDays: { type: 'number', minimum: 1, maximum: 365 },
      durationLabel: { type: 'string' },
      difficulty: { type: 'string', enum: LEVELS },
      intensity: { type: 'string', enum: INTENSITIES },
      previewTitle: { type: 'string' },
      previewDescription: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'description', 'order'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            order: { type: 'number' },
          },
        },
      },
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'title', 'description', 'sectionTitle', 'scheduleType', 'startDay',
            'endDay', 'unlockDay', 'taskMode', 'progressionMetric',
            'progressionUnit', 'startValue', 'targetValue', 'progressionCurve',
            'progressionNotes', 'evidenceRequired', 'resourceUrl', 'order',
          ],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            sectionTitle: { type: 'string' },
            scheduleType: { type: 'string', enum: ['once', 'daily'] },
            taskMode: { type: 'string', enum: TASK_MODES },
            startDay: { type: 'number' },
            endDay: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            unlockDay: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            progressionMetric: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            progressionUnit: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            startValue: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            targetValue: { anyOf: [{ type: 'number' }, { type: 'null' }] },
            progressionCurve: { anyOf: [{ type: 'string', enum: PROGRESSION_CURVES }, { type: 'null' }] },
            progressionNotes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            evidenceRequired: { type: 'boolean' },
            resourceUrl: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            order: { type: 'number' },
          },
        },
      },
      resources: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['title', 'url', 'description'],
          properties: {
            title: { type: 'string' },
            url: { anyOf: [{ type: 'string' }, { type: 'null' }] },
            description: { type: 'string' },
          },
        },
      },
      notes: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
};

function clamp(n, min, max){
  n = Number(n);
  if(!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function text(v, fallback = ''){
  return String(v == null ? fallback : v).trim();
}

function cleanUrl(v){
  const value = text(v);
  if(!value) return null;
  try{ return new URL(value).toString(); }
  catch(e){ return null; }
}

function cleanChoice(value, allowed, fallback){
  return allowed.includes(value) ? value : fallback;
}

function normalizePrompt(body = {}){
  const goal = text(body.goal).slice(0, 500);
  const durationDays = clamp(body.durationDays, 1, 365);
  const currentLevel = cleanChoice(body.currentLevel, LEVELS, 'beginner');
  const intensity = cleanChoice(body.intensity, INTENSITIES, 'moderate');
  const pathType = cleanChoice(body.pathType, PATH_TYPES, 'custom');
  const nonNegotiables = Array.isArray(body.nonNegotiables)
    ? body.nonNegotiables.map(x => text(x).slice(0, 100)).filter(Boolean).slice(0, 12)
    : [];
  const assumptions = Array.isArray(body.assumptions)
    ? body.assumptions.map(x => text(x).slice(0, 220)).filter(Boolean).slice(0, 12)
    : [];
  const progressiveTargets = Array.isArray(body.progressiveTargets)
    ? body.progressiveTargets.slice(0, 8).map(target => ({
      area: text(target.area).slice(0, 100),
      currentValue: Number.isFinite(Number(target.currentValue)) ? Number(target.currentValue) : null,
      targetValue: Number.isFinite(Number(target.targetValue)) ? Number(target.targetValue) : null,
      unit: text(target.unit).slice(0, 40) || null,
      notes: text(target.notes).slice(0, 240) || null,
    })).filter(target => target.area || target.notes)
    : [];
  return {
    goal,
    durationDays,
    currentLevel,
    intensity,
    pathType,
    resourceLinks: text(body.resourceLinks).slice(0, 1000),
    currentStage: text(body.currentStage).slice(0, 700),
    desiredEndState: text(body.desiredEndState).slice(0, 700),
    baseline: text(body.baseline).slice(0, 700),
    targetOutcome: text(body.targetOutcome).slice(0, 700),
    constraints: text(body.constraints).slice(0, 700),
    existingResources: text(body.existingResources).slice(0, 1000),
    dailyTime: text(body.dailyTime).slice(0, 80),
    evidenceStyle: text(body.evidenceStyle).slice(0, 160),
    includeTasks: text(body.includeTasks).slice(0, 1000),
    excludeTasks: text(body.excludeTasks).slice(0, 1000),
    visibility: ['private', 'unlisted', 'public'].includes(body.visibility) ? body.visibility : 'private',
    description: text(body.description).slice(0, 500),
    nonNegotiables,
    assumptions,
    progressiveTargets,
    clarifiedBrief: body.clarifiedBrief && typeof body.clarifiedBrief === 'object' ? body.clarifiedBrief : null,
  };
}

function titleFromGoal(goal){
  const cleaned = text(goal, 'New learning path').replace(/^i want to\s+/i, '').replace(/\.$/, '');
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function sectionForDay(day, durationDays){
  if(day <= Math.ceil(durationDays * 0.33)) return 'Foundation';
  if(day <= Math.ceil(durationDays * 0.66)) return 'Build';
  return 'Ship and review';
}

function basicStarterDraft(input, source = 'fallback'){
  const title = titleFromGoal(input.goal);
  const durationDays = input.durationDays;
  const sections = [
    { title:'Foundation', description:'Set up the routine, expectations, and first repeatable actions.', order:0 },
    { title:'Build', description:'Practice consistently and turn the goal into visible work.', order:1 },
    { title:'Ship and review', description:'Review progress, publish or document outcomes, and decide what continues.', order:2 },
  ];
  const tasks = [];
  const dailyBase = input.nonNegotiables.length ? input.nonNegotiables : ['Work on the goal'];
  dailyBase.slice(0, 8).forEach((name, i) => {
    const lower = name.toLowerCase();
    const proof = /(run|walk|gym|train|workout|course|post|publish|design|project|deep work|proof|record|upload)/.test(lower);
    tasks.push({
      title:name,
      description:'Repeat this commitment during the path.',
      sectionTitle:'Foundation',
      scheduleType:'daily',
      taskMode:'fixed_recurring',
      startDay:1,
      endDay:durationDays,
      unlockDay:null,
      progressionMetric:null,
      progressionUnit:null,
      startValue:null,
      targetValue:null,
      progressionCurve:null,
      progressionNotes:null,
      evidenceRequired: proof || /proof/.test(input.evidenceStyle.toLowerCase()),
      resourceUrl:null,
      order:i,
    });
  });
  const milestoneEvery = durationDays >= 90 ? 30 : durationDays >= 45 ? 15 : 7;
  for(let day = milestoneEvery; day < durationDays; day += milestoneEvery){
    tasks.push({
      title:'Review progress and adjust the next stretch',
      description:'Look at what worked, what got skipped, and what needs to change.',
      sectionTitle:sectionForDay(day, durationDays),
      scheduleType:'once',
      taskMode:'one_off',
      startDay:day,
      endDay:null,
      unlockDay:day,
      progressionMetric:null,
      progressionUnit:null,
      startValue:null,
      targetValue:null,
      progressionCurve:null,
      progressionNotes:null,
      evidenceRequired:false,
      resourceUrl:null,
      order:tasks.length,
    });
  }
  tasks.push({
    title:'Complete a final reflection',
    description:'Summarize progress, proof, lessons, and the next commitment.',
    sectionTitle:'Ship and review',
    scheduleType:'once',
    taskMode:'one_off',
    startDay:durationDays,
    endDay:null,
    unlockDay:durationDays,
    progressionMetric:null,
    progressionUnit:null,
    startValue:null,
    targetValue:null,
    progressionCurve:null,
    progressionNotes:null,
    evidenceRequired:true,
    resourceUrl:null,
    order:tasks.length,
  });
  const notes = ['Basic starter template. Review and edit before saving.'];
  if(['fitness', 'challenge'].includes(input.pathType)){
    notes.push('Adapt intensity to your health, ability, and professional guidance where needed.');
  }
  return normalizeDraft({
    title,
    description: input.description || input.goal,
    goal: input.goal,
    category: input.pathType,
    durationDays,
    durationLabel: durationDays + ' days',
    difficulty: input.currentLevel,
    intensity: input.intensity,
    previewTitle:title,
    previewDescription: input.description || input.goal,
    sections,
    tasks,
    resources: parseResources(input.resourceLinks),
    notes,
  }, input, source);
}

function parseResources(raw){
  return text(raw).split(/\s+/).map(cleanUrl).filter(Boolean).slice(0, 8).map((url, i) => ({
    title:'Resource ' + (i + 1),
    url,
    description:'',
  }));
}

function cleanNullableText(value, max = 160){
  const cleaned = text(value).slice(0, max);
  return cleaned || null;
}

function cleanNullableNumber(value){
  if(value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeTaskMode(value, scheduleType){
  if(TASK_MODES.includes(value)) return value;
  return scheduleType === 'daily' ? 'fixed_recurring' : 'one_off';
}

function normalizeProgressionCurve(value, taskMode){
  if(value == null || value === '') return null;
  if(PROGRESSION_CURVES.includes(value)) return value;
  return taskMode === 'progressive_recurring' ? 'gradual' : null;
}

function normalizeDraft(raw, input, source = 'ai'){
  if(!raw || typeof raw !== 'object') throw new Error('Generator returned an invalid draft.');
  const durationDays = clamp(raw.durationDays || input.durationDays, 1, 365);
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 12).map((s, i) => ({
    title:text(s.title, 'Section ' + (i + 1)).slice(0, 100),
    description:text(s.description).slice(0, 500),
    order:Number.isFinite(Number(s.order)) ? Number(s.order) : i,
  })).filter(s => s.title);
  if(!sections.length) sections.push({ title:'Foundation', description:'Start here.', order:0 });
  const sectionNames = new Set(sections.map(s => s.title));
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).slice(0, 80).map((t, i) => {
    const scheduleType = t.scheduleType === 'daily' ? 'daily' : 'once';
    const startDay = clamp(t.startDay || t.unlockDay || 1, 1, durationDays);
    const endDay = scheduleType === 'daily' ? clamp(t.endDay || durationDays, startDay, durationDays) : null;
    const unlockDay = scheduleType === 'once' ? clamp(t.unlockDay || startDay, 1, durationDays) : null;
    const sectionTitle = sectionNames.has(t.sectionTitle) ? t.sectionTitle : sections[Math.min(sections.length - 1, Math.floor((startDay - 1) / Math.max(1, Math.ceil(durationDays / sections.length))))].title;
    const taskMode = normalizeTaskMode(t.taskMode, scheduleType);
    return {
      title:text(t.title, 'Task ' + (i + 1)).slice(0, 140),
      description:text(t.description).slice(0, 500),
      sectionTitle,
      scheduleType,
      taskMode,
      startDay,
      endDay,
      unlockDay,
      progressionMetric:cleanNullableText(t.progressionMetric, 80),
      progressionUnit:cleanNullableText(t.progressionUnit, 40),
      startValue:cleanNullableNumber(t.startValue),
      targetValue:cleanNullableNumber(t.targetValue),
      progressionCurve:normalizeProgressionCurve(t.progressionCurve, taskMode),
      progressionNotes:cleanNullableText(t.progressionNotes, 300),
      evidenceRequired:!!t.evidenceRequired,
      resourceUrl:cleanUrl(t.resourceUrl),
      order:Number.isFinite(Number(t.order)) ? Number(t.order) : i,
    };
  }).filter(t => t.title);
  if(!tasks.length) throw new Error('Generator returned no usable tasks.');
  return {
    title:text(raw.title, titleFromGoal(input.goal)).slice(0, 100),
    description:text(raw.description, input.description || input.goal).slice(0, 1000),
    goal:text(raw.goal, input.goal).slice(0, 800),
    category:text(raw.category, input.pathType).slice(0, 80),
    durationDays,
    durationLabel:text(raw.durationLabel, durationDays + ' days').slice(0, 80),
    difficulty:cleanChoice(raw.difficulty, LEVELS, input.currentLevel),
    intensity:cleanChoice(raw.intensity, INTENSITIES, input.intensity),
    previewTitle:text(raw.previewTitle, raw.title || titleFromGoal(input.goal)).slice(0, 100),
    previewDescription:text(raw.previewDescription, raw.description || input.goal).slice(0, 500),
    visibility:input.visibility,
    sections:sections.sort((a, b) => a.order - b.order),
    tasks:tasks.sort((a, b) => a.order - b.order),
    resources:(Array.isArray(raw.resources) ? raw.resources : []).slice(0, 12).map((r, i) => ({
      title:text(r.title, 'Resource ' + (i + 1)).slice(0, 100),
      url:cleanUrl(r.url),
      description:text(r.description).slice(0, 300),
    })).filter(r => r.title || r.url || r.description),
    notes:(Array.isArray(raw.notes) ? raw.notes : []).map(n => text(n).slice(0, 300)).filter(Boolean).slice(0, 8),
    source,
  };
}

function buildPrompt(input){
  return [
    'Use the create_learning_path tool to return the path draft.',
    'Do not return prose.',
    'Do not return markdown.',
    'Create an editable progressive proof-of-growth roadmap for this app. Do not claim deep research or cite sources.',
    'Do not generate generic static paths.',
    'Base the path on the user current stage, baseline, target outcome, constraints, and available time.',
    'If a clarifiedBrief is provided, treat it as the user-confirmed source of truth.',
    'Use progressiveTargets as explicit progression requirements when present.',
    'Include assumptions as labeled notes, not as facts.',
    'If current stage is missing, make a conservative beginner-safe assumption and mention it in notes.',
    'Use durationDays and scheduleType instead of generating one task per day.',
    'Use recurring task structures. Do not generate 365 individual tasks for a 1-year path.',
    'Use fixed_recurring for tasks that truly stay the same daily.',
    'Use progressive_recurring for habits that should grow over time: running distance, workout difficulty, deep work duration, language speaking complexity, design project complexity, editing practice complexity, and similar work.',
    'Use sequential_learning for skills where concepts build in order: French speaking, 3D, editing, coding, design, and similar skills.',
    'Use one_off for milestone checks, reviews, tests, recordings, deliverables, and projects.',
    'Keep durationDays within 1-365.',
    'Make the path realistic, current-stage-aware, progressive, and editable.',
    'For fitness/health challenges, avoid unsafe progression and include a safety note.',
    'Set evidenceRequired true only where proof matters: workouts, running/walking, course progress, uploaded work, public posts, project deliverables.',
    'Recommend resources only when useful, and do not invent fake URLs. If a resource URL is unknown, use null and describe the kind of resource in the task/resource description.',
    'The app recommends tasks/resources but does not teach full lessons internally.',
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
    throw codedError('Claude returned invalid JSON. Please regenerate.', 'invalid_ai_json', 502);
  }
}

function extractDraftInput(message){
  const blocks = Array.isArray(message && message.content) ? message.content : [];
  const toolUse = blocks.find(block => block && block.type === 'tool_use' && block.name === TOOL_NAME);
  if(toolUse && toolUse.input && typeof toolUse.input === 'object'){
    return toolUse.input;
  }
  const textContent = blocks
    .filter(block => block && block.type === 'text')
    .map(block => block.text || '')
    .join('\n');
  if(text(textContent)){
    return parseJsonTextFallback(textContent);
  }
  throw codedError('Claude did not return the required structured path draft. Please regenerate.', 'missing_tool_use', 502);
}

async function callAnthropic(input){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey){
    throw codedError('Anthropic is not configured.', 'missing_anthropic_config', 503);
  }
  const anthropic = new Anthropic({ apiKey });
  let message;
  try{
    message = await anthropic.messages.create({
      model:process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      max_tokens:6000,
      temperature:0.5,
      system:'You generate safe, realistic, editable learning path drafts. You must use the create_learning_path tool. Do not return prose, markdown, fake citations, or claims of real web research.',
      tools:[PATH_DRAFT_TOOL],
      tool_choice:{ type:'tool', name:TOOL_NAME },
      messages:[
        { role:'user', content:buildPrompt(input) },
      ],
    });
  }catch(e){
    throw mapAnthropicError(e);
  }
  return extractDraftInput(message);
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
  return codedError('Claude generation failed. Please retry.', 'anthropic_generation_failed', status || 502);
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok:false, message:'POST only.' });
  }
  try{
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const input = normalizePrompt(body);
    if(!input.goal) return res.status(400).json({ ok:false, message:'Goal is required.' });
    let raw;
    try{
      raw = await callAnthropic(input);
    }catch(e){
      return res.status(e.status || 502).json({
        ok:false,
        code:e.code || 'anthropic_generation_failed',
        message:e.message || 'Claude generation failed. Please try again.',
      });
    }
    let draft;
    try{
      draft = normalizeDraft(raw, input, 'anthropic');
    }catch(e){
      throw codedError('Claude returned a path draft that could not be validated. Please regenerate.', 'invalid_ai_output', 502);
    }
    return res.status(200).json({ ok:true, draft, source:'anthropic', message:'Claude draft generated. Review before saving.' });
  }catch(e){
    return res.status(e.status || 400).json({ ok:false, code:e.code || 'invalid_request', message:e.message || 'Could not generate a path draft.' });
  }
}
