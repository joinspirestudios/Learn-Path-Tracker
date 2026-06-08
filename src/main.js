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
import { store, CAT_PREFIX } from './store.js';
import { $, Store } from './helpers.js';
import {
  dbLoadState, dbLoadRenders, dbSaveState, dbSaveRender,
  loadLocalState, dbLoadPlatformPaths,
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
} from './views.js';

/* ---- tab router ---- */
function switchTab(t){
  // User paths only have Plan + Log tabs.
  if(store.state.current && isUserPath(store.state.current) && t !== 'plan' && t !== 'log') t = 'plan';
  store.activeTab = t;
  if(store.state.current){ curState().meta.lastTab = t; dbSaveState(); }
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

/* ---- boot / load helpers ---- */
async function finishLoad(){
  store.enrollments = store.state.enrollments || {};
  store.evidenceSubmissions = store.state.evidenceSubmissions || {};
  applyHeader(); updateLogDot();
  if(await handleHashRoute()) return;
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
}

async function loadLocalAndRender(){
  store.state     = loadLocalState();        // already migrated
  store.enrollments = store.state.enrollments || {};
  store.evidenceSubmissions = store.state.evidenceSubmissions || {};
  store.catalogue = await dbLoadRenders();   // local renders (signed-out path)
  if(fb.ready) await dbLoadPlatformPaths();
  await finishLoad();
}

async function loadAndRender(){
  store.state     = await dbLoadState();     // already migrated
  store.enrollments = store.state.enrollments || {};
  store.evidenceSubmissions = store.state.evidenceSubmissions || {};
  store.catalogue = await dbLoadRenders();
  await dbLoadPlatformPaths();
  await finishLoad();
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

async function onSignIn(){
  const cloudState   = await dbLoadState();    // already migrated
  const cloudRenders = await dbLoadRenders();
  const local = loadLocalState();              // already migrated
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
          if(v){ const e = JSON.parse(v); arr.push(e); await dbSaveRender(e); }
        }catch(e){}
      }
      store.catalogue = arr;
    }
  } else store.catalogue = cloudRenders;
  await dbLoadPlatformPaths();
  await finishLoad();
}

/* ---- wire auth callbacks into the auth module ---- */
setSignInHandler(onSignIn);
setSignOutHandler(() => applyHeader()); // local view already rendered; just refresh the header

/* ---- bootstrap ---- */
async function init(){
  document.querySelectorAll('.tab').forEach(b => b.onclick = () => switchTab(b.dataset.tab));
  const bt = $('brandTitle'); if(bt) bt.onclick = goCatalog;
  const ac = $('allSkills');  if(ac) ac.onclick = goCatalog;
  const ep = $('editPathBtn'); if(ep) ep.onclick = editPath;
  window.addEventListener('hashchange', () => { if(store.nav.handleHash) store.nav.handleHash(); });
  $('startDate').addEventListener('change', e => {
    if(!store.state.current) return;
    curState().meta.startDate = e.target.value || null;
    dbSaveState(); refreshSuggest();
    if(store.activeTab === 'week') renderWeek();
  });
  // Local-first: render instantly from the local mirror so a refresh never
  // waits or loses your place. If signed in, the cloud reconciles in the background.
  await loadLocalAndRender();
  if(fb.present) initFirebase();
}
init();
