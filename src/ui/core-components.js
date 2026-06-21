import { esc } from '../helpers.js';

function attr(name, value){
  return value == null || value === '' ? '' : ' ' + name + '="' + esc(value) + '"';
}

function classNames(...values){
  return values.filter(Boolean).join(' ');
}

export function renderButton({
  label = '',
  variant = 'secondary',
  type = 'button',
  id = '',
  className = '',
  data = {},
  disabled = false,
  loading = false,
  href = '',
} = {}){
  const safeVariant = ['primary', 'secondary', 'ghost', 'destructive'].includes(variant) ? variant : 'secondary';
  const dataAttrs = Object.entries(data || {}).map(([key, value]) => attr('data-' + key, value)).join('');
  const classes = classNames('lpt-button', 'lpt-button-' + safeVariant, className);
  const body = loading ? '<span class="lpt-button-spinner" aria-hidden="true"></span>' + esc(label || 'Loading') : esc(label);
  if(href){
    return '<a class="' + classes + '"' + attr('id', id) + attr('href', href) + dataAttrs + (disabled ? ' aria-disabled="true"' : '') + '>' + body + '</a>';
  }
  return '<button class="' + classes + '"' + attr('id', id) + attr('type', type) + dataAttrs + (disabled || loading ? ' disabled aria-disabled="true"' : '') + '>' + body + '</button>';
}

export function renderProgressMeter({ value = 0, label = 'Progress', state = 'partial' } = {}){
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return '<div class="lpt-progress-meter lpt-progress-' + esc(state) + '" role="progressbar" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + esc(pct) + '">'
    + '<div class="lpt-progress-meter-track"><div class="lpt-progress-meter-fill" style="width:' + esc(pct) + '%"></div></div>'
    + '<span>' + esc(pct) + '%</span>'
    + '</div>';
}

export function renderMetricPill({ label = '', value = '' } = {}){
  return '<span class="lpt-metric-pill"><b>' + esc(value) + '</b><span>' + esc(label) + '</span></span>';
}

export function renderDailyScoreCard({ score = 0, tier = 'not started', copy = '', completed = false } = {}){
  const value = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  return '<section class="lpt-score-card" data-completed="' + esc(completed ? 'true' : 'false') + '">'
    + '<div><span>Today&apos;s progress</span><b data-motion-score>' + esc(value) + '%</b></div>'
    + '<div><span>Day status</span><b>' + esc(String(tier || 'not started').replace(/_/g, ' ')) + '</b></div>'
    + (copy ? '<p>' + esc(copy) + '</p>' : '')
    + renderProgressMeter({ value, label:'Today score', state:completed ? 'passed' : 'partial' })
    + '</section>';
}

export function renderDailyTaskCard({
  title = 'Task',
  description = '',
  position = 1,
  total = 1,
  required = true,
  needsEvidence = false,
  completed = false,
  skipped = false,
  evidenceCount = 0,
  actions = '',
  meta = [],
} = {}){
  const state = completed ? 'complete' : skipped ? 'skipped' : needsEvidence ? 'proof' : 'active';
  const badges = [
    required ? 'Required' : 'Optional',
    needsEvidence ? 'Proof needed' : '',
    completed ? 'Done' : '',
    skipped ? 'Skipped' : '',
    ...meta,
  ].filter(Boolean);
  return '<section class="lpt-task-card" data-task-state="' + esc(state) + '">'
    + '<div class="lpt-task-card-topline"><span>Task ' + esc(position) + ' of ' + esc(total) + '</span><b>' + esc(state === 'proof' ? 'Proof needed' : state) + '</b></div>'
    + '<h3>' + esc(title) + '</h3>'
    + (description ? '<p>' + esc(description) + '</p>' : '')
    + '<div class="lpt-task-badges">' + badges.map(badge => '<span>' + esc(badge) + '</span>').join('') + '</div>'
    + '<div class="lpt-proof-summary"><b>' + esc(needsEvidence ? 'Documented work' : 'Proof status') + '</b><span>' + esc(evidenceCount ? evidenceCount + ' proof item saved' : needsEvidence ? 'Proof required before this task can complete.' : 'No proof required.') + '</span></div>'
    + (actions ? '<div class="lpt-task-actions">' + actions + '</div>' : '')
    + '</section>';
}

export function renderProofUploadCard({ state = 'default', title = 'Proof', body = '', error = '' } = {}){
  return '<section class="lpt-proof-card" data-proof-state="' + esc(state) + '">'
    + '<b>' + esc(title) + '</b>'
    + '<p>' + esc(body || (state === 'success' ? 'Proof saved.' : 'Add evidence when this task requires it.')) + '</p>'
    + (error ? '<div class="lpt-inline-error" role="alert">' + esc(error) + '</div>' : '')
    + '</section>';
}

export function renderCompletionResultPanel({
  score = 0,
  tier = 'passed',
  taskSummary = '',
  proofSummary = '',
  streakSummary = '',
  publishEligible = false,
  publishLabel = 'Publish progress',
  returnLabel = 'Return to roadmap',
} = {}){
  const safeTier = ['passed', 'strong', 'perfect'].includes(tier) ? tier : 'passed';
  return '<section class="lpt-completion-panel lpt-completion-' + esc(safeTier) + '" data-motion-completion-reveal aria-live="polite">'
    + '<div class="lpt-result-tier">' + esc(safeTier) + '</div>'
    + '<h2 data-motion-score>' + esc(Math.max(0, Math.min(100, Math.round(Number(score) || 0)))) + '%</h2>'
    + renderProgressMeter({ value:score, label:'Completion score', state:safeTier })
    + '<div class="lpt-result-summary">'
    + '<span>' + esc(taskSummary || 'Tasks summarized') + '</span>'
    + '<span>' + esc(proofSummary || 'Proof summarized') + '</span>'
    + (streakSummary ? '<span>' + esc(streakSummary) + '</span>' : '')
    + '</div>'
    + '<div class="lpt-result-actions">'
    + (publishEligible ? renderButton({ label:publishLabel, variant:'primary', id:'publishProgress' }) : '')
    + renderButton({ label:returnLabel, variant:'secondary', className:'daily-session-action', data:{ 'session-action':'overview-mode' } })
    + '</div>'
    + '</section>';
}

export function renderEmptyState({ title = '', body = '', action = '' } = {}){
  return '<section class="lpt-empty-state">'
    + '<h2>' + esc(title) + '</h2>'
    + (body ? '<p>' + esc(body) + '</p>' : '')
    + (action ? '<div>' + action + '</div>' : '')
    + '</section>';
}

export function renderToastBanner({ message = '', variant = 'info' } = {}){
  return '<div class="lpt-toast-banner lpt-toast-' + esc(variant) + '" role="' + (variant === 'error' ? 'alert' : 'status') + '">' + esc(message) + '</div>';
}

export function renderProofStudioTodayHero({
  pathTitle = 'Active path',
  dayContext = 'Today',
  title = "Today's proof",
  tasks = [],
  proofSummary = 'Proof needed when a task asks for it.',
  ctaLabel = 'Continue day',
  ctaId = '',
  secondaryAction = '',
  empty = false,
} = {}){
  if(empty){
    return '<section class="proof-studio-today-hero lpt-proof-studio-card is-empty">'
      + '<span class="proof-studio-kicker">Today</span>'
      + '<h2>No active path</h2>'
      + '<p>Create or join a path to start today.</p>'
      + '</section>';
  }
  const preview = (tasks || []).slice(0, 4);
  return '<section class="proof-studio-today-hero lpt-proof-studio-card">'
    + '<div class="proof-studio-context"><span>' + esc(pathTitle) + '</span><b>' + esc(dayContext) + '</b></div>'
    + '<span class="proof-studio-kicker">Today&apos;s proof</span>'
    + '<h2>' + esc(title) + '</h2>'
    + (preview.length ? '<ul class="proof-studio-task-preview">' + preview.map(task => '<li>' + esc(task) + '</li>').join('') + '</ul>' : '<p class="muted">No task preview is available yet.</p>')
    + '<div class="proof-studio-proof-summary"><b>Proof needed</b><span>' + esc(proofSummary) + '</span></div>'
    + '<div class="today-actions lpt-primary-action-bar">'
    + renderButton({ label:ctaLabel, variant:'primary', id:ctaId })
    + secondaryAction
    + '</div>'
    + '</section>';
}

export function renderRoadmapNode({
  day = 1,
  state = 'locked',
  title = '',
  date = '',
  taskCount = 0,
  tier = '',
  proofSubmitted = false,
  cta = '',
  disabled = false,
} = {}){
  const allowedStates = ['completed', 'active', 'locked', 'missed', 'frozen', 'passed', 'strong', 'perfect'];
  const safeState = allowedStates.includes(state) ? state : 'locked';
  const label = safeState === 'active' ? 'Active day'
    : safeState === 'locked' ? 'Locked'
      : safeState === 'completed' ? 'Completed'
        : safeState;
  return '<button type="button" class="proof-roadmap-node proof-roadmap-' + esc(safeState) + '" data-roadmap-state="' + esc(safeState) + '" data-road-day="' + esc(day) + '" ' + (disabled || safeState === 'locked' ? 'disabled aria-disabled="true"' : '') + '>'
    + '<span class="proof-roadmap-node-day">Day ' + esc(day) + '</span>'
    + '<b>' + esc(title || label) + '</b>'
    + '<small>' + esc(date || label) + '</small>'
    + '<em>' + esc(taskCount ? taskCount + ' task' + (taskCount === 1 ? '' : 's') : (safeState === 'locked' ? 'Unlocks later' : 'No tasks yet')) + '</em>'
    + '<span class="proof-roadmap-node-meta">' + (tier ? '<span>' + esc(tier) + '</span>' : '') + (proofSubmitted ? '<span>Proof submitted</span>' : '') + '</span>'
    + (cta ? '<strong>' + esc(cta) + '</strong>' : '')
    + '</button>';
}

export function renderProofActionRow({ respected = false, respectCount = 0, commentCount = 0, reportLabel = 'Report' } = {}){
  return '<div class="proof-action-row" aria-label="Proof actions">'
    + '<button class="btn progress-cheer" type="button" aria-pressed="' + (respected ? 'true' : 'false') + '">' + esc(respected ? 'Respected' : 'Respect') + '</button>'
    + '<span aria-label="' + esc(respectCount + ' respects') + '">' + esc(respectCount) + ' respect' + (Number(respectCount) === 1 ? '' : 's') + '</span>'
    + '<button class="btn subtle" type="button">Comment</button>'
    + '<span aria-label="' + esc(commentCount + ' comments') + '">' + esc(commentCount) + ' comment' + (Number(commentCount) === 1 ? '' : 's') + '</span>'
    + '<button class="link-btn" type="button">' + esc(reportLabel) + '</button>'
    + '</div>';
}

export function renderProofFirstProgressCard({
  authorName = 'Learner',
  pathTitle = 'Path',
  dayNumber = 1,
  proofTitle = "Today's proof",
  proofSummary = 'Proof summary is shown here.',
  proofState = 'submitted',
  tier = 'passed',
  metadata = [],
  actions = '',
} = {}){
  const safeState = proofState === 'verified' ? 'verified' : 'submitted';
  return '<article class="proof-first-progress-card lpt-proof-studio-card" data-proof-state="' + esc(safeState) + '">'
    + '<div class="proof-card-context"><b>' + esc(authorName) + '</b><span>Day ' + esc(dayNumber) + ' - ' + esc(pathTitle) + '</span></div>'
    + '<h3>' + esc(proofTitle) + '</h3>'
    + '<p class="proof-card-specimen">' + esc(proofSummary) + '</p>'
    + '<div class="proof-card-meta"><span>' + esc(safeState === 'verified' ? 'Proof verified' : 'Proof submitted') + '</span><span>' + esc(String(tier || 'passed').replace(/_/g, ' ')) + '</span>'
    + (metadata || []).map(item => '<span>' + esc(item) + '</span>').join('') + '</div>'
    + (actions || renderProofActionRow())
    + '</article>';
}

export function renderProofMetricCard({ title = '', value = '', body = '', empty = false } = {}){
  return '<article class="proof-metric-card ' + (empty ? 'is-empty' : 'has-data') + '">'
    + '<span>' + esc(title) + '</span>'
    + '<b>' + esc(empty ? 'Not enough data yet' : value) + '</b>'
    + '<small>' + esc(body || 'Every number here is proof-backed') + '</small>'
    + '</article>';
}

export function renderConsistencyCard({ streak = 0, completedDays = 0, empty = false } = {}){
  const safeStreak = Math.max(0, Math.round(Number(streak) || 0));
  const safeCompleted = Math.max(0, Math.round(Number(completedDays) || 0));
  const isEmpty = empty || (!safeStreak && !safeCompleted);
  return '<article class="proof-consistency-card ' + (isEmpty ? 'is-empty' : 'has-data') + '">'
    + '<span>Your consistency</span>'
    + '<b>' + esc(isEmpty ? 'Not enough data yet' : safeStreak + ' day streak') + '</b>'
    + '<p>' + esc(isEmpty ? 'Complete a few sessions to see your consistency map.' : safeCompleted + ' completed day value' + (safeCompleted === 1 ? '' : 's') + ' from real progress.') + '</p>'
    + '</article>';
}
