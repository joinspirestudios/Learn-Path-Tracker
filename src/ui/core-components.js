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
