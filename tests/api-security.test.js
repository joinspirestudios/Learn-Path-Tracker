import test from 'node:test';
import assert from 'node:assert/strict';

import { apiError } from '../api/_lib/errors.js';
import { runProviderRequest } from '../api/_lib/provider.js';
import { enforceRateLimit } from '../api/_lib/rate-limit.js';
import { requireAuth } from '../api/_lib/require-auth.js';
import { createGeneratePathHandler, basicStarterDraft } from '../api/generate-path.js';
import { createInterpretGoalHandler, normalizeBrief } from '../api/interpret-goal.js';
import { createTranscribeVoiceHandler, MAX_AUDIO_BYTES } from '../api/transcribe-voice.js';
import {
  briefFromPrompt, confirmBrief, mergeBriefPreservingConfirmed,
  mergeClarificationAnswers, normalizeConfirmedBrief,
} from '../src/ai-builder-model.js';

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

function jsonRequest(body, authorization = 'Bearer valid-token'){
  return {
    method:'POST',
    headers:{ authorization, 'content-type':'application/json' },
    body,
    once(){},
    off(){},
  };
}

test('authentication rejects missing and malformed bearer tokens', async () => {
  await assert.rejects(() => requireAuth({ headers:{} }, async () => ({ uid:'ignored' })), error => error.code === 'unauthorized');
  await assert.rejects(() => requireAuth({ headers:{ authorization:'Token nope' } }, async () => ({ uid:'ignored' })), error => error.code === 'unauthorized');
});

test('authentication returns a normalized verified context', async () => {
  const context = await requireAuth(
    { headers:{ authorization:'Bearer valid-token' } },
    async token => ({ uid:'verified-user', email:'user@example.com', name:'Ada', tokenValue:token })
  );
  assert.equal(context.uid, 'verified-user');
  assert.equal(context.email, 'user@example.com');
  assert.equal(context.name, 'Ada');
});

test('generation uses verified UID and ignores a client supplied UID', async () => {
  let limitedUid = null;
  let providerCalls = 0;
  let providerBrief = null;
  const handler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async uid => { limitedUid = uid; },
    provider:async input => {
      providerCalls += 1;
      providerBrief = input.confirmedBrief;
      return basicStarterDraft(input, 'test');
    },
  });
  const confirmedBrief = confirmBrief({
    goal:'Practise gratitude nightly for 14 days',
    durationDays:14,
    pathType:'habit',
    assumptions:[],
  });
  const req = jsonRequest({ uid:'another-user', confirmedBrief, visibility:'private' });
  const res = responseRecorder();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(limitedUid, 'verified-user');
  assert.equal(providerCalls, 1);
  assert.equal(providerBrief.briefConfirmed, true);
  assert.equal(providerBrief.durationDays, 14);
});

test('protected route returns 401 when the Firebase bearer token is missing', async () => {
  const handler = createGeneratePathHandler({
    rateLimit:async () => { throw new Error('Rate limit must not run.'); },
    provider:async () => { throw new Error('Provider must not run.'); },
  });
  const req = jsonRequest({ confirmedBrief:confirmBrief({ goal:'Learn piano', durationDays:30 }) }, '');
  const res = responseRecorder();
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.error, 'unauthorized');
});

test('all paid route handlers reject unauthenticated requests before provider use', async () => {
  let providerCalls = 0;
  const neverProvider = async () => { providerCalls += 1; };
  const handlers = [
    [createInterpretGoalHandler({ provider:neverProvider }), jsonRequest({ roughGoal:'Learn piano' }, '')],
    [createGeneratePathHandler({ provider:neverProvider }), jsonRequest({ confirmedBrief:confirmBrief({ goal:'Learn piano', durationDays:30 }) }, '')],
    [createTranscribeVoiceHandler({ provider:neverProvider }), {
      method:'POST', headers:{ 'content-type':'audio/webm' }, body:Buffer.from('audio'), once(){}, off(){},
    }],
  ];
  for(const [handler, request] of handlers){
    const response = responseRecorder();
    await handler(request, response);
    assert.equal(response.statusCode, 401);
    assert.equal(response.payload.error, 'unauthorized');
    assert.equal(response.headers['Cache-Control'], 'private, no-store, max-age=0');
    assert.ok(response.headers['X-Request-Id']);
  }
  assert.equal(providerCalls, 0);
});

test('rate-limited generation returns 429 with Retry-After and skips provider', async () => {
  let providerCalls = 0;
  const handler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {
      const error = apiError('rate_limited', 'Limit reached.', 429);
      error.retryAfterSeconds = 120;
      throw error;
    },
    provider:async () => { providerCalls += 1; },
  });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:confirmBrief({ goal:'Learn piano', durationDays:30 }) }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.payload.message, 'Limit reached.');
  assert.equal(res.headers['Retry-After'], '120');
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(providerCalls, 0);
});

test('Firestore-backed rate limiter allows requests below burst limit and rejects excess', async () => {
  const documents = new Map();
  const db = {
    collection(){
      return { doc:id => ({ id }) };
    },
    async runTransaction(callback){
      const pending = [];
      const transaction = {
        async get(ref){
          const data = documents.get(ref.id);
          return { exists:!!data, data:() => data };
        },
        set(ref, value){ pending.push([ref.id, value]); },
      };
      const result = await callback(transaction);
      pending.forEach(([id, value]) => documents.set(id, value));
      return result;
    },
  };
  const now = Date.now();
  await enforceRateLimit('user-a', 'generate', { db, now });
  await enforceRateLimit('user-a', 'generate', { db, now:now + 1 });
  await enforceRateLimit('user-a', 'generate', { db, now:now + 2 });
  await assert.rejects(
    () => enforceRateLimit('user-a', 'generate', { db, now:now + 3 }),
    error => error.code === 'rate_limited' && error.status === 429
  );
});

test('provider timeout aborts work and returns a structured timeout error', async () => {
  let aborted = false;
  await assert.rejects(
    () => runProviderRequest(null, 5, signal => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    })),
    error => error.code === 'provider_timeout' && error.status === 504
  );
  assert.equal(aborted, true);
});

test('route-level provider timeout returns structured 504 without reporting success', async () => {
  const handler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:async () => { throw new Error('Provider should be wrapped.'); },
    runProvider:async () => { throw apiError('provider_timeout', 'The provider request took too long and was cancelled. Try again.', 504); },
  });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:confirmBrief({ goal:'Learn piano', durationDays:30 }) }), res);
  assert.equal(res.statusCode, 504);
  assert.equal(res.payload.ok, false);
  assert.equal(res.payload.error, 'provider_timeout');
});

test('clarification answers update target fields and AI proposals cannot overwrite locked values', () => {
  const base = normalizeConfirmedBrief({
    goal:'Become conversational in French',
    clarifyingQuestions:[{
      id:'question-current-level', targetField:'currentBaseline',
      prompt:'What is your current French level?', required:true, reason:'Changes progression.',
    }],
  });
  const answered = mergeClarificationAnswers(base, {
    'question-current-level':{ targetField:'currentBaseline', value:'A1' },
  });
  assert.equal(answered.currentBaseline, 'A1');
  assert.ok(answered.confirmedFields.includes('currentBaseline'));
  const merged = mergeBriefPreservingConfirmed(answered, { currentBaseline:'Complete beginner' });
  assert.equal(merged.currentBaseline, 'A1');
});

test('unaccepted material assumptions block generation while accepted assumptions reach the provider', async () => {
  let providerCalls = 0;
  let receivedAssumptions = null;
  const handler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:async input => {
      providerCalls += 1;
      receivedAssumptions = input.assumptions;
      return basicStarterDraft(input, 'test');
    },
  });
  const unconfirmedAssumption = confirmBrief({
    goal:'Learn piano', durationDays:30,
    assumptions:[{ id:'assumption-level', field:'currentBaseline', text:'Starting from no piano experience.', accepted:false, source:'ai', material:true }],
  });
  const blocked = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:unconfirmedAssumption }), blocked);
  assert.equal(blocked.statusCode, 400);
  assert.equal(providerCalls, 0);

  const acceptedAssumption = confirmBrief({
    ...unconfirmedAssumption,
    assumptions:unconfirmedAssumption.assumptions.map(item => ({ ...item, accepted:true })),
  });
  const allowed = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:acceptedAssumption }), allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(providerCalls, 1);
  assert.equal(receivedAssumptions[0].accepted, true);
});

test('neutral normalization does not insert beginner or moderate defaults', () => {
  const brief = normalizeConfirmedBrief({ goal:'Learn guitar', durationDays:30 });
  assert.equal(brief.currentLevel, '');
  assert.equal(brief.intensity, '');
});

test('vague interpretations can ask material questions while detailed goals can proceed', () => {
  const vague = normalizeBrief({
    goal:'Become conversational in French', summary:'French conversation', pathType:'skill',
    materialGaps:['current level', 'available practice time'],
    clarifyingQuestions:[{
      id:'question-current-level', targetField:'currentBaseline', prompt:'What is your current level?',
      required:true, reason:'Changes starting difficulty.',
    }],
    assumptions:[], readyToGenerate:false,
  });
  const detailed = normalizeBrief({
    goal:'Write one gratitude entry every night for 14 days', summary:'14-day gratitude practice', pathType:'habit',
    durationDays:14, materialGaps:[], clarifyingQuestions:[], assumptions:[], readyToGenerate:true,
  });
  assert.equal(vague.readyToGenerate, false);
  assert.equal(vague.clarifyingQuestions[0].id, 'question-current-level');
  assert.equal(detailed.readyToGenerate, true);
});

test('interpretation route requires auth and reaches provider only after validation and rate limit', async () => {
  let calls = 0;
  const handler = createInterpretGoalHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:async () => {
      calls += 1;
      return {
        goal:'Write one gratitude entry every night for 14 days', summary:'Gratitude practice', pathType:'habit',
        durationDays:14, materialGaps:[], clarifyingQuestions:[], assumptions:[], readyToGenerate:true,
      };
    },
  });
  const res = responseRecorder();
  await handler(jsonRequest({ roughGoal:'Write one gratitude entry every night for 14 days' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(calls, 1);
});

test('voice validation rejects unsupported MIME type after rate limit and before provider use', async () => {
  let rateCalls = 0;
  let providerCalls = 0;
  const handler = createTranscribeVoiceHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => { rateCalls += 1; },
    provider:async () => { providerCalls += 1; },
  });
  const req = {
    method:'POST', headers:{ authorization:'Bearer token', 'content-type':'text/plain' },
    body:Buffer.from('not audio'), once(){}, off(){},
  };
  const res = responseRecorder();
  await handler(req, res);
  assert.equal(res.statusCode, 415);
  assert.equal(rateCalls, 1);
  assert.equal(providerCalls, 0);
});

test('voice rate limiting happens before the request stream is buffered', async () => {
  let iterated = false;
  let providerCalls = 0;
  const handler = createTranscribeVoiceHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => { throw apiError('rate_limited', 'Limit reached.', 429); },
    provider:async () => { providerCalls += 1; },
  });
  const req = {
    method:'POST', headers:{ authorization:'Bearer token', 'content-type':'audio/webm' },
    once(){}, off(){},
    async *[Symbol.asyncIterator](){ iterated = true; yield Buffer.from('audio'); },
  };
  const res = responseRecorder();
  await handler(req, res);
  assert.equal(res.statusCode, 429);
  assert.equal(iterated, false);
  assert.equal(providerCalls, 0);
});

test('oversized voice content is rejected before provider use', async () => {
  let providerCalls = 0;
  const handler = createTranscribeVoiceHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:async () => { providerCalls += 1; },
  });
  const req = {
    method:'POST', headers:{ authorization:'Bearer token', 'content-type':'audio/webm', 'content-length':String(MAX_AUDIO_BYTES + 1) },
    body:Buffer.from('small'), once(){}, off(){},
  };
  const res = responseRecorder();
  await handler(req, res);
  assert.equal(res.statusCode, 413);
  assert.equal(providerCalls, 0);
});

test('oversized streamed voice upload stops reading and never reaches Deepgram', async () => {
  let providerCalls = 0;
  let destroyed = false;
  let chunksRead = 0;
  const handler = createTranscribeVoiceHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:async () => { providerCalls += 1; },
  });
  const req = {
    method:'POST', headers:{ authorization:'Bearer token', 'content-type':'audio/webm' },
    once(){}, off(){}, destroy(){ destroyed = true; },
    async *[Symbol.asyncIterator](){
      chunksRead += 1;
      yield Buffer.alloc(MAX_AUDIO_BYTES);
      chunksRead += 1;
      yield Buffer.alloc(1);
      chunksRead += 1;
      yield Buffer.alloc(1024);
    },
  };
  const res = responseRecorder();
  await handler(req, res);
  assert.equal(res.statusCode, 413);
  assert.equal(destroyed, true);
  assert.equal(chunksRead, 2);
  assert.equal(providerCalls, 0);
});

test('protected responses are private no-store and include a request ID', async () => {
  const handler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:async input => basicStarterDraft(input, 'test'),
  });
  const res = responseRecorder();
  await handler(jsonRequest({
    confirmedBrief:confirmBrief({ goal:'Learn piano', durationDays:30 }),
    saveOptions:{ visibility:'private' },
  }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.ok(res.headers['X-Request-Id']);
  assert.equal(res.payload.requestId, res.headers['X-Request-Id']);
});

test('all protected route successes include private no-store headers', async () => {
  const confirmedBrief = confirmBrief({ goal:'Learn piano', durationDays:30 });
  const cases = [
    [createGeneratePathHandler({
      authenticate:async () => ({ uid:'verified-user' }), rateLimit:async () => {},
      provider:async input => basicStarterDraft(input, 'test'),
    }), jsonRequest({ confirmedBrief, saveOptions:{ visibility:'private' } })],
    [createInterpretGoalHandler({
      authenticate:async () => ({ uid:'verified-user' }), rateLimit:async () => {},
      provider:async () => ({
        goal:'Learn piano', summary:'Piano practice', pathType:'skill', durationDays:30,
        materialGaps:[], clarifyingQuestions:[], assumptions:[], readyToGenerate:true,
      }),
    }), jsonRequest({ roughGoal:'Learn piano' })],
    [createTranscribeVoiceHandler({
      authenticate:async () => ({ uid:'verified-user' }), rateLimit:async () => {},
      provider:async () => ({ transcript:'Learn piano', duration:2, confidence:0.9 }),
    }), {
      method:'POST', headers:{ authorization:'Bearer token', 'content-type':'audio/webm' },
      body:Buffer.from('audio'), once(){}, off(){},
    }],
  ];
  for(const [handler, req] of cases){
    const res = responseRecorder();
    await handler(req, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
    assert.equal(res.headers.Pragma, 'no-cache');
    assert.equal(res.headers.Expires, '0');
    assert.ok(res.headers['X-Request-Id']);
  }
});

test('unexpected server errors do not expose internal messages', async () => {
  const handler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    runProvider:async () => { throw new Error('database password is secret'); },
  });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief:confirmBrief({ goal:'Learn piano', durationDays:30 }) }), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.payload.error, 'internal_error');
  assert.doesNotMatch(res.payload.message, /password|secret/i);
  assert.equal(res.payload.stack, undefined);
  assert.equal(res.payload.details, null);
  assert.ok(res.payload.requestId);
});

test('conflicting legacy generation fields are rejected before provider use', async () => {
  let providerCalls = 0;
  const handler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:async () => { providerCalls += 1; },
  });
  const confirmedBrief = confirmBrief({ goal:'Learn piano', durationDays:30, description:'Daily piano plan' });
  const res = responseRecorder();
  await handler(jsonRequest({ confirmedBrief, description:'A conflicting plan' }), res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error, 'conflicting_brief_data');
  assert.equal(providerCalls, 0);
});

test('exact legacy duplicates are ignored while material conflicts are rejected', async () => {
  let providerCalls = 0;
  const handler = createGeneratePathHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:async input => { providerCalls += 1; return basicStarterDraft(input, 'test'); },
  });
  const confirmedBrief = confirmBrief({
    goal:'Learn piano', durationDays:30, currentLevel:'beginner',
    resources:['https://example.com/course'], description:'Daily piano plan',
  });
  const exact = responseRecorder();
  await handler(jsonRequest({
    confirmedBrief,
    currentLevel:'beginner', durationDays:30,
    resourceLinks:'https://example.com/course', description:'Daily piano plan',
    saveOptions:{ visibility:'unlisted' }, visibility:'unlisted',
  }), exact);
  assert.equal(exact.statusCode, 200);
  assert.equal(exact.payload.draft.visibility, 'unlisted');
  assert.equal(providerCalls, 1);

  for(const conflict of [
    { currentLevel:'advanced' },
    { durationDays:60 },
    { resourceLinks:'https://example.com/other' },
  ]){
    const res = responseRecorder();
    await handler(jsonRequest({ confirmedBrief, ...conflict }), res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.error, 'conflicting_brief_data');
  }
  assert.equal(providerCalls, 1);
});

test('brief created from prompt keeps original user values authoritative', () => {
  const brief = briefFromPrompt({
    goal:'Hold a 15-minute French conversation', currentStage:'A1', durationDays:270,
    dailyTime:'45 minutes on weekdays', intensity:'light',
  });
  assert.equal(brief.currentBaseline, 'A1');
  assert.equal(brief.durationDays, 270);
  assert.ok(brief.confirmedFields.includes('currentBaseline'));
  assert.ok(brief.confirmedFields.includes('durationDays'));
});
