import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PROOF_STUDIO_COPY_RULES,
  PROOF_STUDIO_INTERACTION_PATTERNS,
  PROOF_STUDIO_PRINCIPLES,
  PROOF_STUDIO_REJECTED_PATTERNS,
  PROOF_STUDIO_SCREEN_PATTERNS,
} from '../src/proof-studio-direction.js';

const source = readFileSync(new URL('../src/proof-studio-direction.js', import.meta.url), 'utf8');

test('Proof Studio principles define the required direction', () => {
  assert.ok(PROOF_STUDIO_PRINCIPLES.includes('proof is the hero'));
  assert.ok(PROOF_STUDIO_PRINCIPLES.includes('one primary daily action'));
  assert.ok(PROOF_STUDIO_PRINCIPLES.includes('public trust must be real'));
  assert.ok(PROOF_STUDIO_PRINCIPLES.includes('respect over likes'));
  assert.ok(PROOF_STUDIO_PRINCIPLES.includes('journey before dashboard'));
  assert.ok(PROOF_STUDIO_PRINCIPLES.includes('clear locked / active / complete progression'));
  assert.ok(PROOF_STUDIO_PRINCIPLES.includes('one lead color (indigo) for action, progress and active state'));
  assert.ok(PROOF_STUDIO_PRINCIPLES.includes('green means proof only; purple means peak only'));
  assert.equal(PROOF_STUDIO_PRINCIPLES.includes('no cold blue primary action language'), false);
});

test('rejected patterns prevent fake metrics, leaderboards, competing primaries and game economy', () => {
  const rejected = PROOF_STUDIO_REJECTED_PATTERNS.join('\n');
  assert.match(rejected, /fake metrics/);
  assert.match(rejected, /leaderboard/);
  assert.match(rejected, /more than one competing primary accent/);
  assert.match(rejected, /cold slate base/);
  assert.doesNotMatch(rejected, /cold blue primary action/);
  assert.match(rejected, /hearts\/gems\/shop economy/);
  assert.match(rejected, /raw evidence URLs/);
});

test('screen and interaction patterns cover Today, roadmap and public progress', () => {
  assert.equal(PROOF_STUDIO_SCREEN_PATTERNS.today.role, 'daily action center');
  assert.ok(PROOF_STUDIO_SCREEN_PATTERNS.today.required.includes('proof requirement summary'));
  assert.ok(PROOF_STUDIO_SCREEN_PATTERNS.roadmap.states.includes('completed'));
  assert.ok(PROOF_STUDIO_SCREEN_PATTERNS.roadmap.states.includes('active'));
  assert.ok(PROOF_STUDIO_SCREEN_PATTERNS.roadmap.states.includes('locked'));
  assert.ok(PROOF_STUDIO_SCREEN_PATTERNS.publicProgress.required.includes('Respect / Comment / Report actions'));
  assert.match(PROOF_STUDIO_INTERACTION_PATTERNS.reducedMotion, /prefers-reduced-motion/);
  assert.match(PROOF_STUDIO_INTERACTION_PATTERNS.primaryCta, /indigo primary action/);
  assert.match(PROOF_STUDIO_INTERACTION_PATTERNS.buttons, /passing on-fill label/);
  assert.match(PROOF_STUDIO_INTERACTION_PATTERNS.inputs, /text, not color-only/);
});

test('copy rules prefer Respect and distinguish submitted from verified proof', () => {
  assert.ok(PROOF_STUDIO_COPY_RULES.prefer.includes('Respect'));
  assert.ok(PROOF_STUDIO_COPY_RULES.avoid.includes('Like'));
  assert.match(PROOF_STUDIO_COPY_RULES.proofStatus.submitted, /not independently validated/);
  assert.match(PROOF_STUDIO_COPY_RULES.proofStatus.verified, /actual verified evidence state/);
});

test('Proof Studio direction module stays pure data', () => {
  assert.doesNotMatch(source, /from ['"].*(firebase|analytics|server|api\/_lib|db\.js|auth\.js)/);
  assert.doesNotMatch(source, /document|window|localStorage|process\.env|import\.meta\.env|fetch\(|XMLHttpRequest/);
});
