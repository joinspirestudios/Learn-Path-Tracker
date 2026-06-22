import { esc } from '../helpers.js';

function stateClass(status){
  return ['completed', 'active', 'locked', 'missed', 'frozen'].includes(status) ? status : 'locked';
}

function tierClass(tier){
  if(!tier) return '';
  const t = String(tier).toLowerCase().replace(/[_ ]+/g, '-');
  if(t === 'strong' || t === 'perfect') return t;
  return 'passed';
}

function markerIcon(day, status){
  if(status === 'completed') return '<svg class="aurora-node-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 10.5l3.5 3L15 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if(status === 'locked') return '<svg class="aurora-node-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="5" y="9" width="10" height="8" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M7 9V7a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  if(status === 'missed') return '<svg class="aurora-node-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  if(status === 'frozen') return '<svg class="aurora-node-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3v14M6 6l4 4 4-4M6 14l4-4 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  return '<span class="aurora-node-number">' + esc(String(day)) + '</span>';
}

function tierChipHTML(tier){
  if(!tier) return '';
  const label = String(tier).replace(/_/g, ' ');
  const cls = tierClass(tier);
  return '<span class="aurora-tier-chip aurora-tier-' + esc(cls) + '">' + esc(label.charAt(0).toUpperCase() + label.slice(1)) + '</span>';
}

export function auroraRoadmapDayItemHTML({
  day = 1,
  status = 'locked',
  label = '',
  date = '',
  title = '',
  taskSummary = '',
  tier = '',
  proofSubmitted = false,
  open = false,
  isToday = false,
} = {}){
  const safeStatus = stateClass(status);
  const meta = 'Day ' + Number(day || 1) + ' · ' + (label || safeStatus);
  const classes = 'aurora-journey-item is-' + esc(safeStatus) + (isToday ? ' is-today' : '');
  const content = '<span class="aurora-journey-marker aurora-circular-node" aria-hidden="true">' + markerIcon(day, safeStatus) + '</span>'
    + '<div class="aurora-journey-content">'
    + '<div class="aurora-journey-meta">' + esc(meta + (date ? ' · ' + date : '')) + tierChipHTML(tier) + '</div>'
    + '<div class="aurora-journey-title">' + esc(title || ('Day ' + Number(day || 1))) + '</div>'
    + '<div class="aurora-journey-task-summary">' + esc(taskSummary || (safeStatus === 'locked' ? 'Unlocks later' : 'No tasks yet')) + '</div>'
    + (proofSubmitted ? '<div class="aurora-journey-evidence">Proof submitted</div>' : '')
    + (safeStatus === 'active' ? '<span class="aurora-journey-cta">Continue this day</span>' : '')
    + '</div>';
  if(!open){
    return '<li class="' + classes + '" data-roadmap-state="' + esc(safeStatus) + '" aria-disabled="true">' + content + '</li>';
  }
  return '<li class="' + classes + '" data-roadmap-state="' + esc(safeStatus) + '"><button type="button" class="aurora-journey-open" data-road-day="' + esc(day) + '">' + content + '</button></li>';
}
