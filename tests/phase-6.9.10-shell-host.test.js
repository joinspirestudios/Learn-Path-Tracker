import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAuroraShell, renderShellNav } from '../src/ui/core-layout.js';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
const indexHTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const coreLayout = readFileSync(new URL('../src/ui/core-layout.js', import.meta.url), 'utf8');

/* ── 1. Host wrapper override: .wrap must not constrain Aurora shell ── */

test('Phase 6.9.10 index.html keeps #content inside .wrap', () => {
  const wrapPos = indexHTML.indexOf('class="wrap"');
  const contentPos = indexHTML.indexOf('id="content"');
  assert.ok(wrapPos > 0 && contentPos > 0);
  assert.ok(wrapPos < contentPos, '#content must be inside .wrap');
});

test('Phase 6.9.10 CSS includes aurora-shell-mode .wrap override', () => {
  assert.match(styles, /body\.aurora-shell-mode\s+\.wrap\{[^}]*max-width:\s*none/);
  assert.match(styles, /body\.aurora-shell-mode\s+\.wrap\{[^}]*width:\s*100%/);
  assert.match(styles, /body\.aurora-shell-mode\s+\.wrap\{[^}]*margin:\s*0/);
  assert.match(styles, /body\.aurora-shell-mode\s+\.wrap\{[^}]*padding:\s*0/);
});

test('Phase 6.9.10 CSS includes aurora-shell-mode #content full-width/height', () => {
  assert.match(styles, /body\.aurora-shell-mode\s+#content\{[^}]*min-height:\s*100dvh/);
  assert.match(styles, /body\.aurora-shell-mode\s+#content\{[^}]*width:\s*100%/);
});

test('Phase 6.9.10 CSS hides header.top and #tabs in aurora-shell-mode', () => {
  assert.match(styles, /body\.aurora-shell-mode\s+header\.top[^{]*\{[^}]*display:\s*none\s*!important/);
  assert.match(styles, /body\.aurora-shell-mode\s+#tabs\{[^}]*display:\s*none\s*!important|body\.aurora-shell-mode\s+header\.top,body\.aurora-shell-mode\s+#tabs\{[^}]*display:\s*none\s*!important/);
});

test('Phase 6.9.10 .wrap still has max-width for non-shell screens', () => {
  assert.match(styles, /\.wrap\{[^}]*max-width:\s*1100px/);
});

/* ── 2. Aurora render path toggles aurora-shell-mode ── */

test('Phase 6.9.10 appShellHTML adds aurora-shell-mode for signed-in users', () => {
  assert.match(views, /aurora-shell-mode/);
  const appShellBlock = views.slice(views.indexOf('function appShellHTML'), views.indexOf('function appShellHTML') + 600);
  assert.match(appShellBlock, /classList\.add\(['"]aurora-shell-mode['"]\)/);
});

test('Phase 6.9.10 appShellHTML removes aurora-shell-mode for public/legacy screens', () => {
  // Window widened in 6.15.1: appShellHTML grew (side-nav profile identity), but
  // the signed-out branch still removes the shell-mode class.
  const appShellBlock = views.slice(views.indexOf('function appShellHTML'), views.indexOf('function appShellHTML') + 1200);
  assert.match(appShellBlock, /classList\.remove\(['"]aurora-shell-mode['"]\)/);
});

/* ── 3. renderAuroraShell content-inner wrapper ── */

test('Phase 6.9.10 renderAuroraShell output includes aurora-shell-content-inner', () => {

  const html = renderAuroraShell({ active:'today', title:'Test', body:'<p>Body</p>' });
  assert.match(html, /aurora-shell-content-inner/);
  const contentStart = html.indexOf('aurora-shell-content');
  const innerStart = html.indexOf('aurora-shell-content-inner');
  assert.ok(innerStart > contentStart, 'inner wrapper must be inside shell-content');
});

test('Phase 6.9.10 CSS defines aurora-shell-content-inner with content-max', () => {
  assert.match(styles, /\.aurora-shell-content-inner\{[^}]*max-width:\s*var\(--lpt-layout-content-max\)/);
});

/* ── 4. Side nav structure: no last-child hack ── */

test('Phase 6.9.10 side nav does not use last-child margin-top auto', () => {
  assert.doesNotMatch(styles, /\.aurora-side-nav\s+\.aurora-nav-item:last-child\{[^}]*margin-top:\s*auto/);
});

test('Phase 6.9.10 side nav uses aurora-side-nav-links wrapper', () => {

  const html = renderShellNav({ active:'today' });
  assert.match(html, /aurora-side-nav-links/);
});

test('Phase 6.9.10 Profile appears inside aurora-side-nav-links not bottom-anchored', () => {

  const html = renderShellNav({ active:'today' });
  const linksStart = html.indexOf('aurora-side-nav-links');
  const profilePos = html.indexOf('Profile');
  const linksEnd = html.indexOf('</div>', linksStart);
  assert.ok(profilePos > linksStart && profilePos < linksEnd, 'Profile must be inside aurora-side-nav-links');
});

test('Phase 6.9.10 aurora-side-nav-user is the only bottom-anchored block', () => {
  assert.match(styles, /\.aurora-side-nav-user\{[^}]*margin-top:\s*auto/);
  assert.doesNotMatch(styles, /\.aurora-side-nav\s+\.aurora-nav-item:last-child/);
});

test('Phase 6.9.10 renderShellNav renders user label when provided', () => {

  const html = renderShellNav({ active:'today', userLabel:'test@example.com' });
  assert.match(html, /aurora-side-nav-user/);
  assert.match(html, /test@example\.com/);
});

test('Phase 6.9.10 renderShellNav omits user block when no label', () => {

  const html = renderShellNav({ active:'today' });
  assert.doesNotMatch(html, /aurora-side-nav-user/);
});

/* ── 5. Today/path pages use shell rightRail slot ── */

test('Phase 6.9.10 renderPlatformToday passes rightRail to appShellHTML', () => {
  const platformTodayBlock = views.slice(views.indexOf('function renderPlatformToday'), views.indexOf('function renderPlatformToday') + 500);
  assert.match(platformTodayBlock, /rightRail\s*:\s*platformRightRailHTML/);
  assert.doesNotMatch(platformTodayBlock, /aurora-unified-rail/);
});

test('Phase 6.9.10 renderPlatformToday does not embed rail inside content body', () => {
  const platformTodayBlock = views.slice(views.indexOf('function renderPlatformToday'), views.indexOf('function renderPlatformToday') + 500);
  assert.doesNotMatch(platformTodayBlock, /<aside.*aurora-unified-rail/);
});

test('Phase 6.9.10 path detail passes rightRail to appShellHTML', () => {
  const planBlock = views.slice(views.indexOf('export function renderPlan'), views.indexOf('export function editPath'));
  assert.match(planBlock, /rightRail\s*:\s*platformRightRailHTML/);
});

test('Phase 6.9.10 renderAuroraShell adds has-right-rail when rightRail provided', () => {

  const withRail = renderAuroraShell({ active:'today', body:'<p>B</p>', rightRail:'<div>Rail</div>' });
  const withoutRail = renderAuroraShell({ active:'today', body:'<p>B</p>' });
  assert.match(withRail, /has-right-rail/);
  assert.doesNotMatch(withoutRail, /has-right-rail/);
  assert.match(withRail, /aurora-shell-rail/);
  assert.doesNotMatch(withoutRail, /aurora-shell-rail/);
});

/* ── 6. Daily task row markup uses title/status classes ── */

test('Phase 6.9.10 platformDailyFocusHTML uses aurora-daily-task-title class', () => {
  assert.match(views, /aurora-daily-task-title/);
  const focusBlock = views.slice(views.indexOf('function platformDailyFocusHTML'), views.indexOf('function platformRightRailHTML'));
  assert.match(focusBlock, /aurora-daily-task-title/);
});

test('Phase 6.9.10 proof-required rows include aurora-daily-task-status wrapper', () => {
  const focusBlock = views.slice(views.indexOf('function platformDailyFocusHTML'), views.indexOf('function platformRightRailHTML'));
  assert.match(focusBlock, /aurora-daily-task-status/);
});

test('Phase 6.9.10 CSS reserves fixed status column for desktop', () => {
  assert.match(styles, /\.aurora-daily-task\{[^}]*grid-template-columns:\s*20px\s+minmax\(0,\s*1fr\)\s+minmax\(112px/);
});

test('Phase 6.9.10 CSS moves task status under title on mobile', () => {
  const mobileBlock = styles.slice(styles.lastIndexOf('@media(max-width:767px)'));
  assert.match(mobileBlock, /\.aurora-daily-task-status\{[^}]*grid-column:\s*2/);
});

test('Phase 6.9.10 proof chip is non-interactive with no primary glow', () => {
  const proofChip = styles.match(/\.aurora-chip-proof\{[^}]+\}/);
  assert.ok(proofChip);
  assert.match(proofChip[0], /cursor:\s*default/);
  assert.match(proofChip[0], /pointer-events:\s*none/);
  assert.match(proofChip[0], /box-shadow:\s*none/);
  assert.doesNotMatch(proofChip[0], /var\(--lpt-effect-lead-glow\)/);
});

/* ── 7. Regression: Aurora tokens/direction preserved ── */

test('Phase 6.9.10 regression: aurora direction tokens preserved', () => {
  const tokenCSS = readFileSync(new URL('../src/generated/design-tokens.css', import.meta.url), 'utf8');
  assert.match(tokenCSS, /--lpt-color-accent-progress/);
  assert.match(tokenCSS, /--lpt-color-accent-proof/);
  assert.match(tokenCSS, /--lpt-color-accent-trust/);
});

test('Phase 6.9.10 regression: non-shell pages still have fallback layout', () => {
  assert.match(styles, /\.lpt-shell:not\(\.aurora-app-shell\)\{[^}]*max-width/);
});

test('Phase 6.9.10 regression: bottom nav hidden by default, shown on mobile', () => {
  assert.match(styles, /\.aurora-bottom-nav\{[^}]*display:\s*none/);
  const mobileBlock = styles.slice(styles.lastIndexOf('@media(max-width:767px)'));
  assert.match(mobileBlock, /\.aurora-bottom-nav\{[^}]*display:\s*flex/);
});

test('Phase 6.9.10 regression: shell rail has sticky positioning', () => {
  assert.match(styles, /\.aurora-shell-rail\{[^}]*position:\s*sticky/);
});
