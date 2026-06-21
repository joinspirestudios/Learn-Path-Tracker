import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  DESIGN_TOKENS,
  COLOR_TOKENS,
  TYPOGRAPHY_TOKENS,
  SPACING_TOKENS,
  RADIUS_TOKENS,
  ELEVATION_TOKENS,
  MOTION_TOKENS,
  STATE_TOKENS,
  ACCESSIBILITY_TOKENS,
} from '../src/design-tokens.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('DESIGN_TOKENS exists and aggregates all token groups', () => {
  assert.ok(DESIGN_TOKENS);
  assert.ok(DESIGN_TOKENS.color);
  assert.ok(DESIGN_TOKENS.typography);
  assert.ok(DESIGN_TOKENS.spacing);
  assert.ok(DESIGN_TOKENS.radius);
  assert.ok(DESIGN_TOKENS.elevation);
  assert.ok(DESIGN_TOKENS.motion);
  assert.ok(DESIGN_TOKENS.state);
  assert.ok(DESIGN_TOKENS.accessibility);
});

test('COLOR_TOKENS include surface, text, border, accent and state groups', () => {
  assert.ok(COLOR_TOKENS.surface);
  assert.ok(COLOR_TOKENS.text);
  assert.ok(COLOR_TOKENS.border);
  assert.ok(COLOR_TOKENS.accent);
  assert.ok(COLOR_TOKENS.state);
});

test('COLOR_TOKENS surface includes canvas, panel and raised', () => {
  assert.ok(COLOR_TOKENS.surface.canvas);
  assert.ok(COLOR_TOKENS.surface.panel);
  assert.ok(COLOR_TOKENS.surface.raised);
});

test('COLOR_TOKENS accent includes progress, proof, warning, success, danger and trust', () => {
  assert.ok(COLOR_TOKENS.accent.progress);
  assert.ok(COLOR_TOKENS.accent.proof);
  assert.ok(COLOR_TOKENS.accent.warning);
  assert.ok(COLOR_TOKENS.accent.success);
  assert.ok(COLOR_TOKENS.accent.danger);
  assert.ok(COLOR_TOKENS.accent.trust);
});

test('COLOR_TOKENS state includes focus, disabled, loading, hover and pressed', () => {
  assert.ok(COLOR_TOKENS.state.focus);
  assert.ok(COLOR_TOKENS.state.disabled);
  assert.ok(COLOR_TOKENS.state.loading);
  assert.ok(COLOR_TOKENS.state.hover);
  assert.ok(COLOR_TOKENS.state.pressed);
});

test('each color token has value, purpose, usage and a11y fields', () => {
  Object.entries(COLOR_TOKENS.surface).forEach(([name, token]) => {
    assert.ok(token.value, `surface.${name} has value`);
    assert.ok(token.purpose, `surface.${name} has purpose`);
    assert.ok(token.usage, `surface.${name} has usage`);
    assert.ok(token.a11y, `surface.${name} has a11y`);
  });
});

test('TYPOGRAPHY_TOKENS include display, pageTitle, sectionTitle, body, label, metadata, button and numeric roles', () => {
  assert.ok(TYPOGRAPHY_TOKENS.display);
  assert.ok(TYPOGRAPHY_TOKENS.pageTitle);
  assert.ok(TYPOGRAPHY_TOKENS.sectionTitle);
  assert.ok(TYPOGRAPHY_TOKENS.body);
  assert.ok(TYPOGRAPHY_TOKENS.label);
  assert.ok(TYPOGRAPHY_TOKENS.metadata);
  assert.ok(TYPOGRAPHY_TOKENS.button);
  assert.ok(TYPOGRAPHY_TOKENS.numeric);
});

test('each typography token has role, family, size, lineHeight, weight and usage', () => {
  Object.entries(TYPOGRAPHY_TOKENS).forEach(([name, token]) => {
    assert.ok(token.role, `${name} has role`);
    assert.ok(token.family, `${name} has family`);
    assert.ok(token.size, `${name} has size`);
    assert.ok(token.lineHeight, `${name} has lineHeight`);
    assert.ok(token.weight, `${name} has weight`);
    assert.ok(token.usage, `${name} has usage`);
  });
});

test('SPACING_TOKENS include a consistent scale', () => {
  assert.ok(SPACING_TOKENS.xxs);
  assert.ok(SPACING_TOKENS.xs);
  assert.ok(SPACING_TOKENS.sm);
  assert.ok(SPACING_TOKENS.md);
  assert.ok(SPACING_TOKENS.lg);
  assert.ok(SPACING_TOKENS.xl);
  const values = Object.values(SPACING_TOKENS);
  for(let i = 1; i < values.length; i++){
    assert.ok(values[i] > values[i-1], `spacing scale is ascending at index ${i}`);
  }
});

test('RADIUS_TOKENS include small, medium, large, xl, pill, card and modal', () => {
  assert.ok(RADIUS_TOKENS.small);
  assert.ok(RADIUS_TOKENS.medium);
  assert.ok(RADIUS_TOKENS.large);
  assert.ok(RADIUS_TOKENS.xl);
  assert.ok(RADIUS_TOKENS.pill);
  assert.ok(RADIUS_TOKENS.card);
  assert.ok(RADIUS_TOKENS.modal);
});

test('each radius token has value and usage', () => {
  Object.entries(RADIUS_TOKENS).forEach(([name, token]) => {
    assert.ok(token.value, `${name} has value`);
    assert.ok(token.usage, `${name} has usage`);
  });
});

test('ELEVATION_TOKENS include flat, raised, floating and overlay', () => {
  assert.ok(ELEVATION_TOKENS.flat !== undefined);
  assert.ok(ELEVATION_TOKENS.raised);
  assert.ok(ELEVATION_TOKENS.floating);
  assert.ok(ELEVATION_TOKENS.overlay);
});

test('each elevation token has value and usage', () => {
  Object.entries(ELEVATION_TOKENS).forEach(([name, token]) => {
    assert.ok(token.value !== undefined, `${name} has value`);
    assert.ok(token.usage, `${name} has usage`);
  });
});

test('MOTION_TOKENS include fast/base/slow durations and easing', () => {
  assert.ok(MOTION_TOKENS.duration.fast);
  assert.ok(MOTION_TOKENS.duration.base);
  assert.ok(MOTION_TOKENS.duration.slow);
  assert.ok(MOTION_TOKENS.easing.standard);
  assert.ok(MOTION_TOKENS.easing.enter);
  assert.ok(MOTION_TOKENS.easing.exit);
});

test('MOTION_TOKENS include task transition, proof saved, score increase and reduced motion fallback', () => {
  assert.ok(MOTION_TOKENS.taskTransition);
  assert.ok(MOTION_TOKENS.proofSaved);
  assert.ok(MOTION_TOKENS.scoreIncrease);
  assert.ok(MOTION_TOKENS.completionResult);
  assert.ok(MOTION_TOKENS.reducedMotion);
  assert.ok(MOTION_TOKENS.reducedMotion.fallback);
  assert.ok(MOTION_TOKENS.reducedMotion.rule);
});

test('STATE_TOKENS include default, hover, focus, pressed, disabled, loading, success, warning and error', () => {
  assert.ok(STATE_TOKENS.default);
  assert.ok(STATE_TOKENS.hover);
  assert.ok(STATE_TOKENS.focus);
  assert.ok(STATE_TOKENS.pressed);
  assert.ok(STATE_TOKENS.disabled);
  assert.ok(STATE_TOKENS.loading);
  assert.ok(STATE_TOKENS.success);
  assert.ok(STATE_TOKENS.warning);
  assert.ok(STATE_TOKENS.error);
});

test('ACCESSIBILITY_TOKENS include tap target, focus ring, contrast guidance, reduced motion and aria-live guidance', () => {
  assert.ok(ACCESSIBILITY_TOKENS.tapTarget);
  assert.ok(ACCESSIBILITY_TOKENS.tapTarget.minSize);
  assert.ok(ACCESSIBILITY_TOKENS.focusRing);
  assert.ok(ACCESSIBILITY_TOKENS.focusRing.width);
  assert.ok(ACCESSIBILITY_TOKENS.contrastTarget);
  assert.ok(ACCESSIBILITY_TOKENS.contrastTarget.normal);
  assert.ok(ACCESSIBILITY_TOKENS.reducedMotion);
  assert.ok(ACCESSIBILITY_TOKENS.reducedMotion.mediaQuery);
  assert.ok(ACCESSIBILITY_TOKENS.ariaLive);
  assert.ok(ACCESSIBILITY_TOKENS.ariaLive.feedback);
  assert.ok(ACCESSIBILITY_TOKENS.ariaLive.urgent);
});

test('ACCESSIBILITY_TOKENS include error messaging, loading state and disabled state guidance', () => {
  assert.ok(ACCESSIBILITY_TOKENS.errorMessaging);
  assert.ok(ACCESSIBILITY_TOKENS.loadingState);
  assert.ok(ACCESSIBILITY_TOKENS.disabledState);
  assert.ok(ACCESSIBILITY_TOKENS.colorIndependence);
});

test('design-tokens module has no DOM/Firebase/analytics/server/env imports', () => {
  const source = readFileSync(resolve(root, 'src/design-tokens.js'), 'utf8');
  assert.doesNotMatch(source, /import.*from.*firebase/i);
  assert.doesNotMatch(source, /import.*from.*views/i);
  assert.doesNotMatch(source, /import.*from.*analytics/i);
  assert.doesNotMatch(source, /import.*from.*server/i);
  assert.doesNotMatch(source, /import.*from.*api\//i);
  assert.doesNotMatch(source, /document\./);
  assert.doesNotMatch(source, /window\./);
  assert.doesNotMatch(source, /process\.env/);
});
