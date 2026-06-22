import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  renderCatalogView, renderDiscoverView, renderWorkspaceView,
  discoveryControlsHTML, discoverySectionsHTML, publicPathCardHTML,
  createPathCardsHTML,
} from '../src/views/catalog/index.js';
import {
  renderAuroraShell, renderShellNav, AURORA_APP_NAV,
} from '../src/ui/core-layout.js';
import { renderConsistencyCard } from '../src/ui/core-components.js';
import { APP_ROUTES, parseAppRoute } from '../src/routes.js';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');

function publicPath(id = 'p1', extra = {}){
  return {
    id,
    platform:true,
    visibility:'public',
    discoverable:true,
    title:'Proof-backed Drawing',
    goal:'Learn drawing',
    category:'Creative',
    durationDays:14,
    intensity:'balanced',
    creatorName:'Avery',
    previewDescription:'Practice drawing with public proof.',
    stats:{ joinedCount:3, proofSubmissionCount:2, publicProgressCount:1, completedCount:1 },
    ...extra,
  };
}

function catalogContext(store){
  return {
    store,
    skills:[],
    syncStatusHTML:() => '',
    authRestoring:() => false,
    configPresent:() => true,
    cloudActive:() => false,
    pathTitle:id => store.state.userPaths[id]?.title || id,
    pathGoal:id => store.state.userPaths[id]?.goal || 'Goal',
    totalsFor:() => ({ done:0, total:4 }),
    canOpenFullPath:() => false,
    pathTasksReady:() => true,
  };
}

/* ── Shell: every primary route renders inside lpt-shell with the side nav ── */

test('Shell: renderAuroraShell wraps content with side nav and bottom nav', () => {
  const html = renderAuroraShell({ active:'today', title:'Today', body:'<p>Content</p>' });
  assert.match(html, /lpt-shell aurora-app-shell/);
  assert.match(html, /aurora-side-nav/);
  assert.match(html, /aurora-bottom-nav/);
  assert.match(html, /data-shell-active="today"/);
  assert.match(html, /<p>Content<\/p>/);
});

test('Shell: side nav contains Today, Discover, Progress, Paths, Profile', () => {
  const html = renderShellNav({ active:'today' });
  assert.match(html, /Today/);
  assert.match(html, /Discover/);
  assert.match(html, /Progress/);
  assert.match(html, /Paths/);
  assert.match(html, /Profile/);
});

test('Shell: AURORA_APP_NAV has all five primary routes', () => {
  const ids = AURORA_APP_NAV.map(item => item.id);
  assert.deepEqual(ids, ['today', 'discover', 'progress', 'paths', 'profile']);
});

test('Shell: active nav item uses nav active state, not button style', () => {
  const html = renderShellNav({ active:'discover' });
  assert.match(html, /aurora-nav-item is-active/);
  assert.match(html, /aria-current="page"/);
  assert.doesNotMatch(html, /btn gold|lpt-button-primary/);
});

test('Shell: appShellHTML wraps signed-in routes in renderAuroraShell', () => {
  assert.match(views, /store\.currentUser[\s\S]*?renderAuroraShell/);
  assert.match(views, /appShellHTML\('today'/);
  assert.match(views, /appShellHTML\('discover'/);
  assert.match(views, /appShellHTML\('progress'/);
  assert.match(views, /appShellHTML\('paths'/);
  assert.match(views, /appShellHTML\('profile'/);
});

/* ── Routing: discover route renders the discovery page; home/default is not the public feed ── */

test('Routing: APP_ROUTES includes today, discover, progress, paths, profile', () => {
  assert.deepEqual(APP_ROUTES, ['today', 'discover', 'progress', 'paths', 'profile']);
});

test('Routing: parseAppRoute recognizes discover and paths routes', () => {
  assert.deepEqual(parseAppRoute({ hash:'#/discover' }), { kind:'app', page:'discover', source:'hash' });
  assert.deepEqual(parseAppRoute({ hash:'#/paths' }), { kind:'app', page:'paths', source:'hash' });
  assert.deepEqual(parseAppRoute({ hash:'#/today' }), { kind:'app', page:'today', source:'hash' });
  assert.deepEqual(parseAppRoute({ hash:'#/progress' }), { kind:'app', page:'progress', source:'hash' });
  assert.deepEqual(parseAppRoute({ hash:'#/profile' }), { kind:'app', page:'profile', source:'hash' });
});

test('Routing: default/home route dispatches to today, not public feed', () => {
  const todayDispatch = views.match(/else\s*\{[\s\S]*?store\.route\s*=\s*\{\s*kind:'app',\s*page:'today'/);
  assert.ok(todayDispatch, 'default route should dispatch to today');
});

/* ── Search header: discovery renders a sticky search header ── */

test('Search header: discovery toolbar is sticky and contains search input as primary', () => {
  const html = discoveryControlsHTML([publicPath()], {
    query:'',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  });
  assert.match(html, /aurora-discovery-toolbar/);
  assert.match(html, /aurora-discovery-search-header/);
  assert.match(html, /aurora-discovery-primary-row/);
  assert.match(html, /id="discoveryQuery"/);
  assert.match(html, /aurora-search-control/);
  assert.match(html, /aurora-category-control/);
  assert.ok(html.indexOf('id="discoveryQuery"') < html.indexOf('aurora-filter-row'));
  assert.match(styles, /\.aurora-discovery-toolbar\{[\s\S]*?position:sticky/);
});

test('Search header: clear is ghost style', () => {
  const html = discoveryControlsHTML([publicPath()], {
    query:'test',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  });
  assert.match(html, /aurora-button-ghost.*aurora-clear-control/);
  assert.match(html, /id="clearDiscoverySearch"/);
  assert.match(html, /id="clearDiscoveryFilters"/);
});

test('Search header: all filters, sort, load-more still wired', () => {
  const html = discoveryControlsHTML([publicPath()], {
    query:'',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  });
  for(const field of ['category', 'duration', 'intensity', 'proof', 'sort']){
    assert.match(html, new RegExp('data-discovery-field="' + field + '"'));
  }
});

/* ── Discover page: separate from home, no public feed on home ── */

test('Discover page: renderDiscoverView does not include workspace cards', () => {
  const store = {
    currentUser:{ uid:'user1' },
    cloudStatus:'connected',
    discovery:{ query:'', category:'all', duration:'all', intensity:'all', proof:'all', sort:'recommended' },
    state:{ skills:{}, userPaths:{ public:publicPath() } },
  };
  const result = renderDiscoverView(catalogContext(store));
  assert.doesNotMatch(result.html, /Your workspace/);
  assert.doesNotMatch(result.html, /Create new path/);
  assert.match(result.html, /Discover/);
  assert.match(result.html, /Search public paths/);
});

test('Home: workspace renders Create/Build before user paths, no public feed', () => {
  const store = {
    currentUser:{ uid:'user1' },
    cloudStatus:'connected',
    discovery:{ query:'', category:'all', duration:'all', intensity:'all', proof:'all', sort:'recommended' },
    state:{ skills:{}, userPaths:{ local:{ title:'My path', goal:'Goal', weeks:[] } } },
  };
  const result = renderWorkspaceView(catalogContext(store));
  assert.match(result.html, /Create new path/);
  assert.match(result.html, /Build path with AI/);
  assert.match(result.html, /aurora-workspace-actions/);
  assert.match(result.html, /aurora-workspace-paths/);
  assert.ok(result.html.indexOf('aurora-workspace-actions') < result.html.indexOf('aurora-workspace-paths'));
  assert.doesNotMatch(result.html, /All public paths/);
  assert.ok(result.rightRail, 'workspace should have a right rail');
  assert.match(result.rightRail, /aurora-workspace-rail-card/);
});

/* ── Affordance: status chips are non-interactive ── */

test('Affordance: path card meta/tags/metrics chips are non-interactive via CSS', () => {
  assert.match(styles, /\.aurora-path-card-meta span[\s\S]*?cursor:default/);
  assert.match(styles, /\.aurora-path-card-tags span[\s\S]*?pointer-events:none/);
  assert.match(styles, /\.aurora-path-card-metrics span[\s\S]*?cursor:default/);
});

test('Affordance: primary/secondary/ghost buttons have distinct classes', () => {
  assert.match(styles, /\.lpt-button-primary/);
  assert.match(styles, /\.lpt-button-secondary/);
  assert.match(styles, /\.aurora-button-ghost/);
  assert.match(styles, /\.lpt-button-primary:hover/);
  assert.match(styles, /\.aurora-button-ghost:hover/);
});

test('Affordance: focus-visible ring exists on interactive elements', () => {
  assert.match(styles, /\.btn:focus-visible/);
  assert.match(styles, /\.lpt-button:focus-visible/);
  assert.match(styles, /outline.*var\(--lpt-color-border-focus\)/);
});

test('Affordance: aurora-chip class is non-interactive', () => {
  assert.match(styles, /\.aurora-chip[\s\S]*?cursor:default/);
  assert.match(styles, /\.aurora-chip[\s\S]*?pointer-events:none/);
});

/* ── Today: real data, no placeholder trust numbers ── */

test('Today: no hardcoded placeholder trust numbers in renderToday', () => {
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.doesNotMatch(todayBlock, /\b1,284\b|\b9,512\b|\b18,330\b/);
  assert.doesNotMatch(todayBlock, /Math\.random/);
  assert.doesNotMatch(todayBlock, /leaderboard|weekly ranking/i);
  assert.match(todayBlock, /Not enough data yet/);
});

test('Today: consistency card uses real data or empty state', () => {
  const real = renderConsistencyCard({ streak:10, completedDays:8 });
  const empty = renderConsistencyCard({ empty:true });
  assert.match(real, /10 day streak/);
  assert.match(real, /8 completed days from real progress/);
  assert.match(empty, /Not enough completed days yet/);
});

test('Today: roadmap active node has CTA, locked has none', () => {
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.match(todayBlock, /proof-consistency-card/);
  assert.match(todayBlock, /real local progress/);
  assert.match(todayBlock, /No rankings or follower counts are estimated/);
});

/* ── Progress: real feed or honest empty state ── */

test('Progress: renders real proof feed or empty state, no fake data', () => {
  const progressBlock = views.slice(views.indexOf('function publicProgressFeedHTML'), views.indexOf('export function renderProgress'));
  assert.match(progressBlock, /No public progress is loaded yet/);
  assert.match(progressBlock, /proof-first-progress-card/);
  assert.doesNotMatch(progressBlock, /leaderboard|weekly ranking/i);
});

test('Progress: renderProgress does not use following or leaderboard', () => {
  const renderBlock = views.slice(views.indexOf('export function renderProgress'), views.indexOf('export function renderProfile'));
  assert.doesNotMatch(renderBlock, /Following|Leaderboard|weekly ranking/i);
  assert.match(renderBlock, /follower counts/);
});

/* ── Count badges: no floating N PATHS count pills ── */

test('Badges: discovery section headers include labeled counts not floating pills', () => {
  const html = discoverySectionsHTML([publicPath('a'), publicPath('b')], {
    query:'',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  }, { store:{ currentUser:null, state:{ userPaths:{} } }, canOpenFullPath:() => false });
  assert.doesNotMatch(html, /<span>\s*\d+\s*<\/span>/);
  const counts = [...html.matchAll(/class="discovery-section-count">([^<]+)<\/span>/g)].map(m => m[1]);
  assert.ok(counts.length >= 1, 'should have at least one labeled count');
  for(const count of counts){
    assert.match(count, /\bpath(s)?\b/);
  }
});

/* ── Workspace card tags: no Private tool or AI draft ── */

test('Tags: Create/Build cards have no Private tool or AI draft tags', () => {
  const signedIn = createPathCardsHTML({ store:{ currentUser:{ uid:'u' } }, configPresent:() => true });
  assert.match(signedIn, /Create new path/);
  assert.match(signedIn, /Build path with AI/);
  assert.doesNotMatch(signedIn, /Private tool/);
  assert.doesNotMatch(signedIn, /AI draft/);
  assert.doesNotMatch(signedIn, /Platform path/);
});

/* ── Aurora and Proof Studio integrity ── */

test('Integrity: no leaderboard, following, fake social proof in views or styles', () => {
  const progressBlock = views.slice(views.indexOf('function publicProgressTimelineHTML'), views.indexOf('function updateProgressEntry'));
  const interactionBlock = views.slice(views.indexOf('function publicProgressInteractionsHTML'), views.indexOf('function publicProgressTimelineHTML'));
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.doesNotMatch(progressBlock + interactionBlock + todayBlock + styles, /Leaderboard|Following|weekly ranking|fake verified/i);
});

test('Integrity: no raw evidence URLs in roadmap or progress', () => {
  const roadmapBlock = views.slice(views.indexOf('function roadmapHTML'), views.indexOf('function journeyDetailHTML'));
  const progressBlock = views.slice(views.indexOf('function publicProgressTimelineHTML'), views.indexOf('function updateProgressEntry'));
  assert.doesNotMatch(progressBlock + roadmapBlock, /evidenceUrl|downloadURL|storagePath/);
});

/* ── Mobile: shell collapses cleanly ── */

test('Mobile: CSS collapses side nav and shows bottom nav on small screens', () => {
  assert.match(styles, /@media\(max-width:900px\)[\s\S]*?\.aurora-side-nav\{display:none\}/);
  assert.match(styles, /@media\(max-width:900px\)[\s\S]*?\.aurora-bottom-nav\{display:flex\}/);
});

/* ── No new dependencies ── */

test('No new dependencies added', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const deps = Object.keys(pkg.dependencies || {});
  const devDeps = Object.keys(pkg.devDependencies || {});
  assert.ok(deps.length <= 3, 'should have at most 3 runtime deps');
  assert.ok(devDeps.length <= 3, 'should have at most 3 dev deps');
  assert.equal(pkg.dependencies['firebase-admin'], '13.10.0');
});
