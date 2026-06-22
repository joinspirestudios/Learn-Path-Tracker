import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/design-tokens.js', import.meta.url), 'utf8');
const tokenCSS = readFileSync(new URL('../src/generated/design-tokens.css', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/design-system-foundation.md', import.meta.url), 'utf8');

/* ── FIX 1: Shell layout ── */

test('Phase 6.9.8 shell has 1680px max-width cap for 4K', () => {
  assert.match(styles, /\.aurora-app-shell\{[^}]*max-width:\s*1680px/);
});

test('Phase 6.9.8 side nav has min-height 100vh', () => {
  assert.match(styles, /\.aurora-side-nav\{[^}]*min-height:\s*100vh/);
});

test('Phase 6.9.8 shell content uses vertical padding with space tokens', () => {
  assert.match(styles, /\.aurora-shell-content\{[^}]*padding:\s*var\(--lpt-space-5xl\)\s+var\(--lpt-space-4xl\)/);
});

test('Phase 6.9.8 shell rail is sticky', () => {
  assert.match(styles, /\.aurora-shell-rail\{[^}]*position:\s*sticky/);
});

test('Phase 6.9.8 unified layout uses 3-column grid with breathing space', () => {
  const match = styles.match(/\.aurora-unified-layout\{[^}]*grid-template-columns:[^;}]+/);
  assert.ok(match, 'unified layout should have grid-template-columns');
  assert.match(match[0], /760px/);
  assert.match(match[0], /300px/);
});

test('Phase 6.9.8 core column max-width is 760px left-aligned', () => {
  const coreBlock = styles.match(/\.lpt-core-column\{[^}]+\}/);
  assert.ok(coreBlock);
  assert.match(coreBlock[0], /max-width:\s*760px/);
  assert.doesNotMatch(coreBlock[0], /margin:\s*0\s+auto/);
});

test('Phase 6.9.8 tablet breakpoint stacks rail below at 1023px', () => {
  assert.match(styles, /@media\s*\(max-width:\s*1023px\)/);
  assert.match(styles, /\.aurora-unified-layout\{grid-template-columns:\s*1fr\}/);
});

test('Phase 6.9.8 mobile breakpoint at 767px shows bottom nav', () => {
  assert.match(styles, /@media\s*\(max-width:\s*767px\)/);
  assert.match(styles, /\.aurora-bottom-nav\{[^}]*display:\s*flex/);
});

/* ── FIX 2: Radius token ladder ── */

test('Phase 6.9.8 design-tokens.js card radius is 16px', () => {
  assert.match(tokens, /card:\s*\{[^}]*value:\s*'16px'/);
});

test('Phase 6.9.8 generated CSS has correct radius tokens', () => {
  assert.match(tokenCSS, /--lpt-radius-small:\s*4px/);
  assert.match(tokenCSS, /--lpt-radius-medium:\s*8px/);
  assert.match(tokenCSS, /--lpt-radius-large:\s*12px/);
  assert.match(tokenCSS, /--lpt-radius-xl:\s*16px/);
  assert.match(tokenCSS, /--lpt-radius-card:\s*16px/);
  assert.match(tokenCSS, /--lpt-radius-modal:\s*16px/);
  assert.match(tokenCSS, /--lpt-radius-pill:\s*9999px/);
});

test('Phase 6.9.8 no arbitrary border-radius pixel values in styles', () => {
  const arbitrary = styles.match(/border-radius:\s*\d+px/g) || [];
  const violations = arbitrary.filter(m => {
    const px = parseInt(m.match(/\d+/)[0]);
    return ![50].includes(px);
  });
  assert.equal(violations.length, 0, `Found arbitrary border-radius values: ${violations.join(', ')}`);
});

test('Phase 6.9.8 core Aurora classes use --lpt-radius-* tokens', () => {
  const auroraBlocks = styles.match(/\.aurora-[a-z-]+\{[^}]*border-radius:[^}]+\}/g) || [];
  for (const block of auroraBlocks) {
    const radiusMatch = block.match(/border-radius:\s*([^;]+)/);
    if (radiusMatch) {
      const val = radiusMatch[1].trim();
      if (val !== '50%') {
        assert.match(val, /var\(--lpt-radius-/, `Aurora block uses raw radius: ${block.slice(0, 60)}`);
      }
    }
  }
});

/* ── FIX 2: Nesting rules ── */

test('Phase 6.9.8 daily-focus card uses uniform 3xl inset padding', () => {
  assert.match(styles, /\.aurora-daily-focus\{[^}]*padding:\s*var\(--lpt-space-3xl\)/);
});

test('Phase 6.9.8 daily-tasks uses uniform lg sibling gap', () => {
  assert.match(styles, /\.aurora-daily-tasks\{[^}]*gap:\s*var\(--lpt-space-lg\)/);
});

test('Phase 6.9.8 daily-task uses step-down radius (large not card)', () => {
  assert.match(styles, /\.aurora-daily-task\{[^}]*border-radius:\s*var\(--lpt-radius-large\)/);
});

test('Phase 6.9.8 today-task inner radius is large (step-down from card)', () => {
  assert.match(styles, /\.today-task\{[^}]*border-radius:\s*var\(--lpt-radius-large\)/);
});

/* ── Documentation ── */

test('Phase 6.9.8 design system docs include updated radius ladder', () => {
  assert.match(docs, /card.*16px/);
  assert.match(docs, /modal.*16px/);
  assert.match(docs, /Concentric step-down/i);
  assert.match(docs, /Uniform inset/i);
  assert.match(docs, /No arbitrary values/i);
});

/* ── Regression ── */

test('Phase 6.9.8 regression: modal-box uses --lpt-radius-modal', () => {
  assert.match(styles, /\.modal-box\{[^}]*border-radius:\s*var\(--lpt-radius-modal\)/);
});

test('Phase 6.9.8 regression: skill-card uses --lpt-radius-xl', () => {
  assert.match(styles, /\.skill-card\{[^}]*border-radius:\s*var\(--lpt-radius-xl\)/);
});

test('Phase 6.9.8 regression: circular node keeps 50% radius', () => {
  assert.match(styles, /\.aurora-circular-node\{[^}]*border-radius:\s*50%/);
});

test('Phase 6.9.8 regression: pill elements use --lpt-radius-pill', () => {
  assert.match(styles, /border-radius:\s*var\(--lpt-radius-pill\)/);
});
