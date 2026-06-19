import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  initialRouteIntent,
  legacyPathShareLink,
  makePendingPathRoute,
  parsePathRoute,
  pathHash,
  pathPreviewHash,
  pathPreviewPath,
  pathShareLink,
} from '../src/routes.js';

test('path route parser supports legacy hash preview, plan, and roadmap day routes', () => {
  assert.deepEqual(parsePathRoute({ hash:'#/path/public-path_1/preview' }), {
    kind:'path',
    id:'public-path_1',
    preview:true,
    options:{ tab:null, day:null },
    source:'hash',
  });
  assert.deepEqual(parsePathRoute({ hash:'#/path/public-path_1/plan' }), {
    kind:'path',
    id:'public-path_1',
    preview:false,
    options:{ tab:'plan', day:null },
    source:'hash',
  });
  assert.deepEqual(parsePathRoute({ hash:'#/path/public-path_1/roadmap/day/7' }), {
    kind:'path',
    id:'public-path_1',
    preview:false,
    options:{ tab:'plan', day:7 },
    source:'hash',
  });
  assert.equal(pathHash('public-path_1', 'plan', 7), '#/path/public-path_1/plan/roadmap/day/7');
  assert.equal(pathPreviewHash('public-path_1'), '#/path/public-path_1/preview');
});

test('path route parser supports clean shared path URLs without breaking hash links', () => {
  assert.deepEqual(parsePathRoute({ pathname:'/path/public-path_1/preview' }), {
    kind:'path',
    id:'public-path_1',
    preview:true,
    options:{ tab:null, day:null },
    source:'pathname',
  });
  assert.deepEqual(parsePathRoute({ pathname:'/path/public-path_1/plan' }), {
    kind:'path',
    id:'public-path_1',
    preview:false,
    options:{ tab:'plan', day:null },
    source:'pathname',
  });
  assert.deepEqual(parsePathRoute({ pathname:'/path/public-path_1/roadmap/day/2' }), {
    kind:'path',
    id:'public-path_1',
    preview:false,
    options:{ tab:'plan', day:2 },
    source:'pathname',
  });
  assert.equal(pathPreviewPath('public-path_1'), '/path/public-path_1/preview');
});

test('path route parser rejects unsafe path IDs', () => {
  assert.equal(parsePathRoute({ hash:'#/path/../preview' }), null);
  assert.equal(parsePathRoute({ pathname:'/path/%2Fsecret/preview' }), null);
  assert.equal(parsePathRoute({ hash:'#/path/user@example.com/preview' }), null);
});

test('current shared URL route wins over stored last route', () => {
  const currentHash = initialRouteIntent(
    { hash:'#/path/current-path/preview', pathname:'/', search:'' },
    '#/discover',
  );
  assert.equal(currentHash.source, 'current-url');
  assert.equal(currentHash.pathRoute.id, 'current-path');
  assert.equal(currentHash.restoreHash, null);

  const currentClean = initialRouteIntent(
    { hash:'', pathname:'/path/clean-path/preview', search:'' },
    '#/discover',
  );
  assert.equal(currentClean.source, 'current-url');
  assert.equal(currentClean.pathRoute.id, 'clean-path');
  assert.equal(currentClean.restoreHash, null);

  const restored = initialRouteIntent({ hash:'', pathname:'/', search:'' }, '#/path/stored-path/plan');
  assert.equal(restored.source, 'last-route');
  assert.equal(restored.pathRoute.id, 'stored-path');
  assert.equal(restored.restoreHash, '#/path/stored-path/plan');
});

test('share link helpers produce clean public preview links and safe legacy fallbacks', () => {
  assert.equal(pathShareLink('public-path_1', 'https://learn-path-tracker.vercel.app'), 'https://learn-path-tracker.vercel.app/path/public-path_1/preview');
  assert.equal(legacyPathShareLink('public-path_1', 'https://learn-path-tracker.vercel.app'), 'https://learn-path-tracker.vercel.app/#/path/public-path_1/preview');
  assert.equal(pathShareLink('bad/user', 'https://learn-path-tracker.vercel.app'), 'https://learn-path-tracker.vercel.app/');
  const link = pathShareLink('public-path_1', 'https://learn-path-tracker.vercel.app');
  assert.doesNotMatch(link, /@/);
  assert.doesNotMatch(link, /token|jwt|firebase/i);
});

test('pending shared route keeps path intent while cloud readiness catches up', () => {
  const route = parsePathRoute({ hash:'#/path/public-path_1/preview' });
  const pending = makePendingPathRoute(route, 'cloud');
  assert.equal(pending.kind, 'path');
  assert.equal(pending.id, 'public-path_1');
  assert.equal(pending.preview, true);
  assert.equal(pending.waitingFor, 'cloud');
  assert.deepEqual(pending.options, { tab:null, day:null });
});

test('boot and view sources preserve shared routes instead of falling through to discover', () => {
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  assert.match(main, /initialRouteIntent/);
  assert.match(main, /parsePathRoute\(\{ hash:location\.hash, pathname:location\.pathname, search:location\.search \}\)/);
  assert.match(main, /hasPendingPathRoute\(\)/);
  assert.match(main, /retryPendingPathRoute\(\)/);
  assert.match(views, /Opening shared path/);
  assert.match(views, /Checking cloud connection/);
  assert.match(views, /We could not load this shared path yet/);
  assert.match(views, /setPendingPathRoute/);
});

test('Vercel clean path rewrite is narrow and preserves API and Firebase rewrites', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const rewrites = config.rewrites || [];
  assert.ok(rewrites.some(item => item.source === '/__/auth/:path*'));
  assert.ok(rewrites.some(item => item.source === '/__/firebase/:path*'));
  assert.ok(rewrites.some(item => item.source === '/path/:path*' && item.destination === '/index.html'));
  assert.equal(rewrites.some(item => item.source === '/api/:path*'), false);
  assert.equal(rewrites.some(item => item.source === '/:path*'), false);
});
