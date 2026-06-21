import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { COLOR_TOKENS } from '../src/design-tokens.js';
import { contrastRatio, hexToRgb, meetsContrast, relativeLuminance } from '../src/design-contrast.js';

const colorSource = readFileSync(new URL('../src/design-contrast.js', import.meta.url), 'utf8');
const colors = COLOR_TOKENS;
const value = token => token.value;

function ratio(foreground, background){
  return contrastRatio(value(foreground), value(background));
}

function assertAtLeast(actual, expected, label){
  assert.ok(actual >= expected, `${label}: expected ${actual.toFixed(2)} >= ${expected}`);
}

test('contrast helpers parse hex, calculate luminance and evaluate thresholds', () => {
  assert.deepEqual(hexToRgb('#fff'), { r:255, g:255, b:255 });
  assert.deepEqual(hexToRgb('#0d0b0a'), { r:13, g:11, b:10 });
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(meetsContrast('#fff7e8', '#0d0b0a', 7), true);
});

test('warm text tokens meet the Phase 6.9.1 contrast floors', () => {
  for(const surface of [colors.surface.canvas, colors.surface.panel]){
    assertAtLeast(ratio(colors.text.primary, surface), 7, 'primary on ' + surface.value);
    assertAtLeast(ratio(colors.text.secondary, surface), 4.5, 'secondary on ' + surface.value);
    assertAtLeast(ratio(colors.text.muted, surface), 3, 'muted on ' + surface.value);
  }
});

test('progress accent is gold, not blue, and supports readable labels', () => {
  const progress = hexToRgb(colors.accent.progress.value);
  assert.ok(progress.r > progress.b * 1.8, 'progress red channel should dominate blue');
  assert.ok(progress.g > progress.b, 'progress green channel should exceed blue');
  assertAtLeast(ratio(colors.accent.progress, colors.surface.canvas), 3, 'progress on canvas');
  assertAtLeast(ratio(colors.accent.progress, colors.text.inverse), 4.5, 'inverse text on progress');
  assert.notEqual(colors.accent.progress.value.toLowerCase(), '#3b82f6');
});

test('status and tier colors have usable contrast on warm surfaces', () => {
  for(const token of [
    colors.accent.danger,
    colors.accent.proof,
    colors.accent.warning,
    colors.accent.success,
    colors.tier.passed,
    colors.tier.strong,
    colors.tier.perfect,
  ]){
    assertAtLeast(ratio(token, colors.surface.canvas), 3, token.value + ' on canvas');
    assertAtLeast(ratio(token, colors.surface.panel), 3, token.value + ' on panel');
  }
});

test('design contrast module has no DOM, Firebase, analytics, server or env imports', () => {
  assert.doesNotMatch(colorSource, /from ['"].*(firebase|analytics|server|api\/_lib|db\.js|auth\.js)/);
  assert.doesNotMatch(colorSource, /document|window|localStorage|process\.env|import\.meta\.env/);
});
