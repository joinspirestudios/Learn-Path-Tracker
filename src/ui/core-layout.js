import { esc } from '../helpers.js';

export const AURORA_APP_NAV = [
  { id:'today', label:'Today', href:'#/today' },
  { id:'discover', label:'Discover', href:'#/discover' },
  { id:'progress', label:'Progress', href:'#/progress' },
  { id:'paths', label:'Paths', href:'#/paths' },
  { id:'profile', label:'Profile', href:'#/profile' },
];

export function renderAppShell({ title = '', body = '', className = '' } = {}){
  return '<main class="lpt-shell ' + esc(className) + '">'
    + (title ? '<h1>' + esc(title) + '</h1>' : '')
    + body
    + '</main>';
}

export function renderShellNav({ active = 'today', compact = false } = {}){
  return '<nav class="' + (compact ? 'aurora-bottom-nav' : 'aurora-side-nav') + '" aria-label="App navigation">'
    + AURORA_APP_NAV.map(item => {
      const activeClass = item.id === active ? ' is-active' : '';
      return '<a class="aurora-nav-item' + activeClass + '" href="' + esc(item.href) + '" data-app-route="' + esc(item.id) + '"' + (item.id === active ? ' aria-current="page"' : '') + '>'
        + '<span class="aurora-nav-dot" aria-hidden="true"></span><span>' + esc(item.label) + '</span></a>';
    }).join('')
    + '</nav>';
}

export function renderAuroraShell({
  active = 'today',
  title = '',
  body = '',
  rightRail = '',
  className = '',
} = {}){
  const railClass = rightRail ? ' has-right-rail' : '';
  return '<main class="lpt-shell aurora-app-shell' + railClass + ' ' + esc(className) + '" data-shell-active="' + esc(active) + '">'
    + renderShellNav({ active })
    + '<section class="aurora-shell-content" aria-label="' + esc(title || 'Workspace') + '">'
    + body
    + '</section>'
    + (rightRail ? '<aside class="aurora-shell-rail" aria-label="Context">' + rightRail + '</aside>' : '')
    + renderShellNav({ active, compact:true })
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
