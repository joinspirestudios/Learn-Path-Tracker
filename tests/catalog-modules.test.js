import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bindCatalogEvents, catalogCtaForPath, canOpenFullPlatformPath,
  discoveryControlsHTML, discoveryPaginationHTML, discoverySectionsHTML, openCatalogPath,
  platformAccessRecordFromState, publicDiscoveryPaths, publicPathCardHTML,
  renderCatalogView,
} from '../src/views/catalog/index.js';

function path(id, extra = {}){
  return {
    id,
    platform:true,
    visibility:'public',
    discoverable:true,
    title:'Proof-backed Drawing',
    goal:'Learn drawing',
    category:'Creative',
    durationDays:14,
    intensity:'balanced',
    creatorName:'Avery',
    previewDescription:'Practice drawing with public proof.',
    stats:{ joinedCount:3, proofSubmissionCount:2, publicProgressCount:1, completedCount:1 },
    ...extra,
  };
}

function catalogContext(store){
  return {
    store,
    skills:[{ id:'builtin', blurb:'Built-in path' }],
    syncStatusHTML:() => '',
    authRestoring:() => false,
    configPresent:() => true,
    cloudActive:() => false,
    pathTitle:id => id === 'builtin' ? 'Built In' : store.state.userPaths[id]?.title,
    pathGoal:id => store.state.userPaths[id]?.goal || 'Goal',
    totalsFor:() => ({ done:0, total:4 }),
    canOpenFullPath:(id, def = store.state.userPaths[id]) => !def?.platform || def.membership?.role || def.ownerId === store.currentUser?.uid,
    pathTasksReady:() => true,
  };
}

test('catalog module exports focused render, bind, access, and card helpers', () => {
  assert.equal(typeof renderCatalogView, 'function');
  assert.equal(typeof bindCatalogEvents, 'function');
  assert.equal(typeof publicPathCardHTML, 'function');
  assert.equal(typeof discoveryControlsHTML, 'function');
  assert.equal(typeof discoveryPaginationHTML, 'function');
  assert.equal(typeof discoverySectionsHTML, 'function');
  assert.equal(typeof platformAccessRecordFromState, 'function');
  assert.equal(typeof canOpenFullPlatformPath, 'function');
  assert.equal(typeof catalogCtaForPath, 'function');
});

test('public discovery paths honor loaded pagination ids after page state exists', () => {
  const store = {
    discoveryPage:{ loadedPublicIds:['public'], lastLoadedAt:123, hasMore:true },
    state:{ userPaths:{
      public:path('public'),
      cached:path('cached'),
      hidden:path('hidden', { discoverable:false }),
    } },
  };
  assert.deepEqual(publicDiscoveryPaths(store).map(item => item.id), ['public']);
});

test('discovery pagination renders load-more states and honest loaded-set copy', () => {
  const more = discoveryPaginationHTML({ hasMore:true, loadingMore:false }, 3, { cloudAvailable:true });
  assert.match(more, /Search, filters, sort and curated sections apply to the loaded public set/);
  assert.match(more, /id="loadMorePublicPaths"/);
  assert.match(more, /Load more public paths/);

  const loading = discoveryPaginationHTML({ hasMore:true, loadingMore:true }, 3, { cloudAvailable:true });
  assert.match(loading, /disabled/);
  assert.match(loading, /Loading more paths\.\.\./);

  const done = discoveryPaginationHTML({ hasMore:false }, 3, { cloudAvailable:true });
  assert.doesNotMatch(done, /id="loadMorePublicPaths"/);
  assert.match(done, /You have reached the end of public paths loaded for now/);
});

test('public discovery cards render real compact metrics and preview-first CTA', () => {
  const store = { currentUser:null, state:{ userPaths:{ p1:path('p1') } }, platformPaths:{} };
  const html = publicPathCardHTML(store.state.userPaths.p1, { store, canOpenFullPath:() => false });
  assert.match(html, /View &rarr;/);
  assert.doesNotMatch(html, /Start/);
  assert.match(html, /3 joined/);
  assert.match(html, /1 public updates/);
  assert.match(html, /2 proof submitted/);
  assert.match(html, /1 completed/);
  assert.doesNotMatch(html, /creatorEmail|ownerEmail|sections|tasks|dayLogs|submissions|participantStats/);
});

test('catalog CTA helper preserves joined and owner states', () => {
  assert.equal(catalogCtaForPath({ owner:false, fullAccess:false }), 'View &rarr;');
  assert.equal(catalogCtaForPath({ owner:false, fullAccess:true }), 'Open &rarr;');
  assert.equal(catalogCtaForPath({ owner:true, fullAccess:true }), 'Open / manage &rarr;');
});

test('public discovery excludes private and unlisted paths while controls render filters', () => {
  const store = {
    state:{ userPaths:{
      public:path('public'),
      unlisted:path('unlisted', { visibility:'unlisted' }),
      private:path('private', { visibility:'private' }),
      hidden:path('hidden', { discoverable:false }),
    } },
  };
  assert.deepEqual(publicDiscoveryPaths(store).map(item => item.id), ['public']);
  const controls = discoveryControlsHTML(publicDiscoveryPaths(store), { query:'draw', category:'all', duration:'all', intensity:'all', proof:'all', sort:'recommended' });
  assert.match(controls, /id="discoveryQuery"/);
  assert.match(controls, /data-discovery-field="category"/);
  assert.match(controls, /data-discovery-field="duration"/);
  assert.match(controls, /data-discovery-field="intensity"/);
  assert.match(controls, /data-discovery-field="proof"/);
  assert.match(controls, /data-discovery-field="sort"/);
});

test('renderCatalogView composes discovery, curated sections, and workspace cards', () => {
  const store = {
    currentUser:{ uid:'creator' },
    cloudStatus:'connected',
    discovery:{ query:'', category:'all', duration:'all', intensity:'all', proof:'all', sort:'recommended' },
    state:{ skills:{}, userPaths:{ public:path('public'), local:{ title:'Local', goal:'Private goal', weeks:[] } } },
  };
  const result = renderCatalogView(catalogContext(store));
  assert.equal(result.restoring, false);
  assert.match(result.html, /Search public paths/);
  assert.match(result.html, /All public paths/);
  assert.match(result.html, /Your workspace/);
  assert.match(result.html, /Create new path/);
});

test('catalog event helpers update discovery state and route cards by access', async () => {
  const store = {
    discovery:{ query:'', category:'all', duration:'all', intensity:'all', proof:'all', sort:'recommended' },
    state:{ userPaths:{ public:path('public'), joined:path('joined', { membership:{ role:'learner' } }) } },
  };
  let previewId = '';
  let openedId = '';
  await openCatalogPath('public', {
    store,
    canOpenFullPath:() => false,
    openPathRoute:async id => { previewId = id; },
    openSkill:async id => { openedId = id; },
  });
  assert.equal(previewId, 'public');
  assert.equal(openedId, '');

  await openCatalogPath('joined', {
    store,
    canOpenFullPath:() => true,
    openPathRoute:async id => { previewId = id; },
    openSkill:async id => { openedId = id; },
  });
  assert.equal(openedId, 'joined');
});

test('catalog event binder updates filters and clears discovery state', () => {
  const handlers = {};
  const root = {
    querySelectorAll(selector){
      if(selector === '[data-discovery-field]'){
        return [{
          dataset:{ discoveryField:'sort' },
          set onchange(fn){ handlers.sort = fn; },
        }];
      }
      if(selector === '.skill-card[data-id]' || selector === '[data-import]') return [];
      return [];
    },
  };
  const elements = {
    content:root,
    clearDiscoveryFilters:{
      set onclick(fn){ handlers.clearFilters = fn; },
    },
    clearDiscoverySearch:{
      set onclick(fn){ handlers.clearSearch = fn; },
    },
    discoveryQuery:{
      selectionStart:0,
      set oninput(fn){ handlers.query = fn; },
    },
  };
  const store = {
    discovery:{ query:'draw', category:'creative', duration:'month', intensity:'balanced', proof:'proof_backed', sort:'newest' },
    state:{ userPaths:{} },
  };
  let renders = 0;
  bindCatalogEvents({
    $:id => elements[id] || null,
    store,
    renderCatalog:() => { renders += 1; },
    openPathRoute:() => {},
    openSkill:() => {},
    canOpenFullPath:() => false,
    getOpeningPathId:() => null,
    setOpeningPathId:() => {},
    importLocalPath:() => {},
    createPath:() => {},
    openAIPathBuilder:() => {},
    openAuthModal:() => {},
  });
  handlers.sort({ target:{ dataset:{ discoveryField:'sort' }, value:'most_joined' } });
  assert.equal(store.discovery.sort, 'most_joined');
  handlers.clearSearch();
  assert.equal(store.discovery.query, '');
  handlers.clearFilters();
  assert.deepEqual(store.discovery, { query:'', category:'all', duration:'all', intensity:'all', proof:'all', sort:'recommended' });
  assert.equal(renders, 3);
});

test('catalog event binder calls load-more without resetting discovery filters', async () => {
  const handlers = {};
  const root = {
    querySelectorAll(selector){
      if(selector === '[data-discovery-field]' || selector === '.skill-card[data-id]' || selector === '[data-import]') return [];
      return [];
    },
  };
  const elements = {
    content:root,
    clearDiscoveryFilters:null,
    clearDiscoverySearch:null,
    discoveryQuery:null,
    loadMorePublicPaths:{
      disabled:false,
      textContent:'Load more public paths',
      set onclick(fn){ handlers.loadMore = fn; },
    },
  };
  const store = {
    discovery:{ query:'draw', category:'creative', duration:'month', intensity:'balanced', proof:'proof_backed', sort:'newest' },
    state:{ userPaths:{} },
  };
  let loaded = 0;
  bindCatalogEvents({
    $:id => elements[id] || null,
    store,
    renderCatalog:() => {},
    openPathRoute:() => {},
    openSkill:() => {},
    canOpenFullPath:() => false,
    getOpeningPathId:() => null,
    setOpeningPathId:() => {},
    importLocalPath:() => {},
    createPath:() => {},
    openAIPathBuilder:() => {},
    openAuthModal:() => {},
    loadMorePublicPaths:async () => { loaded += 1; },
  });
  await handlers.loadMore();
  assert.equal(loaded, 1);
  assert.deepEqual(store.discovery, { query:'draw', category:'creative', duration:'month', intensity:'balanced', proof:'proof_backed', sort:'newest' });
  assert.equal(elements.loadMorePublicPaths.disabled, true);
  assert.equal(elements.loadMorePublicPaths.textContent, 'Loading more paths...');
});
