import test from 'node:test';
import assert from 'node:assert/strict';

import { createRouteLogger, requestBodyBytes, safeLog } from '../api/_lib/diagnostics.js';

test('safe latency logs include correlation and timing metadata', () => {
  const records = [];
  const logger = {
    info(event, entry){ records.push({ level:'info', event, entry }); },
    warn(event, entry){ records.push({ level:'warn', event, entry }); },
  };
  let now = 1000;
  const log = createRouteLogger('interpret-goal', 'req-123', { logger, now:() => now });
  now = 1242;
  log.event('interpret_provider_completed', {
    timeoutMs:90_000,
    providerElapsedMs:240,
    result:'ok',
    model:'claude-sonnet-4-6',
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].entry.requestId, 'req-123');
  assert.equal(records[0].entry.route, 'interpret-goal');
  assert.equal(records[0].entry.elapsedMs, 242);
  assert.equal(records[0].entry.providerElapsedMs, 240);
  assert.equal(records[0].entry.timeoutMs, 90_000);
  assert.equal(records[0].entry.result, 'ok');
});

test('safe latency logs drop user content and sensitive fields', () => {
  const records = [];
  const logger = {
    info(event, entry){ records.push(JSON.stringify({ event, entry })); },
  };
  safeLog(logger, 'info', 'interpret_request_started', {
    requestId:'req-123',
    route:'interpret-goal',
    goalCharacterCount:42,
    rawGoal:'My private goal text',
    transcript:'private transcript',
    authorization:'Bearer secret-token',
    apiKey:'sk-ant-secret',
    firebasePrivateKey:'-----BEGIN PRIVATE KEY-----',
    requestBody:{ goal:'private' },
    url:'https://private.example/resource',
  });

  const serialized = records.join('\n');
  assert.match(serialized, /req-123/);
  assert.match(serialized, /goalCharacterCount/);
  assert.doesNotMatch(serialized, /private goal|private transcript|secret-token|sk-ant|PRIVATE KEY|private\.example|requestBody/);
});

test('request body byte helper uses declared length before inspecting body', () => {
  assert.equal(requestBodyBytes({ headers:{ 'content-length':'123' } }, { goal:'Do not log me' }), 123);
  assert.equal(requestBodyBytes({ headers:{} }, { ok:true }), Buffer.byteLength(JSON.stringify({ ok:true }), 'utf8'));
  assert.equal(requestBodyBytes({ headers:{} }, Buffer.from('audio')), 5);
});
