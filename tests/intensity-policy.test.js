import test from 'node:test';
import assert from 'node:assert/strict';

import {
  completionTierForScore, intensityPolicySummary, normalizeIntensityPolicy,
  passThresholdForIntensity, policyForIntensity,
} from '../src/intensity-policy.js';

test('intensity policies use distinct ordered thresholds', () => {
  assert.equal(policyForIntensity('soft').passThreshold, 55);
  assert.equal(policyForIntensity('balanced').passThreshold, 65);
  assert.equal(policyForIntensity('intensive').passThreshold, 75);
  assert.ok(passThresholdForIntensity('soft') < passThresholdForIntensity('balanced'));
  assert.ok(passThresholdForIntensity('balanced') < passThresholdForIntensity('intensive'));
});

test('intensity aliases normalize to canonical stored values', () => {
  assert.equal(normalizeIntensityPolicy('medium'), 'balanced');
  assert.equal(normalizeIntensityPolicy('normal'), 'balanced');
  assert.equal(normalizeIntensityPolicy('hard'), 'intensive');
  assert.equal(normalizeIntensityPolicy('light'), 'soft');
  assert.equal(normalizeIntensityPolicy('unknown'), 'balanced');
});

test('completion tiers distinguish participation, pass, strong and perfect', () => {
  const policy = policyForIntensity('balanced');
  assert.equal(completionTierForScore(0, policy), 'not_started');
  assert.equal(completionTierForScore(20, policy), 'in_progress');
  assert.equal(completionTierForScore(45, policy), 'attempted');
  assert.equal(completionTierForScore(70, policy), 'passed');
  assert.equal(completionTierForScore(88, policy), 'strong');
  assert.equal(completionTierForScore(100, policy), 'perfect');
});

test('policy summary includes workload, flexibility, proof and resource depth', () => {
  const summary = intensityPolicySummary('hard');
  assert.match(summary, /Intensive/);
  assert.match(summary, /5-8 tasks\/day/);
  assert.match(summary, /low flexibility/);
  assert.match(summary, /stronger proof/);
  assert.match(summary, /deep resources/);
});
