import Anthropic from '@anthropic-ai/sdk';

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const INTENSITIES = ['light', 'moderate', 'intense'];
const PATH_TYPES = ['skill', 'habit', 'challenge', 'fitness', 'creative_project', 'business', 'academic', 'spiritual/devotional', 'content', 'custom'];
const CADENCE_TYPES = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval', 'once', 'sequential'];
const RECURRING_CADENCES = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval'];
const TASK_MODES = ['fixed_recurring', 'progressive_recurring', 'one_off', 'sequential_learning'];
const PROGRESSION_CURVES = ['linear', 'gradual', 'stepped', 'custom'];
const TOOL_NAME = 'create_learning_path';

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
      difficulty:{ type:'string', enum:LEVELS },
      intensity:{ type:'string', enum:INTENSITIES },
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
  const candidate = text(value);
  if(!candidate) return null;
  try{ return new URL(candidate).toString(); }
  catch(e){ return null; }
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
  const clarified = body.clarifiedBrief && typeof body.clarifiedBrief === 'object' ? body.clarifiedBrief : null;
  const suppliedDuration = cleanNullableNumber(body.durationDays, 1, 365) || cleanNullableNumber(clarified && clarified.durationDays, 1, 365);
  const rawType = body.pathType || (clarified && clarified.pathType);
  const pathType = rawType === 'auto' ? 'custom' : cleanChoice(rawType, PATH_TYPES, 'custom');
  const coreCommitments = normalizeCommitments(
    body.coreCommitments || (clarified && clarified.coreCommitments),
    body.nonNegotiables || (clarified && clarified.nonNegotiables)
  );
  return {
    goal:text(body.goal || (clarified && clarified.goal)).slice(0, 700),
    durationDays:suppliedDuration || 30,
    durationWasProvided:!!suppliedDuration,
    deadline:cleanNullableText(body.deadline || (clarified && clarified.deadline), 40),
    currentLevel:cleanChoice(body.currentLevel, LEVELS, 'beginner'),
    intensity:cleanChoice(body.intensity || (clarified && clarified.intensity), INTENSITIES, 'moderate'),
    pathType,
    preferredSchedule:text(body.preferredSchedule || (clarified && clarified.scheduleNotes)).slice(0, 500),
    resourceLinks:text(body.resourceLinks).slice(0, 1200),
    currentStage:text(body.currentStage || (clarified && clarified.currentStage)).slice(0, 700),
    desiredEndState:text(body.desiredEndState || (clarified && clarified.desiredEndState)).slice(0, 700),
    baseline:text(body.baseline).slice(0, 700),
    targetOutcome:text(body.targetOutcome).slice(0, 700),
    constraints:text(body.constraints).slice(0, 700),
    existingResources:text(body.existingResources).slice(0, 1200),
    dailyTime:text(body.dailyTime || (clarified && clarified.dailyTimeAvailable)).slice(0, 120),
    evidenceStyle:text(body.evidenceStyle || (clarified && clarified.evidencePreference)).slice(0, 220),
    includeTasks:text(body.includeTasks).slice(0, 1200),
    excludeTasks:text(body.excludeTasks).slice(0, 1200),
    visibility:['private', 'unlisted', 'public'].includes(body.visibility) ? body.visibility : 'private',
    description:text(body.description).slice(0, 700),
    coreCommitments,
    assumptions:(Array.isArray(body.assumptions) ? body.assumptions : []).map(item => text(item).slice(0, 240)).filter(Boolean).slice(0, 12),
    progressiveTargets:(Array.isArray(body.progressiveTargets) ? body.progressiveTargets : []).slice(0, 8).map(target => ({
      area:text(target.area).slice(0, 100),
      currentValue:cleanNullableNumber(target.currentValue),
      targetValue:cleanNullableNumber(target.targetValue),
      unit:cleanNullableText(target.unit, 40),
      notes:cleanNullableText(target.notes, 240),
    })).filter(target => target.area || target.notes),
    clarifiedBrief:clarified,
  };
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
    difficulty:input.currentLevel,
    intensity:input.intensity,
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
    difficulty:cleanChoice(raw.difficulty, LEVELS, input.currentLevel),
    intensity:cleanChoice(raw.intensity, INTENSITIES, input.intensity),
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
    'If clarifiedBrief is present, treat it as the user-confirmed source of truth.',
    'Use the supplied duration. If durationWasProvided is false, 30 days is a neutral generation window and may be adjusted only when the goal clearly requires it; explain the reason in notes.',
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

function codedError(message, code, status = 400){
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function parseJsonTextFallback(content){
  let trimmed = text(content);
  if(!trimmed) throw codedError('Claude returned an empty response.', 'empty_ai_response', 502);
  trimmed = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  if(first >= 0 && last > first) trimmed = trimmed.slice(first, last + 1);
  try{ return JSON.parse(trimmed); }
  catch(e){ throw codedError('Claude returned invalid JSON. Please regenerate.', 'invalid_ai_json', 502); }
}

function extractDraftInput(message){
  const blocks = Array.isArray(message && message.content) ? message.content : [];
  const toolUse = blocks.find(block => block && block.type === 'tool_use' && block.name === TOOL_NAME);
  if(toolUse && toolUse.input && typeof toolUse.input === 'object') return toolUse.input;
  const textContent = blocks.filter(block => block && block.type === 'text').map(block => block.text || '').join('\n');
  if(text(textContent)) return parseJsonTextFallback(textContent);
  throw codedError('Claude did not return the required structured path draft. Please regenerate.', 'missing_tool_use', 502);
}

function mapAnthropicError(error){
  const status = Number(error && (error.status || error.statusCode));
  const type = text(error && (error.type || (error.error && error.error.type)));
  if(status === 401 || status === 403 || /auth|permission/i.test(type)) return codedError('Anthropic authentication failed. Check the server API key.', 'anthropic_auth_error', status || 401);
  if(status === 429 || /rate_limit|quota/i.test(type)) return codedError('Anthropic rate limit or quota reached. Please retry later.', 'anthropic_rate_limited', 429);
  if(status >= 500 || /api_error|overloaded/i.test(type)) return codedError('Anthropic service error. Please retry later.', 'anthropic_server_error', status || 502);
  return codedError('Claude generation failed. Please retry.', 'anthropic_generation_failed', status || 502);
}

async function callAnthropic(input){
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if(!apiKey) throw codedError('Anthropic is not configured.', 'missing_anthropic_config', 503);
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
    });
  }catch(e){
    throw mapAnthropicError(e);
  }
  return extractDraftInput(message);
}

export default async function handler(req, res){
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok:false, message:'POST only.' });
  }
  try{
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if(body.briefConfirmed !== true || !body.clarifiedBrief || typeof body.clarifiedBrief !== 'object'){
      return res.status(400).json({
        ok:false,
        code:'confirmed_brief_required',
        message:'Review and confirm the goal brief before generating a roadmap.',
      });
    }
    const input = normalizePrompt(body);
    if(!input.goal) return res.status(400).json({ ok:false, code:'missing_goal_text', message:'Goal is required.' });
    if(!input.durationWasProvided){
      return res.status(400).json({ ok:false, code:'confirmed_duration_required', message:'Set a duration in the confirmed brief before generating a roadmap.' });
    }
    let raw;
    try{ raw = await callAnthropic(input); }
    catch(e){
      return res.status(e.status || 502).json({ ok:false, code:e.code || 'anthropic_generation_failed', message:e.message || 'Claude generation failed. Please try again.' });
    }
    let draft;
    try{ draft = normalizeDraft(raw, input, 'anthropic'); }
    catch(e){ throw codedError('Claude returned a path draft that could not be validated. Please regenerate.', 'invalid_ai_output', 502); }
    return res.status(200).json({ ok:true, draft, source:'anthropic', message:'Claude draft generated. Review before saving.' });
  }catch(e){
    return res.status(e.status || 400).json({ ok:false, code:e.code || 'invalid_request', message:e.message || 'Could not generate a path draft.' });
  }
}
