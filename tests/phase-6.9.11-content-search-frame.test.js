import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAuroraShell } from '../src/ui/core-layout.js';
import { discoveryControlsHTML } from '../src/views/catalog/controls.js';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const views = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');
const gallery = readFileSync(new URL('../src/ui/design-gallery.js', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../docs/design-system-foundation.md', import.meta.url), 'utf8');
const phaseDocs = readFileSync(new URL('../docs/phase-6.9-core-ui-rollout.md', import.meta.url), 'utf8');

/* ── 1. Content centering inside shell content column ── */

test('Phase 6.9.11 aurora-shell-content uses flex centering', () => {
  const block = styles.match(/\.aurora-shell-content\{[^}]+\}/);
  assert.ok(block);
  assert.match(block[0], /display:\s*flex/);
  assert.match(block[0], /justify-content:\s*center/);
});

test('Phase 6.9.11 aurora-shell-content-inner uses margin-inline:auto', () => {
  assert.match(styles, /\.aurora-shell-content-inner\{[^}]*margin-inline:\s*auto/);
});

test('Phase 6.9.11 content-inner still has max-width from content-max token', () => {
  assert.match(styles, /\.aurora-shell-content-inner\{[^}]*max-width:\s*var\(--lpt-layout-content-max\)/);
});

test('Phase 6.9.11 renderAuroraShell content structure unchanged', () => {
  const html = renderAuroraShell({ active:'today', body:'<p>Test</p>' });
  assert.match(html, /aurora-shell-content/);
  assert.match(html, /aurora-shell-content-inner/);
  const contentIdx = html.indexOf('aurora-shell-content');
  const innerIdx = html.indexOf('aurora-shell-content-inner');
  assert.ok(innerIdx > contentIdx);
});

/* ── 2. Loose divider removed from right rail ── */

test('Phase 6.9.11 aurora-shell-rail has no border-left', () => {
  const railBlock = styles.match(/\.aurora-shell-rail\{[^}]+\}/);
  assert.ok(railBlock);
  assert.doesNotMatch(railBlock[0], /border-left/);
});

test('Phase 6.9.11 rail still has sticky positioning', () => {
  assert.match(styles, /\.aurora-shell-rail\{[^}]*position:\s*sticky/);
});

/* ── 3. Day detail rail card ── */

test('Phase 6.9.11 selectedDayDetailRailCardHTML exists in views.js', () => {
  assert.match(views, /function selectedDayDetailRailCardHTML/);
});

test('Phase 6.9.11 selectedDayDetailRailCardHTML renders aurora-day-detail-rail', () => {
  assert.match(views, /aurora-day-detail-rail/);
  const fnBlock = views.slice(
    views.indexOf('function selectedDayDetailRailCardHTML'),
    views.indexOf('function platformRightRailHTML')
  );
  assert.match(fnBlock, /aurora-day-detail-rail/);
  assert.match(fnBlock, /aurora-day-detail-kicker/);
  assert.match(fnBlock, /aurora-day-detail-tasks/);
  assert.match(fnBlock, /aurora-day-detail-check/);
});

test('Phase 6.9.11 platformRightRailHTML calls selectedDayDetailRailCardHTML', () => {
  const start = views.indexOf('function platformRightRailHTML');
  const end = views.indexOf('\nexport function renderToday');
  const fnBlock = views.slice(start, end);
  assert.match(fnBlock, /selectedDayDetailRailCardHTML/);
});

test('Phase 6.9.11 CSS defines aurora-day-detail-rail styling', () => {
  assert.match(styles, /\.aurora-day-detail-rail\{[^}]*border-radius:\s*var\(--lpt-radius-xl\)/);
  assert.match(styles, /\.aurora-day-detail-rail\{[^}]*padding:\s*var\(--lpt-layout-card-inset\)/);
});

test('Phase 6.9.11 day detail check circle uses proof accent', () => {
  assert.match(styles, /\.aurora-day-detail-check\{[^}]*border.*var\(--lpt-color-accent-proof\)/);
});

/* ── 4. Focus screen vertical centering ── */

test('Phase 6.9.11 daily-focus-screen uses 3-zone grid for centering', () => {
  assert.match(styles, /\.daily-focus-screen\{[^}]*display:\s*grid/);
  assert.match(styles, /\.daily-focus-screen\{[^}]*grid-template-rows:\s*auto\s+1fr\s+auto/);
  assert.match(styles, /\.daily-focus-screen\{[^}]*min-height:\s*100dvh/);
});

test('Phase 6.9.11 daily-session inside focus screen aligns to center zone', () => {
  assert.match(styles, /\.daily-focus-screen\s+\.daily-session\{[^}]*align-self:\s*center/);
  assert.match(styles, /\.daily-focus-screen\s+\.daily-session\{[^}]*max-width:\s*var\(--lpt-layout-main-column-width\)/);
  assert.match(styles, /\.daily-focus-screen\s+\.daily-session\{[^}]*margin-inline:\s*auto/);
});

/* ── 5. Search/Control frame system ── */

test('Phase 6.9.11 aurora-search-frame has panel radius', () => {
  assert.match(styles, /\.aurora-search-frame\{[^}]*border-radius:\s*var\(--lpt-radius-panel\)/);
});

test('Phase 6.9.11 aurora-search-frame is sticky', () => {
  assert.match(styles, /\.aurora-search-frame\{[^}]*position:\s*sticky/);
  assert.match(styles, /\.aurora-search-frame\{[^}]*z-index:\s*10/);
});

test('Phase 6.9.11 inner controls use large radius not pill', () => {
  assert.match(styles, /\.aurora-search-frame\s+\.aurora-search-control\s+input\{[^}]*border-radius:\s*var\(--lpt-radius-large\)/);
  assert.match(styles, /\.aurora-search-frame\s+\.aurora-category-control\s+select[^{]*\{[^}]*border-radius:\s*var\(--lpt-radius-large\)/);
});

test('Phase 6.9.11 filter row inside frame uses border-top', () => {
  assert.match(styles, /\.aurora-search-frame\s+\.aurora-filter-row\{[^}]*border-top/);
});

test('Phase 6.9.11 discoveryControlsHTML wraps in aurora-search-frame', () => {
  const html = discoveryControlsHTML([{ id:'p1', title:'Path', category:'test', visibility:'public', discoverable:true }], {
    query:'', category:'all', duration:'all', intensity:'all', proof:'all', sort:'recommended',
  });
  assert.match(html, /aurora-search-frame/);
  assert.match(html, /aurora-discovery-search-header/);
  assert.match(html, /id="discoveryQuery"/);
  assert.match(html, /id="toggleDiscoveryFilters"/);
  assert.match(html, /data-discovery-field="category"/);
  assert.match(html, /data-discovery-field="sort"/);
  assert.match(html, /aurora-filter-row/);
});

test('Phase 6.9.11 old search header becomes non-sticky inside frame', () => {
  assert.match(styles, /\.aurora-search-frame\s+\.aurora-discovery-search-header\{[^}]*position:\s*static/);
});

/* ── 6. Gallery coverage ── */

test('Phase 6.9.11 gallery includes new sections', () => {
  assert.match(gallery, /Content centering/);
  assert.match(gallery, /Search frame system/);
  assert.match(gallery, /Day detail rail card/);
  assert.match(gallery, /Focus screen centering/);
});

/* ── 7. Documentation ── */

test('Phase 6.9.11 docs describe content centering', () => {
  assert.match(docs, /margin-inline.*auto|flex.*center/i);
  assert.match(docs, /aurora-shell-content/);
});

test('Phase 6.9.11 docs describe search frame system', () => {
  assert.match(docs, /Search.*[Cc]ontrol frame|search-frame/);
  assert.match(docs, /panel radius.*20px|20px.*panel/i);
  assert.match(docs, /large radius.*12px|12px.*large/i);
});

test('Phase 6.9.11 docs describe day detail rail card', () => {
  assert.match(docs, /day-detail-rail|Day detail rail/i);
});

test('Phase 6.9.11 docs describe focus screen centering', () => {
  assert.match(docs, /3-zone.*grid|grid-template-rows.*auto.*1fr/i);
  assert.match(docs, /daily-focus-screen|focus screen/i);
});

test('Phase 6.9.11 phase docs describe all five changes', () => {
  assert.match(phaseDocs, /6\.9\.11/);
  assert.match(phaseDocs, /Content centering|margin-inline/i);
  assert.match(phaseDocs, /Rail divider|border-left/i);
  assert.match(phaseDocs, /Day detail rail|selectedDayDetail/i);
  assert.match(phaseDocs, /Focus screen centering|3-zone/i);
  assert.match(phaseDocs, /Search frame|aurora-search-frame/i);
});

/* ── 8. Regression ── */

test('Phase 6.9.11 regression: aurora-app-shell still full viewport', () => {
  const shellBlock = styles.match(/\.aurora-app-shell\{[^}]+\}/);
  assert.ok(shellBlock);
  assert.match(shellBlock[0], /width:\s*100%/);
  assert.doesNotMatch(shellBlock[0], /margin:\s*0\s+auto/);
  assert.doesNotMatch(shellBlock[0], /max-width/);
});

test('Phase 6.9.11 regression: shell-mode overrides preserved', () => {
  assert.match(styles, /body\.aurora-shell-mode\s+\.wrap\{[^}]*max-width:\s*none/);
  assert.match(styles, /body\.aurora-shell-mode\s+#content\{[^}]*width:\s*100%/);
});

test('Phase 6.9.11 regression: non-shell pages still have fallback layout', () => {
  assert.match(styles, /\.lpt-shell:not\(\.aurora-app-shell\)\{[^}]*max-width/);
});

test('Phase 6.9.11 regression: bottom nav hidden by default, shown on mobile', () => {
  assert.match(styles, /\.aurora-bottom-nav\{[^}]*display:\s*none/);
  const mobileBlock = styles.slice(styles.lastIndexOf('@media(max-width:767px)'));
  assert.match(mobileBlock, /\.aurora-bottom-nav\{[^}]*display:\s*flex/);
});

test('Phase 6.9.11 regression: aurora direction tokens preserved', () => {
  const tokenCSS = readFileSync(new URL('../src/generated/design-tokens.css', import.meta.url), 'utf8');
  assert.match(tokenCSS, /--lpt-color-accent-progress/);
  assert.match(tokenCSS, /--lpt-color-accent-proof/);
  assert.match(tokenCSS, /--lpt-color-accent-trust/);
});

test('Phase 6.9.11 regression: functional hooks preserved in discovery controls', () => {
  const html = discoveryControlsHTML([{ id:'p1', title:'Path', category:'test', visibility:'public', discoverable:true }], {
    query:'test', category:'all', duration:'all', intensity:'all', proof:'all', sort:'recommended',
  });
  assert.match(html, /id="discoveryQuery"/);
  assert.match(html, /id="clearDiscoveryFilters"/);
  assert.match(html, /data-discovery-field="sort"/);
  assert.match(html, /data-discovery-field="category"/);
  assert.match(html, /data-discovery-field="duration"/);
  assert.match(html, /data-discovery-field="intensity"/);
  assert.match(html, /data-discovery-field="proof"/);
});

test('Phase 6.9.11 regression: discover CTA still uses radius-card', () => {
  assert.match(styles, /\.aurora-discover-cta\{[^}]*border-radius:\s*var\(--lpt-radius-card\)/);
});
