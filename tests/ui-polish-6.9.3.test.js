import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderConsistencyCard } from '../src/ui/core.js';
import { renderDesignSystemGallery } from '../src/ui/design-gallery.js';
import { discoveryControlsHTML, publicPathCardHTML } from '../src/views/catalog/index.js';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
const gallerySource = readFileSync(new URL('../src/ui/design-gallery.js', import.meta.url), 'utf8');
const polishStart = styles.indexOf('Phase 6.9.3 UI spacing');
const polishEnd = styles.indexOf('/* ---- undo toast', polishStart);
const polishStyles = styles.slice(polishStart, polishEnd);

function publicPath(extra = {}){
  return {
    id:'public-polish',
    platform:true,
    visibility:'public',
    discoverable:true,
    title:'A very long public path title that should wrap cleanly without colliding with creator metadata',
    goal:'Build a visible proof practice',
    category:'Creative Practice',
    durationDays:30,
    intensity:'balanced',
    creatorName:'Avery Long-Creator Name',
    previewDescription:'A longer preview paragraph that needs breathing room across multiple lines in the card layout.',
    stats:{ joinedCount:1, proofSubmissionCount:2, publicProgressCount:3, completedCount:4 },
    ...extra,
  };
}

test('Phase 6.9.3 public path cards use stacked regions instead of overlap-prone metadata', () => {
  const path = publicPath();
  const html = publicPathCardHTML(path, {
    store:{ currentUser:null, state:{ userPaths:{ [path.id]:path } } },
    canOpenFullPath:() => false,
  });
  assert.match(html, /skill-card discovery-card lpt-card-polished/);
  assert.match(html, /lpt-card-header/);
  assert.match(html, /lpt-card-title sc-top/);
  assert.match(html, /lpt-card-body sc-blurb/);
  assert.match(html, /lpt-card-tags discovery-badges/);
  assert.match(html, /lpt-card-tags discovery-metrics/);
  assert.match(html, /lpt-card-actions sc-cta/);
  assert.ok(html.indexOf('sc-creator') < html.indexOf('lpt-card-title'));
  assert.match(html, /1 joined/);
  assert.match(html, /2 proof submitted/);
  assert.doesNotMatch(html, />\s*[1234]\s*</);
  assert.doesNotMatch(polishStyles, /\.sc-creator\{[^}]*position:absolute/);
});

test('Phase 6.9.3 CSS uses token-backed spacing, wrapping and radius rules', () => {
  assert.match(polishStyles, /\.lpt-card-polished\{[\s\S]*padding:var\(--lpt-space-3xl\)/);
  assert.match(polishStyles, /\.lpt-card-polished\{[\s\S]*border-radius:var\(--lpt-radius-card\)/);
  assert.match(polishStyles, /\.lpt-card-title\{[^}]*line-height:1\.18/);
  assert.match(polishStyles, /\.lpt-card-body\{[^}]*line-height:1\.62/);
  assert.match(polishStyles, /\.lpt-card-tags\{[^}]*flex-wrap:wrap/);
  assert.match(polishStyles, /\.lpt-search-primary\{[^}]*border-radius:var\(--lpt-radius-pill\)/);
  assert.match(polishStyles, /\.proof-journey-node\{[^}]*border-radius:var\(--lpt-radius-card\)/);
  assert.match(polishStyles, /\.proof-consistency-card\{[^}]*border-radius:var\(--lpt-radius-card\)/);
  assert.doesNotMatch(polishStyles, /border-radius:\s*(13px|17px|19px)/);
});

test('Phase 6.9.3 Discovery toolbar keeps search primary and filters compact', () => {
  const controls = discoveryControlsHTML([publicPath()], {
    query:'proof',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  });
  assert.match(controls, /lpt-discovery-toolbar/);
  assert.match(controls, /lpt-search-primary/);
  assert.match(controls, /id="discoveryQuery"/);
  assert.match(controls, /data-discovery-field="category"/);
  assert.match(controls, /data-discovery-field="duration"/);
  assert.match(controls, /data-discovery-field="intensity"/);
  assert.match(controls, /data-discovery-field="proof"/);
  assert.match(controls, /data-discovery-field="sort"/);
  assert.match(controls, /btn subtle discovery-clear-action/);
  assert.ok(controls.indexOf('id="discoveryQuery"') < controls.indexOf('discovery-filter-chips'));
  assert.doesNotMatch(controls, /panel card|discovery-filter-row/);
});

test('Phase 6.9.3 roadmap source renders a proof journey without private evidence URLs', () => {
  const roadmapBlock = views.slice(views.indexOf('function roadmapHTML'), views.indexOf('function journeyDetailHTML'));
  assert.match(roadmapBlock, /proof-journey-spine/);
  assert.match(roadmapBlock, /proof-journey-node/);
  assert.match(roadmapBlock, /proof-roadmap-' \+ status/);
  assert.match(roadmapBlock, /Open today/);
  assert.match(roadmapBlock, /Proof submitted/);
  assert.match(roadmapBlock, /<span>Day ' \+ day/);
  assert.match(roadmapBlock, /disabled aria-disabled="true"/);
  assert.doesNotMatch(roadmapBlock, /evidenceUrl|downloadURL|storagePath/);
});

test('Phase 6.9.3 consistency card is honest with real data and empty states', () => {
  const real = renderConsistencyCard({ streak:7, completedDays:12 });
  const empty = renderConsistencyCard({ empty:true });
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.match(real, /7 day streak/);
  assert.match(real, /12 completed day values from real progress/);
  assert.match(empty, /Not enough data yet/);
  assert.match(todayBlock, /proof-consistency-card/);
  assert.match(todayBlock, /real local progress/);
  assert.match(todayBlock, /No rankings or follower counts are estimated/);
  assert.doesNotMatch(real + empty + todayBlock, /Leaderboard|Following|weekly ranking/i);
});

test('Phase 6.9.3 gallery examples cover card, toolbar, roadmap, consistency and public progress states', () => {
  const html = renderDesignSystemGallery();
  assert.match(html, /Polished public path card/);
  assert.match(html, /Compact discovery toolbar/);
  assert.match(html, /RoadmapNode states/);
  assert.match(html, /Consistency card states/);
  assert.match(html, /Proof-first Public Progress/);
  assert.match(html, /lpt-card-polished/);
  assert.match(html, /lpt-discovery-toolbar/);
  assert.match(html, /proof-consistency-card has-data/);
  assert.match(html, /proof-consistency-card is-empty/);
  assert.match(gallerySource, /Static mock values only/);
  assert.doesNotMatch(html, /evidenceUrl|downloadURL|Following|Leaderboard/i);
});
