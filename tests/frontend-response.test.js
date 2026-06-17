import test from 'node:test';
import assert from 'node:assert/strict';

import { recoverAIBuilderState } from '../src/ai-builder-model.js';
import { INVALID_SERVER_RESPONSE_MESSAGE, SERVER_FUNCTION_FAILED_MESSAGE, parseAIResponse } from '../src/ai-response.js';

function response({ ok = false, status = 500, contentType = 'application/json', payload, jsonError = null } = {}){
  return {
    ok,
    status,
    headers:{ get:name => name.toLowerCase() === 'content-type' ? contentType : '' },
    async json(){
      if(jsonError) throw jsonError;
      return payload;
    },
  };
}

test('structured JSON error payloads are preserved for application handling', async () => {
  const payload = {
    ok:false,
    error:'provider_unavailable',
    code:'provider_unavailable',
    message:'The AI service is temporarily unavailable. Try again later.',
  };
  const parsed = await parseAIResponse(response({ status:503, payload }));
  assert.equal(parsed.error, 'provider_unavailable');
  assert.equal(parsed.message, 'The AI service is temporarily unavailable. Try again later.');
});

test('non-JSON HTTP 500 becomes server_function_failed', async () => {
  await assert.rejects(
    () => parseAIResponse(response({ status:500, contentType:'text/html', payload:'<html>FUNCTION_INVOCATION_FAILED</html>' })),
    error => {
      assert.equal(error.code, 'server_function_failed');
      assert.equal(error.message, SERVER_FUNCTION_FAILED_MESSAGE);
      assert.equal(error.status, 500);
      return true;
    }
  );
});

test('empty or plain-text platform failures become server_function_failed', async () => {
  for(const contentType of ['', 'text/plain']){
    await assert.rejects(
      () => parseAIResponse(response({ status:500, contentType, payload:'' })),
      error => error.code === 'server_function_failed' && error.message === SERVER_FUNCTION_FAILED_MESSAGE
    );
  }
});

test('JSON parse failures do not become invalid goal briefs', async () => {
  await assert.rejects(
    () => parseAIResponse(response({ ok:true, status:200, jsonError:new SyntaxError('bad json') })),
    error => error.code === 'invalid_server_response' && error.message === INVALID_SERVER_RESPONSE_MESSAGE
  );
  await assert.rejects(
    () => parseAIResponse(response({ ok:false, status:500, jsonError:new SyntaxError('bad json') })),
    error => error.code === 'server_function_failed' && error.message === SERVER_FUNCTION_FAILED_MESSAGE
  );
});

test('genuine invalid AI brief payloads remain structured application errors', async () => {
  const payload = {
    ok:false,
    error:'invalid_goal_brief',
    code:'invalid_goal_brief',
    message:'The AI returned an incomplete goal brief. Please retry.',
  };
  const parsed = await parseAIResponse(response({ status:502, payload }));
  assert.equal(parsed.error, 'invalid_goal_brief');
  assert.equal(parsed.message, 'The AI returned an incomplete goal brief. Please retry.');
});

test('server startup failures can be surfaced without clearing builder data', async () => {
  const state = {
    prompt:{ goal:'Learn French', coreCommitments:[{ title:'Speaking practice' }], resourceLinks:'https://example.com' },
    clarifyingAnswers:{ level:{ value:'A1' } },
    brief:{ goal:'Learn French', assumptions:[{ text:'Assume 30 minutes daily', accepted:true }], confirmedFields:['goal'] },
    draft:{ title:'French path' },
    saveOptions:{ visibility:'private' },
    loading:true,
    clarifyLoading:true,
  };
  let parsedError = null;
  await assert.rejects(
    () => parseAIResponse(response({ status:500, contentType:'text/html', payload:'FUNCTION_INVOCATION_FAILED' })),
    error => { parsedError = error; return true; }
  );
  const recovered = recoverAIBuilderState(state, parsedError.message, 'brief');
  assert.equal(recovered.prompt, state.prompt);
  assert.equal(recovered.clarifyingAnswers, state.clarifyingAnswers);
  assert.equal(recovered.brief, state.brief);
  assert.equal(recovered.draft, state.draft);
  assert.equal(recovered.saveOptions, state.saveOptions);
  assert.equal(recovered.error, SERVER_FUNCTION_FAILED_MESSAGE);
});
