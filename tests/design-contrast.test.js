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
  assert.deepEqual(hexToRgb('#15131C'), { r:21, g:19, b:28 });
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(meetsContrast('#F2EFF7', '#15131C', 7), true);
});

test('Aurora text tokens meet readable contrast floors', () => {
  for(const surface of [colors.surface.canvas, colors.surface.panel, colors.surface.raised]){
    assertAtLeast(ratio(colors.text.primary, surface), 7, 'primary on ' + surface.value);
    assertAtLeast(ratio(colors.text.secondary, surface), 4.5, 'secondary on ' + surface.value);
    assertAtLeast(ratio(colors.text.muted, surface), 4.5, 'muted on ' + surface.value);
  }
});

test('progress accent is indigo and supports readable labels', () => {
  const progress = hexToRgb(colors.accent.progress.value);
  assert.equal(colors.accent.progress.value, '#6D5DF6');
  assert.ok(progress.b > progress.r, 'progress blue channel should lead in Aurora indigo');
  assertAtLeast(ratio(colors.accent.progress, colors.surface.canvas), 3, 'progress on canvas');
  assertAtLeast(ratio(colors.accent.progress, colors.surface.panel), 3, 'progress on panel');
  assertAtLeast(contrastRatio('#FFFFFF', colors.accent.progress.value), 4.5, 'white label on indigo progress fill');
  assert.ok(contrastRatio(colors.text.primary.value, colors.accent.progress.value) < 4.5, 'near-white primary is not accepted as normal text on indigo fill');
  assert.notEqual(colors.accent.progress.value.toLowerCase(), '#d8b24c');
});

test('Aurora filled accent labels are mathematically guarded', () => {
  assertAtLeast(contrastRatio('#FFFFFF', colors.accent.progress.value), 4.5, 'white on indigo primary');
  assert.ok(contrastRatio(colors.text.primary.value, colors.accent.trust.value) < 4.5, 'near-white primary must not be used for normal text on purple');
  assert.ok(contrastRatio('#FFFFFF', colors.accent.trust.value) < 4.5, 'white must not be used for normal text on purple');
  assertAtLeast(contrastRatio(colors.text.inverse.value, colors.accent.trust.value), 4.5, 'dark inverse on purple peak');
  assertAtLeast(contrastRatio(colors.text.inverse.value, colors.accent.proof.value), 4.5, 'dark inverse on green proof');
});

test('status and tier colors have usable contrast on Aurora surfaces', () => {
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
  assert.equal(colors.tier.strong.value, '#2ED06E');
  assert.equal(colors.tier.perfect.value, '#B15CF6');
});

test('design contrast module has no DOM, Firebase, analytics, server or env imports', () => {
  assert.doesNotMatch(colorSource, /from ['"].*(firebase|analytics|server|api\/_lib|db\.js|auth\.js)/);
  assert.doesNotMatch(colorSource, /document|window|localStorage|process\.env|import\.meta\.env/);
});
