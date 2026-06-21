import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  renderButton, renderCompletionResultPanel, renderDailyScoreCard, renderDailyTaskCard,
  renderEmptyState, renderProgressMeter, renderProofActionRow, renderProofFirstProgressCard,
  renderProofMetricCard, renderProofStudioTodayHero, renderRoadmapNode,
} from '../src/ui/core.js';

const coreSources = [
  '../src/ui/core.js',
  '../src/ui/core-components.js',
  '../src/ui/core-layout.js',
  '../src/ui/design-gallery.js',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

test('renderButton supports variants and escapes labels', () => {
  assert.match(renderButton({ label:'Save', variant:'primary' }), /lpt-button-primary/);
  assert.match(renderButton({ label:'More', variant:'secondary' }), /lpt-button-secondary/);
  assert.match(renderButton({ label:'Quiet', variant:'ghost' }), /lpt-button-ghost/);
  assert.match(renderButton({ label:'Delete', variant:'destructive' }), /lpt-button-destructive/);
  assert.match(renderButton({ label:'<script>' }), /&lt;script&gt;/);
});

test('renderProgressMeter renders accessible progressbar attributes', () => {
  const html = renderProgressMeter({ value:72, label:'Daily progress' });
  assert.match(html, /role="progressbar"/);
  assert.match(html, /aria-valuenow="72"/);
  assert.match(html, /aria-valuemin="0"/);
  assert.match(html, /aria-valuemax="100"/);
});

test('renderDailyTaskCard renders required, proof and complete states without private evidence URLs', () => {
  const html = renderDailyTaskCard({
    title:'Upload proof',
    description:'Document it',
    required:true,
    needsEvidence:true,
    completed:true,
    evidenceCount:1,
    evidenceUrl:'https://private.example/proof.jpg',
  });
  assert.match(html, /Required/);
  assert.match(html, /Proof needed/);
  assert.match(html, /Done/);
  assert.doesNotMatch(html, /private\.example/);
});

test('renderDailyScoreCard does not render Pass mark as primary copy', () => {
  const html = renderDailyScoreCard({ score:66, tier:'passed' });
  assert.match(html, /Today&apos;s progress/);
  assert.doesNotMatch(html, /Pass mark/);
});

test('renderCompletionResultPanel renders tiers and publish CTA only when eligible', () => {
  for(const tier of ['passed', 'strong', 'perfect']){
    assert.match(renderCompletionResultPanel({ tier, score:90 }), new RegExp('lpt-completion-' + tier));
  }
  assert.match(renderCompletionResultPanel({ publishEligible:true }), /Publish progress/);
  assert.doesNotMatch(renderCompletionResultPanel({ publishEligible:false }), /Publish progress/);
  assert.match(renderCompletionResultPanel({ score:100 }), /data-motion-completion-reveal/);
});

test('renderEmptyState renders safe title, body and action', () => {
  const html = renderEmptyState({ title:'<Empty>', body:'No <data>', action:renderButton({ label:'Start' }) });
  assert.match(html, /&lt;Empty&gt;/);
  assert.match(html, /No &lt;data&gt;/);
  assert.match(html, /Start/);
});

test('Proof Studio Today hero renders one primary daily action and proof summary', () => {
  const html = renderProofStudioTodayHero({
    pathTitle:'Path',
    dayContext:'Day 4',
    title:'Practice proof',
    tasks:['Task one', 'Task two'],
    proofSummary:'1 task asks for proof.',
    ctaLabel:'Continue day',
    ctaId:'openWeek',
    secondaryAction:renderButton({ label:'View roadmap', variant:'secondary' }),
  });
  assert.match(html, /proof-studio-today-hero/);
  assert.match(html, /Today&apos;s proof/);
  assert.match(html, /Proof needed/);
  assert.match(html, /Continue day/);
  assert.equal((html.match(/lpt-button-primary/g) || []).length, 1);
  assert.doesNotMatch(html, /Pass mark|65% needed|fake/i);
});

test('Roadmap node states are text-readable and safe', () => {
  const completed = renderRoadmapNode({ day:2, state:'completed', tier:'strong', proofSubmitted:true, taskCount:3, cta:'Completed' });
  const active = renderRoadmapNode({ day:3, state:'active', taskCount:2, cta:"Open today's session" });
  const locked = renderRoadmapNode({ day:4, state:'locked', taskCount:1 });
  assert.match(completed, /data-roadmap-state="completed"/);
  assert.match(completed, /strong/);
  assert.match(completed, /Proof submitted/);
  assert.match(active, /Open today&#39;s session/);
  assert.match(locked, /disabled aria-disabled="true"/);
  assert.doesNotMatch(completed + active + locked, /evidenceUrl|private\.example|downloadURL/);
});

test('Proof-first public progress card uses submitted or verified state deliberately', () => {
  const submitted = renderProofFirstProgressCard({ proofState:'submitted', proofSummary:'Safe summary only.', tier:'strong' });
  const verified = renderProofFirstProgressCard({ proofState:'verified', proofSummary:'Safe summary only.', tier:'perfect' });
  assert.match(submitted, /Proof submitted/);
  assert.doesNotMatch(submitted, /Proof verified/);
  assert.match(verified, /Proof verified/);
  assert.match(submitted, /proof-card-specimen/);
  assert.match(submitted, /Respect/);
  assert.match(submitted, /Comment/);
  assert.match(submitted, /Report/);
  assert.doesNotMatch(submitted, /Following|Leaderboard|evidenceUrl|downloadURL/);
});

test('Proof metric cards support real and empty states', () => {
  const real = renderProofMetricCard({ title:'Path trust', value:'3 proof submitted' });
  const empty = renderProofMetricCard({ title:'Your consistency', empty:true });
  assert.match(real, /Every number here is proof-backed/);
  assert.match(empty, /Not enough data yet/);
});

test('core UI modules have no Firebase, server or analytics imports', () => {
  assert.doesNotMatch(coreSources, /from ['"].*(firebase|analytics|server|api\/_lib|db\.js|auth\.js)/);
  assert.doesNotMatch(coreSources, /authFetch|fetch\(|localStorage|process\.env|import\.meta\.env/);
});
