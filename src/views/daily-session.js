import { esc } from '../helpers.js';
import { externalLinkHTML, safeExternalUrl } from '../urls.js';
import {
  agendaSummary, canCompleteDailySession, deriveDailySessionState,
  completionTierCopy, dailyCompletionScore,
  effortLabel, encouragementForProgress, evidenceSummary,
  orderedSessionTasks, saveStateLabel, sessionTaskStates, taskEvidenceLabel,
  taskTitle,
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
    + '<div><span>Pass score</span><b>' + esc(score.passThreshold) + '%</b></div>'
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
  return '<section class="daily-session-panel daily-task-card" aria-labelledby="dailyTaskTitle">'
    + '<div class="daily-session-topline"><span>Task ' + esc(position) + ' of ' + esc(total) + '</span><b>' + esc(progress.score) + '%</b></div>'
    + '<div class="daily-progress-row"><progress value="' + esc(progress.score) + '" max="100" aria-label="Daily completion score"></progress><span>' + esc(progress.score) + '%</span></div>'
    + '<h3 id="dailyTaskTitle" tabindex="-1">' + esc(title) + '</h3>'
    + (desc ? '<p class="daily-task-copy">' + esc(desc) + '</p>' : '')
    + '<div class="daily-task-meta">' + taskMetaHTML(task, item, dayNumber) + '</div>'
    + (task?.progressionNotes && task.progressionNotes !== desc ? '<div class="hint">' + esc(task.progressionNotes) + '</div>' : '')
    + (resourceUrl ? '<div class="daily-resource">Resource: ' + externalLinkHTML(resourceUrl, task.resourceLabel || 'Open resource') + '</div>' : (task?.resourceUrl ? '<div class="daily-resource invalid-link">Resource link is not available</div>' : ''))
    + '<div class="daily-evidence-state"><b>' + esc(taskEvidenceLabel(task)) + '</b><span>' + (item.state.evidenceCount ? esc(item.state.evidenceCount + ' proof item saved') : esc(item.state.needsEvidence ? 'Proof required before this task can complete.' : 'No proof required.')) + '</span></div>'
    + (evidenceForm ? taskEvidenceFormHTML(evidenceForm) : '')
    + '<div class="daily-session-actions sticky-actions">'
    + (needsEvidence
      ? '<button class="btn gold daily-session-action" type="button" data-session-action="task-evidence" data-task="' + esc(item.id) + '" ' + (evidenceBusy ? 'disabled' : '') + '>Add evidence</button>'
      : '<button class="btn gold daily-session-action" type="button" data-session-action="mark-done" data-task="' + esc(item.id) + '" ' + (!canMarkDone ? 'disabled' : '') + '>Mark as done</button>')
    + (!item.state.needsEvidence && !item.state.completed ? '<button class="btn daily-session-action" type="button" data-session-action="reflection" data-task="' + esc(item.id) + '">Add reflection</button>' : '')
    + (item.state.optional && !item.state.resolved ? '<button class="btn daily-session-action" type="button" data-session-action="skip-optional" data-task="' + esc(item.id) + '">Skip optional task</button>' : '')
    + (!item.state.resolved ? '<button class="btn daily-session-action" type="button" data-session-action="not-done" data-task="' + esc(item.id) + '">Not done yet</button>' : '')
    + '<button class="btn daily-session-action" type="button" data-session-action="agenda">Agenda</button>'
    + '</div>'
    + '</section>';
}

function summaryHTML({ tasks, dayLog, evidenceSubmissions, complete = false, intensity }){
  const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
  const progress = agendaSummary(tasks, dayLog, evidenceSubmissions);
  const score = dailyCompletionScore(tasks, dayLog, evidenceSubmissions, { intensity });
  const canComplete = canCompleteDailySession(tasks, dayLog, evidenceSubmissions, { intensity });
  const title = complete ? 'Day complete' : (canComplete ? 'Ready to complete this day' : 'Today so far');
  const blocked = score.tier === 'blocked_anchor';
  return '<section class="daily-session-panel daily-session-summary" aria-labelledby="dailySessionSummaryTitle">'
    + '<div class="chip">' + (complete ? 'Completed' : 'Review') + '</div>'
    + '<h3 id="dailySessionSummaryTitle" tabindex="-1">' + esc(title) + '</h3>'
    + '<p class="daily-task-copy">' + esc(completionTierCopy(score)) + '</p>'
    + '<div class="daily-session-stats">'
    + '<div><span>Score</span><b>' + esc(score.score) + '%</b></div>'
    + '<div><span>Pass score</span><b>' + esc(score.passThreshold) + '%</b></div>'
    + '<div><span>Tier</span><b>' + esc(score.tier.replace(/_/g, ' ')) + '</b></div>'
    + '<div><span>Required</span><b>' + esc(progress.requiredResolved) + '/' + esc(progress.requiredTotal) + '</b></div>'
    + '<div><span>Optional done</span><b>' + esc(progress.optionalCompleted) + '/' + esc(progress.optionalTotal) + '</b></div>'
    + '<div><span>Evidence</span><b>' + esc(score.evidenceCompleted) + '/' + esc(score.evidenceRequired) + '</b></div>'
    + '</div>'
    + '<div class="history-list">'
    + states.map(item => '<div class="history-task ' + (item.state.completed ? 'done' : '') + '"><b>' + esc(taskTitle(item.task)) + '</b>' + statusPill(item) + '</div>').join('')
    + '</div>'
    + '<div class="daily-session-actions">'
    + (!complete && canComplete ? '<button class="btn gold" id="completeDay" type="button" data-day="' + esc(dayLog.dayNumber || 1) + '">Complete Day - ' + esc(score.score) + '%</button>' : '')
    + (!complete && !canComplete ? '<button class="btn gold daily-session-action" type="button" data-session-action="finish-pending">' + esc(blocked ? 'Complete core task first' : 'Finish more work') + '</button>' : '')
    + '<button class="btn daily-session-action" type="button" data-session-action="agenda">Review agenda</button>'
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
} = {}){
  const session = deriveDailySessionState({ pathId, dayNumber, tasks, dayLog, evidenceSubmissions, saveState, error, intensity });
  let body = '';
  if(session.phase === 'agenda') body = agendaHTML({ dayNumber, date, tasks, dayLog, evidenceSubmissions, intensity });
  else if(session.phase === 'evidence-preparation') body = evidencePrepHTML(evidenceSummary(tasks));
  else if(session.phase === 'complete') body = summaryHTML({ tasks, dayLog, evidenceSubmissions, complete:true, intensity });
  else if(session.phase === 'partial-summary' || session.phase === 'completion-check') body = summaryHTML({ tasks, dayLog, evidenceSubmissions, intensity });
  else {
    const states = sessionTaskStates(tasks, dayLog, evidenceSubmissions);
    const currentId = evidenceTaskId || session.currentTaskId || states.find(item => !item.state.resolved)?.id || states[0]?.id;
    const item = states.find(candidate => candidate.id === currentId) || states[0];
    if(!item){
      body = '<section class="daily-session-panel"><h3>No tasks available</h3><p class="muted">Task data is still loading for this day.</p></section>';
    } else {
      const evidenceForm = evidenceTaskId === item.id || session.phase === 'task-evidence'
        ? { task:item.task, proofType, accepts, error:evidenceError, busy:evidenceBusy }
        : null;
      body = taskCardHTML({
        item,
        position:states.findIndex(candidate => candidate.id === item.id) + 1,
        total:states.length,
        progress:session.progress,
        dayNumber,
        evidenceForm,
        evidenceBusy,
      });
    }
  }
  const save = saveStateLabel(saveState || session.saveState);
  return '<div class="daily-session" id="dailySession" data-phase="' + esc(session.phase) + '">'
    + '<div class="daily-session-save" aria-live="polite">' + esc(save) + '</div>'
    + (session.error || error ? '<div class="form-error" role="alert">' + esc(session.error || error) + '</div>' : '')
    + body
    + '</div>';
}
