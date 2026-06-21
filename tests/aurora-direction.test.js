import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { COLOR_TOKENS } from '../src/design-tokens.js';
import { contrastRatio } from '../src/design-contrast.js';
import { renderDesignSystemGallery } from '../src/ui/core.js';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
const gallerySource = readFileSync(new URL('../src/ui/design-gallery.js', import.meta.url), 'utf8');

test('Aurora tokens use indigo lead, proof green, peak purple and readable muted text', () => {
  assert.equal(COLOR_TOKENS.accent.progress.value, '#6D5DF6');
  assert.equal(COLOR_TOKENS.accent.proof.value, '#2ED06E');
  assert.equal(COLOR_TOKENS.tier.strong.value, '#2ED06E');
  assert.equal(COLOR_TOKENS.tier.perfect.value, '#B15CF6');
  assert.equal(COLOR_TOKENS.text.muted.value, '#958CA5');
  assert.ok(contrastRatio(COLOR_TOKENS.text.muted.value, COLOR_TOKENS.surface.raised.value) >= 4.5);
});

test('Aurora on-fill labels pass contrast without relying on near-white over purple', () => {
  assert.ok(contrastRatio('#FFFFFF', COLOR_TOKENS.accent.progress.value) >= 4.5);
  assert.ok(contrastRatio(COLOR_TOKENS.text.primary.value, COLOR_TOKENS.accent.progress.value) < 4.5);
  assert.ok(contrastRatio(COLOR_TOKENS.text.inverse.value, COLOR_TOKENS.accent.trust.value) >= 4.5);
  assert.ok(contrastRatio(COLOR_TOKENS.text.primary.value, COLOR_TOKENS.accent.trust.value) < 4.5);
  assert.ok(contrastRatio(COLOR_TOKENS.text.inverse.value, COLOR_TOKENS.accent.proof.value) >= 4.5);
});

test('Aurora CSS maps legacy primary hooks to indigo with explicit white labels', () => {
  assert.match(styles, /--gold:var\(--lpt-color-accent-progress\)/);
  assert.match(styles, /--aurora-on-indigo:#fff/);
  assert.match(styles, /\.btn\.gold\{[^}]*background:var\(--gold\)[^}]*color:var\(--aurora-on-indigo\)/);
  assert.match(styles, /\.lpt-button-primary\{[^}]*color:#fff!important/);
  assert.match(styles, /box-shadow:var\(--lpt-effect-lead-glow\)/);
  assert.doesNotMatch(styles, /--gold-soft:#f2c75c/);
});

test('Aurora interaction system covers controls, cards, roadmap, reactions and reduced motion', () => {
  assert.match(styles, /\.lpt-button-spinner/);
  assert.match(styles, /\.skill-card:hover,.skill-card:focus-visible/);
  assert.match(styles, /\.proof-roadmap-node:hover:not\(:disabled\)/);
  assert.match(styles, /\.progress-cheer:active/);
  assert.match(styles, /\.discovery-search-shell:focus-within/);
  assert.match(styles, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(styles, /\.lpt-proof-card,.proof-first-progress-card\{animation:lptProofReveal/);
});

test('Aurora keeps production integrity and no-following proof-first copy', () => {
  const progressBlock = views.slice(views.indexOf('function publicProgressTimelineHTML'), views.indexOf('function updateProgressEntry'));
  const interactionBlock = views.slice(views.indexOf('function publicProgressInteractionsHTML'), views.indexOf('function publicProgressTimelineHTML'));
  const roadmapBlock = views.slice(views.indexOf('function roadmapHTML'), views.indexOf('function journeyDetailHTML'));
  const todayBlock = views.slice(views.indexOf('export function renderToday'), views.indexOf('export function editPath'));
  assert.doesNotMatch(progressBlock + interactionBlock + roadmapBlock + todayBlock + styles, /Leaderboard|Following|weekly ranking|fake verified/i);
  assert.doesNotMatch(progressBlock + roadmapBlock, /evidenceUrl|downloadURL|storagePath/);
  assert.match(interactionBlock, /Respect/);
  assert.match(progressBlock + roadmapBlock, /Proof submitted/);
  assert.match(todayBlock, /Not enough data yet/);
});

test('Design gallery includes Aurora state examples with mock labels only', () => {
  const html = renderDesignSystemGallery();
  assert.match(html, /Aurora Buttons/);
  assert.match(html, /lpt-button-spinner/);
  assert.match(html, /Aurora tier chips/);
  assert.match(html, /Perfect/);
  assert.match(html, /Missed/);
  assert.match(html, /Frozen/);
  assert.match(gallerySource, /Static mock values only/);
  assert.doesNotMatch(html, /Following|Leaderboard|evidenceUrl|downloadURL/i);
});
