import { esc } from '../../helpers.js';
import {
  DEFAULT_DISCOVERY_STATE, curatedDiscoverySections, discoverPaths,
  isDiscoverablePublicPath, isDiscoveryDefault,
} from '../../discovery.js';
import { publicPathCardHTML } from './cards.js';

export function publicDiscoveryPaths(store){
  const userPaths = store.state.userPaths || {};
  const page = store.discoveryPage || {};
  const pageLoaded = !!(page.lastLoadedAt || page.loading || page.loadingMore || page.errorStatus || page.errorMessage);
  if(pageLoaded){
    return (Array.isArray(page.loadedPublicIds) ? page.loadedPublicIds : [])
      .map(id => ({ ...(userPaths[id] || {}), id }))
      .filter(isDiscoverablePublicPath);
  }
  return Object.entries(userPaths)
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
    return '<div class="panel card empty-state"><div class="section-title">No public paths loaded yet.</div><div class="muted">Create a path and publish it when you are ready to share, or try loading more public paths when cloud access is available.</div></div>';
  }
  const filtered = discoverPaths(paths, state);
  if(!isDiscoveryDefault(state)){
    return '<div class="discovery-section"><div class="discovery-section-head"><h3>Matching public paths</h3><span>' + filtered.length + '</span></div>'
      + renderDiscoveryGrid(filtered, state.query ? 'No loaded public paths match this search yet. Try a broader goal, category or intensity, or load more public paths.' : 'No loaded paths match these filters. Try clearing a filter or loading more public paths.', context) + '</div>';
  }
  let h = curatedDiscoverySections(paths).map(section =>
    '<div class="discovery-section"><div class="discovery-section-head"><h3>' + esc(section.title) + '</h3><span>' + section.paths.length + '</span></div>'
      + renderDiscoveryGrid(section.paths, '', context) + '</div>'
  ).join('');
  h += '<div class="discovery-section"><div class="discovery-section-head"><h3>All public paths</h3><span>' + paths.length + '</span></div>'
    + renderDiscoveryGrid(discoverPaths(paths, { ...DEFAULT_DISCOVERY_STATE, sort:'recommended' }), '', context) + '</div>';
  return h;
}

export function discoveryPaginationHTML(page = {}, loadedCount = 0, { cloudAvailable = false } = {}){
  const loading = !!(page.loading || page.loadingMore);
  const hasMore = page.hasMore !== false;
  const hasLoadedOrCloud = loadedCount > 0 || cloudAvailable;
  let h = '<div class="discovery-pagination">';
  h += '<div class="muted discovery-page-note">Showing loaded public paths. Search, filters, sort and curated sections apply to the loaded public set.</div>';
  if(page.errorMessage){
    h += '<div class="panel card discovery-warning">' + esc(page.errorMessage) + '</div>';
  }
  if(hasMore && hasLoadedOrCloud){
    h += '<button class="btn discovery-load-more" id="loadMorePublicPaths" type="button" ' + (loading ? 'disabled' : '') + '>'
      + (loading ? 'Loading more paths...' : 'Load more public paths') + '</button>';
  } else if(!hasMore && loadedCount > 0){
    h += '<div class="muted discovery-page-note">You have reached the end of public paths loaded for now.</div>';
  }
  h += '</div>';
  return h;
}
