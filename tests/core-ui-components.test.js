import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  renderButton, renderCompletionResultPanel, renderDailyScoreCard, renderDailyTaskCard,
  renderEmptyState, renderProgressMeter,
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

test('core UI modules have no Firebase, server or analytics imports', () => {
  assert.doesNotMatch(coreSources, /from ['"].*(firebase|analytics|server|api\/_lib|db\.js|auth\.js)/);
  assert.doesNotMatch(coreSources, /authFetch|fetch\(|localStorage|process\.env|import\.meta\.env/);
});
