import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeTodayState, todayPrimaryAction, todayStatusCopy, todayRecoveryCopy,
  todayProofStatusCopy, adaptiveCopyForTodayState, proofJourneyItemCopy, rightRailTodayContext,
  TODAY_STATES,
} from '../src/today-state-model.js';
import { renderAdaptivePlanningPanel } from '../src/views/adaptive-planning-panel.js';
import { renderAuroraShell } from '../src/ui/core-layout.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }

/* ── 1. Today state model ── */

test('Phase 8.1.1 today-state-model exists and supports all states', () => {
  assert.equal(existsSync(resolve(root, 'src/today-state-model.js')), true);
  for (const s of ['not_started', 'active', 'in_progress', 'completed', 'missed', 'recoverable', 'locked', 'upcoming', 'synced', 'review_only']) {
    assert.ok(TODAY_STATES.includes(s), s);
  }
});

test('Phase 8.1.1 normalizeTodayState classifies raw statuses + flags correctly', () => {
  // A day flagged missed behind the calendar with no freeze → missed.
  assert.equal(normalizeTodayState({ rawStatus: 'missed', dayNumber: 4, activeCalendarDay: 5, freezeCount: 0 }).state, 'missed');
  // Missed with a freeze available → recoverable.
  assert.equal(normalizeTodayState({ rawStatus: 'missed', dayNumber: 4, activeCalendarDay: 5, freezeCount: 1 }).state, 'recoverable');
  // Active + session started → in_progress; not started → active.
  assert.equal(normalizeTodayState({ rawStatus: 'active', dayNumber: 5, activeCalendarDay: 5, sessionStarted: true }).state, 'in_progress');
  assert.equal(normalizeTodayState({ rawStatus: 'active', dayNumber: 5, activeCalendarDay: 5, sessionStarted: false }).state, 'active');
  // Completed → completed; locked future → upcoming.
  assert.equal(normalizeTodayState({ rawStatus: 'completed', dayNumber: 3 }).state, 'completed');
  assert.equal(normalizeTodayState({ rawStatus: 'locked', dayNumber: 9, activeCalendarDay: 5 }).state, 'upcoming');
  // Not started path.
  assert.equal(normalizeTodayState({ pathStarted: false }).state, 'not_started');
  // An "active" raw status that is actually behind → missed (the deployed bug).
  assert.equal(normalizeTodayState({ rawStatus: 'active', dayNumber: 4, activeCalendarDay: 5, freezeCount: 0 }).state, 'missed');
});

test('Phase 8.1.1 primary CTA mapping; missed/locked/completed never map to Start day', () => {
  const cta = (s) => todayPrimaryAction(normalizeTodayState(s)).label;
  assert.equal(cta({ rawStatus: 'active', dayNumber: 5, activeCalendarDay: 5, sessionStarted: false }), 'Start today');
  assert.equal(cta({ rawStatus: 'active', dayNumber: 5, activeCalendarDay: 5, sessionStarted: true }), 'Continue day');
  assert.equal(cta({ rawStatus: 'completed', dayNumber: 3 }), 'Review completed day');
  assert.equal(cta({ rawStatus: 'missed', dayNumber: 4, activeCalendarDay: 5, freezeCount: 0 }), 'Review missed day');
  assert.equal(cta({ rawStatus: 'missed', dayNumber: 4, activeCalendarDay: 5, freezeCount: 1 }), 'Recover this day');
  assert.equal(cta({ rawStatus: 'locked', dayNumber: 9, activeCalendarDay: 5 }), 'Locked until later');
  // None of missed/locked/completed ever say "Start day"/"Start today".
  for (const s of [
    { rawStatus: 'missed', dayNumber: 4, activeCalendarDay: 5, freezeCount: 0 },
    { rawStatus: 'locked', dayNumber: 9, activeCalendarDay: 5 },
    { rawStatus: 'completed', dayNumber: 3 },
  ]) {
    const action = todayPrimaryAction(normalizeTodayState(s));
    assert.doesNotMatch(action.label, /start (day|today)/i, JSON.stringify(s));
    assert.notEqual(action.action, 'start_today');
  }
  // Locked is disabled with a reason.
  const locked = todayPrimaryAction(normalizeTodayState({ rawStatus: 'locked', dayNumber: 9, activeCalendarDay: 5 }));
  assert.equal(locked.disabled, true);
  assert.ok(locked.reason);
});

test('Phase 8.1.1 status + recovery + proof copy is state-specific', () => {
  assert.match(todayStatusCopy(normalizeTodayState({ rawStatus: 'missed', dayNumber: 4, activeCalendarDay: 5 })), /was missed/i);
  assert.match(todayStatusCopy(normalizeTodayState({ rawStatus: 'completed', dayNumber: 3 })), /complete/i);
  assert.match(todayStatusCopy(normalizeTodayState({ rawStatus: 'locked', dayNumber: 9, activeCalendarDay: 5 })), /unlocks later/i);
  assert.match(todayRecoveryCopy(normalizeTodayState({ rawStatus: 'recoverable', freezeCount: 1, dayNumber: 4, activeCalendarDay: 5 })), /can still be recovered/i);
  assert.match(todayProofStatusCopy(normalizeTodayState({ rawStatus: 'active', dayNumber: 5, activeCalendarDay: 5, pendingUploadCount: 2 })), /pending/i);
  assert.match(todayProofStatusCopy(normalizeTodayState({ rawStatus: 'active', dayNumber: 5, activeCalendarDay: 5, failedUploadCount: 1 })), /failed/i);
});

/* ── 2. Adaptive copy repair ── */

test('Phase 8.1.1 adaptiveCopyForTodayState is missed-aware; never plain steady while missed', () => {
  const keepDraft = { recommendations: [{ type: 'keep_plan_unchanged' }], summary: 'Your plan looks steady — no changes suggested.' };
  const missed = adaptiveCopyForTodayState(normalizeTodayState({ rawStatus: 'missed', dayNumber: 4, activeCalendarDay: 5 }), keepDraft);
  assert.match(missed, /missed/i);
  assert.notEqual(missed, 'Your plan looks steady — no changes suggested.');
  // Active steady day may still show the plain steady copy.
  const active = adaptiveCopyForTodayState(normalizeTodayState({ rawStatus: 'active', dayNumber: 5, activeCalendarDay: 5 }), keepDraft);
  assert.equal(active, 'Your plan looks steady — no changes suggested.');
  // No data → not-enough-data copy.
  assert.match(adaptiveCopyForTodayState(normalizeTodayState({ rawStatus: 'active', dayNumber: 1, activeCalendarDay: 1 }), { recommendations: [] }), /not enough/i);
  // Pending proof → proof-attention copy.
  assert.match(adaptiveCopyForTodayState(normalizeTodayState({ rawStatus: 'active', dayNumber: 5, activeCalendarDay: 5, pendingUploadCount: 1 }), keepDraft), /pending proof/i);
});

test('Phase 8.1.1 adaptive panel renders missed-aware summary when todayState supplied', () => {
  const draft = { id: 'd', recommendations: [{ type: 'keep_plan_unchanged', reason: 'steady' }], summary: 'Your plan looks steady — no changes suggested.' };
  const missedState = normalizeTodayState({ rawStatus: 'missed', dayNumber: 4, activeCalendarDay: 5 });
  const html = renderAdaptivePlanningPanel({ draft, todayState: missedState });
  assert.match(html, /missed/i);
  assert.doesNotMatch(html.match(/aurora-adapt-summary">([^<]*)</)[1], /^Your plan looks steady — no changes suggested\.$/);
  // Without a todayState, the original summary is preserved (Phase 7.0 behavior).
  assert.match(renderAdaptivePlanningPanel({ draft }), /Your plan looks steady/);
});

/* ── 3. Proof journey copy ── */

test('Phase 8.1.1 proofJourneyItemCopy is state-aware and not identical placeholders', () => {
  const active = proofJourneyItemCopy({ dayNumber: 5, state: 'active', taskCount: 1, proofRequired: true });
  assert.match(active.title, /Today's proof session/);
  assert.equal(proofJourneyItemCopy({ state: 'completed', taskCount: 1 }).title, 'Completed proof day');
  assert.equal(proofJourneyItemCopy({ state: 'missed', dayNumber: 4 }).title, 'Missed day');
  assert.equal(proofJourneyItemCopy({ state: 'recoverable' }).title, 'Recovery available');
  const lockedWithTitle = proofJourneyItemCopy({ dayNumber: 6, state: 'locked', taskTitle: 'Write 300 words', tasksReady: true });
  assert.match(lockedWithTitle.title, /Write 300 words/);
  const lockedNoTitle = proofJourneyItemCopy({ dayNumber: 7, state: 'locked', tasksReady: true, proofRequired: true });
  assert.match(lockedNoTitle.title, /Upcoming proof checkpoint/);
  // Two different locked rows are NOT identical.
  assert.notEqual(JSON.stringify(lockedWithTitle), JSON.stringify(lockedNoTitle));
  // No private evidence leaks.
  assert.doesNotMatch(JSON.stringify([active, lockedWithTitle, lockedNoTitle]), /storagePath|localUri|https?:\/\/|downloadURL/);
});

test('Phase 8.1.1 roadmap renders use proofJourneyItemCopy; no "Scheduled proof day" placeholder', () => {
  const views = read('src/views.js');
  assert.match(views, /proofJourneyItemCopy/);
  // Both roadmap renderers stopped emitting the repetitive placeholder title.
  assert.doesNotMatch(views, /title:status === 'active' \? "Today's proof session" : status === 'completed' \? 'Completed proof day' : 'Scheduled proof day'/);
});

/* ── 4. Right rail ── */

test('Phase 8.1.1 rightRailTodayContext gives status/proof/next-step', () => {
  const missed = rightRailTodayContext(normalizeTodayState({ rawStatus: 'missed', dayNumber: 4, activeCalendarDay: 5, proofRequiredCount: 1, proofSubmittedCount: 0 }));
  assert.equal(missed.statusLabel, 'Missed');
  assert.equal(missed.proof, 'Not submitted');
  assert.match(missed.nextStep, /Review missed day/);
  const completed = rightRailTodayContext(normalizeTodayState({ rawStatus: 'completed', dayNumber: 3 }));
  assert.equal(completed.statusLabel, 'Completed');
  assert.match(completed.nextStep, /Review proof record/);
  const locked = rightRailTodayContext(normalizeTodayState({ rawStatus: 'locked', dayNumber: 9, activeCalendarDay: 5 }));
  assert.equal(locked.statusLabel, 'Upcoming');
  assert.match(locked.nextStep, /current day/i);
  assert.match(read('src/views.js'), /rightRailTodayContext/);
});

/* ── 5. Daily Focus + shell wiring (source-level) ── */

test('Phase 8.1.1 platformDailyFocusHTML uses the state model, not the old "Start day" ternary', () => {
  const views = read('src/views.js');
  assert.match(views, /platformTodayState/);
  assert.match(views, /todayPrimaryAction/);
  // Old hard-coded CTA ternary is gone.
  assert.doesNotMatch(views, /const ctaLabel = status === 'completed' \? 'Review Day ' \+ day : \(sessionStarted \? 'Continue day' : 'Start day'\);/);
  // Missed/recoverable/completed route to read-only review, not the focus session.
  assert.match(views, /aurora-today-review/);
  assert.match(views, /data-review-action/);
});

/* ── 6. Notification bell placement ── */

test('Phase 8.1.1 bell sits in a stable shell header (not a floating page-body orphan)', () => {
  const shell = renderAuroraShell({ active: 'today', showBell: true, unreadCount: 3, body: '<p>x</p>' });
  assert.match(shell, /aurora-shell-header/);
  assert.match(shell, /aurora-shell-utility/);
  assert.match(shell, /aurora-bell/);
  assert.match(shell, /aurora-bell-badge/); // unread badge still renders
  assert.match(shell, /data-action="open-notifications"/);
  // Signed-out shell has no bell.
  assert.doesNotMatch(renderAuroraShell({ active: 'today', body: '<p>x</p>' }), /aurora-bell/);
  // The bell header sits inside the centered content column (top of content-inner),
  // before the page body — anchored, not a floating page-body orphan.
  assert.ok(shell.indexOf('aurora-shell-content-inner') < shell.indexOf('aurora-shell-header'));
  assert.ok(shell.indexOf('aurora-shell-header') < shell.indexOf('<p>x</p>'));
});

/* ── 7. Regression / preservation ── */

test('Phase 8.1.1 Gemini Vision + prior phases preserved; admin pinned; routers intact', () => {
  for (const rel of [
    'src/evidence-vision-model.js', 'server/gemini-vision-provider.js', 'server/evidence-vision-service.js',
    'apps/mobile/src/components/MobileEvidenceVisionCard.js',
  ]) assert.equal(existsSync(resolve(root, rel)), true, rel);
  // The 8.2 limitation is intentionally preserved (not fixed here).
  assert.match(read('server/evidence-vision-service.js'), /defaultLoadImage/);
  const pkg = read('package.json');
  for (const t of ['phase-8.2-gemini-vision-evidence-understanding', 'phase-8.1-evidence-public-safe-review', 'phase-8.0.1-evidence-intelligence-runtime-source-repair', 'phase-8.0-evidence-intelligence', 'phase-7.0-rolling-adaptive-planning', 'phase-6.18.1-web-notification-preferences-signout-repair']) {
    assert.match(pkg, new RegExp(t.replace(/\./g, '\\.')));
  }
  assert.equal(JSON.parse(pkg).dependencies['firebase-admin'], '13.10.0');
  const fs = JSON.parse(read('vercel.json'));
  assert.ok(Object.keys(fs.functions || {}).length < 12);
  // No client/mobile Gemini key exposure.
  for (const rel of ['src/today-state-model.js', 'src/views.js', 'src/ui/core-layout.js', 'src/views/adaptive-planning-panel.js']) {
    assert.doesNotMatch(read(rel), /GEMINI_API_KEY|VITE_GEMINI|EXPO_PUBLIC_GEMINI/i, rel);
  }
});

test('Phase 8.1.1 no forbidden additions in the Today repair files', () => {
  for (const rel of ['src/today-state-model.js', 'src/views/adaptive-planning-panel.js', 'src/ui/core-layout.js']) {
    const src = read(rel);
    assert.doesNotMatch(src, /perplexity|tesseract|\bocr\b|face recognition|\bfraud\b|truth score|credibility|\bfollowers?\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy|twilio|sendgrid|@segment|mixpanel|google-analytics|gtag\(/i, rel);
  }
});
