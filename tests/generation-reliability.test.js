import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_SUPPORTING_TASK_LIMIT, PATH_DRAFT_TOOL, callAnthropic as callGenerateAnthropic,
  createGeneratePathHandler, normalizeDraft, normalizePrompt,
} from '../api/generate-path.js';
import { confirmBrief } from '../src/ai-builder-model.js';

function responseRecorder(){
  return {
    statusCode:200,
    headers:{},
    payload:null,
    setHeader(name, value){ this.headers[name] = value; },
    status(code){ this.statusCode = code; return this; },
    json(value){ this.payload = value; return value; },
  };
}

function jsonRequest(body){
  return {
    method:'POST',
    headers:{ authorization:'Bearer token', 'content-type':'application/json' },
    body,
    once(){},
    off(){},
  };
}

function compactTask(overrides = {}){
  return {
    title:'Set up weekly checkpoint',
    description:'Review adherence and adjust the next week.',
    sectionTitle:'Foundation',
    scheduleType:'weekly',
    taskMode:'fixed_recurring',
    startDay:1,
    endDay:0,
    unlockDay:0,
    daysOfWeek:[],
    timesPerWeek:0,
    intervalDays:0,
    scheduledDay:0,
    progressionMetric:'',
    progressionUnit:'',
    startValue:0,
    targetValue:0,
    progressionCurve:'none',
    progressionNotes:'',
    evidenceRequired:false,
    resourceUrl:'',
    order:0,
    ...overrides,
  };
}

function compactPlan(overrides = {}){
  return {
    title:'75-day disciplined challenge',
    description:'A bounded plan that supports the confirmed commitments.',
    sections:[
      { title:'Foundation', description:'Start the daily rhythm.', order:0 },
      { title:'Build', description:'Sustain and refine the work.', order:1 },
      { title:'Complete and review', description:'Finish and review outcomes.', order:2 },
    ],
    tasks:[compactTask()],
    previewTitle:'75-day challenge',
    previewDescription:'A structured challenge with recurring commitments and review points.',
    notes:['Review intensity and safety as needed.'],
    ...overrides,
  };
}

function streamClient(message){
  let calls = 0;
  return {
    calls:() => calls,
    client:{
      messages:{
        stream(params, options){
          calls += 1;
          return {
            async finalMessage(){
              return typeof message === 'function' ? message(params, options) : message;
            },
          };
        },
      },
    },
  };
}

function generationHandlerWithMessage(message){
  const mock = streamClient(message);
  const handler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:(input, signal) => callGenerateAnthropic(input, signal, mock.client),
  });
  return { handler, mock };
}

function confirmedBrief(overrides = {}){
  return confirmBrief({
    goal:'Complete a focused 75-day personal challenge',
    durationDays:75,
    pathType:'challenge',
    coreCommitments:[
      { title:'Sleep eight hours', required:true, cadence:{ type:'daily' }, evidenceType:'check-in' },
      { title:'Complete a home workout', required:true, cadence:{ type:'daily' }, evidenceType:'photo' },
    ],
    assumptions:[{ id:'assumption-safety', field:'constraints', text:'Keep progression sustainable.', accepted:true, source:'ai', material:true }],
    ...overrides,
  });
}

test('normal tool-use stop reason produces a complete compact roadmap draft', async () => {
  const { handler, mock } = generationHandlerWithMessage({
    stop_reason:'tool_use',
    content:[{ type:'tool_use', name:'create_learning_path', input:compactPlan() }],
    usage:{ input_tokens:100, output_tokens:200 },
  });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:confirmedBrief(), saveOptions:{ visibility:'private' } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.source, 'anthropic');
  assert.equal(res.payload.draft.durationDays, 75);
  assert.equal(res.payload.draft.coreCommitments.length, 2);
  assert.ok(res.payload.draft.tasks.some(task => task.title === 'Sleep eight hours'));
  assert.equal(mock.calls(), 1);
});

test('max_tokens stop reason returns provider_output_truncated and skips normalization', async () => {
  const { handler } = generationHandlerWithMessage({
    stop_reason:'max_tokens',
    content:[{ type:'tool_use', name:'create_learning_path', input:compactPlan() }],
  });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:confirmedBrief() }), res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.payload.code, 'provider_output_truncated');
  assert.match(res.payload.message, /cut off/);
});

test('refusal stop reason returns provider_refusal without normalization', async () => {
  const { handler } = generationHandlerWithMessage({
    stop_reason:'refusal',
    content:[{ type:'text', text:'I cannot help with that.' }],
  });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:confirmedBrief() }), res);

  assert.equal(res.statusCode, 422);
  assert.equal(res.payload.code, 'provider_refusal');
});

test('end_turn without tool use returns missing_tool_use', async () => {
  const { handler } = generationHandlerWithMessage({
    stop_reason:'end_turn',
    content:[{ type:'text', text:'No tool call.' }],
  });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:confirmedBrief() }), res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.payload.code, 'missing_tool_use');
});

test('context exhaustion returns provider_context_limit', async () => {
  const { handler } = generationHandlerWithMessage({
    stop_reason:'model_context_window_exceeded',
    content:[],
  });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:confirmedBrief() }), res);

  assert.equal(res.statusCode, 502);
  assert.equal(res.payload.code, 'provider_context_limit');
});

test('generation tool schema is strict and compact', () => {
  assert.equal(PATH_DRAFT_TOOL.strict, true);
  const topLevel = Object.keys(PATH_DRAFT_TOOL.input_schema.properties);
  assert.deepEqual(topLevel, ['title', 'description', 'sections', 'tasks', 'previewTitle', 'previewDescription', 'notes']);
  assert.equal(topLevel.includes('coreCommitments'), false);
  assert.equal(topLevel.includes('resources'), false);
  assert.equal(topLevel.includes('durationDays'), false);
  assert.equal(JSON.stringify(PATH_DRAFT_TOOL).includes('"anyOf"'), false);
  assert.equal(PATH_DRAFT_TOOL.input_schema.properties.tasks.items.properties.progressionCurve.enum.includes('none'), true);
  assert.equal(PATH_DRAFT_TOOL.input_schema.properties.tasks.items.properties.endDay.type, 'number');

  const visit = schema => {
    if(!schema || typeof schema !== 'object') return;
    if(schema.type === 'object') assert.equal(schema.additionalProperties, false);
    Object.values(schema.properties || {}).forEach(visit);
    if(schema.items) visit(schema.items);
  };
  visit(PATH_DRAFT_TOOL.input_schema);
  assert.ok(JSON.stringify(PATH_DRAFT_TOOL).length < 16000);
});

test('complex 75-day fixture keeps confirmed commitments deterministic and bounded', () => {
  const brief = confirmedBrief({
    coreCommitments:[
      { title:'Sleep eight hours', required:true, cadence:{ type:'daily' }, evidenceType:'check-in' },
      { title:'Complete a home workout', required:true, cadence:{ type:'daily' }, evidenceType:'photo' },
      { title:'Complete a gym workout', required:true, cadence:{ type:'times_per_week', timesPerWeek:3 }, evidenceType:'photo' },
      { title:'Read daily', required:true, cadence:{ type:'daily' }, evidenceType:'note' },
      { title:'Study the first course', required:true, cadence:{ type:'times_per_week', timesPerWeek:4 }, evidenceType:'screenshot' },
      { title:'Study the second course', required:true, cadence:{ type:'times_per_week', timesPerWeek:3 }, evidenceType:'screenshot' },
      { title:'Publish a daily progress post', required:true, cadence:{ type:'daily' }, evidenceType:'url' },
      { title:'Drink the water target', required:true, cadence:{ type:'daily' }, evidenceType:'check-in' },
      { title:'Follow the clean meal plan', required:true, cadence:{ type:'daily' }, evidenceType:'photo' },
      { title:'Avoid soda and energy drinks', required:true, cadence:{ type:'daily' }, evidenceType:'check-in' },
    ],
    constraints:['Limit recreational screen time.', 'Work schedule is full-time and professional.'],
    assumptions:[
      { id:'assumption-work', field:'scheduleNotes', text:'Use evenings for longer study blocks.', accepted:true, source:'ai', material:true },
      { id:'assumption-health', field:'constraints', text:'Keep exercise intensity sustainable.', accepted:true, source:'ai', material:true },
    ],
  });
  const input = normalizePrompt({ confirmedBrief:brief, saveOptions:{ visibility:'private' } });
  const draft = normalizeDraft(compactPlan({
    tasks:[
      compactTask({ title:'Plan the week', scheduleType:'weekly', order:0 }),
      compactTask({ title:'Review course notes', scheduleType:'weekly', order:1 }),
      compactTask({ title:'Check screen-time boundary', scheduleType:'daily', endDay:75, order:2 }),
    ],
  }), input, 'anthropic');

  const taskTitles = draft.tasks.map(task => task.title);
  brief.coreCommitments.forEach(commitment => assert.ok(taskTitles.includes(commitment.title), commitment.title));
  assert.equal(draft.durationDays, 75);
  assert.ok(draft.tasks.length <= brief.coreCommitments.length + AI_SUPPORTING_TASK_LIMIT);
  assert.equal(taskTitles.filter(title => title === 'Sleep eight hours').length, 1);
  assert.equal(draft.tasks.some(task => task.endDay === 75 && task.scheduleType === 'daily'), true);
  assert.equal(draft.tasks.some(task => task.progressionCurve === 'none'), false);
  assert.equal(draft.tasks.some(task => task.progressionMetric === ''), false);
  const sections = new Set(draft.sections.map(section => section.title));
  draft.tasks.forEach(task => assert.ok(sections.has(task.sectionTitle), task.sectionTitle));
  assert.equal(JSON.stringify(draft).toLowerCase().includes('run or walk 1km'), false);
});

test('empty supporting tasks recover safely from confirmed commitments without another provider call', async () => {
  const { handler, mock } = generationHandlerWithMessage({
    stop_reason:'tool_use',
    content:[{ type:'tool_use', name:'create_learning_path', input:compactPlan({ tasks:[] }) }],
  });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:confirmedBrief() }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.source, 'anthropic_recovered');
  assert.match(res.payload.message, /safe editable draft/);
  assert.ok(res.payload.draft.tasks.some(task => task.title === 'Complete a final goal review'));
  assert.equal(mock.calls(), 1);
});

test('malformed and excessive supporting task output cannot reach the saved draft', () => {
  const input = normalizePrompt({ confirmedBrief:confirmedBrief() });
  assert.throws(
    () => normalizeDraft(compactPlan({ tasks:new Array(AI_SUPPORTING_TASK_LIMIT + 1).fill(null).map((_, index) => compactTask({ title:`Task ${index}` })) }), input, 'anthropic'),
    error => error.details?.validationReason === 'too_many_tasks'
  );
  assert.throws(
    () => normalizeDraft(compactPlan({ tasks:[{ ...compactTask(), scheduleType:'invalid' }] }), input, 'anthropic'),
    error => error.details?.validationReason === 'invalid_schedule'
  );
});
