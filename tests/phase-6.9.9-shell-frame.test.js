import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const tokens = readFileSync(new URL('../src/design-tokens.js', import.meta.url), 'utf8');
const tokenCSS = readFileSync(new URL('../src/generated/design-tokens.css', import.meta.url), 'utf8');
const coreLayout = readFileSync(new URL('../src/ui/core-layout.js', import.meta.url), 'utf8');
const gallery = readFileSync(new URL('../src/ui/design-gallery.js', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/design-system-foundation.md', import.meta.url), 'utf8');

/* ── Shell layout: full viewport, no centering ── */

test('Phase 6.9.9 aurora-app-shell does not use margin:0 auto', () => {
  const shellBlock = styles.match(/\.aurora-app-shell\{[^}]+\}/);
  assert.ok(shellBlock);
  assert.doesNotMatch(shellBlock[0], /margin:\s*0\s+auto/);
});

test('Phase 6.9.9 aurora-app-shell does not apply a global max-width', () => {
  const shellBlock = styles.match(/\.aurora-app-shell\{[^}]+\}/);
  assert.ok(shellBlock);
  assert.doesNotMatch(shellBlock[0], /max-width/);
});

test('Phase 6.9.9 aurora-app-shell uses full-width grid layout', () => {
  const shellBlock = styles.match(/\.aurora-app-shell\{[^}]+\}/);
  assert.ok(shellBlock);
  assert.match(shellBlock[0], /width:\s*100%/);
  assert.match(shellBlock[0], /display:\s*grid/);
  assert.match(shellBlock[0], /grid-template-columns/);
});

test('Phase 6.9.9 side nav is first column and uses full viewport height', () => {
  assert.match(styles, /\.aurora-side-nav\{[^}]*height:\s*100dvh/);
  assert.match(styles, /\.aurora-side-nav\{[^}]*position:\s*sticky/);
  assert.match(styles, /\.aurora-side-nav\{[^}]*top:\s*0/);
});

test('Phase 6.9.9 side nav user/account anchors to bottom via margin-top auto', () => {
  assert.match(styles, /\.aurora-side-nav\s+\.aurora-nav-item:last-child\{[^}]*margin-top:\s*auto/);
});

test('Phase 6.9.9 shell content uses layout gutter tokens', () => {
  assert.match(styles, /\.aurora-shell-content\{[^}]*padding:\s*var\(--lpt-layout-top-gutter\)\s+var\(--lpt-layout-content-gutter\)/);
});

test('Phase 6.9.9 shell rail is placed in right region when present', () => {
  assert.match(styles, /\.aurora-app-shell\.has-right-rail\{[^}]*grid-template-columns:[^}]*--lpt-layout-shell-rail-width/);
});

test('Phase 6.9.9 renderAuroraShell adds has-right-rail class when rightRail provided', () => {
  assert.match(coreLayout, /rightRail.*has-right-rail|has-right-rail.*rightRail/s);
});

/* ── Responsive layout ── */

test('Phase 6.9.9 CSS includes mobile breakpoint at 767px', () => {
  assert.match(styles, /@media\s*\(max-width:\s*767px\)/);
});

test('Phase 6.9.9 CSS includes tablet breakpoint at 1023px', () => {
  assert.match(styles, /@media\s*\(max-width:\s*1023px\)/);
});

test('Phase 6.9.9 CSS includes laptop breakpoint at 1279px', () => {
  assert.match(styles, /@media\s*\(max-width:\s*1279px\)/);
});

test('Phase 6.9.9 mobile hides side nav and shows bottom nav', () => {
  assert.match(styles, /\.aurora-side-nav\{display:\s*none\}/);
  assert.match(styles, /\.aurora-bottom-nav\{display:\s*flex\}/);
});

test('Phase 6.9.9 tablet stacks rail below content', () => {
  assert.match(styles, /\.aurora-unified-layout\{grid-template-columns:\s*1fr\}/);
});

test('Phase 6.9.9 desktop keeps side nav visible with shell grid', () => {
  assert.match(styles, /\.aurora-app-shell\{[^}]*grid-template-columns:\s*var\(--lpt-layout-shell-nav-width\)/);
});

/* ── Radius / frame system tokens ── */

test('Phase 6.9.9 design tokens include layout variables', () => {
  assert.match(tokens, /LAYOUT_TOKENS/);
  assert.match(tokens, /shellNavWidth/);
  assert.match(tokens, /shellRailWidth/);
  assert.match(tokens, /contentGutter/);
  assert.match(tokens, /panelInset/);
  assert.match(tokens, /cardInset/);
  assert.match(tokens, /rowPaddingY/);
  assert.match(tokens, /rowPaddingX/);
});

test('Phase 6.9.9 design token CSS emits layout tokens', () => {
  assert.match(tokenCSS, /--lpt-layout-shell-nav-width/);
  assert.match(tokenCSS, /--lpt-layout-shell-rail-width/);
  assert.match(tokenCSS, /--lpt-layout-content-gutter/);
  assert.match(tokenCSS, /--lpt-layout-panel-inset/);
  assert.match(tokenCSS, /--lpt-layout-card-inset/);
  assert.match(tokenCSS, /--lpt-layout-row-padding-y/);
  assert.match(tokenCSS, /--lpt-layout-row-padding-x/);
});

test('Phase 6.9.9 radius tokens include panel (20px) and hero (24px)', () => {
  assert.match(tokenCSS, /--lpt-radius-panel:\s*20px/);
  assert.match(tokenCSS, /--lpt-radius-hero:\s*24px/);
});

test('Phase 6.9.9 no arbitrary 13/17/19px radii in new Aurora layout classes', () => {
  const auroraBlocks = [...styles.matchAll(/\.(aurora-[^{,\s]+)[^{]*\{[^}]*\}/g)].map(m => m[0]).join('\n');
  assert.doesNotMatch(auroraBlocks, /border-radius:\s*(13px|17px|19px)/);
});

test('Phase 6.9.9 aurora shell classes use tokenized padding/insets', () => {
  assert.match(styles, /\.aurora-shell-content\{[^}]*--lpt-layout/);
  assert.match(styles, /\.aurora-daily-focus\{[^}]*--lpt-layout-panel-inset/);
});

/* ── Daily task row and proof chip alignment ── */

test('Phase 6.9.9 daily task rows use grid with reserved status column', () => {
  assert.match(styles, /\.aurora-daily-task\{[^}]*display:\s*grid/);
  assert.match(styles, /\.aurora-daily-task\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+minmax\(112px/);
});

test('Phase 6.9.9 proof required chip is non-interactive', () => {
  assert.match(styles, /\.aurora-chip-proof\{[^}]*cursor:\s*default/);
  assert.match(styles, /\.aurora-chip-proof\{[^}]*pointer-events:\s*none/);
});

test('Phase 6.9.9 proof required chip uses status chip class not primary button', () => {
  assert.match(styles, /\.aurora-chip-proof\{[^}]*border-color:\s*var\(--lpt-color-accent-proof\)/);
  const proofChip = styles.match(/\.aurora-chip-proof\{[^}]+\}/);
  assert.ok(proofChip);
  assert.doesNotMatch(proofChip[0], /box-shadow:\s*var\(--lpt-effect-lead-glow\)/);
});

test('Phase 6.9.9 proof chip aligns to right status column on desktop', () => {
  assert.match(styles, /\.aurora-chip-proof\{[^}]*justify-self:\s*end/);
});

test('Phase 6.9.9 mobile rule allows chip to wrap below without overflow', () => {
  const mobileBlock = styles.slice(styles.lastIndexOf('@media(max-width:767px)'));
  assert.match(mobileBlock, /\.aurora-daily-task\{[^}]*grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)/);
  assert.match(mobileBlock, /\.aurora-chip-proof\{[^}]*grid-column:\s*2/);
});

/* ── Design gallery coverage ── */

test('Phase 6.9.9 gallery includes layout system sections', () => {
  assert.match(gallery, /Aurora shell layout/);
  assert.match(gallery, /Daily focus with task rows/);
  assert.match(gallery, /Radius ladder/);
  assert.match(gallery, /Frame-inset ladder/);
  assert.match(gallery, /Responsive notes/);
});

/* ── Documentation ── */

test('Phase 6.9.9 docs document app shell grid rules', () => {
  assert.match(docs, /App shell grid|shell.*span.*viewport/i);
  assert.match(docs, /shellNavWidth/);
  assert.match(docs, /shellRailWidth/);
});

test('Phase 6.9.9 docs document responsive breakpoints', () => {
  assert.match(docs, /767.*mobile|mobile.*767/i);
  assert.match(docs, /1023.*tablet|tablet.*1023/i);
  assert.match(docs, /1279.*laptop|laptop.*1279/i);
});

test('Phase 6.9.9 docs document frame-inset ladder', () => {
  assert.match(docs, /panelInset/);
  assert.match(docs, /cardInset/);
  assert.match(docs, /rowPaddingY|rowPadding/i);
});

test('Phase 6.9.9 docs document nested rounded rectangle rule', () => {
  assert.match(docs, /step-down|concentric/i);
  assert.match(docs, /hero.*24.*panel.*20.*card.*16.*large.*12/s);
});

test('Phase 6.9.9 docs document proof-required chip as non-interactive', () => {
  assert.match(docs, /non-interactive|cursor.*default/i);
});

/* ── Regression ── */

test('Phase 6.9.9 regression: aurora direction tokens preserved', () => {
  assert.match(tokenCSS, /--lpt-color-accent-progress/);
  assert.match(tokenCSS, /--lpt-color-accent-proof/);
  assert.match(tokenCSS, /--lpt-color-accent-trust/);
});

test('Phase 6.9.9 regression: non-shell pages still have fallback layout', () => {
  assert.match(styles, /\.lpt-shell:not\(\.aurora-app-shell\)\{[^}]*max-width/);
});

test('Phase 6.9.9 regression: aurora discover CTA still uses radius-card', () => {
  assert.match(styles, /\.aurora-discover-cta\{[^}]*border-radius:\s*var\(--lpt-radius-card\)/);
});
