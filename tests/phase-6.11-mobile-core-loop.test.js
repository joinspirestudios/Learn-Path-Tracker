import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createInitialMobileLoopState,
  getTodaySummary,
  todayCta,
  startTodaySession,
  startTask,
  getCurrentTask,
  addTextProof,
  addTaskReflection,
  markTaskDone,
  goToNextTask,
  goToPreviousTask,
  canFinishMobileDay,
  finishMobileDay,
  getCompletionSummary,
  MOBILE_SESSION_STATUS,
} from '../apps/mobile/src/core/mobileCoreLoop.js';
import {
  computeMobileScore,
  mobileTierForScore,
  mobileCompletionTier,
  MOBILE_INTENSITY_POLICY,
} from '../apps/mobile/src/core/mobileScoring.js';
import { completionTierForScore, policyForIntensity } from '../src/intensity-policy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = resolve(root, 'apps/mobile');

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Helper: mark all of a list of task ids done (proof tasks get proof text first).
function completeTasks(state, ids) {
  let s = state;
  for (const id of ids) {
    s = addTextProof(s, id, 'did the work');
    s = markTaskDone(s, id);
  }
  return s;
}

/* ── 1. Core-loop model ── */

test('Phase 6.11 createInitialMobileLoopState returns a local-only starter path/session', () => {
  const s = createInitialMobileLoopState();
  assert.equal(s.path.local, true);
  assert.equal(s.session.status, MOBILE_SESSION_STATUS.NOT_STARTED);
  assert.ok(s.tasks.length >= 3 && s.tasks.length <= 4);
  assert.ok(s.tasks.some(t => t.requiresProof), 'has a proof task');
});

test('Phase 6.11 getTodaySummary returns task count and proof-needed count', () => {
  const s = createInitialMobileLoopState();
  const summary = getTodaySummary(s);
  assert.equal(summary.totalTasks, s.tasks.length);
  assert.equal(summary.completedTasks, 0);
  assert.equal(summary.proofNeeded, s.tasks.filter(t => t.requiresProof).length);
  assert.equal(summary.proofSubmitted, 0);
  assert.equal(summary.local, true);
});

test('Phase 6.11 startTodaySession moves status to in_progress', () => {
  const s0 = createInitialMobileLoopState();
  const s1 = startTodaySession(s0);
  assert.equal(s1.session.status, MOBILE_SESSION_STATUS.IN_PROGRESS);
  assert.equal(s0.session.status, MOBILE_SESSION_STATUS.NOT_STARTED, 'input not mutated');
});

test('Phase 6.11 todayCta reflects session state', () => {
  const s0 = createInitialMobileLoopState();
  assert.deepEqual(todayCta(s0), { label: 'Start today', action: 'start' });
  const s1 = startTodaySession(s0);
  assert.deepEqual(todayCta(s1), { label: 'Continue day', action: 'continue' });
  const s2 = finishMobileDay(s1);
  assert.deepEqual(todayCta(s2), { label: 'View result', action: 'result' });
});

test('Phase 6.11 markTaskDone updates exactly one task and does not mutate input', () => {
  const s0 = startTodaySession(createInitialMobileLoopState());
  const s1 = markTaskDone(s0, 'review');
  assert.equal(s1.session.taskState.review.done, true);
  assert.equal(s0.session.taskState.review.done, false, 'input state not mutated in place');
  const otherDone = Object.entries(s1.session.taskState).filter(([, v]) => v.done).length;
  assert.equal(otherDone, 1);
});

test('Phase 6.11 a proof task cannot be marked done without text proof', () => {
  const s0 = startTodaySession(createInitialMobileLoopState());
  const blocked = markTaskDone(s0, 'proof');
  assert.equal(blocked.session.taskState.proof.done, false, 'no proof -> not done');
  const withProof = markTaskDone(addTextProof(s0, 'proof', 'wrote a reflection'), 'proof');
  assert.equal(withProof.session.taskState.proof.done, true);
});

test('Phase 6.11 addTextProof and addTaskReflection store local text safely', () => {
  const s0 = createInitialMobileLoopState();
  const s1 = addTextProof(s0, 'proof', 'my proof');
  assert.equal(s1.session.taskState.proof.proofText, 'my proof');
  const s2 = addTaskReflection(s1, 'proof', 'my reflection');
  assert.equal(s2.session.taskState.proof.reflection, 'my reflection');
  assert.equal(s0.session.taskState.proof.proofText, '', 'input not mutated');
});

test('Phase 6.11 next/previous task navigation is bounded and immutable', () => {
  const s0 = startTodaySession(createInitialMobileLoopState());
  const prevAtStart = goToPreviousTask(s0);
  assert.equal(prevAtStart.session.currentTaskIndex, 0);
  let s = s0;
  for (let i = 0; i < 10; i += 1) s = goToNextTask(s);
  assert.equal(s.session.currentTaskIndex, s.tasks.length - 1, 'capped at last task');
  assert.equal(s0.session.currentTaskIndex, 0, 'input not mutated');
});

test('Phase 6.11 startTask and getCurrentTask select a single current task', () => {
  const s0 = createInitialMobileLoopState();
  const s1 = startTask(s0, 'proof');
  const current = getCurrentTask(s1);
  assert.equal(current.id, 'proof');
  assert.equal(current.total, s0.tasks.length);
  assert.ok(current.position >= 1 && current.position <= current.total);
});

test('Phase 6.11 finishMobileDay creates a deterministic completion summary', () => {
  const s = completeTasks(startTodaySession(createInitialMobileLoopState()), ['review', 'work-block', 'proof', 'self-check']);
  const finished = finishMobileDay(s);
  assert.equal(finished.session.status, MOBILE_SESSION_STATUS.FINISHED);
  const summary = getCompletionSummary(finished);
  assert.equal(summary.totalTasks, 4);
  assert.equal(summary.completedTasks, 4);
  assert.equal(summary.proofSubmitted, 1);
  assert.equal(summary.score, 100);
  assert.equal(summary.tier, 'perfect');
});

/* ── 2. Mobile scoring ── */

test('Phase 6.11 scoring: no work done returns not_started', () => {
  const s = createInitialMobileLoopState();
  const score = computeMobileScore(s.tasks, s.session.taskState);
  assert.equal(score.score, 0);
  assert.equal(mobileCompletionTier(score), 'not_started');
});

test('Phase 6.11 scoring: partial work returns in_progress or attempted', () => {
  const s = completeTasks(createInitialMobileLoopState(), ['review']);
  const tier = mobileCompletionTier(computeMobileScore(s.tasks, s.session.taskState));
  assert.ok(['in_progress', 'attempted'].includes(tier), 'got ' + tier);
});

test('Phase 6.11 scoring: pass threshold returns passed', () => {
  // review(1) + work-block(1) + self-check(0.5) = 2.5 / 3.5 = 71% -> passed
  const s = completeTasks(createInitialMobileLoopState(), ['review', 'work-block', 'self-check']);
  const score = computeMobileScore(s.tasks, s.session.taskState);
  assert.equal(score.score, 71);
  assert.equal(mobileCompletionTier(score), 'passed');
});

test('Phase 6.11 scoring: high completion returns strong', () => {
  // review + work-block + proof = 3 / 3.5 = 86% -> strong
  const s = completeTasks(createInitialMobileLoopState(), ['review', 'work-block', 'proof']);
  const score = computeMobileScore(s.tasks, s.session.taskState);
  assert.equal(score.score, 86);
  assert.equal(mobileCompletionTier(score), 'strong');
});

test('Phase 6.11 scoring: all required tasks + proofs returns perfect', () => {
  const s = completeTasks(createInitialMobileLoopState(), ['review', 'work-block', 'proof', 'self-check']);
  const score = computeMobileScore(s.tasks, s.session.taskState);
  assert.equal(score.score, 100);
  assert.equal(mobileCompletionTier(score), 'perfect');
});

test('Phase 6.11 scoring: proof submitted is counted as submitted, never verified', () => {
  const s = completeTasks(createInitialMobileLoopState(), ['proof']);
  const score = computeMobileScore(s.tasks, s.session.taskState);
  assert.equal(score.proofSubmitted, 1);
  assert.equal(typeof score.proofVerified, 'undefined', 'no verified field exists');
});

test('Phase 6.11 mobile tier mapping is in parity with the web balanced policy', () => {
  const webPolicy = policyForIntensity('balanced');
  assert.equal(MOBILE_INTENSITY_POLICY.passThreshold, webPolicy.passThreshold);
  assert.equal(MOBILE_INTENSITY_POLICY.strongThreshold, webPolicy.strongThreshold);
  assert.equal(MOBILE_INTENSITY_POLICY.perfectThreshold, webPolicy.perfectThreshold);
  assert.equal(MOBILE_INTENSITY_POLICY.participationThreshold, webPolicy.participationThreshold);
  for (let n = 0; n <= 100; n += 1) {
    assert.equal(mobileTierForScore(n), completionTierForScore(n, webPolicy), 'parity at ' + n);
  }
});

/* ── 3. Screen wiring (source-level, deterministic without a RN renderer) ── */

test('Phase 6.11 TodayScreen drives CTA from todayCta and shows local note', () => {
  const src = read('apps/mobile/src/screens/TodayScreen.js');
  assert.match(src, /todayCta/);
  assert.match(src, /getTodaySummary/);
  assert.match(src, /not connected yet/i);
  assert.doesNotMatch(src, /verified/i);
});

test('Phase 6.11 DailyFocusScreen renders one task at a time, not the whole list', () => {
  const src = read('apps/mobile/src/screens/DailyFocusScreen.js');
  assert.match(src, /getCurrentTask/);
  assert.match(src, /Task .* of/); // position label
  // Must not render the full task list by mapping over tasks.
  assert.doesNotMatch(src, /\.tasks\.map\s*\(/);
  assert.doesNotMatch(src, /session\.taskState\)\.map/);
});

test('Phase 6.11 DailyFocusScreen shows proof input only when required', () => {
  const src = read('apps/mobile/src/screens/DailyFocusScreen.js');
  assert.match(src, /proofRequired\s*\?/);
  assert.match(src, /AuroraTextInput/);
});

test('Phase 6.11 CompletionResultScreen shows score, tier and proof submitted count', () => {
  const src = read('apps/mobile/src/screens/CompletionResultScreen.js');
  assert.match(src, /getCompletionSummary/);
  assert.match(src, /MobileCompletionSummary/);
  const summarySrc = read('apps/mobile/src/components/MobileCompletionSummary.js');
  assert.match(summarySrc, /proof submitted/i);
  assert.match(summarySrc, /tasks completed/i);
  assert.doesNotMatch(summarySrc, /verified/i);
});

test('Phase 6.11 PathsScreen shows the local starter path without fake public stats', () => {
  const src = read('apps/mobile/src/screens/PathsScreen.js');
  assert.match(src, /Local only|local starter/i);
  assert.doesNotMatch(src, /joined|leaderboard|followers?/i);
});

test('Phase 6.11 PathRoadmapScreen renders a read-only roadmap without exposing evidence', () => {
  // Phase 6.12 repurposed this screen to render a read-only cloud roadmap.
  const src = read('apps/mobile/src/screens/PathRoadmapScreen.js');
  assert.match(src, /roadmap/i);
  assert.match(src, /MobileRoadmapList|roadmapState/);
  assert.doesNotMatch(src, /evidenceUrl|downloadURL|storagePath/i);
});

/* ── 4. No forbidden behavior ── */

test('Phase 6.11 no mobile screen imports apiClient or calls fetch directly', () => {
  const screenDir = resolve(mobile, 'src/screens');
  for (const file of walk(screenDir)) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /apiClient/, file + ' imports apiClient');
    assert.doesNotMatch(src, /\bfetch\s*\(/, file + ' calls fetch directly');
  }
});

test('Phase 6.11 apiClient seam remains available for future phases', () => {
  assert.ok(existsSync(resolve(mobile, 'src/services/apiClient.js')));
  const src = read('apps/mobile/src/services/apiClient.js');
  assert.match(src, /createApiClient/);
});

test('Phase 6.11 mobile source does not import web DOM modules, server code, or Firebase Admin', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  const forbidden = [
    /from\s+['"][^'"]*src\/views(\.js|\/)/,
    /from\s+['"][^'"]*styles\.css/,
    /from\s+['"][^'"]*\/header\.js/,
    /from\s+['"]firebase-admin/,
    /from\s+['"][^'"]*api-handlers\//,
    /from\s+['"][^'"]*\/server\//,
  ];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    for (const re of forbidden) assert.doesNotMatch(src, re, file + ' violates ' + re);
    assert.doesNotMatch(src, /\bdocument\./, file + ' uses document');
    assert.doesNotMatch(src, /\bwindow\./, file + ' uses window');
    assert.doesNotMatch(src, /\blocalStorage\b/, file + ' uses localStorage');
  }
});

test('Phase 6.11 no fake metrics or game-economy copy in mobile source', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /leaderboard|followers?|hearts|gems|lives|\bshop\b|proof verified/i, file);
  }
});

test('Phase 6.11 no camera/file-picker/audio or new native deps added to mobile package', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const banned of [
    'expo-camera', 'expo-image-picker', 'expo-document-picker', 'expo-av',
    'expo-file-system', '@react-native-async-storage/async-storage',
    'firebase-admin', '@react-navigation/native',
  ]) {
    assert.equal(deps[banned], undefined, banned + ' must not be added');
  }
  // Phase 6.12 adds firebase (client SDK) for auth/cloud reads. No camera/
  // picker/audio/native-storage/admin deps.
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['expo', 'firebase', 'react', 'react-native']);
});

/* ── 5. Components ── */

test('Phase 6.11 Aurora components exist and use the Aurora theme without CSS', () => {
  const comps = [
    'AuroraCard', 'AuroraButton', 'AuroraProgressBar', 'AuroraTaskCard',
    'AuroraStatusPill', 'AuroraTextInput', 'MobileCompletionSummary',
  ];
  for (const name of comps) {
    const file = resolve(mobile, 'src/components/' + name + '.js');
    assert.ok(existsSync(file), 'missing component ' + name);
    const src = readFileSync(file, 'utf8');
    assert.match(src, /auroraTheme/, name + ' uses auroraTheme');
    assert.doesNotMatch(src, /\.css/, name + ' must not import CSS');
  }
});

test('Phase 6.11 AuroraButton supports primary/secondary/ghost/disabled', () => {
  const src = read('apps/mobile/src/components/AuroraButton.js');
  assert.match(src, /primary/);
  assert.match(src, /secondary/);
  assert.match(src, /ghost/);
  assert.match(src, /disabled/);
});

test('Phase 6.11 AuroraTextInput does not imply cloud sync and is not logged', () => {
  const src = read('apps/mobile/src/components/AuroraTextInput.js');
  assert.doesNotMatch(src, /synced|cloud|published/i);
  assert.doesNotMatch(src, /console\./);
});

/* ── 6. Docs ── */

test('Phase 6.11 documentation exists and references the phase', () => {
  assert.ok(existsSync(resolve(root, 'docs/mobile-core-loop-mvp.md')));
  assert.match(read('README.md'), /Phase 6\.11/);
  assert.match(read('apps/mobile/README.md'), /local.*core loop|core loop/i);
  const mvp = read('docs/mobile-core-loop-mvp.md');
  assert.match(mvp, /Firebase Auth/i);
  assert.match(mvp, /proof upload/i);
  assert.match(mvp, /defer/i);
  assert.match(mvp, /Phase 6\.12/);
});
