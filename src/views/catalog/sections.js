import { esc } from '../../helpers.js';
import {
  DEFAULT_DISCOVERY_STATE, curatedDiscoverySections, discoverPaths,
  isDiscoverablePublicPath, isDiscoveryDefault,
} from '../../discovery.js';
import { publicPathCardHTML } from './cards.js';

export function publicDiscoveryPaths(store){
  return Object.entries(store.state.userPaths || {})
    .map(([id, def]) => ({ ...def, id }))
    .filter(isDiscoverablePublicPath);
}

export function personalPathIds({ store, canOpenFullPath } = {}){
  return Object.keys(store.state.userPaths || {}).filter(id => {
    const def = store.state.userPaths[id];
    if(!def) return false;
    if(!def.platform) return true;
    return canOpenFullPath(id, def) && !isDiscoverablePublicPath({ ...def, id });
  });
}

export function renderDiscoveryGrid(paths, emptyCopy, context = {}){
  if(!paths.length) return '<div class="panel card empty-state"><div class="section-title">No paths found.</div><div class="muted">' + esc(emptyCopy) + '</div></div>';
  return '<div class="cat-grid discovery-grid">' + paths.map(path => publicPathCardHTML(path, context)).join('') + '</div>';
}

export function discoverySectionsHTML(paths, state, context = {}){
  if(!paths.length){
    return '<div class="panel card empty-state"><div class="section-title">No public paths yet.</div><div class="muted">Create a path and publish it when you are ready to share.</div></div>';
  }
  const filtered = discoverPaths(paths, state);
  if(!isDiscoveryDefault(state)){
    return '<div class="discovery-section"><div class="discovery-section-head"><h3>Matching public paths</h3><span>' + filtered.length + '</span></div>'
      + renderDiscoveryGrid(filtered, state.query ? 'No public paths match this search yet. Try a broader goal, category or intensity.' : 'No paths match these filters. Try clearing a filter or searching a broader goal.', context) + '</div>';
  }
  let h = curatedDiscoverySections(paths).map(section =>
    '<div class="discovery-section"><div class="discovery-section-head"><h3>' + esc(section.title) + '</h3><span>' + section.paths.length + '</span></div>'
      + renderDiscoveryGrid(section.paths, '', context) + '</div>'
  ).join('');
  h += '<div class="discovery-section"><div class="discovery-section-head"><h3>All public paths</h3><span>' + paths.length + '</span></div>'
    + renderDiscoveryGrid(discoverPaths(paths, { ...DEFAULT_DISCOVERY_STATE, sort:'recommended' }), '', context) + '</div>';
  return h;
}
