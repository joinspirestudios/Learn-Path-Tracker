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
  initFirebase, setSignInHandler, setSignOutHandler, doSignOut,
} from './auth.js';
import { authFetch } from './api.js';
import {
  skillDef, ensureSkill, curState, isUserPath,
} from './plan.js';
import { applyHeader, updateOverall } from './header.js';
import {
  renderCatalog, renderWorkspace, renderPlan, renderToday, renderWeek, renderMap,
  renderLadders, renderDrills, renderRes, renderLog,
  openSkill, goCatalog, goWeek, editPath,
  refreshSuggest, updateLogDot, handleHashRoute,
  hasPendingPathRoute, hasSharedPathRouteState, renderPendingPathRouteState, retryPendingPathRoute,
} from './views.js';
import { trackOperation } from './sync.js';
import { appHash, hashRouteUrl, initialRouteIntent, parseAppRoute, parsePathRoute } from './routes.js';
import {
  listNotifications, getUnreadNotificationCount, markNotificationRead,
  markAllNotificationsRead, archiveNotification, loadNotificationPreferences,
  saveNotificationPreferences, saveWebPushSubscription,
} from './notification-db.js';
import { notificationPublicSafeView } from './notification-model.js';
import { browserSupportsPush, requestWebPushPermission, currentPushPermission } from './web-push-permissions.js';
import { subscribeToWebPush, getExistingPushSubscription, unsubscribeFromWebPush } from './web-push-client.js';
import { buildContextForPath, buildDeterministicPlan } from './adaptive-planning-context.js';
import { buildAdaptationDraft } from './adaptive-planning-drafts.js';
import { saveAdaptationDraft, dismissAdaptationDraft, applyAdaptationDraft } from './adaptive-planning-db.js';
import { buildEvidenceContextForPath, buildDeterministicEvidencePlan, collectEvidenceSubmissionsForPath } from './evidence-intelligence-context.js';
import { buildEvidenceInsightDraft } from './evidence-intelligence-drafts.js';
import { saveEvidenceInsightDraft, dismissEvidenceInsight, markEvidenceInsightReviewed } from './evidence-intelligence-db.js';

let preflightPromise = null;
let platformSyncPromise = null;
let platformSyncKey = null;
let reconciliationPromise = null;
let reconciledUserId = null;

/* ---- tab router ---- */
function routeHashForCurrent(tab = store.activeTab){
  if(!store.state.current) return appHash('today');
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
    if(store.currentUser) renderWorkspace();
    else renderCatalog();
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
  const hash = (location.hash || '').replace(/^#\/?/, '');
  if(hash === 'dev/design-system' || hash === 'design-system'){
    handleHashRoute();
    return;
  }
  if(parseAppRoute({ hash:location.hash })){
    handleHashRoute();
    return;
  }
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
  else if(store.currentUser) renderWorkspace();
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
  // Load notifications in the background; never blocks the signed-in render.
  loadNotificationsForCurrentUser();
  // Build deterministic adaptive-planning + evidence-intelligence drafts in the
  // background (both advisory; never auto-applied/published).
  try{ refreshAdaptivePlan(); }catch(error){ /* advisory only */ }
  try{ refreshEvidenceInsight(); }catch(error){ /* advisory only */ }
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
  // Clear notification + adaptive transient state so nothing leaks across users.
  clearSignedInTransientState();
  applyHeader();
  if(store.state.current == null){
    if(hasPendingPathRoute() || parsePathRoute({ hash:location.hash, pathname:location.pathname, search:location.search })) handleHashRoute();
    else renderCatalog();
  }
  if(cloudAvailable()) startPlatformSync();
});

/* ---- Phase 6.17 notifications controller ---- */
const WEB_PUSH_PUBLIC_VAPID_KEY = String(import.meta.env?.VITE_WEB_PUSH_PUBLIC_VAPID_KEY || '').trim();

function notificationUid(){
  return store.currentUser && store.currentUser.uid;
}

// Best-effort: reflect whether this browser currently holds a PushSubscription.
// 'active' | 'missing' | 'unknown'. Never reads/stores endpoint or keys.
async function refreshWebPushSubscriptionState(){
  if(!browserSupportsPush()){ store.webPushSubscriptionState = 'unknown'; return; }
  try{
    const existing = await getExistingPushSubscription();
    store.webPushSubscriptionState = existing ? 'active' : 'missing';
  }catch(error){ store.webPushSubscriptionState = 'unknown'; }
  refreshVisibleRoute();
}

async function loadNotificationsForCurrentUser(){
  const uid = notificationUid();
  if(!uid || !fb.firestoreReady){
    store.notifications = []; store.notificationUnreadCount = 0; store.notificationPreferences = null;
    return;
  }
  store.webPushConfigured = browserSupportsPush() && !!WEB_PUSH_PUBLIC_VAPID_KEY;
  store.webPushState = browserSupportsPush() ? currentPushPermission() : 'unsupported';
  refreshWebPushSubscriptionState();
  try{
    const [items, unread, prefs] = await Promise.all([
      listNotifications(uid, {}),
      getUnreadNotificationCount(uid, {}),
      loadNotificationPreferences(uid, {}),
    ]);
    store.notifications = items.map(notificationPublicSafeView);
    store.notificationUnreadCount = unread;
    store.notificationPreferences = prefs;
  }catch(error){
    // Notifications are non-critical chrome; never block the app on failure.
    store.notifications = store.notifications || [];
  }
  refreshVisibleRoute();
}

function readPreferenceForm(){
  const out = {};
  document.querySelectorAll('[data-pref]').forEach(el => {
    const key = el.getAttribute('data-pref');
    if(el.type === 'checkbox') out[key] = !!el.checked;
    else out[key] = el.value;
  });
  return out;
}

async function enableWebPushFromClick(){
  const uid = notificationUid();
  if(!uid) return;
  if(!browserSupportsPush()){ store.webPushState = 'unsupported'; refreshVisibleRoute(); return; }
  if(!WEB_PUSH_PUBLIC_VAPID_KEY){ store.webPushConfigured = false; refreshVisibleRoute(); return; }
  const permission = await requestWebPushPermission();
  store.webPushState = permission;
  if(permission !== 'granted'){ refreshVisibleRoute(); return; }
  const subscription = await subscribeToWebPush({ publicVapidKey: WEB_PUSH_PUBLIC_VAPID_KEY });
  if(subscription){
    try{
      await saveWebPushSubscription(uid, subscription, {});
      const prefs = await saveNotificationPreferences(uid, { ...(store.notificationPreferences || {}), webPushEnabled:true }, {});
      store.notificationPreferences = prefs;
    }catch(error){ /* surfaced via UI state */ }
  }
  refreshVisibleRoute();
}

// Turn off browser push: flip the preference and unsubscribe locally. Never
// requests permission. Keeps in-app notifications working.
async function disableWebPushFromClick(){
  const uid = notificationUid();
  if(!uid) return;
  try{
    const prefs = await saveNotificationPreferences(uid, { ...(store.notificationPreferences || {}), webPushEnabled:false }, {});
    store.notificationPreferences = prefs;
    const existing = await getExistingPushSubscription();
    if(existing) await unsubscribeFromWebPush(existing);
  }catch(error){ /* best effort */ }
  refreshVisibleRoute();
}

async function handleNotificationAction(action, id){
  const uid = notificationUid();
  if(!uid) return;
  if(action === 'open-notifications'){ store.notificationsOpen = !store.notificationsOpen; refreshVisibleRoute(); return; }
  if(action === 'close-notifications-overlay'){ store.notificationsOpen = false; refreshVisibleRoute(); return; }
  if(action === 'mark-read' && id){ await markNotificationRead(uid, id, {}); await loadNotificationsForCurrentUser(); return; }
  if(action === 'mark-all-read'){ await markAllNotificationsRead(uid, {}); await loadNotificationsForCurrentUser(); return; }
  if(action === 'archive-notification' && id){ await archiveNotification(uid, id, {}); await loadNotificationsForCurrentUser(); return; }
  if(action === 'enable-web-push'){ await enableWebPushFromClick(); return; }
  if(action === 'disable-web-push'){ await disableWebPushFromClick(); return; }
  if(action === 'save-notification-preferences'){ await saveNotificationPreferencesFromForm(); return; }
  if(action === 'send-test-notification'){ await sendTestNotificationFromClick(); return; }
}

// Persist preferences with VISIBLE saving/saved/error status. Prefers the
// consolidated community API (consistent auth + rate-limit); falls back to a
// direct owner-only Firestore write if the API is unavailable in dev.
async function saveNotificationPreferencesFromForm(){
  const uid = notificationUid();
  if(!uid) return;
  const prefsInput = readPreferenceForm();
  store.notificationPreferenceStatus = 'saving';
  store.notificationPreferenceMessage = 'Saving preferences…';
  refreshVisibleRoute();
  try{
    let saved = null;
    try{
      const res = await authFetch('/api/community?route=notification-preferences', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ preferences:prefsInput }),
      });
      if(res && res.ok){
        const data = await res.json().catch(() => null);
        saved = (data && data.preferences) || null;
      }
    }catch(apiError){ /* fall through to direct Firestore */ }
    if(!saved){
      // Safe fallback: write the user's OWN preferences doc directly.
      saved = await saveNotificationPreferences(uid, prefsInput, {});
    }
    store.notificationPreferences = saved;
    store.notificationPreferenceStatus = 'saved';
    store.notificationPreferenceMessage = 'Preferences saved.';
    store.notificationPreferenceSavedAt = Date.now();
  }catch(error){
    store.notificationPreferenceStatus = 'error';
    store.notificationPreferenceMessage = 'Could not save preferences. Check your connection and try again.';
  }
  refreshVisibleRoute();
}

// Send a safe test notification (current user only) and surface the result.
async function sendTestNotificationFromClick(){
  const uid = notificationUid();
  if(!uid) return;
  store.notificationTestStatus = 'sending';
  store.notificationTestResult = null;
  refreshVisibleRoute();
  try{
    const res = await authFetch('/api/community?route=send-test-notification', {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body:'{}',
    });
    const data = res ? await res.json().catch(() => null) : null;
    if(res && res.ok && data){
      store.notificationTestStatus = 'done';
      store.notificationTestResult = {
        pushAttempted:!!data.pushAttempted,
        pushSent:Number(data.pushSent) || 0,
        pushDisabledReason:data.pushDisabledReason || null,
      };
      // The server reports whether server-side VAPID is configured.
      if(typeof data.webPushConfigured === 'boolean') store.serverWebPushConfigured = data.webPushConfigured;
      await loadNotificationsForCurrentUser();
    }else{
      store.notificationTestStatus = 'error';
    }
  }catch(error){
    store.notificationTestStatus = 'error';
  }
  refreshVisibleRoute();
}

/* ---- Phase 7.0 adaptive planning controller ---- */
function activePathContext(){
  const enrollments = (store.state && store.state.enrollments) || {};
  const pathId = store.state.current
    || (Object.values(enrollments).find(e => e && e.pathId && e.startDate) || {}).pathId
    || null;
  if(!pathId) return null;
  const path = (store.state.userPaths && store.state.userPaths[pathId]) || { id:pathId };
  const enrollment = Object.values(enrollments).find(e => e && e.pathId === pathId) || {};
  return { pathId, path:{ ...path, id:pathId }, enrollment };
}

// Build a deterministic adaptation draft for the active path (cached by
// path+day to avoid rebuilding every render). Never auto-applies.
function refreshAdaptivePlan(){
  const uid = notificationUid();
  const active = activePathContext();
  if(!uid || !active){ return; }
  const context = buildContextForPath({
    path:active.path,
    enrollment:active.enrollment,
    isOwner:!!(active.path && active.path.ownerId && active.path.ownerId === uid),
  });
  const key = active.pathId + ':' + (context.currentDayNumber || 0);
  if(store.adaptivePlanKey === key && store.adaptivePlanDraft){ return; }
  const { insights, recommendations } = buildDeterministicPlan({ context });
  const draft = buildAdaptationDraft({
    uid, pathId:active.pathId, currentDayNumber:context.currentDayNumber,
    insights, recommendations, source:'deterministic',
  });
  store.adaptivePlanKey = key;
  store.adaptivePlanDraft = draft;
  // Persist best-effort (creating a draft is not applying it).
  saveAdaptationDraft(uid, active.pathId, draft, {}).catch(() => {});
  refreshVisibleRoute();
}

async function handleAdaptiveAction(action, draftId){
  const uid = notificationUid();
  const active = activePathContext();
  if(!uid || !active) return;
  if(action === 'review-adaptation'){ store.adaptivePlanReviewOpen = true; refreshVisibleRoute(); return; }
  if(action === 'close-adaptation-overlay'){ store.adaptivePlanReviewOpen = false; refreshVisibleRoute(); return; }
  if(action === 'dismiss-adaptation'){
    store.adaptivePlanReviewOpen = false;
    store.adaptivePlanDraft = null;
    if(draftId) dismissAdaptationDraft(uid, active.pathId, draftId, {}).catch(() => {});
    refreshVisibleRoute();
    return;
  }
  if(action === 'apply-adaptation' && draftId){
    try{
      const role = (active.path && active.path.ownerId === uid) ? 'owner' : 'participant';
      await applyAdaptationDraft(uid, active.pathId, draftId, { path:active.path, userRole:role });
      store.adaptivePlanStatus = 'Applied to your upcoming days.';
      store.adaptivePlanReviewOpen = false;
      store.adaptivePlanDraft = null;
    }catch(error){ store.adaptivePlanStatus = 'Could not apply that yet.'; }
    refreshVisibleRoute();
    return;
  }
}

/* ---- Phase 8.0 evidence intelligence controller ---- */
// Build a deterministic evidence insight draft for the active path (cached by
// path+day). Advisory only — never publishes, never claims "verified".
function refreshEvidenceInsight(){
  const uid = notificationUid();
  const active = activePathContext();
  if(!uid || !active){ return; }
  // Proof is cached nested by enrollment: evidenceSubmissions[enrollmentId][id].
  // Flatten + collect for the active path (also handles flat/array shapes) so
  // Evidence Intelligence sees real submitted proof, not the enrollment buckets.
  const proofSubmissions = collectEvidenceSubmissionsForPath({
    evidenceSubmissions: (store.state && store.state.evidenceSubmissions) || store.evidenceSubmissions || {},
    enrollments: (store.state && store.state.enrollments) || store.enrollments || {},
    pathId: active.pathId,
  });
  const context = buildEvidenceContextForPath({
    path:active.path, enrollment:active.enrollment, proofSubmissions,
    isOwner:!!(active.path && active.path.ownerId === uid),
  });
  // Phase 8.2 — note whether the path has uploaded image proof (for the Vision
  // trigger). Uses the evidence model's classification, never raw URLs/paths.
  const firstImage = (context.uploadedEvidence || []).find(r => r && r.kind === 'image');
  store.evidenceHasImageProof = !!firstImage;
  store.evidenceFirstImageId = firstImage ? String(firstImage.id || firstImage.taskId || '') : '';
  const key = active.pathId + ':' + (context.currentDayNumber || 0) + ':' + proofSubmissions.length;
  if(store.evidenceInsightKey === key && store.evidenceInsightDraft){ return; }
  const { insights, recommendations } = buildDeterministicEvidencePlan({ context });
  // Only surface a draft when there is something useful to say.
  if(!insights.length && (!recommendations.length || (recommendations.length === 1 && recommendations[0].type === 'improve_tomorrow_proof_prompt'))){
    store.evidenceInsightKey = key; store.evidenceInsightDraft = null; return;
  }
  const draft = buildEvidenceInsightDraft({
    uid, pathId:active.pathId, currentDayNumber:context.currentDayNumber, insights, recommendations, source:'deterministic',
  });
  store.evidenceInsightKey = key;
  store.evidenceInsightDraft = draft;
  saveEvidenceInsightDraft(uid, active.pathId, draft, {}).catch(() => {});
  refreshVisibleRoute();
}

async function handleEvidenceAction(action, insightId){
  const uid = notificationUid();
  const active = activePathContext();
  if(!uid || !active) return;
  if(action === 'refresh-evidence-insight'){
    // Rebuild the deterministic insight from current local proof state (no AI).
    store.evidenceInsightKey = '';
    try{ refreshEvidenceInsight(); }catch(error){ /* advisory only */ }
    store.evidenceInsightStatus = 'Updated from your latest proof.';
    refreshVisibleRoute();
    return;
  }
  if(action === 'review-evidence-insight'){ store.evidenceInsightReviewOpen = true; refreshVisibleRoute(); return; }
  if(action === 'close-evidence-overlay'){ store.evidenceInsightReviewOpen = false; refreshVisibleRoute(); return; }
  if(action === 'mark-evidence-insight-reviewed' && insightId){
    // Marking reviewed never publishes — it only updates the draft status.
    if(store.evidenceInsightDraft && store.evidenceInsightDraft.id === insightId){
      store.evidenceInsightDraft = { ...store.evidenceInsightDraft, status:'reviewed', reviewedAt:Date.now() };
    }
    store.evidenceInsightStatus = 'Reviewed. Nothing was published.';
    markEvidenceInsightReviewed(uid, active.pathId, insightId, {}).catch(() => {});
    refreshVisibleRoute();
    return;
  }
  if(action === 'archive-evidence-insight' && insightId){
    // Archiving never changes proof visibility; it just resolves the draft.
    store.evidenceInsightReviewOpen = false;
    store.evidenceInsightDraft = null;
    store.evidenceInsightStatus = 'Archived.';
    refreshVisibleRoute();
    return;
  }
  if(action === 'copy-public-safe-summary'){
    // Copy the already-public-safe summary to the clipboard (no publish).
    const summary = store.evidenceInsightDraft && store.evidenceInsightDraft.publicSafeSummary;
    if(summary && navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(String(summary)).catch(() => {});
    }
    store.evidenceInsightStatus = 'Public-safe summary copied.';
    refreshVisibleRoute();
    return;
  }
  if(action === 'dismiss-evidence-insight'){
    // Dismiss resolves the draft; it never deletes the underlying proof.
    store.evidenceInsightReviewOpen = false;
    store.evidenceInsightDraft = null;
    if(insightId) dismissEvidenceInsight(uid, active.pathId, insightId, {}).catch(() => {});
    refreshVisibleRoute();
    return;
  }
}

// Phase 8.2 — Gemini Vision actions. Consent is always explicit; analysis runs on
// the server (never client→Gemini). Never publishes, never changes visibility.
async function handleVisionAction(action, evidenceId){
  const uid = notificationUid();
  const active = activePathContext();
  if(!uid || !active) return;
  if(action === 'open-vision-consent'){
    store.visionConsentOpen = true;
    store.visionConsentEvidenceId = evidenceId || store.evidenceFirstImageId || '';
    refreshVisibleRoute();
    return;
  }
  if(action === 'cancel-vision-analysis'){ store.visionConsentOpen = false; refreshVisibleRoute(); return; }
  if(action === 'confirm-vision-analysis'){
    store.visionConsentOpen = false;
    store.visionStatus = 'loading';
    store.visionDraft = null;
    store.visionDisabledReason = '';
    refreshVisibleRoute();
    try{
      const res = await authFetch('/api/ai?route=analyze-evidence-image', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify({ pathId:active.pathId, evidenceId:evidenceId || store.visionConsentEvidenceId || store.evidenceFirstImageId, consentToVisionAnalysis:true }),
      });
      const data = res ? await res.json().catch(() => null) : null;
      if(data && data.ok && data.draft){
        store.visionStatus = 'done'; store.visionDraft = data.draft;
      }else{
        store.visionStatus = 'disabled'; store.visionDisabledReason = (data && data.disabledReason) || 'provider_error';
      }
    }catch(error){
      store.visionStatus = 'disabled'; store.visionDisabledReason = 'provider_error';
    }
    refreshVisibleRoute();
    return;
  }
  if(action === 'mark-vision-reviewed' && evidenceId){
    if(store.visionDraft && store.visionDraft.id === evidenceId){
      store.visionDraft = { ...store.visionDraft, status:'reviewed' };
    }
    refreshVisibleRoute();
    return;
  }
  if(action === 'dismiss-vision-insight'){
    store.visionDraft = null; store.visionStatus = 'idle'; store.visionDisabledReason = '';
    refreshVisibleRoute();
    return;
  }
}

// Clear all notification + adaptive transient state (called on sign-out).
function clearSignedInTransientState(){
  store.notifications = []; store.notificationUnreadCount = 0;
  store.notificationsOpen = false; store.notificationPreferences = null;
  store.notificationPreferenceStatus = 'idle'; store.notificationPreferenceMessage = '';
  store.notificationTestStatus = 'idle'; store.notificationTestResult = null;
  store.webPushSubscriptionState = 'unknown'; store.serverWebPushConfigured = null;
  // Phase 7.0 adaptive planning transient state.
  store.adaptivePlanDraft = null; store.adaptivePlanReviewOpen = false;
  store.adaptivePlanKey = ''; store.adaptivePlanStatus = '';
  // Phase 8.0 evidence intelligence transient state.
  store.evidenceInsightDraft = null; store.evidenceInsightReviewOpen = false;
  store.evidenceInsightKey = ''; store.evidenceInsightStatus = '';
  // Phase 8.2 vision transient state.
  store.evidenceHasImageProof = false; store.evidenceFirstImageId = '';
  store.visionConsentOpen = false; store.visionConsentEvidenceId = '';
  store.visionStatus = 'idle'; store.visionDraft = null; store.visionDisabledReason = '';
}

// Visible sign-out from the Aurora shell. Delegates to the existing auth
// doSignOut(); the setSignOutHandler below clears state + re-renders.
async function handleSignOutClick(){
  clearSignedInTransientState();
  try{ await doSignOut(); }catch(error){ /* auth module already logs */ }
}

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
    const notify = e.target.closest('[data-action]');
    if(notify){
      const action = notify.getAttribute('data-action');
      // Visible sign-out from the Aurora shell / Profile account card.
      if(action === 'sign-out'){ e.preventDefault(); handleSignOutClick(); return; }
      const NOTIFICATION_ACTIONS = [
        'open-notifications', 'close-notifications-overlay', 'mark-read', 'mark-all-read',
        'archive-notification', 'enable-web-push', 'disable-web-push', 'save-notification-preferences',
        'send-test-notification',
      ];
      // Ignore overlay backdrop clicks that bubble from inner controls.
      if(action === 'close-notifications-overlay' && e.target !== notify) return;
      if(NOTIFICATION_ACTIONS.includes(action)){
        e.preventDefault();
        handleNotificationAction(action, notify.getAttribute('data-notification-id') || '');
      }
      const ADAPTIVE_ACTIONS = ['review-adaptation', 'close-adaptation-overlay', 'dismiss-adaptation', 'apply-adaptation'];
      if(action === 'close-adaptation-overlay' && e.target !== notify) return;
      if(ADAPTIVE_ACTIONS.includes(action)){
        e.preventDefault();
        handleAdaptiveAction(action, notify.getAttribute('data-draft-id') || '');
      }
      const EVIDENCE_ACTIONS = ['review-evidence-insight', 'close-evidence-overlay', 'dismiss-evidence-insight', 'mark-evidence-insight-reviewed', 'refresh-evidence-insight', 'archive-evidence-insight', 'copy-public-safe-summary'];
      if(action === 'close-evidence-overlay' && e.target !== notify) return;
      if(EVIDENCE_ACTIONS.includes(action)){
        e.preventDefault();
        handleEvidenceAction(action, notify.getAttribute('data-insight-id') || '');
      }
      const VISION_ACTIONS = ['open-vision-consent', 'cancel-vision-analysis', 'confirm-vision-analysis', 'mark-vision-reviewed', 'dismiss-vision-insight'];
      if(action === 'cancel-vision-analysis' && e.target !== notify) return;
      if(VISION_ACTIONS.includes(action)){
        e.preventDefault();
        handleVisionAction(action, notify.getAttribute('data-evidence-id') || notify.getAttribute('data-vision-id') || '');
      }
    }
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
