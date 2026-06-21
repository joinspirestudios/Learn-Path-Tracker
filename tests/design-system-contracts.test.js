import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  CORE_COMPONENTS,
  COMPONENT_CONTRACTS,
  COMPONENT_STATE_MODEL,
  SCREEN_COMPOSITION_MODEL,
  DESIGN_SYSTEM_DEFERRED_WORK,
} from '../src/design-system-contracts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('CORE_COMPONENTS includes Button, Input, SearchBar, PathCard, DailyTaskCard, ProofUploadCard, ProgressMeter and CompletionResultPanel', () => {
  assert.ok(CORE_COMPONENTS.includes('Button'));
  assert.ok(CORE_COMPONENTS.includes('Input'));
  assert.ok(CORE_COMPONENTS.includes('SearchBar'));
  assert.ok(CORE_COMPONENTS.includes('PathCard'));
  assert.ok(CORE_COMPONENTS.includes('DailyTaskCard'));
  assert.ok(CORE_COMPONENTS.includes('ProofUploadCard'));
  assert.ok(CORE_COMPONENTS.includes('ProgressMeter'));
  assert.ok(CORE_COMPONENTS.includes('CompletionResultPanel'));
});

test('CORE_COMPONENTS includes all 25 required components', () => {
  const required = [
    'Button', 'Input', 'Select', 'SearchBar', 'FilterChip', 'TabBar', 'BottomNav',
    'PathCard', 'PublicPathCard', 'TrustMetricCard', 'DailyScoreCard', 'DailyTaskCard',
    'ProofUploadCard', 'ProgressMeter', 'CompletionResultPanel', 'PublicProgressEntry',
    'CommentItem', 'ReactionButton', 'ReportAction', 'Modal', 'ToastBanner',
    'EmptyState', 'SkeletonLoader', 'SessionHeader', 'RoadmapNode',
  ];
  required.forEach(name => {
    assert.ok(CORE_COMPONENTS.includes(name), `missing ${name}`);
  });
});

test('COMPONENT_CONTRACTS has one entry per core component', () => {
  CORE_COMPONENTS.forEach(name => {
    assert.ok(COMPONENT_CONTRACTS[name], `missing contract for ${name}`);
  });
});

test('each component contract includes purpose, slots, variants, states, accessibility notes and mobile notes', () => {
  CORE_COMPONENTS.forEach(name => {
    const contract = COMPONENT_CONTRACTS[name];
    assert.ok(contract.purpose, `${name} has purpose`);
    assert.ok(contract.slots, `${name} has slots`);
    assert.ok(contract.variants, `${name} has variants`);
    assert.ok(contract.states, `${name} has states`);
    assert.ok(contract.a11y, `${name} has a11y`);
    assert.ok(contract.mobile, `${name} has mobile`);
  });
});

test('component states include default and disabled for interactive components, focus and loading where applicable', () => {
  const interactiveComponents = ['Button', 'Input', 'Select'];
  interactiveComponents.forEach(name => {
    const states = COMPONENT_CONTRACTS[name].states;
    assert.ok(states.includes('default'), `${name} has default`);
    assert.ok(states.includes('disabled'), `${name} has disabled`);
  });
  assert.ok(COMPONENT_CONTRACTS.Button.states.includes('focus'));
  assert.ok(COMPONENT_CONTRACTS.Button.states.includes('loading'));
  assert.ok(COMPONENT_CONTRACTS.Input.states.includes('focus'));
  assert.ok(COMPONENT_CONTRACTS.Select.states.includes('open'));
});

test('ProofUploadCard states include success and error', () => {
  const states = COMPONENT_CONTRACTS.ProofUploadCard.states;
  assert.ok(states.includes('success'));
  assert.ok(states.includes('error'));
});

test('COMPONENT_STATE_MODEL defines interactive, feedback, content, access and tier state groups', () => {
  assert.ok(Array.isArray(COMPONENT_STATE_MODEL.interactive));
  assert.ok(Array.isArray(COMPONENT_STATE_MODEL.feedback));
  assert.ok(Array.isArray(COMPONENT_STATE_MODEL.content));
  assert.ok(Array.isArray(COMPONENT_STATE_MODEL.access));
  assert.ok(Array.isArray(COMPONENT_STATE_MODEL.tier));
});

test('SCREEN_COMPOSITION_MODEL includes Today, Daily Focus, Discover, Public Path Preview, AI Path Builder and Completion Result', () => {
  assert.ok(SCREEN_COMPOSITION_MODEL['today']);
  assert.ok(SCREEN_COMPOSITION_MODEL['daily-focus']);
  assert.ok(SCREEN_COMPOSITION_MODEL['discover']);
  assert.ok(SCREEN_COMPOSITION_MODEL['public-path-preview']);
  assert.ok(SCREEN_COMPOSITION_MODEL['ai-path-builder']);
  assert.ok(SCREEN_COMPOSITION_MODEL['completion-result']);
});

test('screen contracts include primary job, emotional goal, main components, primary CTA, empty/loading/error states, privacy risk and motion opportunity', () => {
  Object.entries(SCREEN_COMPOSITION_MODEL).forEach(([id, screen]) => {
    assert.ok(screen.primaryJob, `${id} has primaryJob`);
    assert.ok(screen.emotionalGoal, `${id} has emotionalGoal`);
    assert.ok(Array.isArray(screen.mainComponents), `${id} has mainComponents`);
    assert.ok(screen.primaryCTA, `${id} has primaryCTA`);
    assert.ok(screen.emptyState, `${id} has emptyState`);
    assert.ok(screen.loadingState, `${id} has loadingState`);
    assert.ok(screen.errorState, `${id} has errorState`);
    assert.ok(screen.privacyRisk, `${id} has privacyRisk`);
    assert.ok(screen.motionOpportunity, `${id} has motionOpportunity`);
  });
});

test('screen contracts include mobile and desktop behavior', () => {
  Object.entries(SCREEN_COMPOSITION_MODEL).forEach(([id, screen]) => {
    assert.ok(screen.mobile, `${id} has mobile`);
    assert.ok(screen.desktop, `${id} has desktop`);
  });
});

test('DESIGN_SYSTEM_DEFERRED_WORK includes production UI redesign, native mobile implementation, animation implementation and Figma file creation', () => {
  assert.ok(DESIGN_SYSTEM_DEFERRED_WORK.some(d => /production.*UI.*redesign/i.test(d)));
  assert.ok(DESIGN_SYSTEM_DEFERRED_WORK.some(d => /native.*mobile/i.test(d)));
  assert.ok(DESIGN_SYSTEM_DEFERRED_WORK.some(d => /animation/i.test(d)));
  assert.ok(DESIGN_SYSTEM_DEFERRED_WORK.some(d => /figma/i.test(d)));
});

test('design-system-contracts module has no DOM/Firebase/analytics/server/env imports', () => {
  const source = readFileSync(resolve(root, 'src/design-system-contracts.js'), 'utf8');
  assert.doesNotMatch(source, /import.*from.*firebase/i);
  assert.doesNotMatch(source, /import.*from.*views/i);
  assert.doesNotMatch(source, /import.*from.*analytics/i);
  assert.doesNotMatch(source, /import.*from.*server/i);
  assert.doesNotMatch(source, /import.*from.*api\//i);
  assert.doesNotMatch(source, /document\./);
  assert.doesNotMatch(source, /window\./);
  assert.doesNotMatch(source, /process\.env/);
});
