import { esc } from '../helpers.js';
import { externalLinkHTML, safeExternalUrl } from '../urls.js';
import {
  agendaSummary, canCompleteDailySession, deriveDailySessionState,
  completionTierCopy, currentFocusTask, dailyCompletionScore,
  effortLabel, evidenceSummary, focusFeedbackForAction,
  normalizeDailyFocusState, saveStateLabel, sessionTaskStates,
  taskEvidenceLabel, taskFocusStatus, taskTitle,
} from '../daily-session-model.js';
import { evidencePrepHTML, taskEvidenceFormHTML } from './daily-session-evidence.js';

function taskDescription(task){
  return String(task?.description || task?.progressionNotes || '').trim();
}

function statusPill(item){
  if(item.state.completed) return '<span class="proof-pill">Done</span>';
  if(item.state.skipped) return '<span class="proof-pill optional">Skipped</span>';
  if(item.state.pending) return '<span class="proof-pill pending">Pending</span>';
  return item.state.required ? '<span class="proof-pill required">Required</span>' : '<span class="proof-pill optional">Optional</span>';
}

function tierLabel(tier = ''){
  return String(tier || 'not started').replace(/_/g, ' ');
}

function scoreHeaderHTML(score, { showResult } = {}){
  const value = Math.max(0, Math.min(100, Number(score.score || 0)));
  return '<div class="focus-scoreboard" aria-label="Daily score summary">'
    + '<div><span>Today&apos;s progress</span><b>' + esc(value) + '%</b></div>'
    + '<div><span>Day status</span><b>' + esc(tierLabel(score.tier)) + '</b></div>'
    + '<div><span>Core tasks</span><b>' + esc(score.anchorSatisfied ? 'Clear' : 'Blocked') + '</b></div>'
    + (showResult ? '<div><span>Threshold</span><b>' + esc(score.passThreshold) + '%</b></div>' : '')
    + '</div>'
    + '<div class="daily-progress-row"><progress value="' + esc(value) + '" max="100" aria-label="Daily completion score, ' + esc(value) + ' percent"></progress><span>' + esc(value) + '%</span></div>';
}

function modeSwitchHTML(activeMode){
  return '<div class="daily-mode-switch" role="group" aria-label="Daily session view">'
    + '<button class="btn daily-session-action ' + (activeMode === 'focus' ? 'gold' : '') + '" type="button" data-session-action="focus-mode" aria-pressed="' + (activeMode === 'focus' ? 'true' : 'false') + '">Focus</button>'
    + '<button class="btn daily-session-action ' + (activeMode === 'overview' ? 'gold' : '') + '" type="button" data-session-action="overview-mode" aria-pressed="' + (activeMode === 'overview' ? 'true' : 'false') + '">Overview</button>'
    + '</div>';
}

function agendaListHTML(title, items, more){
  if(!items.length) return '';
  return '<div class="daily-agenda-list"><b>' + esc(title) + '</b><ul>'
    + items.map(item => '<li>' + esc(item) + '</li>').join('')
    + (more ? '<li class="muted">More in the full session</li>' : '')
    + '</ul></div>';
}

function agendaHTML({ dayNumber, date, tasks, dayLog, evidenceSubmissions, intensity }){
  const summary = agendaSummary(tasks, dayLog, evidenceSubmissions);
  const score = dailyCompletionScore(tasks, dayLog, evidenceSubmissions, { intensity });
  const effort = effortLabel(summary.estimatedMinutes);
  return '<section class="daily-session-panel daily-agenda" aria-labelledby="dailyAgendaTitle">'
    + '<div class="detail-head"><div><div class="chip">Today&apos;s Agenda</div><h3 id="dailyAgendaTitle" tabindex="-1">Day ' + esc(dayNumber) + '</h3>'
    + '<p class="muted">' + esc(date || 'Date set when started') + '</p></div>'
    + '<div class="detail-progress">' + esc(score.score) + '% score</div></div>'
    + '<div class="daily-session-stats">'
    + '<div><span>Required</span><b>' + esc(summary.requiredTotal) + '</b></div>'
    + '<div><span>Optional</span><b>' + esc(summary.optionalTotal) + '</b></div>'
    + '<div><span>Evidence</span><b>' + esc(summary.evidenceRequired) + '</b></div>'
    + (effort ? '<div><span>Effort</span><b>' + esc(effort) + '</b></div>' : '')
    + '</div>'
    + '<div class="daily-progress-row"><progress value="' + esc(score.score) + '" max="100" aria-label="Daily completion score"></progress><span>' + esc(score.score) + '%</span></div>'
    + '<p class="hint">' + esc(score.canRecordAttempt ? completionTierCopy(score) : encouragementForProgress(score.score)) + '</p>'
    + agendaListHTML('Required', summary.requiredPreview, summary.hasMoreRequired)
    + agendaListHTML('Optional', summary.optionalPreview, summary.hasMoreOptional)
    + '<div class="daily-session-actions">'
    + '<button class="btn gold daily-session-action" type="button" data-session-action="' + (summary.evidenceRequired ? 'evidence-preparation' : 'start-session') + '">' + esc(dayLog?.sessionStartedAt ? 'Continue today' : 'Start today') + '</button>'
    + '<button class="btn daily-session-action" type="button" data-session-action="review">Review saved work</button>'
    + '</div>'
    + '</section>';
}

function taskMetaHTML(task, item, dayNumber){
  const bits = [];
  const minutes = Number(task?.estimatedMinutes ?? task?.durationMinutes ?? task?.minutes ?? 0);
  if(Number.isFinite(minutes) && minutes > 0) bits.push(effortLabel(minutes));
  bits.push(item.state.required ? 'Required task' : 'Optional task');
  if(item.state.anchor) bits.push('Core task');
  if(item.state.needsEvidence) bits.push('Proof required');
  if(task?.scheduleType) bits.push(scheduleLabel(task, dayNumber));
  return bits.filter(Boolean).map(bit => '<span>' + esc(bit) + '</span>').join('');
}

function scheduleLabel(task, dayNumber){
  if(task?.taskMode === 'progressive_recurring' && task?.progressionMetric){
    return 'Progressive target for Day ' + dayNumber;
  }
  if(task?.scheduleType === 'daily') return 'Daily task';
  if(task?.scheduleType === 'weekdays') return 'Weekday task';
  if(task?.scheduleType === 'selected_days') return 'Scheduled selected days';
  if(task?.scheduleType === 'times_per_week') return String(task.timesPerWeek || 1) + ' times each week';
  if(task?.scheduleType === 'weekly') return 'Weekly task';
  if(task?.scheduleType === 'interval') return 'Repeats every ' + String(task.intervalDays || 1) + ' days';
  return '';
}

function taskCardHTML({ item, position, total, progress, dayNumber, evidenceForm, evidenceBusy }){
  const task = item.task;
  const desc = taskDescription(task);
  const title = taskTitle(task);
  const resourceUrl = safeExternalUrl(task?.resourceUrl);
  const needsEvidence = item.state.needsEvidence && !item.state.completed;
  const canMarkDone = !item.state.needsEvidence || item.state.evidenceCount > 0;
  const status = taskFocusStatus(item, progress);
  return '<section class="daily-session-panel daily-task-card" aria-labelledby="dailyTaskTitle">'
    + '<div class="daily-session-topline"><span>Task ' + esc(position) + ' of ' + esc(total) + '</span><b>' + esc(status) + '</b></div>'
    + '<h3 id="dailyTaskTitle" tabindex="-1">' + esc(title) + '</h3>'
    + (desc ? '<p class="daily-task-copy">' + esc(desc) + '</p>' : '')
    + '<div class="daily-task-meta">' + taskMetaHTML(task, item, dayNumber) + '</div>'
    + (task?.progressionNotes && task.progressionNotes !== desc ? '<div class="hint">' + esc(task.progressionNotes) + '</div>' : '')
    + (resourceUrl ? '<div class="daily-resource">Resource: ' + externalLinkHTML(resourceUrl, task.resourceLabel || 'Open resource') + '</div>' : (task?.resourceUrl ? '<div class="daily-resource invalid-link">Resource link is not available</div>' : ''))
    + '<div class="daily-evidence-state"><b>' + esc(taskEvidenceLabel(task)) + '</b><span>' + (item.state.evidenceCount ? esc(item.state.evidenceCount + ' proof item saved') : esc(item.state.needsEvidence ? 'Proof required before this task can complete.' : 'No proof required.')) + '</span></div>'
    + (evidenceForm ? taskEvidenceFormHTML(evidenceForm) : '')
    + '<div class="daily-session-actions sticky-actions">'
    + (needsEvidence
      ? '<button class="btn gold daily-session-action" type="button" data-session-action="task-evidence" data-task="' + esc(item.id) + '" ' + (evidenceBusy ? 'disabled' : '') + '>Add proof</button>'
      : '<button class="btn gold daily-session-action" type="button" data-session-action="mark-done" data-task="' + esc(item.id) + '" ' + (!canMarkDone ? 'disabled' : '') + '>Mark as done</button>')
    + (!item.state.needsEvidence && !item.state.completed ? '<button class="btn daily-session-action" type="button" data-session-action="reflection" data-task="' + esc(item.id) + '">Add reflection</button>' : '')
    + (item.state.optional && !item.state.resolved ? '<button class="btn daily-session-action" type="button" data-session-action="skip-optional" data-task="' + esc(item.id) + '">Skip optional task</button>' : '')
    + (!item.state.resolved ? '<button class="btn daily-session-action" type="button" data-session-action="not-done" data-task="' + esc(item.id) + '">Not done yet</button>' : '')
    + '</div>'
    + '</section>';
}

function overviewHTML({ tasks, dayLog, evidenceSubmissions, intensity, dayNumber }){
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  const progress = agendaSummary(tasks, dayLog, evidenceSubmissions);
  const score = dailyCompletionScore(tasks, dayLog, evidenceSubmissions, { intensity });
  const canComplete = canCompleteDailySession(tasks, dayLog, evidenceSubmissions, { intensity });
  const blocked = score.tier === 'blocked_anchor';
  return '<section class="daily-session-panel daily-session-summary" aria-labelledby="dailyOverviewTitle">'
    + '<div class="chip">Overview</div>'
    + '<h3 id="dailyOverviewTitle" tabindex="-1">Full day scan</h3>'
    + '<p class="daily-task-copy">' + esc(completionTierCopy(score)) + '</p>'
    + scoreHeaderHTML(score)
    + '<div class="daily-session-stats">'
    + '<div><span>Required</span><b>' + esc(progress.requiredResolved) + '/' + esc(progress.requiredTotal) + '</b></div>'
    + '<div><span>Optional done</span><b>' + esc(progress.optionalCompleted) + '/' + esc(progress.optionalTotal) + '</b></div>'
    + '<div><span>Evidence</span><b>' + esc(score.evidenceCompleted) + '/' + esc(score.evidenceRequired) + '</b></div>'
    + '<div><span>Tasks complete</span><b>' + esc(states.filter(item => item.state.completed).length) + '/' + esc(states.length) + '</b></div>'
    + '</div>'
    + '<div class="history-list">'
    + states.map((item, index) => '<button class="history-task daily-session-action ' + (item.state.completed ? 'done' : '') + '" type="button" data-session-action="focus-task" data-task-index="' + esc(index) + '"><b>' + esc(taskTitle(item.task)) + '</b>' + statusPill(item) + '</button>').join('')
    + '</div>'
    + '<div class="daily-session-actions">'
    + (canComplete ? '<button class="btn gold" id="completeDay" type="button" data-day="' + esc(dayNumber || dayLog.dayNumber || 1) + '">Complete Day - ' + esc(score.score) + '%</button>' : '')
    + (!canComplete ? '<button class="btn gold daily-session-action" type="button" data-session-action="finish-pending">' + esc(blocked ? 'Complete core task first' : 'Finish more work') + '</button>' : '')
    + '</div>'
    + '</section>';
}

function resultHTML({ tasks, dayLog, evidenceSubmissions, intensity, dayNumber }){
  const score = dailyCompletionScore(tasks, dayLog, evidenceSubmissions, { intensity });
  const progress = agendaSummary(tasks, dayLog, evidenceSubmissions);
  return '<section class="daily-session-panel daily-result-panel" aria-labelledby="dailyResultTitle">'
    + '<div class="chip">Result</div>'
    + '<h3 id="dailyResultTitle" tabindex="-1">' + esc(score.tier === 'perfect' ? 'Perfect day.' : score.tier === 'strong' ? 'Strong day.' : 'Day passed.') + '</h3>'
    + '<p class="daily-task-copy">' + esc(completionTierCopy(score)) + '</p>'
    + scoreHeaderHTML(score, { showResult:true })
    + '<div class="daily-session-stats">'
    + '<div><span>Tasks completed</span><b>' + esc(progress.completed) + '/' + esc(progress.total) + '</b></div>'
    + '<div><span>Proof submitted</span><b>' + esc(score.evidenceCompleted) + '/' + esc(score.evidenceRequired) + '</b></div>'
    + '<div><span>Required done</span><b>' + esc(score.requiredCompleted) + '/' + esc(score.requiredTotal) + '</b></div>'
    + '<div><span>Optional done</span><b>' + esc(score.optionalCompleted) + '/' + esc(score.optionalTotal) + '</b></div>'
    + '</div>'
    + '<div class="daily-session-actions"><button class="btn daily-session-action" type="button" data-session-action="overview-mode">Review task overview</button></div>'
    + '<p class="hint">Next step: continue the journey from the roadmap, or publish today&apos;s sanitized progress when available.</p>'
    + '</section>';
}

function focusHTML({ pathId, dayNumber, tasks, dayLog, evidenceSubmissions, proofType, accepts, evidenceTaskId, evidenceError, evidenceBusy, intensity, focusState }){
  const score = dailyCompletionScore(tasks, dayLog, evidenceSubmissions, { intensity });
  const focus = normalizeDailyFocusState(focusState, { pathId, dayNumber, tasks, dayLog, evidenceSubmissions });
  const item = currentFocusTask(tasks, dayLog, evidenceSubmissions, focus);
  const canComplete = canCompleteDailySession(tasks, dayLog, evidenceSubmissions, { intensity });
  if(!item){
    return '<section class="daily-session-panel"><h3>No tasks available</h3><p class="muted">Task data is still loading for this day.</p></section>';
  }
  const evidenceForm = evidenceTaskId === item.id
    ? { task:item.task, proofType, accepts, error:evidenceError, busy:evidenceBusy }
    : null;
  const feedback = focus.feedback || focusFeedbackForAction('', score, item);
  const blocked = score.tier === 'blocked_anchor';
  return '<section class="daily-focus-shell" aria-labelledby="dailyFocusTitle">'
    + '<div class="daily-focus-head"><div><div class="chip">Focus mode</div><h3 id="dailyFocusTitle">Guided proof-of-growth session</h3></div>' + modeSwitchHTML('focus') + '</div>'
    + scoreHeaderHTML(score)
    + '<div class="daily-feedback" role="status" aria-live="polite">' + esc(feedback) + '</div>'
    + taskCardHTML({
      item,
      position:item.focusIndex + 1,
      total:item.total,
      progress:score,
      dayNumber,
      evidenceForm,
      evidenceBusy,
    })
    + '<div class="daily-session-actions daily-focus-nav">'
    + '<button class="btn daily-session-action" type="button" data-session-action="focus-prev" ' + (item.focusIndex <= 0 ? 'disabled' : '') + '>Previous</button>'
    + '<button class="btn daily-session-action" type="button" data-session-action="focus-next" ' + (item.focusIndex >= item.total - 1 ? 'disabled' : '') + '>Next task</button>'
    + (canComplete ? '<button class="btn gold" id="completeDay" type="button" data-day="' + esc(dayNumber || dayLog.dayNumber || 1) + '">Complete Day - ' + esc(score.score) + '%</button>' : '<button class="btn gold daily-session-action" type="button" data-session-action="finish-pending">' + esc(blocked ? 'Complete core task first' : 'Finish more work') + '</button>')
    + '</div>'
    + '</section>';
}

export function dailySessionHTML({
  pathId,
  dayNumber,
  date,
  tasks = [],
  dayLog = {},
  evidenceSubmissions = [],
  proofType = 'url',
  evidenceTaskId = null,
  evidenceError = '',
  evidenceBusy = false,
  accepts = '',
  saveState = 'idle',
  error = '',
  intensity = 'balanced',
  focusState = {},
} = {}){
  const session = deriveDailySessionState({ pathId, dayNumber, tasks, dayLog, evidenceSubmissions, saveState, error, intensity });
  const focus = normalizeDailyFocusState(focusState, { pathId, dayNumber, tasks, dayLog, evidenceSubmissions });
  let body = '';
  if(session.phase === 'complete') body = resultHTML({ tasks, dayLog, evidenceSubmissions, intensity, dayNumber });
  else if(focus.mode === 'overview') body = '<div class="daily-focus-head"><div><div class="chip">Daily session</div><h3>Overview mode</h3></div>' + modeSwitchHTML('overview') + '</div>' + overviewHTML({ tasks, dayLog, evidenceSubmissions, intensity, dayNumber });
  else body = focusHTML({ pathId, dayNumber, tasks, dayLog, evidenceSubmissions, proofType, accepts, evidenceTaskId, evidenceError, evidenceBusy, intensity, focusState:focus });
  const save = saveStateLabel(saveState || session.saveState);
  return '<div class="daily-session" id="dailySession" data-phase="' + esc(session.phase) + '" data-mode="' + esc(focus.mode) + '">'
    + '<div class="daily-session-save" aria-live="polite">' + esc(save) + '</div>'
    + (session.error || error ? '<div class="form-error" role="alert">' + esc(session.error || error) + '</div>' : '')
    + body
    + '</div>';
}

export function focusScreenHTML({
  pathId,
  pathTitle = '',
  dayNumber,
  roadmapHash = '#/discover',
  tasks = [],
  dayLog = {},
  evidenceSubmissions = [],
  proofType = 'url',
  evidenceTaskId = null,
  evidenceError = '',
  evidenceBusy = false,
  accepts = '',
  saveState = 'idle',
  error = '',
  intensity = 'balanced',
  focusState = {},
} = {}){
  const session = deriveDailySessionState({ pathId, dayNumber, tasks, dayLog, evidenceSubmissions, saveState, error, intensity });
  const focus = normalizeDailyFocusState(focusState, { pathId, dayNumber, tasks, dayLog, evidenceSubmissions });
  let body = '';
  if(session.phase === 'complete') body = resultHTML({ tasks, dayLog, evidenceSubmissions, intensity, dayNumber });
  else if(focus.mode === 'overview') body = '<div class="daily-focus-head"><div><div class="chip">Daily session</div><h3>Overview mode</h3></div>' + modeSwitchHTML('overview') + '</div>' + overviewHTML({ tasks, dayLog, evidenceSubmissions, intensity, dayNumber });
  else body = focusHTML({ pathId, dayNumber, tasks, dayLog, evidenceSubmissions, proofType, accepts, evidenceTaskId, evidenceError, evidenceBusy, intensity, focusState:focus });
  const save = saveStateLabel(saveState || session.saveState);
  return '<div class="daily-focus-screen" id="dailyFocusScreen">'
    + '<div class="focus-screen-header">'
    + '<a class="focus-back-link" href="' + esc(roadmapHash) + '" id="focusBackToRoadmap">&larr; Back to roadmap</a>'
    + '<div class="focus-screen-title"><span>' + esc(pathTitle) + '</span><span>Day ' + esc(dayNumber) + '</span></div>'
    + '</div>'
    + '<div class="daily-session" id="dailySession" data-phase="' + esc(session.phase) + '" data-mode="' + esc(focus.mode) + '">'
    + '<div class="daily-session-save" aria-live="polite">' + esc(save) + '</div>'
    + (session.error || error ? '<div class="form-error" role="alert">' + esc(session.error || error) + '</div>' : '')
    + body
    + '</div>'
    + '</div>';
}
