// ── today-state-model.js ────────────────────────────────────────────────────
// Pure Today-screen state model. No DOM, Firebase, network, or store access. It
// turns raw day/enrollment data into ONE coherent state and the copy/CTA/journey/
// rail/adaptive text that state implies — so the Today screen never shows
// contradictory combinations (e.g. "Missed" + "Start day").

export const TODAY_STATES = [
  'not_started', 'active', 'in_progress', 'completed', 'missed',
  'recoverable', 'locked', 'upcoming', 'synced', 'review_only', 'unknown',
];

export const TODAY_ACTIONS = [
  'start_path', 'start_today', 'continue_day', 'review_completed',
  'review_missed', 'recover_day', 'view_details', 'view_archive', 'locked', 'loading',
];

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function bool(value) { return value === true; }

// Map a raw enrollment/journey status (active|completed|missed|frozen|locked) +
// flags into one normalized Today state. Already-normalized states pass through.
export function normalizeTodayState(input = {}) {
  const s = input && typeof input === 'object' ? input : {};

  // Pass-through when an explicit normalized state is provided.
  if (TODAY_STATES.includes(s.status) && !['active', 'completed', 'missed', 'locked', 'frozen'].includes(s.rawStatus)) {
    // 'active'/'completed'/'missed'/'locked' are ALSO raw values; only treat the
    // status as normalized when it is one of the normalized-only labels OR no raw
    // status is present to derive from.
    if (['not_started', 'in_progress', 'recoverable', 'upcoming', 'synced', 'review_only', 'unknown'].includes(s.status)) {
      return buildState(s.status, s);
    }
  }

  const raw = s.rawStatus || s.status || '';
  const tasksReady = s.tasksReady === undefined ? true : bool(s.tasksReady);
  const pathStarted = s.pathStarted === undefined ? (s.currentEnrollmentDay != null || s.dayNumber != null) : bool(s.pathStarted);

  if (s.pathStarted === false || raw === 'not_started') return buildState('not_started', s);

  // Explicit normalized-only labels still win if supplied directly.
  if (['synced', 'review_only', 'recoverable', 'upcoming', 'in_progress', 'not_started'].includes(s.status) && !s.rawStatus) {
    return buildState(s.status, s);
  }

  const dayNumber = num(s.dayNumber, null);
  const activeCalendarDay = num(s.activeCalendarDay, dayNumber);
  const freezeCount = num(s.freezeCount, 0);

  // A normalized-only state supplied directly (as status or rawStatus) passes through.
  if (['recoverable', 'upcoming', 'in_progress', 'synced', 'review_only'].includes(raw)) {
    return buildState(raw, s);
  }

  switch (raw) {
    case 'completed':
      return buildState(s.synced === true ? 'synced' : 'completed', s);
    case 'frozen':
      return buildState('recoverable', s);
    case 'missed':
      // A missed past day is recoverable only when a freeze is still available.
      return buildState(freezeCount > 0 ? 'recoverable' : 'missed', s);
    case 'locked':
      return buildState(bool(s.isFuture) || (dayNumber != null && activeCalendarDay != null && dayNumber > activeCalendarDay) ? 'upcoming' : 'locked', s);
    case 'active': {
      // A day flagged active but already behind the calendar is actually missed/
      // recoverable, never active.
      if (dayNumber != null && activeCalendarDay != null && dayNumber < activeCalendarDay) {
        return buildState(freezeCount > 0 ? 'recoverable' : 'missed', s);
      }
      if (!tasksReady) return buildState('active', { ...s, tasksReady: false });
      return buildState(bool(s.sessionStarted) ? 'in_progress' : 'active', s);
    }
    default:
      return buildState(pathStarted ? 'unknown' : 'not_started', s);
  }
}

function buildState(state, s) {
  return {
    state: TODAY_STATES.includes(state) ? state : 'unknown',
    pathId: typeof s.pathId === 'string' ? s.pathId : '',
    pathTitle: typeof s.pathTitle === 'string' ? s.pathTitle : '',
    dayNumber: num(s.dayNumber, null),
    totalDays: num(s.totalDays, null),
    date: typeof s.date === 'string' ? s.date : '',
    taskCount: num(s.taskCount, 0),
    completedTaskCount: num(s.completedTaskCount, 0),
    proofRequiredCount: num(s.proofRequiredCount, 0),
    proofSubmittedCount: num(s.proofSubmittedCount, num(s.evidenceCount, 0)),
    pendingUploadCount: num(s.pendingUploadCount, 0),
    failedUploadCount: num(s.failedUploadCount, 0),
    sessionStarted: bool(s.sessionStarted),
    canComplete: bool(s.canComplete),
    canOpen: bool(s.canOpen),
    freezeCount: num(s.freezeCount, 0),
    hasAnchorTask: bool(s.hasAnchorTask),
    anchorCompleted: bool(s.anchorCompleted),
    tasksReady: s.tasksReady === undefined ? true : bool(s.tasksReady),
  };
}

// ── Primary CTA ──
const ACTION_BY_STATE = {
  not_started: { label: 'Start this path', action: 'start_path', tone: 'primary' },
  active: { label: 'Start today', action: 'start_today', tone: 'primary' },
  in_progress: { label: 'Continue day', action: 'continue_day', tone: 'primary' },
  completed: { label: 'Review completed day', action: 'review_completed', tone: 'secondary' },
  synced: { label: 'View proof archive', action: 'view_archive', tone: 'secondary' },
  missed: { label: 'Review missed day', action: 'review_missed', tone: 'secondary' },
  recoverable: { label: 'Recover this day', action: 'recover_day', tone: 'primary' },
  locked: { label: 'Locked until later', action: 'locked', tone: 'muted', disabled: true, reason: 'This day unlocks later.' },
  upcoming: { label: 'Locked until later', action: 'locked', tone: 'muted', disabled: true, reason: 'This day unlocks later.' },
  review_only: { label: 'View day details', action: 'view_details', tone: 'secondary' },
  unknown: { label: 'View day details', action: 'view_details', tone: 'secondary' },
};

export function todayPrimaryAction(todayState = {}) {
  const ts = todayState.state ? todayState : normalizeTodayState(todayState);
  if (!ts.tasksReady && (ts.state === 'active' || ts.state === 'in_progress')) {
    return { label: 'Loading tasks…', action: 'loading', disabled: true, reason: 'Tasks are loading.', tone: 'muted' };
  }
  const base = ACTION_BY_STATE[ts.state] || ACTION_BY_STATE.unknown;
  return {
    label: base.label,
    action: base.action,
    disabled: base.disabled === true,
    reason: base.reason || '',
    tone: base.tone || 'secondary',
  };
}

// ── Status copy ──
export function todayStatusCopy(todayState = {}) {
  const ts = todayState.state ? todayState : normalizeTodayState(todayState);
  switch (ts.state) {
    case 'not_started': return 'Start this path to activate your first daily focus.';
    case 'active':
      return ts.tasksReady ? 'Today is ready. Complete the anchor task and submit proof where needed.' : 'Your tasks for today are loading.';
    case 'in_progress': return 'You’ve started today. Finish your tasks and submit proof where needed.';
    case 'completed': return 'This day is complete. Review the proof record or continue to the next day.';
    case 'synced': return 'This day is complete and synced. Review the proof record in your archive.';
    case 'missed': return 'This day was missed. Review what was scheduled and continue with your next recoverable step.';
    case 'recoverable': return 'This missed day can still be recovered. Review the task and protect your next proof checkpoint.';
    case 'locked':
    case 'upcoming': return 'This day unlocks later. Future proof checkpoints stay locked until you reach them.';
    default: return 'Open this day to see what’s next.';
  }
}

// ── Recovery copy (missed/recoverable focus card note) ──
export function todayRecoveryCopy(todayState = {}) {
  const ts = todayState.state ? todayState : normalizeTodayState(todayState);
  if (ts.state === 'missed') return 'This day was missed. Review what was scheduled, then continue from the next recoverable step.';
  if (ts.state === 'recoverable') return 'This missed day can still be recovered.';
  if (ts.state === 'completed' || ts.state === 'synced') return 'This day is complete. Review the proof record.';
  if (ts.state === 'locked' || ts.state === 'upcoming') return 'This day unlocks later.';
  return '';
}

// ── Proof status copy ──
export function todayProofStatusCopy(todayState = {}) {
  const ts = todayState.state ? todayState : normalizeTodayState(todayState);
  if (ts.failedUploadCount > 0) return ts.failedUploadCount + ' proof upload' + (ts.failedUploadCount > 1 ? 's' : '') + ' failed — retry before continuing.';
  if (ts.pendingUploadCount > 0) return ts.pendingUploadCount + ' proof upload' + (ts.pendingUploadCount > 1 ? 's are' : ' is') + ' still pending.';
  if (ts.proofRequiredCount > 0 && ts.proofSubmittedCount >= ts.proofRequiredCount && ts.proofRequiredCount > 0) return 'Proof submitted for this day.';
  if (ts.proofRequiredCount > 0) return 'Proof required: ' + ts.proofSubmittedCount + ' of ' + ts.proofRequiredCount + ' submitted.';
  if (ts.proofSubmittedCount > 0) return ts.proofSubmittedCount + ' proof submitted.';
  return 'No required proof for this day.';
}

// ── Adaptive copy, made Today-state aware (Phase 7.0 model preserved) ──
const STEADY_COPY = 'Your plan looks steady — no changes suggested.';
export function adaptiveCopyForTodayState(todayState = {}, adaptiveDraft = {}) {
  const ts = todayState.state ? todayState : normalizeTodayState(todayState);
  const recs = Array.isArray(adaptiveDraft && adaptiveDraft.recommendations) ? adaptiveDraft.recommendations : [];
  const onlyKeep = recs.length === 1 && recs[0] && recs[0].type === 'keep_plan_unchanged';
  const noData = recs.length === 0;

  // Pending/failed proof always takes precedence over "steady".
  if (ts.failedUploadCount > 0 || ts.pendingUploadCount > 0) {
    return 'Resolve your pending proof before adding more work — then your plan can stay steady.';
  }
  if (ts.state === 'missed') {
    return 'This day was missed. Keep the plan steady for now and use your next active day to rebuild momentum.';
  }
  if (ts.state === 'recoverable') {
    return 'One missed day detected. No major plan change is needed yet, but your next anchor task deserves focus.';
  }
  if (noData) {
    return 'Not enough progress data yet. Complete a few more days to unlock stronger adaptive suggestions.';
  }
  if (onlyKeep) {
    // Steady copy is only allowed for active/in_progress/completed states.
    if (['active', 'in_progress', 'completed', 'synced'].includes(ts.state)) return STEADY_COPY;
    return 'Keep the plan steady for now and focus on your next active day.';
  }
  return String((adaptiveDraft && adaptiveDraft.summary) || '');
}

// ── Proof Journey row copy (state-aware; never identical placeholders) ──
export function proofJourneyItemCopy(item = {}, context = {}) {
  const state = item.state || item.status || 'locked';
  const day = num(item.dayNumber ?? item.day, null);
  const taskTitle = typeof item.taskTitle === 'string' ? item.taskTitle.trim() : '';
  const taskCount = num(item.taskCount, 0);
  const proofRequired = bool(item.proofRequired);
  const tasksReady = item.tasksReady === undefined ? true : bool(item.tasksReady);
  const tasksSuffix = taskCount ? (taskCount + ' task' + (taskCount === 1 ? '' : 's')) : '';

  switch (state) {
    case 'active':
    case 'in_progress':
      return { title: "Today's proof session", summary: (tasksSuffix ? tasksSuffix + ' · ' : '') + (proofRequired ? 'proof required' : 'in progress') };
    case 'completed':
    case 'synced':
      return { title: 'Completed proof day', summary: (tasksSuffix ? tasksSuffix + ' · ' : '') + 'proof submitted' };
    case 'missed':
      return { title: 'Missed day', summary: 'Review scheduled task and proof gap' };
    case 'recoverable':
    case 'frozen':
      return { title: 'Recovery available', summary: 'Review this day before moving forward' };
    case 'locked':
    case 'upcoming':
    default: {
      if (!tasksReady) return { title: day != null ? 'Day ' + day + ' — Upcoming' : 'Upcoming proof checkpoint', summary: 'Task details unlock later' };
      if (taskTitle) return { title: 'Day ' + (day != null ? day : '?') + ' — ' + taskTitle, summary: 'Unlocks after your current day is handled' };
      if (proofRequired) return { title: 'Upcoming proof checkpoint', summary: 'Scheduled evidence task unlocks later' };
      return { title: 'Future proof checkpoint', summary: 'Task details unlock later' };
    }
  }
}

// ── Right-rail current-day context ──
export function rightRailTodayContext(todayState = {}) {
  const ts = todayState.state ? todayState : normalizeTodayState(todayState);
  const statusLabel = {
    not_started: 'Not started', active: 'Active', in_progress: 'In progress',
    completed: 'Completed', synced: 'Synced', missed: 'Missed', recoverable: 'Recoverable',
    locked: 'Locked', upcoming: 'Upcoming', review_only: 'Review', unknown: 'Open',
  }[ts.state] || 'Open';

  let proof;
  if (ts.failedUploadCount > 0) proof = 'Upload failed';
  else if (ts.pendingUploadCount > 0) proof = 'Needs attention';
  else if (ts.proofRequiredCount > 0 && ts.proofSubmittedCount >= ts.proofRequiredCount) proof = 'Submitted';
  else if (ts.proofSubmittedCount > 0) proof = 'Submitted';
  else if (ts.proofRequiredCount > 0) proof = 'Not submitted';
  else proof = 'None required';

  const nextStep = {
    not_started: 'Start this path',
    active: 'Start today', in_progress: 'Continue day',
    completed: 'Review proof record', synced: 'Review proof record',
    missed: 'Review missed day', recoverable: 'Recover this day',
    locked: 'Continue your current day first', upcoming: 'Continue your current day first',
    review_only: 'View day details', unknown: 'View day details',
  }[ts.state] || 'View day details';

  return { statusLabel, proof, nextStep, state: ts.state };
}

export default {
  TODAY_STATES,
  TODAY_ACTIONS,
  normalizeTodayState,
  todayPrimaryAction,
  todayStatusCopy,
  todayRecoveryCopy,
  todayProofStatusCopy,
  adaptiveCopyForTodayState,
  proofJourneyItemCopy,
  rightRailTodayContext,
};
