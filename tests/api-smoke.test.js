import test from 'node:test';
import assert from 'node:assert/strict';

import interpretGoalHandler from '../api/interpret-goal.js';
import generatePathHandler from '../api/generate-path.js';
import joinPathHandler from '../api/join-path.js';
import commentProgressHandler from '../api/comment-progress.js';
import hideProgressCommentHandler from '../api/hide-progress-comment.js';
import publishProgressHandler from '../api/publish-progress.js';
import reactProgressHandler from '../api/react-progress.js';
import transcribeVoiceHandler from '../api/transcribe-voice.js';
import unpublishProgressHandler from '../api/unpublish-progress.js';

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
    ['join-path', joinPathHandler, unauthenticatedRequest()],
    ['publish-progress', publishProgressHandler, unauthenticatedRequest()],
    ['unpublish-progress', unpublishProgressHandler, unauthenticatedRequest()],
    ['react-progress', reactProgressHandler, unauthenticatedRequest()],
    ['comment-progress', commentProgressHandler, unauthenticatedRequest()],
    ['hide-progress-comment', hideProgressCommentHandler, unauthenticatedRequest()],
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
