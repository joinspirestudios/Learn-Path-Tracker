import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { renderDesignSystemGallery } from '../src/ui/core.js';
import { parsePathRoute } from '../src/routes.js';
import { dailySessionHTML, focusScreenHTML } from '../src/views/daily-session.js';

const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const tasks = [
  { id:'core', title:'Core task', required:true, anchor:true },
  { id:'proof', title:'Proof task', required:true, evidenceRequired:true },
  { id:'optional', title:'Optional task', required:false },
];

test('design gallery route is handled without path parsing or auth', () => {
  assert.equal(parsePathRoute({ hash:'#/dev/design-system' }), null);
  assert.match(views, /dev\/design-system/);
  assert.match(views, /design-system-gallery/);
  assert.match(main, /dev\/design-system/);
  const html = renderDesignSystemGallery();
  assert.match(html, /Design system gallery/);
  assert.match(html, /Buttons/);
  assert.match(html, /DailyTaskCard/);
  assert.match(html, /ProgressMeter/);
  assert.match(html, /CompletionResultPanel/);
});

test('Daily Focus route renders centered core column and preserves controls', () => {
  const html = focusScreenHTML({
    pathId:'p1',
    pathTitle:'Path',
    dayNumber:1,
    roadmapHash:'#/path/p1/plan/roadmap/day/1',
    tasks,
    dayLog:{ dayNumber:1 },
    focusState:{ pathId:'p1', dayNumber:1, taskIndex:0, mode:'focus' },
  });
  assert.match(html, /daily-focus-screen lpt-shell/);
  assert.match(html, /lpt-core-column/);
  assert.match(html, /lpt-session-header/);
  assert.match(html, /data-active-task-card/);
  assert.match(html, /lpt-primary-action-bar/);
  assert.match(html, /Overview/);
  assert.match(html, /Back to roadmap/);
  assert.doesNotMatch(html, /Pass mark/);
});

test('Daily Focus preserves scoring, proof and anchor blocking behavior', () => {
  const html = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks:[
      { id:'core', title:'Core task', required:true, anchor:true },
      { id:'proof', title:'Proof task', required:true, evidenceRequired:true },
      { id:'read', title:'Read notes', required:true },
    ],
    dayLog:{ dayNumber:1, completedTaskIds:['proof', 'read'], verifiedTaskIds:['proof'] },
  });
  assert.match(html, /Complete core task first/);
  const proofHtml = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks,
    dayLog:{ dayNumber:1 },
    focusState:{ pathId:'p1', dayNumber:1, taskIndex:1, mode:'focus' },
  });
  assert.match(proofHtml, /Proof required/);
});

test('Completion Result renders score, tier, summaries and stable motion containers', () => {
  const html = dailySessionHTML({
    pathId:'p1',
    dayNumber:1,
    tasks,
    dayLog:{ dayNumber:1, status:'completed', completedTaskIds:['core', 'proof'], verifiedTaskIds:['proof'] },
  });
  assert.match(html, /lpt-completion-panel/);
  assert.match(html, /data-motion-completion-reveal/);
  assert.match(html, /data-motion-score/);
  assert.match(html, /Tasks completed/);
  assert.match(html, /Proof submitted/);
});

test('Today source uses core column shell and Start/Continue Today entry copy', () => {
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.match(todayBlock, /lpt-today-screen/);
  assert.match(todayBlock, /lpt-core-column/);
  assert.match(todayBlock, /Continue Today/);
  assert.match(todayBlock, /View roadmap/);
  assert.doesNotMatch(todayBlock, /dashboard/i);
});

test('CSS imports generated tokens, maps legacy aliases and uses token-backed core classes', () => {
  assert.match(styles, /@import '\.\/generated\/design-tokens\.css'/);
  assert.match(styles, /--ink:var\(--lpt-color-surface-canvas\)/);
  assert.match(styles, /--gold:var\(--lpt-color-accent-progress\)/);
  assert.match(styles, /--gold-soft:#f2c75c/);
  assert.doesNotMatch(styles, /--gold-soft:#93c5fd/);
  assert.match(styles, /\.lpt-core-column/);
  assert.match(styles, /\.lpt-task-card[\s\S]*--lpt-/);
  assert.match(styles, /@media\(max-width:430px\)/);
  assert.match(styles, /@media\(max-width:390px\)/);
  assert.match(styles, /@media\(max-width:360px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
});

test('source guards prevent forbidden Phase 6.9 assets and dependencies', () => {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  for(const forbidden of ['react', 'tailwindcss', '@radix-ui/react-dialog', 'framer-motion', 'gsap', 'expo', 'react-native', 'posthog-js', '@amplitude/analytics-browser']){
    assert.equal(deps[forbidden], undefined, forbidden + ' should not be installed');
  }
  const rootEntries = readdirSync(new URL('../', import.meta.url), { withFileTypes:true }).map(entry => entry.name.toLowerCase());
  assert.equal(rootEntries.includes('mobile'), false);
  assert.equal(rootEntries.includes('apps'), false);
  assert.equal(rootEntries.includes('app.json'), false);
  assert.equal(rootEntries.includes('eas.json'), false);
  assert.doesNotMatch(rootEntries.join('\n'), /\.(fig|ttf|otf|woff|woff2)$/);
});
