import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { renderDesignSystemGallery } from '../src/ui/core.js';
import { parsePathRoute } from '../src/routes.js';
import { dailySessionHTML, focusScreenHTML } from '../src/views/daily-session.js';
import { auroraRoadmapDayItemHTML } from '../src/views/roadmap-render.js';

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
  assert.match(html, /Proof Studio Today hero/);
  assert.match(html, /Aurora proof journey/);
  assert.match(html, /Proof-first Public Progress/);
  assert.match(html, /Component example/);
  assert.match(html, /Respect/);
  assert.match(html, /Not enough data yet/);
  assert.doesNotMatch(html, /fetch\(|authFetch|dbLoad|localStorage/);
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

test('Today source uses Aurora unified layout with one primary Continue CTA', () => {
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.match(todayBlock, /aurora-unified-layout/);
  assert.match(todayBlock, /aurora-unified-core/);
  assert.match(todayBlock, /aurora-daily-focus/);
  assert.match(todayBlock, /aurora-unified-rail/);
  assert.match(todayBlock, /Continue day/);
  assert.match(todayBlock, /View roadmap/);
  assert.match(todayBlock, /Not enough data yet/);
  assert.equal((todayBlock.match(/lpt-button-primary/g) || []).length, 1);
  assert.doesNotMatch(todayBlock, /Pass mark|65% needed/);
  assert.doesNotMatch(todayBlock, /\b1,284\b|\b9,512\b|\b18,330\b/);
  assert.doesNotMatch(todayBlock, /dashboard/i);
});

test('Roadmap source supports completed, active and locked Proof Studio states', () => {
  const roadmapBlock = views.slice(views.indexOf('function roadmapHTML'), views.indexOf('function journeyDetailHTML'));
  assert.match(roadmapBlock, /proof-studio-roadmap/);
  assert.match(roadmapBlock, /Proof journey/);
  assert.match(roadmapBlock, /aurora-roadmap-panel/);
  assert.match(roadmapBlock, /aurora-journey-list/);
  assert.match(roadmapBlock, /auroraRoadmapDayItemHTML/);
  assert.match(auroraRoadmapDayItemHTML({ day:1, status:'completed', label:'Completed', proofSubmitted:true, tier:'strong', open:true }), /Proof submitted/);
  assert.match(auroraRoadmapDayItemHTML({ day:1, status:'completed', label:'Completed', proofSubmitted:true, tier:'strong', open:true }), /aurora-tier-chip/);
  assert.doesNotMatch(roadmapBlock, /evidenceUrl|downloadURL|storagePath/);
});

test('Public progress source renders proof-first cards and Respect actions', () => {
  const progressBlock = views.slice(views.indexOf('function publicProgressTimelineHTML'), views.indexOf('function updateProgressEntry'));
  const interactionBlock = views.slice(views.indexOf('function publicProgressInteractionsHTML'), views.indexOf('function publicProgressTimelineHTML'));
  assert.match(progressBlock, /proof-first-progress-card/);
  assert.match(progressBlock, /proof-card-specimen/);
  assert.match(progressBlock, /Proof submitted/);
  assert.match(interactionBlock, /Respect/);
  assert.match(interactionBlock, /Comment/);
  assert.match(interactionBlock, /Report/);
  assert.doesNotMatch(progressBlock + interactionBlock, /Following|Leaderboard|weekly ranking/i);
  assert.doesNotMatch(progressBlock, /evidenceUrl|downloadURL|storagePath/);
});

test('CSS imports generated tokens, maps legacy aliases and uses token-backed core classes', () => {
  assert.match(styles, /@import '\.\/generated\/design-tokens\.css'/);
  assert.match(styles, /--ink:var\(--lpt-color-surface-canvas\)/);
  assert.match(styles, /--gold:var\(--lpt-color-accent-progress\)/);
  assert.match(styles, /--gold-soft:var\(--lpt-color-border-focus\)/);
  assert.match(styles, /--aurora-on-indigo:#fff/);
  assert.match(styles, /--aurora-glow:var\(--lpt-effect-lead-glow\)/);
  assert.doesNotMatch(styles, /--gold-soft:#f2c75c/);
  assert.match(styles, /proof-studio-today-hero/);
  assert.match(styles, /proof-roadmap-node/);
  assert.match(styles, /proof-first-progress-card/);
  assert.match(styles, /proof-studio-right-rail\{display:none/);
  assert.match(styles, /\.lpt-core-column/);
  assert.match(styles, /\.lpt-task-card[\s\S]*--lpt-/);
  assert.match(styles, /@media\(max-width:430px\)/);
  assert.match(styles, /@media\(max-width:390px\)/);
  assert.match(styles, /@media\(max-width:360px\)/);
  assert.match(styles, /prefers-reduced-motion:reduce/);
  assert.match(styles, /\.btn\.gold\{[^}]*color:var\(--aurora-on-indigo\)/);
  assert.match(styles, /\.lpt-button-primary\{[^}]*color:#fff!important/);
  assert.match(styles, /\.lpt-button-spinner/);
  assert.match(styles, /\.progress-cheer:active/);
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
