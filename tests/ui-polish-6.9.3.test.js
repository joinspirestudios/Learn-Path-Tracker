import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderConsistencyCard } from '../src/ui/core.js';
import { renderDesignSystemGallery } from '../src/ui/design-gallery.js';
import { discoveryControlsHTML, discoverySectionsHTML, publicPathCardHTML } from '../src/views/catalog/index.js';
import { auroraRoadmapDayItemHTML } from '../src/views/roadmap-render.js';

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
  assert.match(html, /skill-card aurora-path-card discovery-card/);
  assert.match(html, /aurora-path-card-meta/);
  assert.match(html, /aurora-path-card-title/);
  assert.match(html, /aurora-path-card-description/);
  assert.match(html, /aurora-path-card-tags/);
  assert.match(html, /aurora-path-card-metrics/);
  assert.match(html, /aurora-path-card-action/);
  assert.ok(html.indexOf('aurora-path-card-creator') < html.indexOf('aurora-path-card-title'));
  assert.match(html, /1 joined/);
  assert.match(html, /2 proof submitted/);
  assert.doesNotMatch(html, />\s*[1234]\s*</);
  assert.doesNotMatch(styles, /\.aurora-path-card-(creator|tags|metrics|action)[^{]*\{[^}]*position:absolute/);
});

test('Phase 6.9.3 CSS uses token-backed spacing, wrapping and radius rules', () => {
  assert.match(styles, /\.skill-card\.aurora-path-card\{[\s\S]*padding:var\(--lpt-space-3xl\)/);
  assert.match(styles, /\.aurora-path-card,[\s\S]*\.aurora-roadmap-panel\{[\s\S]*border-radius:var\(--lpt-radius-card\)/);
  assert.match(styles, /\.aurora-path-card-title\{[^}]*line-height:1\.18/);
  assert.match(styles, /\.aurora-path-card-description\{[^}]*line-height:1\.62/);
  assert.match(styles, /\.aurora-path-card-tags,[\s\S]*flex-wrap:wrap/);
  assert.match(styles, /\.aurora-search-control,[\s\S]*\.aurora-journey-cta\{[\s\S]*border-radius:var\(--lpt-radius-medium\)/);
  assert.match(styles, /\.aurora-journey-list\{[\s\S]*list-style:none[\s\S]*counter-reset:none/);
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
  assert.match(controls, /aurora-discovery-toolbar/);
  assert.match(controls, /aurora-discovery-primary-row/);
  assert.match(controls, /aurora-filter-row/);
  assert.match(controls, /aurora-filter-pill/);
  assert.match(controls, /id="discoveryQuery"/);
  assert.match(controls, /data-discovery-field="category"/);
  assert.match(controls, /data-discovery-field="duration"/);
  assert.match(controls, /data-discovery-field="intensity"/);
  assert.match(controls, /data-discovery-field="proof"/);
  assert.match(controls, /data-discovery-field="sort"/);
  assert.match(controls, /id="toggleDiscoveryFilters"/);
  assert.match(controls, /id="clearDiscoveryFilters"/);
  assert.ok(controls.indexOf('id="discoveryQuery"') < controls.indexOf('aurora-filter-row'));
  assert.doesNotMatch(controls, /panel card|discovery-mainline|discovery-search-shell|discovery-filter-chips/);
});

test('Phase 6.9.7 Discovery sections render without count badges', () => {
  const html = discoverySectionsHTML([publicPath({ id:'a' }), publicPath({ id:'b' })], {
    query:'',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  }, {
    store:{ currentUser:null, state:{ userPaths:{} } },
    canOpenFullPath:() => false,
  });
  assert.doesNotMatch(html, /<span>\s*\d+\s*<\/span>/);
  assert.doesNotMatch(html, /discovery-section-count/);
  assert.match(html, /discovery-section-head/);
});

test('Phase 6.9.3 roadmap source renders a proof journey without private evidence URLs', () => {
  const roadmapBlock = views.slice(views.indexOf('function roadmapHTML'), views.indexOf('function journeyDetailHTML'));
  assert.match(roadmapBlock, /aurora-roadmap-panel/);
  assert.match(roadmapBlock, /aurora-journey-list/);
  assert.match(roadmapBlock, /auroraRoadmapDayItemHTML/);
  assert.match(auroraRoadmapDayItemHTML({ day:2, status:'active', label:'Today', open:true }), /Continue this day/);
  assert.doesNotMatch(auroraRoadmapDayItemHTML({ day:3, status:'locked', label:'Locked' }), /Continue this day|data-road-day/);
  assert.match(auroraRoadmapDayItemHTML({ day:1, status:'completed', label:'Completed', proofSubmitted:true, tier:'strong', open:true }), /Proof submitted/);
  assert.match(auroraRoadmapDayItemHTML({ day:1, status:'completed', label:'Completed', proofSubmitted:true, tier:'strong', open:true }), /aurora-tier-chip/);
  assert.doesNotMatch(roadmapBlock, /evidenceUrl|downloadURL|storagePath/);
});

test('Phase 6.9.3 consistency card is honest with real data and empty states', () => {
  const real = renderConsistencyCard({ streak:7, completedDays:12 });
  const empty = renderConsistencyCard({ empty:true });
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.match(real, /7 day streak/);
  assert.match(real, /12 completed days from real progress/);
  assert.match(empty, /Not enough completed days yet/);
  assert.match(todayBlock, /proof-consistency-card/);
  assert.match(todayBlock, /real local progress/);
  assert.match(todayBlock, /No rankings or follower counts are estimated/);
  assert.doesNotMatch(real + empty + todayBlock, /Leaderboard|Following|weekly ranking/i);
});

test('Phase 6.9.3 gallery examples cover card, toolbar, roadmap, consistency and public progress states', () => {
  const html = renderDesignSystemGallery();
  assert.match(html, /Aurora path card/);
  assert.match(html, /Compact discovery toolbar/);
  assert.match(html, /Aurora proof journey/);
  assert.match(html, /Consistency card states/);
  assert.match(html, /Proof-first Public Progress/);
  assert.match(html, /aurora-path-card/);
  assert.match(html, /aurora-discovery-toolbar/);
  assert.match(html, /aurora-journey-list/);
  assert.match(html, /proof-consistency-card has-data/);
  assert.match(html, /proof-consistency-card is-empty/);
  assert.match(gallerySource, /Static mock values only/);
  assert.doesNotMatch(html, /evidenceUrl|downloadURL|Following|Leaderboard/i);
});
