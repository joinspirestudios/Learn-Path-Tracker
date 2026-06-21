import { normalizeDiscoveryState, DEFAULT_DISCOVERY_STATE } from '../../discovery.js';
import {
  builtInPathCardHTML, createPathCardsHTML, personalPathCardHTML,
} from './cards.js';
import { discoveryControlsHTML } from './controls.js';
import {
  discoveryPaginationHTML, discoverySectionsHTML, personalPathIds, publicDiscoveryPaths,
} from './sections.js';

export function renderCatalogView(context = {}){
  const {
    store, skills, syncStatusHTML, authRestoring, configPresent, cloudActive,
    pathTitle, pathGoal, totalsFor, canOpenFullPath, pathTasksReady,
  } = context;
  store.discovery = normalizeDiscoveryState(store.discovery || DEFAULT_DISCOVERY_STATE);
  const discoveryState = store.discovery;
  const publicPaths = publicDiscoveryPaths(store);
  let h = '<div class="cat-intro"><div class="section-title">Discover <em>Learning Paths</em></div>'
    + '<div class="muted" style="max-width:640px">Explore public journeys, keep your own private paths close, and turn local drafts into shareable learning paths when you are ready.</div></div>';
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
  if(store.currentUser){
    h += '<div class="personal-library"><div class="discovery-section-head"><h3>Your workspace</h3><span>Private tools and drafts</span></div>';
    h += '<div class="cat-grid">';
    skills.forEach(skill => {
      h += builtInPathCardHTML(skill, { pathTitle, pathGoal, totalsFor, store });
    });
    personalPathIds({ store, canOpenFullPath }).forEach(id => {
      h += personalPathCardHTML(id, {
        store, pathTitle, pathGoal, totalsFor, canOpenFullPath, pathTasksReady, cloudActive,
      });
    });
    h += createPathCardsHTML({ store, configPresent });
    h += '</div></div>';
  } else if(configPresent()){
    h += '<div class="personal-library signed-out-cta"><div class="discovery-section-head"><h3>Start your own journey</h3></div>';
    h += '<p class="muted">Sign in to create, save and track your own learning paths.</p>';
    h += '<div class="cat-grid">';
    h += createPathCardsHTML({ store, configPresent });
    h += '</div></div>';
  }
  return { html:h, restoring:false };
}
