// ── main.js ───────────────────────────────────────────────────────────────
// Entry point. Wires the tab router, registers nav handlers on the store
// (so views can navigate without circular imports), runs the local-first
// boot, and starts Firebase in the background.
//
// All view rendering lives in views.js; persistence in db.js; auth in
// auth.js; chrome in header.js; domain logic in plan.js. See store.js for
// the shared mutable state.

import './styles.css';
import { fb } from './firebase.js';
import { store, CAT_PREFIX, LAST_ROUTE_KEY } from './store.js';
import { $, Store, installFormAccessibility } from './helpers.js';
import {
  dbLoadState, dbLoadRenders, dbSaveState, dbSaveRender,
  loadLocalState, dbLoadPlatformPaths, checkFirestoreConnection, cloudAvailable,
} from './db.js';
import {
  initFirebase, setSignInHandler, setSignOutHandler,
} from './auth.js';
import {
  skillDef, ensureSkill, curState, isUserPath,
} from './plan.js';
import { applyHeader, updateOverall } from './header.js';
import {
  renderCatalog, renderPlan, renderToday, renderWeek, renderMap,
  renderLadders, renderDrills, renderRes, renderLog,
  openSkill, goCatalog, goWeek, editPath,
  refreshSuggest, updateLogDot, handleHashRoute,
  hasPendingPathRoute, hasSharedPathRouteState, renderPendingPathRouteState, retryPendingPathRoute,
} from './views.js';
import { trackOperation } from './sync.js';
import { hashRouteUrl, initialRouteIntent, parsePathRoute } from './routes.js';

let preflightPromise = null;
let platformSyncPromise = null;
let platformSyncKey = null;
let reconciliationPromise = null;
let reconciledUserId = null;

/* ---- tab router ---- */
function routeHashForCurrent(tab = store.activeTab){
  if(!store.state.current) return '#/discover';
  return '#/path/' + encodeURIComponent(store.state.current) + '/' + encodeURIComponent(tab || 'plan');
}

function persistRoute(hash){
  try{ localStorage.setItem(LAST_ROUTE_KEY, hash); }catch(e){}
}

function updateRouteHashForTab(tab){
  const hash = routeHashForCurrent(tab);
  persistRoute(hash);
  if(location.hash !== hash || location.pathname.startsWith('/path/')) history.replaceState(null, '', hashRouteUrl(hash));
}

function switchTab(t){
  // User paths only have Plan + Log tabs.
  if(store.state.current && isUserPath(store.state.current) && t !== 'plan' && t !== 'log') t = 'plan';
  store.activeTab = t;
  if(store.state.current){ curState().meta.lastTab = t; dbSaveState(); }
  updateRouteHashForTab(t);
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  if(t === 'plan')         renderPlan();
  else if(t === 'today')   renderToday();
  else if(t === 'week')    renderWeek();
  else if(t === 'map')     renderMap();
  else if(t === 'ladders') renderLadders();
  else if(t === 'drills')  renderDrills();
  else if(t === 'res')     renderRes();
  else if(t === 'log')     renderLog();
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ---- expose navigation to views via the shared store ---- */
store.nav.switchTab = switchTab;
store.nav.goCatalog = goCatalog;
store.nav.goWeek    = goWeek;
store.nav.openSkill = openSkill;
store.nav.handleHash = handleHashRoute;
store.nav.retryCloud = retryCloudConnection;

/* ---- boot / load helpers ---- */
async function finishLoad(){
  store.enrollments = store.state.enrollments || {};
  store.evidenceSubmissions = store.state.evidenceSubmissions || {};
  applyHeader(); updateLogDot();
  const lastRoute = (() => { try{ return localStorage.getItem(LAST_ROUTE_KEY) || ''; }catch(e){ return ''; } })();
  const routeIntent = initialRouteIntent({ hash:location.hash, pathname:location.pathname, search:location.search }, lastRoute);
  const hash = parsePathRoute({ hash:location.hash, pathname:location.pathname, search:location.search })
    ? location.hash
    : (location.hash || routeIntent.restoreHash || '');
  if(hash && hash !== location.hash) history.replaceState(null, '', hashRouteUrl(hash));
  if(await handleHashRoute()){
    markBootReady();
    return;
  }
  if(store.state.current && (skillDef(store.state.current) || isUserPath(store.state.current))){
    ensureSkill(store.state.current);
    store.currentWeek = curState().meta.lastWeek || 1;
    store.activeTab = curState().meta.lastTab || (isUserPath(store.state.current) ? 'plan' : 'today');
    if(!isUserPath(store.state.current)) refreshSuggest();
    updateOverall();
    switchTab(store.activeTab);
  } else {
    store.state.current = null;
    renderCatalog();
  }
  markBootReady();
}

async function loadLocalAndRender(){
  store.state     = loadLocalState();        // already migrated
  store.enrollments = store.state.enrollments || {};
  store.evidenceSubmissions = store.state.evidenceSubmissions || {};
  store.catalogue = await dbLoadRenders();   // local renders (signed-out path)
  await finishLoad();
}

function refreshVisibleRoute(){
  if(hasPendingPathRoute()){
    if(cloudAvailable()) retryPendingPathRoute();
    else renderPendingPathRouteState();
    return;
  }
  if(!store.state.current && (parsePathRoute({ hash:location.hash, pathname:location.pathname, search:location.search }) || hasSharedPathRouteState())){
    handleHashRoute();
    return;
  }
  if(store.state.current && store.activeTab === 'plan') renderPlan();
  else if(store.state.current) switchTab(store.activeTab);
  else renderCatalog();
}

function startPlatformSync(label = 'platform summaries load'){
  if(!cloudAvailable()) return Promise.resolve([]);
  const key = (store.currentUser && store.currentUser.uid) || 'public';
  if(platformSyncPromise) return platformSyncPromise;
  if(platformSyncKey === key) return Promise.resolve([]);
  store.syncStatus = 'Syncing in background...';
  platformSyncPromise = trackOperation(label, dbLoadPlatformPaths())
    .then(() => {
      platformSyncKey = key;
      store.syncStatus = '';
      if(hasPendingPathRoute()) retryPendingPathRoute();
      else refreshVisibleRoute();
    })
    .catch(e => {
      store.syncStatus = '';
      console.warn(label + ':', e && e.message ? e.message : e);
      if(hasPendingPathRoute()) renderPendingPathRouteState();
      else refreshVisibleRoute();
    })
    .finally(() => { platformSyncPromise = null; });
  return platformSyncPromise;
}

function renderBootState(message = 'Restoring your workspace...'){
  const content = $('content');
  if(content){
    content.innerHTML = '<div class="app-loading"><div class="chip">Loading</div><h2>' + message + '</h2><p>Getting your paths and session ready.</p></div>';
  }
}

function markBootReady(){
  store.bootReady = true;
  document.body.classList.remove('booting');
}

/* ---- the post-sign-in reconciliation (cloud vs local merge) ---- */
function hasOwnData(state){
  return !!(
    Object.keys(state.skills || {}).length ||
    Object.keys(state.userPaths || {}).length ||
    Object.keys(state.enrollments || {}).length ||
    Object.keys(state.evidenceSubmissions || {}).length
  );
}

function clone(v){
  return JSON.parse(JSON.stringify(v));
}

function stateHasPath(state, id){
  return !!(id && ((state.skills && state.skills[id]) || (state.userPaths && state.userPaths[id])));
}

function mergeLocalPrivateState(cloudState, localState){
  const merged = {
    ...cloudState,
    skills: { ...(cloudState.skills || {}) },
    userPaths: { ...(cloudState.userPaths || {}) },
    enrollments: { ...(cloudState.enrollments || {}) },
    evidenceSubmissions: { ...(cloudState.evidenceSubmissions || {}) },
  };
  Object.entries(localState.skills || {}).forEach(([id, value]) => {
    if(!merged.skills[id]) merged.skills[id] = clone(value);
  });
  Object.entries(localState.userPaths || {}).forEach(([id, value]) => {
    if(!merged.userPaths[id]) merged.userPaths[id] = clone(value);
  });
  Object.entries(localState.enrollments || {}).forEach(([id, value]) => {
    if(!merged.enrollments[id]) merged.enrollments[id] = clone(value);
  });
  Object.entries(localState.evidenceSubmissions || {}).forEach(([id, value]) => {
    if(!merged.evidenceSubmissions[id]) merged.evidenceSubmissions[id] = clone(value);
    else merged.evidenceSubmissions[id] = { ...clone(value), ...merged.evidenceSubmissions[id] };
  });
  if(!stateHasPath(merged, merged.current) && stateHasPath(merged, localState.current)){
    merged.current = localState.current;
  }
  return merged;
}

function reconcileSignedInWorkspace(){
  const uid = store.currentUser && store.currentUser.uid;
  if(!uid || !cloudAvailable()) return Promise.resolve();
  if(reconciliationPromise) return reconciliationPromise;
  if(reconciledUserId === uid) return Promise.resolve();
  const local = loadLocalState();
  const routeAtStart = location.hash;
  store.syncStatus = 'Syncing your cloud paths...';
  refreshVisibleRoute();
  reconciliationPromise = (async () => {
    const cloudState = await trackOperation('cloud state load', dbLoadState());
    const cloudRenders = await trackOperation('render log load', dbLoadRenders());
    const cloudEmpty = !hasOwnData(cloudState);
    const localHasData = hasOwnData(local);
    if(cloudEmpty && localHasData) store.state = local;
    else if(localHasData) store.state = mergeLocalPrivateState(cloudState, local);
    else store.state = cloudState;
    store.enrollments = store.state.enrollments || {};
    store.evidenceSubmissions = store.state.evidenceSubmissions || {};
    if(localHasData || cloudEmpty) await dbSaveState();
    if(cloudRenders.length === 0){
      const lkeys = await Store.list(CAT_PREFIX);
      if(lkeys.length){
        const arr = [];
        for(const k of lkeys){
          try{
            const v = await Store.get(k);
            if(v){ const entry = JSON.parse(v); arr.push(entry); await dbSaveRender(entry); }
          }catch(e){}
        }
        store.catalogue = arr;
      }
    } else store.catalogue = cloudRenders;
    reconciledUserId = uid;
    store.syncStatus = '';
    if(location.hash === routeAtStart) refreshVisibleRoute();
  })().catch(e => {
    store.syncStatus = '';
    console.warn('cloud reconciliation:', e && e.message ? e.message : e);
    refreshVisibleRoute();
  }).finally(() => { reconciliationPromise = null; });
  return reconciliationPromise;
}

function startConnectedCloudWork(){
  if(!cloudAvailable()) return;
  if(store.currentUser){
    reconcileSignedInWorkspace().then(() => {
      if(hasPendingPathRoute()) return retryPendingPathRoute();
      return startPlatformSync();
    });
  } else {
    if(hasPendingPathRoute()) retryPendingPathRoute().then(() => startPlatformSync());
    else startPlatformSync();
  }
}

function runCloudPreflight(force = false){
  if(preflightPromise) return preflightPromise;
  if(!force && store.cloudStatus === 'connected'){
    startConnectedCloudWork();
    return Promise.resolve(store.cloudCheck);
  }
  store.cloudStatus = 'checking';
  store.cloudMessage = 'Checking Firestore connection...';
  refreshVisibleRoute();
  preflightPromise = checkFirestoreConnection()
    .then(result => {
      store.syncStatus = '';
      if(result.ok && hasPendingPathRoute()) retryPendingPathRoute();
      else refreshVisibleRoute();
      if(result.ok) startConnectedCloudWork();
      return result;
    })
    .finally(() => { preflightPromise = null; });
  return preflightPromise;
}

function retryCloudConnection(){
  platformSyncKey = null;
  reconciledUserId = null;
  return runCloudPreflight(true);
}

async function onSignIn(){
  store.authSoftTimedOut = false;
  const local = loadLocalState();
  store.state = local;
  store.enrollments = store.state.enrollments || {};
  store.evidenceSubmissions = store.state.evidenceSubmissions || {};
  await finishLoad();
  const shouldRecheck = store.cloudStatus !== 'connected';
  const pending = runCloudPreflight(shouldRecheck);
  if(preflightPromise){
    pending.then(result => {
      if(result && result.status === 'permission_denied' && store.currentUser) runCloudPreflight(true);
    });
  }
}

function armAuthSoftTimeout(){
  setTimeout(() => {
    if(!store.authChecked){
      store.authSoftTimedOut = true;
      store.syncStatus = 'Still checking sign-in...';
      if(!store.bootReady) markBootReady();
      refreshVisibleRoute();
    }
  }, 2500);
}

/* ---- wire auth callbacks into the auth module ---- */
setSignInHandler(onSignIn);
setSignOutHandler(() => {
  reconciledUserId = null;
  platformSyncKey = null;
  applyHeader();
  if(store.state.current == null){
    if(hasPendingPathRoute() || parsePathRoute({ hash:location.hash, pathname:location.pathname, search:location.search })) handleHashRoute();
    else renderCatalog();
  }
  if(cloudAvailable()) startPlatformSync();
});

/* ---- bootstrap ---- */
async function init(){
  installFormAccessibility();
  renderBootState();
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  const bt = $('brandTitle'); if(bt) bt.onclick = goCatalog;
  const ac = $('allSkills');  if(ac) ac.onclick = goCatalog;
  const ep = $('editPathBtn'); if(ep) ep.onclick = editPath;
  document.addEventListener('click', e => {
    const retry = e.target.closest('[data-retry-cloud]');
    if(retry){ e.preventDefault(); retryCloudConnection(); }
  });
  window.addEventListener('hashchange', () => { if(store.nav.handleHash) store.nav.handleHash(); });
  $('startDate').addEventListener('change', e => {
    if(!store.state.current) return;
    curState().meta.startDate = e.target.value || null;
    dbSaveState(); refreshSuggest();
    if(store.activeTab === 'week') renderWeek();
  });
  // Local-first: render instantly from the local mirror so a refresh never
  // waits or loses your place. If signed in, the cloud reconciles in the background.
  armAuthSoftTimeout();
  await loadLocalAndRender();
  if(fb.present) initFirebase();
  runCloudPreflight();
}
init();
