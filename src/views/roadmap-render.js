import { esc } from '../helpers.js';

function stateClass(status){
  return ['completed', 'active', 'locked', 'missed', 'frozen'].includes(status) ? status : 'locked';
}

function markerText(day, status){
  if(status === 'completed') return 'Done';
  if(status === 'locked') return 'Lock';
  if(status === 'missed') return 'Missed';
  if(status === 'frozen') return 'Freeze';
  return String(day);
}

function evidenceText({ tier = '', proofSubmitted = false } = {}){
  const bits = [];
  if(proofSubmitted) bits.push('Proof submitted');
  if(tier) bits.push(String(tier).replace(/_/g, ' '));
  return bits.length ? bits.join(' - ') : '';
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
  const meta = 'Day ' + Number(day || 1) + ' - ' + (label || safeStatus);
  const evidence = evidenceText({ tier, proofSubmitted });
  const classes = 'aurora-journey-item is-' + esc(safeStatus) + (isToday ? ' is-today' : '');
  const content = '<span class="aurora-journey-marker" aria-hidden="true">' + esc(markerText(day, safeStatus)) + '</span>'
    + '<div class="aurora-journey-content">'
    + '<div class="aurora-journey-meta">' + esc(meta + (date ? ' - ' + date : '')) + '</div>'
    + '<div class="aurora-journey-title">' + esc(title || ('Day ' + Number(day || 1))) + '</div>'
    + '<div class="aurora-journey-task-summary">' + esc(taskSummary || (safeStatus === 'locked' ? 'Unlocks later' : 'No tasks yet')) + '</div>'
    + (evidence ? '<div class="aurora-journey-evidence">' + esc(evidence) + '</div>' : '')
    + (safeStatus === 'active' ? '<span class="aurora-journey-cta">Continue this day</span>' : '')
    + '</div>';
  if(!open){
    return '<li class="' + classes + '" data-roadmap-state="' + esc(safeStatus) + '" aria-disabled="true">' + content + '</li>';
  }
  return '<li class="' + classes + '" data-roadmap-state="' + esc(safeStatus) + '"><button type="button" class="aurora-journey-open" data-road-day="' + esc(day) + '">' + content + '</button></li>';
}

