import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  discoveryControlsHTML, discoverySectionsHTML, publicPathCardHTML,
} from '../src/views/catalog/index.js';
import { auroraRoadmapDayItemHTML } from '../src/views/roadmap-render.js';
import { renderConsistencyCard } from '../src/ui/core.js';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
const gallery = readFileSync(new URL('../src/ui/design-gallery.js', import.meta.url), 'utf8');

function publicPath(id = 'public-rendered', extra = {}){
  return {
    id,
    platform:true,
    visibility:'public',
    discoverable:true,
    title:'A very long public path title that should wrap without crowding metadata',
    goal:'Build a public proof practice',
    category:'Creative',
    durationDays:14,
    intensity:'balanced',
    creatorName:'Avery Creator',
    previewDescription:'A preview description with enough length to exercise readable line-height and wrapping.',
    stats:{ joinedCount:2, proofSubmissionCount:3, publicProgressCount:1 },
    ...extra,
  };
}

test('Phase 6.9.7 Discovery sections render without count badges', () => {
  const html = discoverySectionsHTML([publicPath('one'), publicPath('two')], {
    query:'',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  }, { store:{ currentUser:null, state:{ userPaths:{} } }, canOpenFullPath:() => false });
  assert.doesNotMatch(html, /<span>\s*\d+\s*<\/span>/);
  assert.doesNotMatch(html, /discovery-section-count/);
  assert.match(html, /discovery-section-head/);
});

test('Phase 6.9.5 Discovery controls use the compact Aurora toolbar and preserve hooks', () => {
  const html = discoveryControlsHTML([publicPath()], {
    query:'proof',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  });
  assert.match(html, /aurora-discovery-toolbar/);
  assert.match(html, /aurora-discovery-primary-row/);
  assert.match(html, /aurora-filter-row/);
  assert.match(html, /aurora-filter-pill/);
  assert.match(html, /id="discoveryQuery"/);
  assert.match(html, /id="toggleDiscoveryFilters"/);
  assert.match(html, /id="clearDiscoveryFilters"/);
  for(const field of ['sort', 'category', 'duration', 'intensity', 'proof']){
    assert.match(html, new RegExp('data-discovery-field="' + field + '"'));
  }
  assert.doesNotMatch(html, /Following/);
  assert.doesNotMatch(html, /discovery-controls|discovery-mainline|discovery-search-shell|discovery-filter-chips|discovery-filter-chip/);
});

test('Phase 6.9.5 path cards separate creator, title, tags, metrics and CTA by markup', () => {
  const html = publicPathCardHTML(publicPath(), {
    store:{ currentUser:null, state:{ userPaths:{} } },
    canOpenFullPath:() => false,
  });
  assert.match(html, /class="skill-card aurora-path-card discovery-card"/);
  assert.match(html, /aurora-path-card-meta/);
  assert.match(html, /aurora-path-card-creator/);
  assert.match(html, /<h3 class="aurora-path-card-title">/);
  assert.match(html, /aurora-path-card-description/);
  assert.match(html, /aurora-path-card-tags/);
  assert.match(html, /aurora-path-card-metrics/);
  assert.match(html, /aurora-path-card-action/);
  assert.ok(html.indexOf('aurora-path-card-creator') < html.indexOf('aurora-path-card-title'));
  const titleBlock = html.match(/<h3 class="aurora-path-card-title">([\s\S]*?)<\/h3>/)?.[1] || '';
  assert.doesNotMatch(titleBlock, /aurora-path-card-creator|By Avery/);
  assert.doesNotMatch(styles, /\.aurora-path-card-(creator|tags|metrics|action)[^{]*\{[^}]*position\s*:\s*absolute/);
});

test('Phase 6.9.5 roadmap renders a clean list with active CTA and quiet locked nodes', () => {
  const active = auroraRoadmapDayItemHTML({ day:4, status:'active', label:'Today', taskSummary:'3 tasks', open:true });
  const completed = auroraRoadmapDayItemHTML({ day:3, status:'completed', label:'Completed', tier:'strong', proofSubmitted:true, open:true });
  const locked = auroraRoadmapDayItemHTML({ day:5, status:'locked', label:'Locked', taskSummary:'Unlocks later' });
  assert.match(views, /<ol class="aurora-journey-list">/);
  assert.match(styles, /\.aurora-journey-list\{[\s\S]*list-style:none[\s\S]*counter-reset:none/);
  assert.equal((active.match(/aurora-journey-cta/g) || []).length, 1);
  assert.match(active, /Continue this day/);
  assert.match(active, /Day 4 · Today/);
  assert.match(completed, /Proof submitted/);
  assert.match(completed, /aurora-tier-chip/);
  assert.match(locked, /aria-disabled="true"/);
  assert.doesNotMatch(locked, /Continue this day|data-road-day/);
  assert.doesNotMatch(active + completed + locked, /evidenceUrl|downloadURL|storagePath/);
});

test('Phase 6.9.5 Aurora radius contract avoids arbitrary hardcoded radii on new classes', () => {
  const auroraBlocks = [...styles.matchAll(/\.(aurora-[^{,\s]+)[^{]*\{[^}]*\}/g)].map(match => match[0]).join('\n');
  assert.match(auroraBlocks, /border-radius:var\(--lpt-radius-card\)/);
  assert.match(auroraBlocks, /border-radius:var\(--lpt-radius-pill\)/);
  assert.match(auroraBlocks, /border-radius:var\(--lpt-radius-medium\)/);
  assert.doesNotMatch(auroraBlocks, /border-radius:\s*(13px|17px|19px|999px|9999px)/);
});

test('Phase 6.9.5 consistency card stays real-data-only and gallery labels mock values', () => {
  const empty = renderConsistencyCard({ empty:true });
  const real = renderConsistencyCard({ streak:14, completedDays:5 });
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.match(empty, /Not enough completed days yet\./);
  assert.match(empty, /Complete a few sessions to see your consistency map\./);
  assert.match(real, /14 day streak/);
  assert.match(real, /5 completed days from real progress/);
  assert.doesNotMatch(todayBlock, /Math\.random/);
  assert.doesNotMatch(todayBlock, /\b1,284\b|\b9,512\b|\b18,330\b|leaderboard|following filter|weekly ranking/i);
  assert.match(gallery, /Mock values below are static gallery data, not production metrics/);
});

