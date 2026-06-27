import { esc } from '../helpers.js';
import { renderNotificationBell } from '../views/notification-center.js';

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

function navUserInitials(name, username) {
  const src = String(name || username || '').trim();
  if (!src) return '?';
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

// Renders the bottom-anchored signed-in identity block: avatar (image or
// initials) + display name + @handle. Never includes tokens or private metadata.
function navUserBlockHTML({ userLabel = '', displayName = '', username = '', avatarURL = '' } = {}) {
  const name = displayName || userLabel;
  if (!name && !username && !avatarURL) return '';
  const avatar = avatarURL
    ? '<img class="aurora-side-nav-avatar" src="' + esc(avatarURL) + '" alt=""/>'
    : '<span class="aurora-side-nav-avatar is-empty" aria-hidden="true">' + esc(navUserInitials(name, username)) + '</span>';
  return '<div class="aurora-side-nav-user">' + avatar
    + '<span class="aurora-side-nav-user-text">'
    + '<span class="aurora-side-nav-user-name">' + esc(name || 'Your account') + '</span>'
    + (username ? '<span class="aurora-side-nav-user-handle">@' + esc(username) + '</span>' : '')
    + '</span>'
    // Visible sign-out for the signed-in Aurora shell (the old top header is
    // hidden in shell mode). Wired in main.js via data-action="sign-out".
    + '<button type="button" class="aurora-side-nav-signout" data-action="sign-out" aria-label="Sign out">Sign out</button>'
    + '</div>';
}

export function renderShellNav({ active = 'today', compact = false, userLabel = '', user = null } = {}){
  if(compact){
    return '<nav class="aurora-bottom-nav" aria-label="App navigation">'
      + AURORA_APP_NAV.map(item => {
        const activeClass = item.id === active ? ' is-active' : '';
        return '<a class="aurora-nav-item' + activeClass + '" href="' + esc(item.href) + '" data-app-route="' + esc(item.id) + '"' + (item.id === active ? ' aria-current="page"' : '') + '>'
          + '<span class="aurora-nav-dot" aria-hidden="true"></span><span>' + esc(item.label) + '</span></a>';
      }).join('')
      + '</nav>';
  }
  let nav = '<nav class="aurora-side-nav" aria-label="App navigation">';
  nav += '<div class="aurora-side-nav-links">';
  nav += AURORA_APP_NAV.map(item => {
    const activeClass = item.id === active ? ' is-active' : '';
    return '<a class="aurora-nav-item' + activeClass + '" href="' + esc(item.href) + '" data-app-route="' + esc(item.id) + '"' + (item.id === active ? ' aria-current="page"' : '') + '>'
      + '<span class="aurora-nav-dot" aria-hidden="true"></span><span>' + esc(item.label) + '</span></a>';
  }).join('');
  nav += '</div>';
  const userBlock = navUserBlockHTML(user || (userLabel ? { userLabel } : {}));
  if(userBlock){
    nav += userBlock;
  }
  nav += '</nav>';
  return nav;
}

export function renderAuroraShell({
  active = 'today',
  title = '',
  body = '',
  rightRail = '',
  className = '',
  userLabel = '',
  user = null,
  showBell = false,
  unreadCount = 0,
} = {}){
  const railClass = rightRail ? ' has-right-rail' : '';
  // Phase 8.1.1 — the signed-in notification bell sits in a stable top header bar
  // at the top-right of the CENTERED content column (not floating mid-canvas).
  // Rendering it inside content-inner keeps it aligned to the content max-width.
  const header = showBell
    ? '<header class="aurora-shell-header"><div class="aurora-shell-header-spacer"></div>'
      + '<div class="aurora-shell-utility">' + renderNotificationBell({ unreadCount }) + '</div></header>'
    : '';
  return '<main class="lpt-shell aurora-app-shell' + railClass + ' ' + esc(className) + '" data-shell-active="' + esc(active) + '">'
    + renderShellNav({ active, userLabel, user })
    + '<section class="aurora-shell-content" aria-label="' + esc(title || 'Workspace') + '">'
    + '<div class="aurora-shell-content-inner">'
    + header
    + body
    + '</div>'
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
