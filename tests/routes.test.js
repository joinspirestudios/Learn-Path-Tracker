import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  focusHash,
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
    options:{ tab:null, day:null, focus:false },
    source:'hash',
  });
  assert.deepEqual(parsePathRoute({ hash:'#/path/public-path_1/plan' }), {
    kind:'path',
    id:'public-path_1',
    preview:false,
    options:{ tab:'plan', day:null, focus:false },
    source:'hash',
  });
  assert.deepEqual(parsePathRoute({ hash:'#/path/public-path_1/roadmap/day/7' }), {
    kind:'path',
    id:'public-path_1',
    preview:false,
    options:{ tab:'plan', day:7, focus:false },
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
    options:{ tab:null, day:null, focus:false },
    source:'pathname',
  });
  assert.deepEqual(parsePathRoute({ pathname:'/path/public-path_1/plan' }), {
    kind:'path',
    id:'public-path_1',
    preview:false,
    options:{ tab:'plan', day:null, focus:false },
    source:'pathname',
  });
  assert.deepEqual(parsePathRoute({ pathname:'/path/public-path_1/roadmap/day/2' }), {
    kind:'path',
    id:'public-path_1',
    preview:false,
    options:{ tab:'plan', day:2, focus:false },
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
  assert.deepEqual(pending.options, { tab:null, day:null, focus:false });
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

test('full path routes require owner or member access before opening the plan', () => {
  const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const routeBlock = views.slice(views.indexOf('async function openPathRoute'), views.indexOf('function renderMissingPath'));
  assert.match(routeBlock, /canAccessFullPath\(record\.path, record\.membership, store\.currentUser\)/);
  assert.match(routeBlock, /renderPathPreview\(record\)/);
  assert.doesNotMatch(routeBlock, /canViewPath\(record\.path/);
});

test('focus route parses safely for hash style consistent with existing router', () => {
  const route = parsePathRoute({ hash:'#/path/my-path/plan/roadmap/day/3/focus' });
  assert.equal(route.kind, 'path');
  assert.equal(route.id, 'my-path');
  assert.equal(route.options.day, 3);
  assert.equal(route.options.focus, true);
  assert.equal(route.preview, false);

  const noDay = parsePathRoute({ hash:'#/path/my-path/plan' });
  assert.equal(noDay.options.focus, false);
  assert.equal(noDay.options.day, null);

  assert.equal(focusHash('my-path', 3), '#/path/my-path/plan/roadmap/day/3/focus');
  assert.equal(focusHash('', 1), '#/discover');
  assert.equal(focusHash('my-path', 0), '#/discover');
});

test('focus route pending preserves focus flag through cloud wait', () => {
  const route = parsePathRoute({ hash:'#/path/public-path_1/plan/roadmap/day/1/focus' });
  const pending = makePendingPathRoute(route, 'cloud');
  assert.equal(pending.options.focus, true);
  assert.equal(pending.options.day, 1);
});

test('dedicated focus screen renders back-to-roadmap and session body', () => {
  const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  assert.match(views, /navigateToFocus/);
  assert.match(views, /exitFocusScreen/);
  assert.match(views, /focusScreenActive/);
  assert.match(views, /focusBackToRoadmap/);
  assert.match(views, /renderFocusScreen/);
  assert.match(views, /wireFocusScreenControls/);
});

test('start journey navigates to focus screen instead of embedding session below roadmap', () => {
  const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const startBlock = views.slice(views.indexOf('async function startPathJourney'), views.indexOf('async function startSavedPathDayOne'));
  assert.match(startBlock, /navigateToFocus\(id, 1\)/);
  const mainBody = startBlock.slice(0, startBlock.indexOf('try{') > -1 ? startBlock.indexOf('try{') : startBlock.indexOf('try {'));
  assert.doesNotMatch(mainBody, /renderPlan\(\)/);
});

test('roadmap active day shows open/continue CTA instead of embedded daily session', () => {
  const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
  const detailBlock = views.slice(views.indexOf('function journeyDetailHTML'), views.indexOf('function journeyStatusHTML'));
  assert.match(detailBlock, /open-focus-session/);
  assert.match(detailBlock, /data-focus-day/);
  assert.match(detailBlock, /Start Day/);
  assert.match(detailBlock, /Continue Day/);
  assert.doesNotMatch(detailBlock.slice(detailBlock.indexOf('} else {')), /dailySessionHTML\(/);
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
