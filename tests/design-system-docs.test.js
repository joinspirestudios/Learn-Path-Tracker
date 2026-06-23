import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('docs/design-system-foundation.md exists', () => {
  assert.ok(existsSync(resolve(root, 'docs/design-system-foundation.md')));
});

test('design system foundation doc mentions proof-backed growth', () => {
  const doc = readFileSync(resolve(root, 'docs/design-system-foundation.md'), 'utf8');
  assert.match(doc, /proof.backed/i);
});

test('design system foundation doc mentions Aurora neutral-violet base', () => {
  const doc = readFileSync(resolve(root, 'docs/design-system-foundation.md'), 'utf8');
  assert.match(doc, /Aurora base/i);
  assert.match(doc, /neutral-violet/i);
});

test('design system foundation doc mentions semantic tokens', () => {
  const doc = readFileSync(resolve(root, 'docs/design-system-foundation.md'), 'utf8');
  assert.match(doc, /semantic/i);
  assert.match(doc, /token/i);
});

test('design system foundation doc mentions accessibility', () => {
  const doc = readFileSync(resolve(root, 'docs/design-system-foundation.md'), 'utf8');
  assert.match(doc, /accessibility/i);
  assert.match(doc, /WCAG/i);
});

test('design system foundation doc mentions motion', () => {
  const doc = readFileSync(resolve(root, 'docs/design-system-foundation.md'), 'utf8');
  assert.match(doc, /motion/i);
  assert.match(doc, /reduced.motion/i);
});

test('design system foundation doc mentions Figma', () => {
  const doc = readFileSync(resolve(root, 'docs/design-system-foundation.md'), 'utf8');
  assert.match(doc, /figma/i);
});

test('design system foundation doc states no production UI redesign was implemented', () => {
  const doc = readFileSync(resolve(root, 'docs/design-system-foundation.md'), 'utf8');
  assert.match(doc, /no production UI redesign was implemented/i);
});

test('design system foundation doc states no font files should be committed', () => {
  const doc = readFileSync(resolve(root, 'docs/design-system-foundation.md'), 'utf8');
  assert.match(doc, /no font files/i);
});

test('design system foundation doc states no Figma file is committed', () => {
  const doc = readFileSync(resolve(root, 'docs/design-system-foundation.md'), 'utf8');
  assert.match(doc, /no figma file was committed/i);
});

test('no Expo or native mobile scaffold exists at the repo root', () => {
  // Web app stays web-first. The Phase 6.10 mobile foundation is isolated under
  // apps/mobile; no Expo config or native project lives at the repo root.
  assert.equal(existsSync(resolve(root, 'app.json')), false);
  assert.equal(existsSync(resolve(root, 'eas.json')), false);
  assert.equal(existsSync(resolve(root, 'expo')), false);
  assert.equal(existsSync(resolve(root, 'mobile')), false);
  assert.equal(existsSync(resolve(root, 'ios')), false);
  assert.equal(existsSync(resolve(root, 'android')), false);
});

test('no animation library dependency was added', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal(allDeps['framer-motion'], undefined);
  assert.equal(allDeps['gsap'], undefined);
  assert.equal(allDeps['lottie-web'], undefined);
  assert.equal(allDeps['@react-spring/web'], undefined);
  assert.equal(allDeps['animejs'], undefined);
});

test('no Figma binary file was added', () => {
  assert.equal(existsSync(resolve(root, 'design.fig')), false);
  assert.equal(existsSync(resolve(root, 'design-system.fig')), false);
});

test('no font files were added', () => {
  assert.equal(existsSync(resolve(root, 'fonts')), false);
  assert.equal(existsSync(resolve(root, 'src', 'fonts')), false);
  assert.equal(existsSync(resolve(root, 'public', 'fonts')), false);
});

test('no design/UI library dependency was added', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.equal(allDeps['tailwindcss'], undefined);
  assert.equal(allDeps['@radix-ui/react-dialog'], undefined);
  assert.equal(allDeps['@chakra-ui/react'], undefined);
  assert.equal(allDeps['@mui/material'], undefined);
  assert.equal(allDeps['react'], undefined);
  assert.equal(allDeps['react-native'], undefined);
  assert.equal(allDeps['expo'], undefined);
});

test('no analytics SDK tracking was added', () => {
  const mainSource = readFileSync(resolve(root, 'src/main.js'), 'utf8');
  assert.doesNotMatch(mainSource, /gtag\(/);
  assert.doesNotMatch(mainSource, /firebase\/analytics/);
  assert.doesNotMatch(mainSource, /getAnalytics/);
  assert.doesNotMatch(mainSource, /logEvent/);
  assert.doesNotMatch(mainSource, /posthog/i);
  assert.doesNotMatch(mainSource, /amplitude/i);
  assert.doesNotMatch(mainSource, /mixpanel/i);
});

test('behavioral UX doc references design system foundation', () => {
  const doc = readFileSync(resolve(root, 'docs/behavioral-ux-retention-redesign-spec.md'), 'utf8');
  assert.match(doc, /design-system-foundation/i);
});

test('mobile architecture doc references design system foundation', () => {
  const doc = readFileSync(resolve(root, 'docs/mobile-core-loop-and-architecture.md'), 'utf8');
  assert.match(doc, /design-system-foundation/i);
});
