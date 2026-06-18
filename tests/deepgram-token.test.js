import test from 'node:test';
import assert from 'node:assert/strict';

import { apiError } from '../api/_lib/errors.js';
import { createDeepgramTokenHandler, DEEPGRAM_TOKEN_TIMEOUT_MS, requestDeepgramToken } from '../api/deepgram-token.js';

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

function req(method = 'POST', authorization = 'Bearer valid-token'){
  return {
    method,
    headers:{ authorization, 'content-type':'application/json' },
    body:{},
    once(){},
    off(){},
  };
}

test('deepgram token endpoint accepts POST only and returns private no-store responses', async () => {
  const handler = createDeepgramTokenHandler();
  const res = responseRecorder();
  await handler(req('GET'), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'POST');
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.ok(res.headers['X-Request-Id']);
});

test('deepgram token endpoint rejects unauthenticated requests before rate limit or provider use', async () => {
  let rateCalls = 0;
  let providerCalls = 0;
  const handler = createDeepgramTokenHandler({
    authenticate:async () => { throw apiError('unauthorized', 'Nope.', 401); },
    rateLimit:async () => { rateCalls += 1; },
    provider:async () => { providerCalls += 1; },
  });
  const res = responseRecorder();
  await handler(req('POST', ''), res);
  assert.equal(res.statusCode, 401);
  assert.equal(rateCalls, 0);
  assert.equal(providerCalls, 0);
});

test('deepgram token endpoint preserves revoked-token auth failure', async () => {
  const handler = createDeepgramTokenHandler({
    authenticate:async () => { throw apiError('unauthorized', 'Your session is invalid or expired. Sign in again.', 401); },
    rateLimit:async () => { throw new Error('rate limit should not run'); },
    provider:async () => { throw new Error('provider should not run'); },
  });
  const res = responseRecorder();
  await handler(req(), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, 'unauthorized');
});

test('deepgram token endpoint applies voice rate limiting before provider grant', async () => {
  let providerCalls = 0;
  const handler = createDeepgramTokenHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async (uid, route) => {
      assert.equal(uid, 'verified-user');
      assert.equal(route, 'transcribe');
      throw apiError('rate_limited', 'Limit reached.', 429);
    },
    provider:async () => { providerCalls += 1; },
  });
  const res = responseRecorder();
  await handler(req(), res);
  assert.equal(res.statusCode, 429);
  assert.equal(providerCalls, 0);
});

test('deepgram token endpoint returns only temporary token metadata on success', async () => {
  let rateCalls = 0;
  let providerCalls = 0;
  const handler = createDeepgramTokenHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => { rateCalls += 1; },
    provider:async signal => {
      providerCalls += 1;
      assert.ok(signal);
      return { accessToken:'temporary-jwt', expiresIn:30, permanentKey:'never-return-this' };
    },
  });
  const res = responseRecorder();
  await handler(req(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(rateCalls, 1);
  assert.equal(providerCalls, 1);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.accessToken, 'temporary-jwt');
  assert.equal(res.payload.expiresIn, 30);
  assert.equal(res.payload.permanentKey, undefined);
  assert.equal(JSON.stringify(res.payload).includes('never-return-this'), false);
});

test('deepgram token endpoint normalizes provider and timeout errors', async () => {
  const providerFailure = createDeepgramTokenHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    provider:async () => { throw apiError('provider_unavailable', 'Live transcription is temporarily unavailable.', 503); },
  });
  const providerRes = responseRecorder();
  await providerFailure(req(), providerRes);
  assert.equal(providerRes.statusCode, 503);
  assert.equal(providerRes.payload.code, 'provider_unavailable');

  const timeoutFailure = createDeepgramTokenHandler({
    authenticate:async () => ({ uid:'verified-user' }),
    rateLimit:async () => {},
    runProvider:async () => { throw apiError('provider_timeout', 'Timed out.', 504); },
  });
  const timeoutRes = responseRecorder();
  await timeoutFailure(req(), timeoutRes);
  assert.equal(timeoutRes.statusCode, 504);
  assert.equal(timeoutRes.payload.code, 'provider_timeout');
  assert.equal(DEEPGRAM_TOKEN_TIMEOUT_MS, 10_000);
});

test('deepgram provider grant uses server-side permanent key and never returns it', async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.DEEPGRAM_API_KEY;
  try{
    process.env.DEEPGRAM_API_KEY = 'test-key';
    let fetchUrl = '';
    let authHeader = '';
    globalThis.fetch = async (url, options) => {
      fetchUrl = url;
      authHeader = options.headers.Authorization;
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).ttl_seconds, 30);
      return { ok:true, json:async () => ({ access_token:'temporary-token', expires_in:30 }) };
    };
    const grant = await requestDeepgramToken(new AbortController().signal);
    assert.equal(fetchUrl, 'https://api.deepgram.com/v1/auth/grant');
    assert.equal(authHeader, 'Token test-key');
    assert.deepEqual(grant, { accessToken:'temporary-token', expiresIn:30 });
  } finally {
    globalThis.fetch = originalFetch;
    if(originalKey == null) delete process.env.DEEPGRAM_API_KEY;
    else process.env.DEEPGRAM_API_KEY = originalKey;
  }
});
