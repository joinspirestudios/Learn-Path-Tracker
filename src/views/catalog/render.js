import { normalizeDiscoveryState, DEFAULT_DISCOVERY_STATE } from '../../discovery.js';
import { esc } from '../../helpers.js';
import {
  builtInPathCardHTML, createPathCardsHTML, personalPathCardHTML,
} from './cards.js';
import { discoveryControlsHTML } from './controls.js';
import {
  discoveryPaginationHTML, discoverySectionsHTML, personalPathIds, publicDiscoveryPaths,
} from './sections.js';

export function renderCatalogView(context = {}){
  return renderDiscoverView(context);
}

export function renderDiscoverView(context = {}){
  const {
    store, skills, syncStatusHTML, authRestoring, configPresent, cloudActive,
    pathTitle, pathGoal, totalsFor, canOpenFullPath, pathTasksReady,
  } = context;
  store.discovery = normalizeDiscoveryState(store.discovery || DEFAULT_DISCOVERY_STATE);
  const discoveryState = store.discovery;
  const publicPaths = publicDiscoveryPaths(store);
  let h = '<div class="cat-intro"><div class="section-title">Discover <em>Learning Paths</em></div>'
    + '<div class="muted" style="max-width:640px">Explore public journeys and open preview-first paths without exposing private workspace tools.</div></div>';
  h += syncStatusHTML();
  if(authRestoring()){
    h += '<div class="panel card restoring-state"><div class="chip">Restoring</div><h3>Restoring your session...</h3><p class="muted">Loading your workspace before showing account actions.</p></div>';
    return { html:h, restoring:true };
  }
  if(configPresent() && store.cloudStatus && store.cloudStatus !== 'connected' && publicPaths.length){
    h += '<div class="panel card discovery-warning">Could not refresh public paths right now. Showing cached paths where available.</div>';
  }
  h += discoveryControlsHTML(publicPaths, discoveryState);
  h += discoverySectionsHTML(publicPaths, discoveryState, { store, canOpenFullPath });
  h += discoveryPaginationHTML(store.discoveryPage || {}, publicPaths.length, { cloudAvailable:cloudActive() });
  if(!store.currentUser && configPresent()){
    h += '<section class="aurora-discover-cta" aria-label="Start your own journey"><div class="section-title">Start your own journey</div>'
      + '<p class="muted">Sign in to create paths, track progress, and build proof-backed learning habits.</p>'
      + '<button class="btn gold" id="signinCard" type="button">Sign in</button></section>';
  }
  return { html:h, restoring:false };
}

export function renderWorkspaceView(context = {}){
  const {
    store, skills, syncStatusHTML, authRestoring, configPresent, cloudActive,
    pathTitle, pathGoal, totalsFor, canOpenFullPath, pathTasksReady,
  } = context;
  if(authRestoring()){
    return {
      html:'<div class="panel card restoring-state"><div class="chip">Restoring</div><h3>Restoring your session...</h3><p class="muted">Loading your workspace before showing account actions.</p></div>',
      restoring:true,
      rightRail:'',
    };
  }
  const personalIds = personalPathIds({ store, canOpenFullPath });
  let actions = '<section class="aurora-workspace-actions" aria-label="Create or build paths"><div class="discovery-section-head"><h3>Create</h3></div><div class="cat-grid">';
  actions += createPathCardsHTML({ store, configPresent });
  actions += '</div></section>';

  let paths = '<section class="aurora-workspace-paths" aria-label="Your paths"><div class="discovery-section-head"><h3>Your workspace</h3></div>';
  paths += '<div class="cat-grid">';
  skills.forEach(skill => {
    paths += builtInPathCardHTML(skill, { pathTitle, pathGoal, totalsFor, store });
  });
  personalIds.forEach(id => {
    paths += personalPathCardHTML(id, {
      store, pathTitle, pathGoal, totalsFor, canOpenFullPath, pathTasksReady, cloudActive,
    });
  });
  if(!skills.length && !personalIds.length){
    paths += '<div class="panel card empty-state"><div class="section-title">No paths in your workspace yet.</div><div class="muted">Create a path or join a public one to start tracking progress.</div></div>';
  }
  paths += '</div></section>';

  const currentId = store.state.current;
  const currentTitle = currentId ? pathTitle(currentId) : '';
  const totalPaths = personalIds.length + skills.length;
  const rightRail = '<div class="aurora-workspace-rail-card"><span>Workspace</span><b>' + totalPaths + ' path' + (totalPaths === 1 ? '' : 's') + '</b><p>Owned, joined, or built-in paths available to this account.</p></div>'
    + '<div class="aurora-workspace-rail-card"><span>Continue</span><b>' + esc(currentTitle || 'No active path') + '</b><p>' + esc(currentTitle ? 'Your active path is ready from Today or the path workspace.' : 'Open a path to make it active for Today.') + '</p></div>';

  const fn = store.currentUser?.displayName || store.currentUser?.email || '';
  const welcome = fn ? 'Welcome back, ' + esc(fn.split(/\s/)[0]) : 'Your workspace';
  let h = '<div class="aurora-workspace-layout">'
    + '<header class="aurora-workspace-header"><div><span class="aurora-section-kicker">Workspace</span><h2>' + welcome + '</h2><p>Private work stays here. Public discovery stays on Discover.</p></div></header>'
    + syncStatusHTML()
    + '<div class="aurora-workspace-main">' + actions + paths + '</div>'
    + '</div>';
  return { html:h, restoring:false, rightRail };
}
