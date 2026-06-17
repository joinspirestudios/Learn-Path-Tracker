import test from 'node:test';
import assert from 'node:assert/strict';

import interpretGoalHandler from '../api/interpret-goal.js';
import generatePathHandler from '../api/generate-path.js';
import transcribeVoiceHandler from '../api/transcribe-voice.js';

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

function unauthenticatedRequest(contentType = 'application/json'){
  return {
    method:'POST',
    headers:{ 'content-type':contentType },
    body:{},
    once(){},
    off(){},
    [Symbol.asyncIterator]:async function*(){},
  };
}

test('protected API modules import and reject unauthenticated requests with structured JSON', async () => {
  const routes = [
    ['interpret-goal', interpretGoalHandler, unauthenticatedRequest()],
    ['generate-path', generatePathHandler, unauthenticatedRequest()],
    ['transcribe-voice', transcribeVoiceHandler, unauthenticatedRequest('audio/webm')],
  ];

  for(const [name, handler, req] of routes){
    const res = responseRecorder();
    await handler(req, res);
    assert.equal(res.statusCode, 401, name);
    assert.equal(res.payload?.ok, false, name);
    assert.equal(res.payload?.error, 'unauthorized', name);
    assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0', name);
    assert.ok(res.payload?.requestId, name);
  }
});
