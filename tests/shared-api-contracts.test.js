import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  API_ENDPOINTS,
  API_ROUTE_GROUPS,
  API_CONTRACTS,
  SHARED_PRIVACY_CONSTRAINTS,
} from '../src/shared-api-contracts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('API_ENDPOINTS exports exactly 13 endpoint URLs', () => {
  const keys = Object.keys(API_ENDPOINTS);
  assert.equal(keys.length, 13);
});

test('every API_ENDPOINTS value starts with /api/', () => {
  Object.entries(API_ENDPOINTS).forEach(([key, url]) => {
    assert.match(url, /^\/api\//, `${key} should start with /api/`);
  });
});

test('API_ENDPOINTS includes all 13 known endpoints', () => {
  const expected = [
    '/api/generate-path',
    '/api/interpret-goal',
    '/api/deepgram-token',
    '/api/transcribe-voice',
    '/api/join-path',
    '/api/publish-progress',
    '/api/unpublish-progress',
    '/api/react-progress',
    '/api/comment-progress',
    '/api/hide-progress-comment',
    '/api/report-path',
    '/api/report-progress-comment',
    '/api/sync-path-metrics',
  ];
  const actual = Object.values(API_ENDPOINTS);
  expected.forEach(url => {
    assert.ok(actual.includes(url), `missing ${url}`);
  });
});

test('API_ROUTE_GROUPS covers ai, voice, and community', () => {
  assert.ok(Array.isArray(API_ROUTE_GROUPS.ai));
  assert.ok(Array.isArray(API_ROUTE_GROUPS.voice));
  assert.ok(Array.isArray(API_ROUTE_GROUPS.community));
});

test('API_ROUTE_GROUPS.ai contains GENERATE_PATH and INTERPRET_GOAL', () => {
  assert.ok(API_ROUTE_GROUPS.ai.includes('GENERATE_PATH'));
  assert.ok(API_ROUTE_GROUPS.ai.includes('INTERPRET_GOAL'));
});

test('API_ROUTE_GROUPS.voice contains DEEPGRAM_TOKEN and TRANSCRIBE_VOICE', () => {
  assert.ok(API_ROUTE_GROUPS.voice.includes('DEEPGRAM_TOKEN'));
  assert.ok(API_ROUTE_GROUPS.voice.includes('TRANSCRIBE_VOICE'));
});

test('API_ROUTE_GROUPS.community contains all 9 community endpoint keys', () => {
  const expected = [
    'JOIN_PATH', 'PUBLISH_PROGRESS', 'UNPUBLISH_PROGRESS',
    'REACT_PROGRESS', 'COMMENT_PROGRESS', 'HIDE_PROGRESS_COMMENT',
    'REPORT_PATH', 'REPORT_PROGRESS_COMMENT', 'SYNC_PATH_METRICS',
  ];
  expected.forEach(key => {
    assert.ok(API_ROUTE_GROUPS.community.includes(key), `community missing ${key}`);
  });
});

test('every API_ROUTE_GROUPS key references a valid API_ENDPOINTS key', () => {
  const endpointKeys = Object.keys(API_ENDPOINTS);
  Object.entries(API_ROUTE_GROUPS).forEach(([group, keys]) => {
    keys.forEach(key => {
      assert.ok(endpointKeys.includes(key), `${group} references unknown key ${key}`);
    });
  });
});

test('all API_ENDPOINTS keys appear in exactly one route group', () => {
  const allGroupKeys = [
    ...API_ROUTE_GROUPS.ai,
    ...API_ROUTE_GROUPS.voice,
    ...API_ROUTE_GROUPS.community,
  ];
  Object.keys(API_ENDPOINTS).forEach(key => {
    const count = allGroupKeys.filter(k => k === key).length;
    assert.equal(count, 1, `${key} appears ${count} times in route groups`);
  });
});

test('API_CONTRACTS has metadata for every API_ENDPOINTS key', () => {
  Object.keys(API_ENDPOINTS).forEach(key => {
    assert.ok(API_CONTRACTS[key], `missing contract for ${key}`);
    assert.ok(API_CONTRACTS[key].method, `${key} has method`);
    assert.equal(API_CONTRACTS[key].auth, true, `${key} requires auth`);
    assert.ok(API_CONTRACTS[key].router, `${key} has router`);
    assert.ok(API_CONTRACTS[key].privacy, `${key} has privacy`);
    assert.ok(API_CONTRACTS[key].mobileUseCase, `${key} has mobileUseCase`);
  });
});

test('API_CONTRACTS method is POST for all endpoints', () => {
  Object.entries(API_CONTRACTS).forEach(([key, contract]) => {
    assert.equal(contract.method, 'POST', `${key} method should be POST`);
  });
});

test('API_CONTRACTS router references only valid router files', () => {
  const validRouters = ['api/ai.js', 'api/voice.js', 'api/community.js'];
  Object.entries(API_CONTRACTS).forEach(([key, contract]) => {
    assert.ok(validRouters.includes(contract.router), `${key} has invalid router ${contract.router}`);
  });
});

test('AI endpoints route to api/ai.js', () => {
  assert.equal(API_CONTRACTS.GENERATE_PATH.router, 'api/ai.js');
  assert.equal(API_CONTRACTS.INTERPRET_GOAL.router, 'api/ai.js');
});

test('voice endpoints route to api/voice.js', () => {
  assert.equal(API_CONTRACTS.DEEPGRAM_TOKEN.router, 'api/voice.js');
  assert.equal(API_CONTRACTS.TRANSCRIBE_VOICE.router, 'api/voice.js');
});

test('community endpoints route to api/community.js', () => {
  const communityKeys = API_ROUTE_GROUPS.community;
  communityKeys.forEach(key => {
    assert.equal(API_CONTRACTS[key].router, 'api/community.js', `${key} should route to community`);
  });
});

test('SHARED_PRIVACY_CONSTRAINTS is a non-empty array of strings', () => {
  assert.ok(Array.isArray(SHARED_PRIVACY_CONSTRAINTS));
  assert.ok(SHARED_PRIVACY_CONSTRAINTS.length >= 5);
  SHARED_PRIVACY_CONSTRAINTS.forEach(rule => {
    assert.equal(typeof rule, 'string');
  });
});

test('privacy constraints mention evidence URLs, reflections, participantStats, and emails', () => {
  const joined = SHARED_PRIVACY_CONSTRAINTS.join(' ');
  assert.match(joined, /evidence/i);
  assert.match(joined, /reflection/i);
  assert.match(joined, /participantStats/i);
  assert.match(joined, /email/i);
});

test('all API_ENDPOINTS appear in vercel.json rewrites', () => {
  const vercelPath = resolve(root, 'vercel.json');
  assert.ok(existsSync(vercelPath), 'vercel.json exists');
  const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
  const rewriteSources = vercel.rewrites.map(r => r.source);
  Object.values(API_ENDPOINTS).forEach(url => {
    assert.ok(rewriteSources.includes(url), `vercel.json missing rewrite for ${url}`);
  });
});

test('vercel.json rewrite destinations map to the correct router per API_CONTRACTS', () => {
  const vercelPath = resolve(root, 'vercel.json');
  const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
  const routerToPrefix = {
    'api/ai.js': '/api/ai?',
    'api/voice.js': '/api/voice?',
    'api/community.js': '/api/community?',
  };
  Object.entries(API_ENDPOINTS).forEach(([key, url]) => {
    const rewrite = vercel.rewrites.find(r => r.source === url);
    assert.ok(rewrite, `vercel.json missing rewrite for ${url}`);
    const expectedRouter = API_CONTRACTS[key].router;
    const prefix = routerToPrefix[expectedRouter];
    assert.ok(
      rewrite.destination.startsWith(prefix),
      `${url} should route to ${expectedRouter} but routes to ${rewrite.destination}`,
    );
  });
});

test('src/api.js imports API_ENDPOINTS from shared-api-contracts', () => {
  const apiSource = readFileSync(resolve(root, 'src/api.js'), 'utf8');
  assert.match(apiSource, /import.*API_ENDPOINTS.*from.*shared-api-contracts/);
});

test('src/api.js uses API_ENDPOINTS constants instead of hardcoded strings for community endpoints', () => {
  const apiSource = readFileSync(resolve(root, 'src/api.js'), 'utf8');
  assert.match(apiSource, /API_ENDPOINTS\.JOIN_PATH/);
  assert.match(apiSource, /API_ENDPOINTS\.PUBLISH_PROGRESS/);
  assert.match(apiSource, /API_ENDPOINTS\.UNPUBLISH_PROGRESS/);
  assert.match(apiSource, /API_ENDPOINTS\.REACT_PROGRESS/);
  assert.match(apiSource, /API_ENDPOINTS\.COMMENT_PROGRESS/);
  assert.match(apiSource, /API_ENDPOINTS\.HIDE_PROGRESS_COMMENT/);
  assert.match(apiSource, /API_ENDPOINTS\.REPORT_PATH/);
  assert.match(apiSource, /API_ENDPOINTS\.REPORT_PROGRESS_COMMENT/);
  assert.match(apiSource, /API_ENDPOINTS\.SYNC_PATH_METRICS/);
});

test('shared-api-contracts module has no DOM/Firebase/analytics imports', () => {
  const source = readFileSync(resolve(root, 'src/shared-api-contracts.js'), 'utf8');
  assert.doesNotMatch(source, /import.*from.*firebase/i);
  assert.doesNotMatch(source, /import.*from.*views/i);
  assert.doesNotMatch(source, /import.*from.*analytics/i);
  assert.doesNotMatch(source, /document\./);
  assert.doesNotMatch(source, /window\./);
  assert.doesNotMatch(source, /process\.env/);
});

test('docs/api-contracts.md exists and covers required topics', () => {
  const docPath = resolve(root, 'docs/api-contracts.md');
  assert.ok(existsSync(docPath), 'api-contracts.md exists');
  const doc = readFileSync(docPath, 'utf8');
  assert.match(doc, /generate-path/);
  assert.match(doc, /interpret-goal/);
  assert.match(doc, /deepgram-token/);
  assert.match(doc, /transcribe-voice/);
  assert.match(doc, /join-path/);
  assert.match(doc, /publish-progress/);
  assert.match(doc, /unpublish-progress/);
  assert.match(doc, /react-progress/);
  assert.match(doc, /comment-progress/);
  assert.match(doc, /hide-progress-comment/);
  assert.match(doc, /report-path/);
  assert.match(doc, /report-progress-comment/);
  assert.match(doc, /sync-path-metrics/);
  assert.match(doc, /privacy/i);
  assert.match(doc, /Router/i);
  assert.match(doc, /api\/ai\.js/);
  assert.match(doc, /api\/voice\.js/);
  assert.match(doc, /api\/community\.js/);
});
