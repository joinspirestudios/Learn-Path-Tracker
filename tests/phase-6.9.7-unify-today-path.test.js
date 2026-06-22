import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { auroraRoadmapDayItemHTML } from '../src/views/roadmap-render.js';
import { discoveryControlsHTML } from '../src/views/catalog/controls.js';
import { discoverySectionsHTML } from '../src/views/catalog/sections.js';

const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const header = readFileSync(new URL('../src/header.js', import.meta.url), 'utf8');

function publicPath(id = 'p1'){
  return {
    id,
    title:'Test path',
    goal:'Goal',
    platform:true,
    visibility:'public',
    discoverable:true,
    previewEnabled:true,
    creatorName:'Creator',
    category:'test',
    durationLabel:'30 days',
    durationDays:30,
    weeks:[],
    stats:{ enrolledCount:5, completedCount:2 },
    tags:['test'],
  };
}

/* ── renderToday detects platform paths ── */

test('Phase 6.9.7 renderToday detects curUser platform path first', () => {
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.match(todayBlock, /curUser\(\)/);
  assert.match(todayBlock, /\.platform/);
  assert.match(todayBlock, /renderPlatformToday/);
  assert.match(todayBlock, /findActiveEnrolledPath/);
});

test('Phase 6.9.7 renderToday uses aurora-unified-layout not empty state for platform paths', () => {
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.match(todayBlock, /aurora-unified-layout/);
  assert.match(todayBlock, /aurora-daily-focus/);
  assert.match(todayBlock, /No active path/);
});

test('Phase 6.9.7 Today is default landing when active path exists', () => {
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.match(todayBlock, /aurora-today-route/);
  assert.match(todayBlock, /appShellHTML\('today'/);
});

/* ── Path view renders daily focus ABOVE roadmap ── */

test('Phase 6.9.7 Path view renders daily focus above roadmap in unified layout', () => {
  const planBlock = views.slice(views.indexOf('export function renderPlan'), views.indexOf('export function editPath'));
  assert.match(planBlock, /aurora-unified-layout/);
  assert.match(planBlock, /aurora-unified-core/);
  assert.match(planBlock, /aurora-unified-rail/);
  const focusPos = planBlock.indexOf('platformDailyFocusHTML');
  const roadmapPos = planBlock.indexOf('roadmapHTML(');
  assert.ok(focusPos > 0 && roadmapPos > 0);
  assert.ok(focusPos < roadmapPos, 'daily focus should come before roadmap');
});

/* ── Roadmap circular nodes ── */

test('Phase 6.9.7 roadmap renders circular icon nodes per state', () => {
  const completed = auroraRoadmapDayItemHTML({ day:1, status:'completed', label:'Done', proofSubmitted:true, tier:'strong', open:true });
  const active = auroraRoadmapDayItemHTML({ day:2, status:'active', label:'Today', open:true });
  const locked = auroraRoadmapDayItemHTML({ day:3, status:'locked', label:'Locked' });
  const missed = auroraRoadmapDayItemHTML({ day:4, status:'missed', label:'Missed', open:true });
  const frozen = auroraRoadmapDayItemHTML({ day:5, status:'frozen', label:'Frozen', open:true });

  for(const html of [completed, active, locked, missed, frozen]){
    assert.match(html, /aurora-circular-node/);
  }
  assert.match(completed, /aurora-node-icon/);
  assert.match(locked, /aurora-node-icon/);
  assert.match(missed, /aurora-node-icon/);
  assert.match(frozen, /aurora-node-icon/);
  assert.match(active, /aurora-node-number/);
});

test('Phase 6.9.7 roadmap active node has CTA, locked has none', () => {
  const active = auroraRoadmapDayItemHTML({ day:2, status:'active', label:'Today', open:true });
  const locked = auroraRoadmapDayItemHTML({ day:3, status:'locked', label:'Locked' });
  assert.match(active, /aurora-journey-cta/);
  assert.match(active, /Continue this day/);
  assert.doesNotMatch(locked, /aurora-journey-cta/);
  assert.doesNotMatch(locked, /Continue this day/);
  assert.doesNotMatch(locked, /data-road-day/);
});

test('Phase 6.9.7 roadmap nodes never expose raw evidence URLs', () => {
  const completed = auroraRoadmapDayItemHTML({ day:1, status:'completed', label:'Done', proofSubmitted:true, tier:'perfect', open:true });
  assert.doesNotMatch(completed, /evidenceUrl|downloadURL|storagePath/);
});

test('Phase 6.9.7 roadmap tier chips render with correct classes', () => {
  const strong = auroraRoadmapDayItemHTML({ day:1, status:'completed', label:'Done', tier:'strong', proofSubmitted:true, open:true });
  const perfect = auroraRoadmapDayItemHTML({ day:2, status:'completed', label:'Done', tier:'perfect', proofSubmitted:true, open:true });
  const passed = auroraRoadmapDayItemHTML({ day:3, status:'completed', label:'Done', tier:'passed', proofSubmitted:true, open:true });
  assert.match(strong, /aurora-tier-chip aurora-tier-strong/);
  assert.match(perfect, /aurora-tier-chip aurora-tier-perfect/);
  assert.match(passed, /aurora-tier-chip aurora-tier-passed/);
});

test('Phase 6.9.7 roadmap meta uses dot separator', () => {
  const item = auroraRoadmapDayItemHTML({ day:4, status:'active', label:'Today', open:true });
  assert.match(item, /Day 4 · Today/);
  assert.doesNotMatch(item, /Day 4 - Today/);
});

/* ── No legacy header for authenticated users ── */

test('Phase 6.9.7 applyHeader hides legacy header for authenticated users', () => {
  const applyBlock = header.slice(header.indexOf('export function applyHeader'), header.indexOf('export function updateOverall'));
  assert.match(applyBlock, /store\.currentUser/);
  assert.match(applyBlock, /top\.style\.display\s*=\s*'none'/);
  assert.match(applyBlock, /tabs\.style\.display\s*=\s*'none'/);
  assert.match(applyBlock, /if\(store\.currentUser\)\{[\s\S]*?return;[\s\S]*?\}/);
});

/* ── Select dropdown color-scheme dark ── */

test('Phase 6.9.7 select dropdowns use color-scheme dark for readability', () => {
  assert.match(styles, /color-scheme:\s*dark/);
  assert.match(styles, /option\s*\{[^}]*background/);
});

/* ── Discovery compact sticky search header ── */

test('Phase 6.9.7 discovery uses compact sticky search header', () => {
  const html = discoveryControlsHTML([publicPath()], {
    query:'test',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  });
  assert.match(html, /aurora-discovery-search-header/);
  assert.match(html, /aurora-discovery-toolbar/);
  assert.match(html, /id="toggleDiscoveryFilters"/);
  assert.match(html, /aurora-filters-toggle/);
  assert.match(styles, /\.aurora-discovery-search-header[\s\S]*?position:\s*sticky/);
});

test('Phase 6.9.7 discovery filter row is collapsible', () => {
  const html = discoveryControlsHTML([publicPath()], {
    query:'',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  });
  assert.match(html, /aurora-filter-row/);
  assert.doesNotMatch(html, /aurora-filter-row is-open/);
  assert.match(styles, /\.aurora-filter-row\{[^}]*display:\s*none/);
  assert.match(styles, /\.aurora-filter-row\.is-open\{[^}]*display:\s*flex/);
});

/* ── No "N paths" count badge ── */

test('Phase 6.9.7 discovery sections have no count badges', () => {
  const html = discoverySectionsHTML([publicPath('a'), publicPath('b')], {
    query:'',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  }, { store:{ currentUser:null, state:{ userPaths:{} } }, canOpenFullPath:() => false });
  assert.doesNotMatch(html, /discovery-section-count/);
  assert.match(html, /discovery-section-head/);
});

/* ── Aurora unified layout CSS ── */

test('Phase 6.9.7 aurora unified layout has two-column grid', () => {
  assert.match(styles, /\.aurora-unified-layout\{[^}]*display:\s*grid/);
  assert.match(styles, /\.aurora-unified-layout\{[^}]*grid-template-columns/);
  assert.match(styles, /\.aurora-unified-rail/);
});

test('Phase 6.9.7 aurora circular node has border-radius 50%', () => {
  assert.match(styles, /\.aurora-circular-node\{[^}]*border-radius:\s*50%/);
});

test('Phase 6.9.7 mobile breakpoint collapses unified layout to single column', () => {
  assert.match(styles, /\.aurora-unified-layout\{grid-template-columns:\s*1fr\}/);
});

/* ── Regression: existing suites still hold ── */

test('Phase 6.9.7 regression: renderPlan still renders edit button in path header', () => {
  const planBlock = views.slice(views.indexOf('export function renderPlan'), views.indexOf('export function editPath'));
  assert.match(planBlock, /aurora-path-header/);
  assert.match(planBlock, /aurora-path-header-actions/);
  assert.match(planBlock, /planEdit/);
  assert.match(planBlock, /Edit/);
});

test('Phase 6.9.7 regression: platform right rail in renderPlan', () => {
  const planBlock = views.slice(views.indexOf('export function renderPlan'), views.indexOf('export function editPath'));
  assert.match(planBlock, /platformRightRailHTML/);
  assert.match(planBlock, /aurora-unified-rail/);
});
