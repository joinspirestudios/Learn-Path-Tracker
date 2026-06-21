import { esc } from '../helpers.js';

export function renderAppShell({ title = '', body = '', className = '' } = {}){
  return '<main class="lpt-shell ' + esc(className) + '">'
    + (title ? '<h1>' + esc(title) + '</h1>' : '')
    + body
    + '</main>';
}

export function renderCoreColumn({ body = '', className = '', ariaLabel = '' } = {}){
  return '<div class="lpt-core-column ' + esc(className) + '"' + (ariaLabel ? ' aria-label="' + esc(ariaLabel) + '"' : '') + '>'
    + body
    + '</div>';
}

export function renderSessionHeader({
  eyebrow = 'Daily Focus',
  title = '',
  meta = '',
  action = '',
  progress = '',
} = {}){
  return '<header class="lpt-session-header">'
    + '<div><span>' + esc(eyebrow) + '</span><h2>' + esc(title) + '</h2>' + (meta ? '<p>' + esc(meta) + '</p>' : '') + '</div>'
    + (progress ? '<div class="lpt-session-header-progress">' + progress + '</div>' : '')
    + (action ? '<div class="lpt-session-header-action">' + action + '</div>' : '')
    + '</header>';
}
