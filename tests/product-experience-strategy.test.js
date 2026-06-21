import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  EXPERIENCE_PRINCIPLES,
  CORE_BEHAVIOR_LOOPS,
  CORE_FLOW_AUDITS,
  RETENTION_METRICS,
  MOTION_OPPORTUNITIES,
  REDESIGN_SCREEN_INVENTORY,
  REDESIGN_COMPONENT_INVENTORY,
  DESIGN_DEFERRED_FEATURES,
} from '../src/product-experience-strategy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('experience principles include proof-backed growth', () => {
  assert.ok(EXPERIENCE_PRINCIPLES.some(p => /proof.backed growth/i.test(p)));
});

test('experience principles include reward participation and celebrate proof', () => {
  assert.ok(EXPERIENCE_PRINCIPLES.some(p => /reward participation/i.test(p)));
  assert.ok(EXPERIENCE_PRINCIPLES.some(p => /celebrate proof/i.test(p)));
});

test('core behavior loops include Daily Focus', () => {
  assert.ok(CORE_BEHAVIOR_LOOPS.some(l => l.id === 'daily-focus'));
  const loop = CORE_BEHAVIOR_LOOPS.find(l => l.id === 'daily-focus');
  assert.ok(loop.cue);
  assert.ok(loop.routine);
  assert.ok(loop.reward);
  assert.ok(loop.retentionMechanic);
});

test('core behavior loops include AI Path Builder', () => {
  assert.ok(CORE_BEHAVIOR_LOOPS.some(l => l.id === 'ai-path-builder'));
});

test('core behavior loops include Discover/Public Preview', () => {
  assert.ok(CORE_BEHAVIOR_LOOPS.some(l => l.id === 'discover-preview'));
});

test('core flow audits cover all four priority flows', () => {
  const ids = CORE_FLOW_AUDITS.map(a => a.id);
  assert.ok(ids.includes('today-daily-focus'));
  assert.ok(ids.includes('ai-path-builder'));
  assert.ok(ids.includes('discover-public-preview'));
  assert.ok(ids.includes('completion-result'));
  CORE_FLOW_AUDITS.forEach(audit => {
    assert.ok(audit.currentStrength, `${audit.id} has currentStrength`);
    assert.ok(audit.currentWeakness, `${audit.id} has currentWeakness`);
    assert.ok(audit.redesignPriority, `${audit.id} has redesignPriority`);
  });
});

test('retention metrics include activation, D1, D7 and D30', () => {
  const ids = RETENTION_METRICS.map(m => m.id);
  assert.ok(ids.includes('activation_rate'));
  assert.ok(ids.includes('d1_retention'));
  assert.ok(ids.includes('d7_retention'));
  assert.ok(ids.includes('d30_retention'));
  RETENTION_METRICS.forEach(metric => {
    assert.ok(metric.why, `${metric.id} has why`);
    assert.ok(Array.isArray(metric.events), `${metric.id} has events array`);
  });
});

test('motion opportunities include proof saved, score increase and completion result', () => {
  const ids = MOTION_OPPORTUNITIES.map(m => m.id);
  assert.ok(ids.includes('proof-saved'));
  assert.ok(ids.includes('score-increase'));
  assert.ok(ids.includes('completion-result'));
  MOTION_OPPORTUNITIES.forEach(opp => {
    assert.ok(opp.moment, `${opp.id} has moment`);
    assert.ok(['high', 'medium', 'low'].includes(opp.priority), `${opp.id} has valid priority`);
  });
});

test('redesign screen inventory includes Today, Daily Focus, AI Path Builder, Discover and Completion Result', () => {
  const ids = REDESIGN_SCREEN_INVENTORY.map(s => s.id);
  assert.ok(ids.includes('today'));
  assert.ok(ids.includes('daily-focus'));
  assert.ok(ids.includes('ai-path-builder'));
  assert.ok(ids.includes('discover'));
  assert.ok(ids.includes('completion-result'));
  REDESIGN_SCREEN_INVENTORY.forEach(screen => {
    assert.ok(screen.name, `${screen.id} has name`);
    assert.ok(screen.primaryJob, `${screen.id} has primaryJob`);
  });
});

test('component inventory includes Button, Path Card, Daily Task Card, Proof Upload Card and Completion Result Panel', () => {
  const ids = REDESIGN_COMPONENT_INVENTORY.map(c => c.id);
  assert.ok(ids.includes('button'));
  assert.ok(ids.includes('path-card'));
  assert.ok(ids.includes('daily-task-card'));
  assert.ok(ids.includes('proof-upload-card'));
  assert.ok(ids.includes('completion-result-panel'));
  REDESIGN_COMPONENT_INVENTORY.forEach(comp => {
    assert.ok(Array.isArray(comp.states), `${comp.id} has states array`);
    assert.ok(comp.states.length >= 2, `${comp.id} has at least 2 states`);
  });
});

test('deferred features include native app build, adaptive planning, Gemini/evidence intelligence and full redesign implementation', () => {
  assert.ok(DESIGN_DEFERRED_FEATURES.some(f => /native.*mobile.*app/i.test(f)));
  assert.ok(DESIGN_DEFERRED_FEATURES.some(f => /adaptive planning/i.test(f)));
  assert.ok(DESIGN_DEFERRED_FEATURES.some(f => /gemini.*evidence/i.test(f)));
  assert.ok(DESIGN_DEFERRED_FEATURES.some(f => /full.*redesign.*implementation/i.test(f)));
});

test('product experience strategy module has no DOM/Firebase/analytics imports', () => {
  const source = readFileSync(resolve(root, 'src/product-experience-strategy.js'), 'utf8');
  assert.doesNotMatch(source, /import.*from.*firebase/i);
  assert.doesNotMatch(source, /import.*from.*views/i);
  assert.doesNotMatch(source, /import.*from.*analytics/i);
  assert.doesNotMatch(source, /document\./);
  assert.doesNotMatch(source, /window\./);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /gtag/);
});
