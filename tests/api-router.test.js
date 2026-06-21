import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import aiRouter from '../api/ai.js';
import communityRouter from '../api/community.js';
import voiceRouter, { config as voiceConfig } from '../api/voice.js';

const rewriteMap = {
  '/api/generate-path':'/api/ai?route=generate-path',
  '/api/interpret-goal':'/api/ai?route=interpret-goal',
  '/api/deepgram-token':'/api/voice?route=deepgram-token',
  '/api/transcribe-voice':'/api/voice?route=transcribe-voice',
  '/api/join-path':'/api/community?route=join-path',
  '/api/publish-progress':'/api/community?route=publish-progress',
  '/api/unpublish-progress':'/api/community?route=unpublish-progress',
  '/api/react-progress':'/api/community?route=react-progress',
  '/api/comment-progress':'/api/community?route=comment-progress',
  '/api/hide-progress-comment':'/api/community?route=hide-progress-comment',
  '/api/report-path':'/api/community?route=report-path',
  '/api/report-progress-comment':'/api/community?route=report-progress-comment',
  '/api/sync-path-metrics':'/api/community?route=sync-path-metrics',
};

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

function request(route, contentType = 'application/json'){
  return {
    method:'POST',
    query:{ route },
    url:`/api/router?route=${encodeURIComponent(route)}`,
    headers:{ 'content-type':contentType },
    body:{},
    once(){},
    off(){},
    [Symbol.asyncIterator]:async function*(){},
  };
}

async function expectDelegatedUnauthorized(router, route, contentType){
  const res = responseRecorder();
  await router(request(route, contentType), res);
  assert.equal(res.statusCode, 401, route);
  assert.equal(res.payload?.ok, false, route);
  assert.equal(res.payload?.error, 'unauthorized', route);
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0', route);
  assert.ok(res.payload?.requestId, route);
}

async function expectUnknownRoute(router){
  const res = responseRecorder();
  await router(request('missing-route'), res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.payload?.ok, false);
  assert.equal(res.payload?.error, 'not_found');
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.ok(res.payload?.requestId);
}

test('AI router delegates known routes and keeps auth handler-owned', async () => {
  await expectDelegatedUnauthorized(aiRouter, 'generate-path');
  await expectDelegatedUnauthorized(aiRouter, 'interpret-goal');
  await expectUnknownRoute(aiRouter);
});

test('voice router delegates known routes and keeps raw body parsing disabled', async () => {
  assert.deepEqual(voiceConfig, { api:{ bodyParser:false } });
  await expectDelegatedUnauthorized(voiceRouter, 'deepgram-token');
  await expectDelegatedUnauthorized(voiceRouter, 'transcribe-voice', 'audio/webm');
  await expectUnknownRoute(voiceRouter);
});

test('community router delegates known routes and keeps auth handler-owned', async () => {
  const routes = [
    'join-path',
    'publish-progress',
    'unpublish-progress',
    'react-progress',
    'comment-progress',
    'hide-progress-comment',
    'report-path',
    'report-progress-comment',
    'sync-path-metrics',
  ];
  for(const route of routes){
    await expectDelegatedUnauthorized(communityRouter, route);
  }
  await expectUnknownRoute(communityRouter);
});

test('Vercel rewrites preserve every existing public API URL', () => {
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrites = new Map((vercel.rewrites || []).map(item => [item.source, item.destination]));
  for(const [source, destination] of Object.entries(rewriteMap)){
    assert.equal(rewrites.get(source), destination, source);
  }
  const firstNonApiIndex = (vercel.rewrites || []).findIndex(item => !item.source.startsWith('/api/'));
  const lastApiIndex = (vercel.rewrites || []).findLastIndex(item => item.source.startsWith('/api/'));
  assert.ok(lastApiIndex >= 0);
  assert.ok(firstNonApiIndex > lastApiIndex);
  assert.equal(rewrites.has('/api/:path*'), false);
});
