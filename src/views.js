// ── views.js ──────────────────────────────────────────────────────────────
// All view renderers (catalog, today, week, plan, map, ladders, drills,
// resources, log) and their event wiring. View-internal navigation
// (goCatalog, goWeek, openSkill) lives here too. Tab switching itself sits
// in main.js and is reached via store.nav.switchTab().

import { SKILLS } from './data.js';
import { TEMPLATES } from './templates.js';
import { store, STATE_KEY } from './store.js';
import { $, esc, flash, undoToast } from './helpers.js';
import { externalLinkHTML, safeExternalUrl } from './urls.js';
import {
  dbSaveState, dbSaveRender, dbDelRender, dbCreatePlatformPath, dbLoadPlatformPath,
  dbLoadMorePlatformPaths,
  dbRequestAccess, dbLoadMyAccessRequest, dbSavePlatformPath,
  dbEnsureEnrollment, dbReconcileEnrollment, dbSaveEnrollment, dbSaveDayLog,
  dbStartEnrollment, enrollmentIdFor, makeDayLog, makeEnrollment,
  createEvidenceSubmission, listEvidenceSubmissions, uploadEvidenceFile,
  dbLoadPublicProgress, ACCEPTED_EVIDENCE_TYPES,
} from './db.js';
import {
  ensureSkill, curState, curDef, P, quarters, days, ladders,
  weekEdits, effPlan, setWeekFocus, weekResArr, addCineWeek, removeCineWeek,
  isUserPath, curUser, pathTitle, pathGoal, canEditUserPath,
  weekObj, dayLabel, weekProg, ladderCount, totalsFor, allTotals,
  nextRungIdx, currentWeekFromStart, computeStreak,
} from './plan.js';
import { openAuthModal } from './auth.js';
import {
  authFetch, commentOnProgress, hideProgressComment, joinPath,
  publishProgress, reactToProgress, reportPath, reportProgressComment,
  syncPathMetrics, unpublishProgress,
} from './api.js';
import { errorFromAIPayload, parseAIResponse, SERVER_FUNCTION_FAILED_MESSAGE } from './ai-response.js';
import { AI_GENERATE_TIMEOUT_MS, AI_INTERPRET_TIMEOUT_MS, VOICE_TRANSCRIBE_TIMEOUT_MS } from './ai-timeouts.js';
import { applyHeader, updateOverall } from './header.js';
import { configPresent, cloudActive, cloudAvailable, cloudConnectionError, cloudFailureMessage } from './db.js';
import { cachedAuthLabel } from './auth.js';
import {
  canAccessFullPath, canJoinPath, canManageMembers, canPreviewPath, canRequestAccess, canViewPath,
  activeThisWeekIsCurrent, displayableActiveThisWeek,
  isOwner, isPathParticipant, normalizePathStats, resolveCreatorName, trustBadgesForStats,
} from './platform.js';
import {
  appHash, focusHash, hashRouteUrl, makePendingPathRoute, parseAppRoute, parsePathRoute, pathHash, pathPreviewHash, pathShareLink,
} from './routes.js';
import {
  AI_CADENCE_TYPES, AI_GUIDED_STAGES, AI_PATH_TYPES, AI_PROGRESSION_CURVES, AI_TASK_MODES,
  AI_INTENSITY_DETAILS, AI_INTENSITY_LEVELS,
  MAX_AI_CLARIFICATION_ROUNDS, assumptionsForFinalClarification,
  answerPayloadForQuestion, answerValueForQuestion,
  aiBriefDefaults, aiPromptDefaults, briefFromPrompt, confirmBrief, emptyCoreCommitment,
  beginAIRequest, cancelAIRequests, canStartAIRequest, createAIRequestState,
  cadenceLabel, commitmentSummary, creationStageForPhase,
  finishAIRequest, hasActiveAIRequest, isMeaningfulAIGoal, normalizeCoreCommitment,
  normalizeCoreCommitments, normalizeBriefAssumptions, normalizeClarifyingQuestions,
  normalizeConfirmedBrief, normalizeIntensity, recoverAIBuilderState, routeInterpretedBrief,
  firstPhase55ValidationMessage, unacceptedMaterialAssumptions,
} from './ai-builder-model.js';
import {
  canCompleteDay, canOpenDay, dateForJourneyDay, getDayStatus,
  formatProgressiveTaskTitle, getMaxRoadmapDay, getTasksForDay, journeyDayForDate,
  localDateString, normalizeDurationDays,
} from './journey.js';
import {
  canCompleteDailySession, completionScoreMetadata, dailyCompletionScore,
  focusFeedbackForAction, isOptionalTask, nextUnresolvedTaskId, normalizeDailyFocusState, resumeTaskId,
  sessionTaskStates, taskNeedsEvidence,
} from './daily-session-model.js';
import { dailySessionHTML, focusScreenHTML } from './views/daily-session.js';
import { auroraRoadmapDayItemHTML } from './views/roadmap-render.js';
import {
  makeVoiceInputState, mapVoiceError,
  voiceIsActive, voiceTargetFromField,
} from './voice-input-model.js';
import {
  cancelLiveVoiceSession, cleanupLiveVoiceSession, startLiveVoiceSession, stopLiveVoiceSession,
} from './live-voice-session.js';
import {
  enhanceVoiceFields, updateVoiceControlForField, updateVoiceInterim,
  updateVoiceMetrics, updateVoiceWaveform,
} from './views/voice-input.js';
import {
  AI_SAVE_TIMEOUT_MS, ENROLLMENT_TIMEOUT_MS, PATH_OPEN_TIMEOUT_MS,
  enrollmentStartErrorMessage, isTemporaryFirebaseError, trackOperation, userSyncMessage, withTimeout,
} from './sync.js';
import {
  aiDraftToLocalPath as aiGeneratedDraftToLocalPath,
  AI_GOAL_EXAMPLES as AI_ROTATING_GOAL_EXAMPLES,
  AI_GOAL_SUGGESTIONS,
  localGeneratedDraft as createLocalGeneratedDraft,
  normalizeGeneratedDraft as normalizeAIGeneratedDraft,
  startExampleRotation,
  stopExampleRotation,
  updateGoalSuggestionButtons,
} from './views/ai-builder/index.js';
import {
  canPublishCompletedDay, evidenceTypeLabel, normalizePublicComment, normalizePublicProgressEntry, publicProgressEntryId,
} from './public-progress.js';
import { REPORT_REASONS, reportTargetLabel } from './moderation.js';
import {
  bindCatalogEvents, canOpenFullPlatformPath, platformAccessRecordFromState, renderDiscoverView, renderWorkspaceView,
} from './views/catalog/index.js';
import { renderDesignSystemGallery } from './ui/design-gallery.js';
import { renderAppShell, renderAuroraShell } from './ui/core.js';

/* ---- debounced save (formerly the file-level noteTimer pattern) ---- */
let _noteTimer = null;
let selectedJourneyDay = null;
let evidenceFormTaskId = null;
let evidenceProofType = 'url';
let evidenceBusy = false;
let evidenceError = '';
let dailySessionSaveState = 'idle';
let dailySessionError = '';
let dailySessionActionToken = 0;
let aiBuilder = null;
let aiProcessingTimer = null;
let suppressNextAIBuilderFocus = false;
let isCreatingPath = false;
let openingPathId = null;
let startingJourneyId = null;
let aiSaveClientId = null;
let joiningPathId = null;
let shareLinkMessage = '';
let publicProgressBusyKey = null;
let publicProgressError = '';
let progressInteractionBusyKey = null;
let progressCommentDrafts = {};
let progressInteractionErrors = {};
let reportPanelKey = '';
let reportBusyKey = '';
let reportDrafts = {};
let reportMessages = {};
let pendingRouteRetrying = false;
let focusScreenActive = false;

function abortAIRequest(kind = null, builder = aiBuilder){
  if(!builder?.requests) return;
  if(!kind){
    cancelAIRequests(builder.requests);
    return;
  }
  const slot = builder.requests[kind];
  if(!slot) return;
  slot.controller?.abort?.();
  slot.token += 1;
  slot.controller = null;
  slot.loading = false;
}

function beginAIClientRequest(builder, kind){
  const controller = new AbortController();
  const token = beginAIRequest(builder.requests, kind, controller);
  return { builder, kind, controller, token };
}

function aiRequestIsCurrent(request){
  return aiBuilder === request.builder
    && request.builder.requests?.[request.kind]?.token === request.token;
}

function finishAIClientRequest(request){
  return finishAIRequest(request.builder.requests, request.kind, request.token);
}

async function authenticatedAIRequest(request, url, options, timeoutMs){
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    request.controller.abort();
  }, timeoutMs);
  try{
    return await authFetch(url, { ...options, signal:request.controller.signal });
  }catch(error){
    if(timedOut){
      const timeoutError = new Error('The request took too long and was cancelled.');
      timeoutError.code = 'operation_timeout';
      throw timeoutError;
    }
    throw error;
  }finally{
    clearTimeout(timer);
  }
}

function scheduleSave(ms = 650){
  clearTimeout(_noteTimer);
  _noteTimer = setTimeout(saveCurrentPath, ms);
}

function setRoute(hash){
  try{ localStorage.setItem('lpt_last_route', hash); }catch(e){}
  if(location.hash !== hash || location.pathname.startsWith('/path/')) history.replaceState(null, '', hashRouteUrl(hash));
}

function authRestoring(){
  return !!(configPresent() && !store.authChecked && cachedAuthLabel() && !store.authSoftTimedOut);
}

function syncStatusHTML(){
  const status = store.cloudStatus || 'checking';
  let h = '';
  if(status !== 'connected'){
    const checking = status === 'checking';
    h += '<div class="sync-banner ' + esc(status) + '"><span>' + esc(store.cloudMessage || (checking ? 'Checking Firestore connection...' : cloudFailureMessage())) + '</span>'
      + (checking ? '' : '<button class="btn" type="button" data-retry-cloud>Retry cloud connection</button>') + '</div>';
  } else if(store.syncStatus){
    h += '<div class="sync-banner subtle"><span>' + esc(store.syncStatus) + '</span></div>';
  }
  if(import.meta.env.DEV){
    const d = store.cloudDiagnostics || {};
    h += '<details class="cloud-diagnostics"><summary>Cloud diagnostics</summary>'
      + '<dl><div><dt>Project</dt><dd>' + esc(d.projectId || 'not configured') + '</dd></div>'
      + '<div><dt>Firebase</dt><dd>' + esc(d.firebaseInitialized ? 'initialized' : 'not initialized') + '</dd></div>'
      + '<div><dt>Firestore</dt><dd>' + esc(d.firestoreInitialized ? 'initialized' : 'not initialized') + '</dd></div>'
      + '<div><dt>Auth</dt><dd>' + esc(!store.authChecked ? 'checking' : (store.currentUser ? 'signed in' : 'signed out')) + '</dd></div>'
      + '<div><dt>Cloud status</dt><dd>' + esc(status) + '</dd></div>'
      + '<div><dt>Preflight</dt><dd>' + esc(d.preflightElapsedMs == null ? '-' : (d.preflightElapsedMs + 'ms')) + '</dd></div>'
      + '<div><dt>Summaries</dt><dd>' + esc(d.platformSummaryElapsedMs == null ? '-' : (d.platformSummaryElapsedMs + 'ms')) + '</dd></div>'
      + '<div><dt>Path children</dt><dd>' + esc(d.selectedPathChildrenStatus || 'idle') + '</dd></div>'
      + '<div><dt>Latest error</dt><dd>' + esc(d.latestErrorStatus || 'none') + '</dd></div>'
      + '<div><dt>Error detail</dt><dd>' + esc(d.latestErrorMessage || 'none') + '</dd></div></dl></details>';
  }
  return h;
}

function pathTasksReady(def){
  if(!def) return false;
  if(!def.platform) return true;
  return def.childrenLoaded === true;
}

function pathHasTasks(def){
  return !!((def?.weeks || []).some(w => (w.tasks || []).length));
}

function pathCanStart(def){
  return pathTasksReady(def) && getTasksForDay(def, 1).length > 0;
}

function renderPathOpening(title = 'Opening path...', message = 'Loading path details.'){
  store.route = { kind:'path-loading', id:store.pendingRoute?.id || store.state.current || null };
  applyHeader();
  $('content').innerHTML = '<div class="panel card path-loading"><div class="chip">Loading</div><h3>' + esc(title) + '</h3><p class="muted">' + esc(message) + '</p></div>';
}

function renderPathLoadError(id, title = 'Could not load path tasks. Try again.'){
  applyHeader();
  $('content').innerHTML = syncStatusHTML() + '<div class="panel card empty-state"><div class="section-title">Path loading issue</div><div class="muted">' + esc(title) + '</div><button class="btn gold" id="retryPathLoad" style="margin-top:14px">Retry</button></div>';
  const retry = $('retryPathLoad');
  if(retry) retry.onclick = async () => {
    if(!cloudAvailable() && store.nav.retryCloud) await store.nav.retryCloud();
    if(cloudAvailable()) openSkill(id, { tab:'plan' });
  };
}

function setPendingPathRoute(route, waitingFor = 'cloud'){
  const next = makePendingPathRoute(route, waitingFor);
  if(!next) return null;
  const previous = store.pendingRoute && store.pendingRoute.id === next.id ? store.pendingRoute : null;
  store.pendingRoute = {
    ...next,
    attempts:previous ? Number(previous.attempts || 0) + 1 : Number(next.attempts || 0),
  };
  store.route = { kind:'path-loading', id:next.id };
  return store.pendingRoute;
}

function clearPendingPathRoute(id = null){
  if(!store.pendingRoute) return;
  if(id && store.pendingRoute.id !== id) return;
  store.pendingRoute = null;
}

export function hasPendingPathRoute(){
  return !!store.pendingRoute;
}

export function hasSharedPathRouteState(){
  if(store.pendingRoute) return true;
  return ['path-preview', 'path-error', 'path-loading'].includes(store.route?.kind);
}

export function renderPendingPathRouteState(){
  const pending = store.pendingRoute;
  if(!pending) return false;
  const checking = (store.cloudStatus || 'checking') === 'checking';
  const title = checking ? 'Opening shared path...' : 'We could not load this shared path yet.';
  const message = checking ? 'Checking cloud connection.' : cloudFailureMessage();
  applyHeader();
  $('content').innerHTML = syncStatusHTML()
    + '<div class="panel card empty-state path-loading"><div class="chip">' + esc(checking ? 'Loading' : 'Cloud unavailable') + '</div>'
    + '<div class="section-title">' + esc(title) + '</div><div class="muted">' + esc(message) + '</div>'
    + (checking ? '' : '<div style="margin-top:14px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn gold" id="retrySharedPath">Retry</button><button class="btn" id="backDiscover">Back to discover</button></div>')
    + '</div>';
  const retry = $('retrySharedPath');
  if(retry) retry.onclick = async () => {
    if(!cloudAvailable() && store.nav.retryCloud) await store.nav.retryCloud();
    await retryPendingPathRoute();
  };
  const back = $('backDiscover');
  if(back) back.onclick = () => { clearPendingPathRoute(); goCatalog(); };
  return true;
}

export async function retryPendingPathRoute(){
  const pending = store.pendingRoute;
  if(!pending) return false;
  if(pendingRouteRetrying) return true;
  if(!cloudAvailable()){
    renderPendingPathRouteState();
    return true;
  }
  pendingRouteRetrying = true;
  try{
    await openPathRoute(pending.id, pending.preview, pending.options || {}, { source:pending.source || 'hash', retryPending:true });
  }finally{
    pendingRouteRetrying = false;
  }
  return true;
}

function upSave(){     saveCurrentPath(); }
function upSaveSoft(){ scheduleSave(); }
function sanitizePersistedUrls(){
  Object.values(store.state.userPaths || {}).forEach(path => {
    path.coverImage = safeExternalUrl(path.coverImage);
    path.profileImage = safeExternalUrl(path.profileImage);
    (path.weeks || []).forEach(week => {
      (week.tasks || []).forEach(task => { task.resourceUrl = safeExternalUrl(task.resourceUrl); });
      (week.resources || []).forEach(resource => { resource.url = safeExternalUrl(resource.url) || ''; });
    });
  });
  Object.values(store.state.skills || {}).forEach(skill => {
    const edits = skill?.edits;
    Object.values(edits?.res || {}).forEach(resources => {
      (resources || []).forEach(resource => { resource.u = safeExternalUrl(resource.u) || ''; });
    });
    (edits?.added || []).forEach(week => {
      (week.res || []).forEach(resource => { resource.u = safeExternalUrl(resource.u) || ''; });
    });
  });
}
async function saveCurrentPath(){
  sanitizePersistedUrls();
  await dbSaveState();
  const id = store.state.current;
  if(id && store.state.userPaths[id] && store.state.userPaths[id].platform && canEditUserPath(id)){
    await dbSavePlatformPath(id);
  }
}

/* ---- progress toggle (used by every .ck checkbox in every render) ---- */
export async function toggle(id, val){
  const p = P();
  if(val){
    p[id] = true;
    const m = curState().meta;
    (m.activity = m.activity || {})[new Date().toISOString().slice(0,10)] = true;
  } else {
    delete p[id];
  }
  updateOverall();
  await dbSaveState();
}

/* ============================================================ */
/* ---------- CATALOG (the start screen) ---------------------- */
/* ============================================================ */
function platformAccessRecord(id, def = store.state.userPaths?.[id]){
  return platformAccessRecordFromState({ store, id, def });
}

function canOpenFullPath(id, def = store.state.userPaths?.[id]){
  return canOpenFullPlatformPath({ store, id, def, canAccessFullPath });
}

function appViewContext(){
  return {
    store,
    skills:SKILLS,
    syncStatusHTML,
    authRestoring,
    configPresent,
    cloudActive,
    pathTitle,
    pathGoal,
    totalsFor,
    canOpenFullPath,
    pathTasksReady,
  };
}

function appShellHTML(active, body, { title = '', rightRail = '', className = '' } = {}){
  if(store.currentUser){
    document.body.classList.add('aurora-shell-mode');
    const label = store.currentUser.displayName || store.currentUser.email || '';
    return renderAuroraShell({ active, title, body, rightRail, className, userLabel:label });
  }
  document.body.classList.remove('aurora-shell-mode');
  if(active === 'discover'){
    return renderAppShell({ body, className:'aurora-public-discover-shell ' + className });
  }
  return renderAppShell({ body, className:'aurora-public-app-shell ' + className });
}

async function loadMorePublicPaths(){
  await dbLoadMorePlatformPaths();
  if(store.discoveryPage?.errorMessage) flash(store.discoveryPage.errorMessage);
  renderCatalog();
}

export function renderCatalog(){
  const result = renderDiscoverView(appViewContext());
  $('content').innerHTML = appShellHTML('discover', result.html, { title:'Discover', className:'aurora-discover-page' });
  applyHeader();
  if(result.restoring) return;
  bindCatalogEvents({
    $,
    store,
    renderCatalog,
    openPathRoute,
    openSkill,
    canOpenFullPath,
    getOpeningPathId:() => openingPathId,
    setOpeningPathId:value => { openingPathId = value; },
    importLocalPath,
    createPath,
    openAIPathBuilder,
    openAuthModal,
    loadMorePublicPaths,
  });
}

export function renderWorkspace(){
  const result = renderWorkspaceView(appViewContext());
  $('content').innerHTML = appShellHTML('paths', result.html, { title:'Paths', rightRail:result.rightRail || '', className:'aurora-workspace-page' });
  applyHeader();
  if(result.restoring) return;
  bindCatalogEvents({
    $,
    store,
    renderCatalog:renderWorkspace,
    openPathRoute,
    openSkill,
    canOpenFullPath,
    getOpeningPathId:() => openingPathId,
    setOpeningPathId:value => { openingPathId = value; },
    importLocalPath,
    createPath,
    openAIPathBuilder,
    openAuthModal,
    loadMorePublicPaths,
  });
}
async function importLocalPath(id){
  if(!cloudActive()){
    openAuthModal('signup');
    return;
  }
  const local = store.state.userPaths[id];
  if(!local || local.platform) return;
  let newId = null;
  try{
    newId = await withTimeout(dbCreatePlatformPath({
      ...JSON.parse(JSON.stringify(local)),
      visibility: 'private',
      discoverable: false,
      migratedFromLocal: true,
      clientSaveId: 'import_' + id + '_' + Date.now().toString(36),
    }, id), AI_SAVE_TIMEOUT_MS, 'import local path');
  }catch(e){
    flash(userSyncMessage(e, 'Could not sync this path. Your local draft is still safe.'));
  }
  if(newId){
    flash('Imported as private path');
    await openSkill(newId);
    store.editMode = true;
    renderPlan();
  }
}


function selectOptions(values, selected){
  return values.map(v => '<option value="' + esc(v) + '" ' + (v === selected ? 'selected' : '') + '>' + esc(v) + '</option>').join('');
}

function clampDay(n, fallback = 1, max = 365){
  n = Number(n);
  if(!Number.isFinite(n)) n = fallback;
  return Math.max(1, Math.min(max, Math.round(n)));
}

function nullableNumber(value){
  if(value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function splitLines(value){
  return String(value || '').split(/\n+/).map(x => x.trim()).filter(Boolean);
}

function joinLines(value){
  return (Array.isArray(value) ? value : []).filter(Boolean).join('\n');
}

function normalizeGoalBrief(raw = {}){
  return normalizeConfirmedBrief(raw);
}

function progressiveTargetsFromText(value){
  return String(value || '').split(/\n+/).map(line => {
    const parts = line.split('|').map(x => x.trim());
    return {
      area:parts[0] || '',
      currentValue:nullableNumber(parts[1]),
      targetValue:nullableNumber(parts[2]),
      unit:parts[3] || '',
      notes:parts.slice(4).join(' | '),
    };
  }).filter(target => target.area || target.notes);
}

function progressiveTargetsToText(targets){
  return (Array.isArray(targets) ? targets : []).map(target => [
    target.area || '',
    target.currentValue == null ? '' : target.currentValue,
    target.targetValue == null ? '' : target.targetValue,
    target.unit || '',
    target.notes || '',
  ].join(' | ')).join('\n');
}

function briefToPromptPatch(brief){
  const b = normalizeGoalBrief(brief);
  const targetLines = (b.progressiveTargets || []).map(target => {
    const range = [target.currentValue, target.targetValue].filter(v => v != null).join(' to ');
    return [target.area, range ? '(' + range + (target.unit ? ' ' + target.unit : '') + ')' : '', target.notes].filter(Boolean).join(' ');
  });
  const briefText = [
    b.summary ? 'Summary: ' + b.summary : '',
    b.goal ? 'Goal: ' + b.goal : '',
    b.currentStage ? 'Current stage: ' + b.currentStage : '',
    b.desiredEndState ? 'Desired end state: ' + b.desiredEndState : '',
    targetLines.length ? 'Progressive targets: ' + targetLines.join('; ') : '',
    b.assumptions.length ? 'Accepted assumptions: ' + b.assumptions.filter(item => item.accepted).map(item => item.text).join('; ') : '',
  ].filter(Boolean).join('\n');
  return {
    goal:b.goal || b.summary,
    durationDays:b.durationDays || aiBuilder.prompt.durationDays || null,
    deadline:b.deadline || aiBuilder.prompt.deadline || '',
    intensity:b.intensity || aiBuilder.prompt.intensity || '',
    pathType:b.pathType || (aiBuilder.prompt.pathType === 'auto' ? 'custom' : aiBuilder.prompt.pathType) || 'custom',
    currentStage:b.currentStage || aiBuilder.prompt.currentStage || '',
    desiredEndState:b.desiredEndState || aiBuilder.prompt.desiredEndState || '',
    baseline:b.progressiveTargets.length ? targetLines.join('; ') : (aiBuilder.prompt.baseline || ''),
    targetOutcome:b.desiredEndState || aiBuilder.prompt.targetOutcome || '',
    constraints:b.constraints.join('\n') || aiBuilder.prompt.constraints || '',
    preferredSchedule:b.scheduleNotes || aiBuilder.prompt.preferredSchedule || '',
    existingResources:b.resourcesMentioned.join('\n') || aiBuilder.prompt.existingResources || '',
    dailyTime:b.dailyTimeAvailable || aiBuilder.prompt.dailyTime || '',
    evidenceStyle:b.evidencePreference || aiBuilder.prompt.evidenceStyle || '',
    includeTasks:[joinLines(b.knownTasks), joinLines(b.milestones), briefText].filter(Boolean).join('\n\n'),
    coreCommitments:b.coreCommitments.length ? b.coreCommitments : aiBuilder.prompt.coreCommitments,
    assumptions:b.assumptions,
    progressiveTargets:b.progressiveTargets,
    domainProfile:b.domainProfile,
    structuredResources:b.structuredResources,
    fitnessContext:b.fitnessContext,
    clarifiedBrief:b,
  };
}

function normalizeTaskMode(value, scheduleType){
  if(AI_TASK_MODES.includes(value)) return value;
  return ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval'].includes(scheduleType)
    ? 'fixed_recurring'
    : (scheduleType === 'sequential' ? 'sequential_learning' : 'one_off');
}

function normalizeScheduleType(value){
  return AI_CADENCE_TYPES.includes(value) ? value : 'once';
}

function normalizeProgressionCurve(value, taskMode){
  if(!value) return null;
  if(AI_PROGRESSION_CURVES.includes(value)) return value;
  return taskMode === 'progressive_recurring' ? 'gradual' : null;
}

function taskTitleForDay(task, day){
  return formatProgressiveTaskTitle(task, day);
}

function titleFromGoal(goal){
  const cleaned = String(goal || 'New path').replace(/^i want to\s+/i, '').trim() || 'New path';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function resourceLinksHTML(url, label){
  const safeUrl = safeExternalUrl(url);
  const title = label || url || 'Unavailable resource';
  return '<div class="rl">' + externalLinkHTML(safeUrl, title) + '</div>'
    + (safeUrl ? externalLinkHTML(safeUrl, 'open link', { className:'ext' }) : '<span class="ext invalid-link">not available</span>');
}

function normalizeGeneratedDraft(raw, prompt){
  if(!raw || typeof raw !== 'object') throw new Error('The generator returned an invalid draft.');
  const durationDays = clampDay(raw.durationDays || prompt.durationDays || 30, 30, 365);
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 12).map((s, i) => ({
    title:String(s.title || ('Section ' + (i + 1))).slice(0, 100),
    description:String(s.description || '').slice(0, 500),
    order:Number.isFinite(Number(s.order)) ? Number(s.order) : i,
  })).filter(s => s.title);
  if(!sections.length) sections.push({ title:'Foundation', description:'Start here.', order:0 });
  const sectionNames = new Set(sections.map(s => s.title));
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).slice(0, 90).map((t, i) => {
    const scheduleType = normalizeScheduleType(t.scheduleType || t.schedule);
    const startDay = clampDay(t.startDay || t.unlockDay || 1, 1, durationDays);
    const recurring = !['once', 'sequential'].includes(scheduleType);
    const endDay = recurring ? clampDay(t.endDay || durationDays, startDay, durationDays) : null;
    const unlockDay = recurring ? startDay : clampDay(t.unlockDay || t.scheduledDay || startDay, startDay, durationDays);
    const taskMode = normalizeTaskMode(t.taskMode, scheduleType);
    return {
      title:String(t.title || ('Task ' + (i + 1))).slice(0, 140),
      description:String(t.description || '').slice(0, 500),
      sectionTitle:sectionNames.has(t.sectionTitle) ? t.sectionTitle : sections[0].title,
      scheduleType,
      taskMode,
      startDay,
      endDay,
      unlockDay,
      daysOfWeek:Array.isArray(t.daysOfWeek) ? t.daysOfWeek.slice(0, 7) : [],
      timesPerWeek:nullableNumber(t.timesPerWeek),
      intervalDays:nullableNumber(t.intervalDays),
      scheduledDay:nullableNumber(t.scheduledDay) || unlockDay,
      progressionMetric:t.progressionMetric ? String(t.progressionMetric).slice(0, 80) : null,
      progressionUnit:t.progressionUnit ? String(t.progressionUnit).slice(0, 40) : null,
      startValue:nullableNumber(t.startValue),
      targetValue:nullableNumber(t.targetValue),
      progressionCurve:normalizeProgressionCurve(t.progressionCurve, taskMode),
      progressionNotes:t.progressionNotes ? String(t.progressionNotes).slice(0, 300) : null,
      evidenceRequired:!!t.evidenceRequired,
      resourceUrl:safeExternalUrl(t.resourceUrl),
      order:Number.isFinite(Number(t.order)) ? Number(t.order) : i,
    };
  }).filter(t => t.title);
  if(!tasks.length) throw new Error('The generator returned no usable tasks.');
  return {
    title:String(raw.title || titleFromGoal(prompt.goal)).slice(0, 100),
    description:String(raw.description || prompt.description || prompt.goal || '').slice(0, 1000),
    goal:String(raw.goal || prompt.goal || '').slice(0, 800),
    category:String(raw.category || prompt.pathType || '').slice(0, 80),
    durationDays,
    durationLabel:String(raw.durationLabel || (durationDays + ' days')).slice(0, 80),
    difficulty:['beginner', 'intermediate', 'advanced'].includes(raw.difficulty) ? raw.difficulty : prompt.currentLevel,
    intensity:normalizeIntensity(raw.intensity || prompt.intensity),
    previewTitle:String(raw.previewTitle || raw.title || titleFromGoal(prompt.goal)).slice(0, 100),
    previewDescription:String(raw.previewDescription || raw.description || prompt.goal || '').slice(0, 500),
    visibility:['private', 'unlisted', 'public'].includes(raw.visibility || prompt.visibility) ? (raw.visibility || prompt.visibility) : 'private',
    sections:sections.sort((a, b) => a.order - b.order),
    tasks:tasks.sort((a, b) => a.order - b.order),
    resources:(Array.isArray(raw.resources) ? raw.resources : []).slice(0, 12).map((r, i) => ({
      title:String(r.title || ('Resource ' + (i + 1))).slice(0, 100),
      url:safeExternalUrl(r.url) || '',
      description:String(r.description || '').slice(0, 300),
    })).filter(r => r.title || r.url || r.description),
    notes:(Array.isArray(raw.notes) ? raw.notes : []).map(n => String(n || '').slice(0, 300)).filter(Boolean).slice(0, 8),
    coreCommitments:normalizeCoreCommitments(raw.coreCommitments, prompt.coreCommitments),
    confirmedBrief:prompt.confirmedBrief ? normalizeConfirmedBrief(prompt.confirmedBrief) : null,
    source:raw.source || 'ai',
  };
}

function localGeneratedDraft(prompt){
  const durationDays = clampDay(prompt.durationDays || 30, 30, 365);
  const title = titleFromGoal(prompt.goal);
  const sections = [
    { title:'Foundation', description:'Set up the routine and first repeatable actions.', order:0 },
    { title:'Build', description:'Practice consistently and make visible progress.', order:1 },
    { title:'Review', description:'Reflect, ship proof, and decide the next step.', order:2 },
  ];
  const commitments = normalizeCoreCommitments(prompt.coreCommitments);
  const starterCommitments = commitments.length ? commitments : [normalizeCoreCommitment({
    id:'goal-session',
    title:'Complete a focused session toward the goal',
    description:'Use the available time for the next concrete step toward the desired outcome.',
    required:true,
    cadence:{ type:'times_per_week', timesPerWeek:3 },
    estimatedMinutes:nullableNumber(String(prompt.dailyTime || '').match(/\d+/)?.[0]) || 30,
    evidenceType:prompt.evidenceStyle || '',
    reason:'Provides a conservative repeatable starting rhythm without adding unrelated habits.',
  })];
  const tasks = starterCommitments.slice(0, 12).map((commitment, i) => ({
    title:commitment.title,
    description:commitment.description || 'Repeat this commitment during the path.',
    sectionTitle:'Foundation',
    scheduleType:commitment.cadence.type,
    taskMode:normalizeTaskMode(null, commitment.cadence.type),
    startDay:1,
    endDay:durationDays,
    unlockDay:commitment.cadence.scheduledDay || 1,
    daysOfWeek:commitment.cadence.daysOfWeek,
    timesPerWeek:commitment.cadence.timesPerWeek,
    intervalDays:commitment.cadence.intervalDays,
    scheduledDay:commitment.cadence.scheduledDay,
    progressionMetric:null,
    progressionUnit:null,
    startValue:null,
    targetValue:null,
    progressionCurve:null,
    progressionNotes:null,
    evidenceRequired:!!commitment.evidenceType || /proof|evidence|upload|log|record/i.test(prompt.evidenceStyle || ''),
    resourceUrl:null,
    order:i,
  }));
  const every = durationDays >= 90 ? 30 : durationDays >= 45 ? 15 : 7;
  for(let day = every; day < durationDays; day += every){
    tasks.push({
      title:'Review progress and adjust the next stretch',
      description:'Look at what worked, what slipped, and what needs to change.',
      sectionTitle:day > durationDays * 0.66 ? 'Review' : 'Build',
      scheduleType:'once',
      taskMode:'one_off',
      startDay:day,
      endDay:null,
      unlockDay:day,
      progressionMetric:null,
      progressionUnit:null,
      startValue:null,
      targetValue:null,
      progressionCurve:null,
      progressionNotes:null,
      evidenceRequired:false,
      resourceUrl:null,
      order:tasks.length,
    });
  }
  tasks.push({
    title:'Complete a final reflection',
    description:'Summarize progress, proof, lessons, and next steps.',
    sectionTitle:'Review',
    scheduleType:'once',
    taskMode:'one_off',
    startDay:durationDays,
    endDay:null,
    unlockDay:durationDays,
    progressionMetric:null,
    progressionUnit:null,
    startValue:null,
    targetValue:null,
    progressionCurve:null,
    progressionNotes:null,
    evidenceRequired:true,
    resourceUrl:null,
    order:tasks.length,
  });
  return normalizeGeneratedDraft({
    title,
    description:prompt.description || prompt.goal,
    goal:prompt.goal,
    category:prompt.pathType,
    durationDays,
    durationLabel:durationDays + ' days',
    difficulty:prompt.currentLevel,
    intensity:normalizeIntensity(prompt.intensity),
    previewTitle:title,
    previewDescription:prompt.description || prompt.goal,
    sections,
    tasks,
    resources:String(prompt.resourceLinks || '').split(/\s+/).filter(x => /^https?:\/\//i.test(x)).map((url, i) => ({ title:'Resource ' + (i + 1), url, description:'' })),
    notes:['Basic starter template. Review and edit before saving.'].concat(['fitness', 'challenge'].includes(prompt.pathType) ? ['Adapt intensity to your health, ability, and professional guidance where needed.'] : []),
    coreCommitments:starterCommitments,
    source:'fallback',
  }, prompt);
}

function aiDraftToLocalPath(draft){
  const confirmed = normalizeGoalBrief(draft.confirmedBrief || {});
  const sections = draft.sections.length ? draft.sections : [{ title:'Foundation', description:'', order:0 }];
  const weeks = sections.map(section => ({
    title:section.title,
    description:section.description || '',
    tasks:[],
    resources:[],
  }));
  const indexByTitle = {};
  sections.forEach((section, i) => { indexByTitle[section.title] = i; });
  (draft.tasks || []).forEach(task => {
    const i = indexByTitle[task.sectionTitle] == null ? 0 : indexByTitle[task.sectionTitle];
    weeks[i].tasks.push({
      text:task.title,
      description:task.description || '',
      resourceUrl:task.resourceUrl || null,
      scheduleType:task.scheduleType,
      taskMode:task.taskMode || null,
      startDay:task.startDay == null ? null : Number(task.startDay),
      endDay:task.endDay == null ? null : Number(task.endDay),
      unlockDay:task.unlockDay == null ? null : Number(task.unlockDay),
      progressionMetric:task.progressionMetric || null,
      progressionUnit:task.progressionUnit || null,
      startValue:task.startValue == null ? null : Number(task.startValue),
      targetValue:task.targetValue == null ? null : Number(task.targetValue),
      progressionCurve:task.progressionCurve || null,
      progressionNotes:task.progressionNotes || null,
      daysOfWeek:Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [],
      timesPerWeek:task.timesPerWeek == null ? null : Number(task.timesPerWeek),
      intervalDays:task.intervalDays == null ? null : Number(task.intervalDays),
      scheduledDay:task.scheduledDay == null ? null : Number(task.scheduledDay),
      evidenceRequired:!!task.evidenceRequired,
    });
  });
  (draft.resources || []).forEach(resource => {
    weeks[0].resources.push({ label:resource.title || resource.url, url:resource.url || '', description:resource.description || '' });
  });
  return {
    title:draft.title,
    goal:draft.goal,
    description:draft.description,
    category:draft.category,
    durationDays:clampDay(draft.durationDays, 1, 365),
    durationLabel:draft.durationLabel || (draft.durationDays + ' days'),
    intensity:normalizeIntensity(draft.intensity || confirmed.intensity),
    domainProfile:confirmed.domainProfile,
    structuredResources:confirmed.structuredResources,
    fitnessContext:confirmed.fitnessContext,
    creatorName:store.currentUser ? (store.currentUser.displayName || (store.currentUser.email || '').split('@')[0]) : '',
    creatorId:store.currentUser?.uid || '',
    creatorEmail:store.currentUser?.email || '',
    coreCommitments:normalizeCoreCommitments(draft.coreCommitments),
    aiBrief:draft.confirmedBrief ? confirmed : null,
    visibility:draft.visibility || 'private',
    discoverable:false,
    previewEnabled:true,
    previewTitle:draft.previewTitle || draft.title,
    previewDescription:draft.previewDescription || draft.description || draft.goal,
    previewIncludesScheme:false,
    coverImage:null,
    profileImage:null,
    created:Date.now(),
    weeks,
  };
}

function openAIPathBuilder(){
  if(configPresent() && !store.currentUser){
    openAuthModal('signup');
    return;
  }
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay ai-builder-overlay';
  document.body.appendChild(overlay);
  const triggerElement = document.activeElement;
  aiBuilder = {
    overlay,
    mode:'guided',
    phase:'goal',
    prompt:aiPromptDefaults(),
    draft:null,
    loading:false,
    clarifyLoading:false,
    error:'',
    errorRequestId:'',
    message:'',
    brief:null,
    clarifyingAnswers:{},
    clarificationIndex:0,
    clarificationRound:0,
    requests:createAIRequestState(),
    voice:makeVoiceInputState(),
    saving:false,
    dirty:false,
    advancedOpen:false,
    fullRoadmap:false,
    briefEditSection:'',
    summaryOpen:false,
    saveOptions:{ visibility:'private' },
    savedPathId:null,
    savedPath:null,
    staleFields:[],
    exampleIndex:0,
    exampleRotationStopped:false,
    triggerElement,
  };
  overlay.addEventListener('click', e => { if(e.target === overlay) requestCloseAIBuilder(); });
  document.addEventListener('keydown', handleAIBuilderKeydown);
  renderAIBuilder();
}

function closeAIBuilder(){
  const builder = aiBuilder;
  abortAIRequest(null, builder);
  stopAIProcessingTicker();
  stopAIExampleRotation(false);
  cleanupInlineVoiceInput();
  document.removeEventListener('keydown', handleAIBuilderKeydown);
  if(builder?.overlay) builder.overlay.remove();
  aiBuilder = null;
  if(builder?.triggerElement?.focus) builder.triggerElement.focus();
}

function builderHasMeaningfulWork(builder = aiBuilder){
  return !!(builder?.prompt?.goal?.trim() || builder?.brief || builder?.draft);
}

function requestCloseAIBuilder(){
  if(!aiBuilder || aiBuilder.saving || hasActiveAIRequest(aiBuilder.requests) || voiceIsActive(aiBuilder.voice)) return;
  if(aiBuilder.phase !== 'ready' && builderHasMeaningfulWork(aiBuilder) && !confirm('Close path creation and discard this unsaved work?')) return;
  closeAIBuilder();
}

function handleAIBuilderKeydown(event){
  if(!aiBuilder?.overlay) return;
  if(event.key === 'Escape'){
    event.preventDefault();
    requestCloseAIBuilder();
    return;
  }
  if(event.key !== 'Tab') return;
  const focusable = [...aiBuilder.overlay.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.hidden && element.offsetParent !== null);
  if(!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if(event.shiftKey && document.activeElement === first){ event.preventDefault(); last.focus(); }
  else if(!event.shiftKey && document.activeElement === last){ event.preventDefault(); first.focus(); }
}

function focusAIBuilderStep(){
  requestAnimationFrame(() => {
    const target = aiBuilder?.overlay?.querySelector('[data-ai-autofocus], #aiStepHeading');
    if(target?.focus) target.focus({ preventScroll:true });
  });
}

function collectAIPrompt(){
  const value = (id, fallback = '') => {
    const field = $(id);
    return field ? String(field.value || '').trim() : fallback;
  };
  aiBuilder.prompt = {
    ...aiBuilder.prompt,
    goal:value('aiGoal', aiBuilder.prompt.goal || ''),
    durationDays:$('aiDuration') ? ($('aiDuration').value ? clampDay($('aiDuration').value, 30, 365) : null) : aiBuilder.prompt.durationDays,
    deadline:value('aiDeadline', aiBuilder.prompt.deadline || ''),
    currentLevel:value('aiLevel', aiBuilder.prompt.currentLevel || ''),
    currentStage:value('aiCurrentStage', aiBuilder.prompt.currentStage || ''),
    desiredEndState:value('aiDesiredEndState', aiBuilder.prompt.desiredEndState || ''),
    baseline:value('aiBaseline', aiBuilder.prompt.baseline || ''),
    targetOutcome:value('aiTargetOutcome', aiBuilder.prompt.targetOutcome || ''),
    constraints:value('aiConstraints', aiBuilder.prompt.constraints || ''),
    preferredSchedule:value('aiPreferredSchedule', aiBuilder.prompt.preferredSchedule || ''),
    existingResources:value('aiExistingResources', aiBuilder.prompt.existingResources || ''),
    intensity:value('aiIntensity', aiBuilder.prompt.intensity || ''),
    pathType:value('aiType', aiBuilder.prompt.pathType || 'auto') || 'auto',
    resourceLinks:value('aiResources', aiBuilder.prompt.resourceLinks || ''),
    dailyTime:value('aiDailyTime', aiBuilder.prompt.dailyTime || ''),
    evidenceStyle:value('aiEvidenceStyle', aiBuilder.prompt.evidenceStyle || ''),
    includeTasks:value('aiInclude', aiBuilder.prompt.includeTasks || ''),
    excludeTasks:value('aiExclude', aiBuilder.prompt.excludeTasks || ''),
    visibility:value('aiVisibility', aiBuilder.saveOptions?.visibility || aiBuilder.prompt.visibility || 'private') || 'private',
    description:value('aiDescription', aiBuilder.prompt.description || ''),
    coreCommitments:normalizeCoreCommitments(aiBuilder.prompt.coreCommitments),
    assumptions:aiBuilder.brief?.assumptions || [],
    progressiveTargets:aiBuilder.brief?.progressiveTargets || [],
    clarifiedBrief:aiBuilder.brief || null,
  };
  return aiBuilder.prompt;
}

function validateAIBuilderInputs(){
  const durationInputs = [
    $('aiDuration'),
    aiBuilder?.overlay?.querySelector('.ai-brief-field[data-key="durationDays"]'),
  ].filter(Boolean);
  for(const input of durationInputs){
    if(input.value === '') continue;
    const duration = Number(input.value);
    if(!Number.isFinite(duration) || duration < 1 || duration > 365){
      input.focus();
      return 'Duration must be between 1 and 365 days.';
    }
  }
  const emptyCommitment = [...(aiBuilder?.overlay?.querySelectorAll('.ai-commitment-field[data-key="title"]') || [])]
    .find(input => !input.value.trim());
  if(emptyCommitment && !emptyCommitment.value.trim()){
    emptyCommitment.focus();
    return 'Each Core commitment needs a title. Add a title or remove the empty commitment.';
  }
  const phase55Message = aiBuilder?.brief ? firstPhase55ValidationMessage(aiBuilder.brief) : '';
  if(phase55Message) return phase55Message;
  return '';
}

function validateMeaningfulGoal(){
  const goal = ($('aiGoal')?.value || aiBuilder?.prompt?.goal || '').trim();
  if(!isMeaningfulAIGoal(goal)){
    const input = $('aiGoal');
    if(input) input.focus();
    return 'Describe what you want to achieve before building with AI.';
  }
  return '';
}

function canStartBuilderAction(){
  return canStartAIRequest(aiBuilder) && !voiceIsActive(aiBuilder?.voice);
}

function aiInterpretationError(error){
  if(error?.code === 'unauthorized') return 'Your session has expired. Sign in again to continue.';
  if(error?.code === 'rate_limited') return 'You have reached the current AI usage limit. Your brief is saved. Try again later.';
  if(error?.code === 'server_function_failed') return SERVER_FUNCTION_FAILED_MESSAGE;
  if(error?.code === 'invalid_server_response') return 'The server returned an unreadable response. Your goal is still saved. Try again.';
  if(['operation_timeout', 'provider_timeout'].includes(error?.code)) return 'The AI request took too long and was cancelled. Your information is still saved.';
  if(['invalid_goal_brief', 'invalid_ai_json', 'missing_tool_use', 'empty_ai_response', 'invalid_provider_response'].includes(error?.code)){
    return 'The AI returned an incomplete goal brief. Please retry.';
  }
  if(error?.code === 'provider_unavailable') return 'The AI service is temporarily unavailable. Try again, or use Basic starter.';
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return 'Build with AI requires a connection. Your goal is still saved, and Basic starter remains available.';
  if(error instanceof TypeError) return 'Build with AI requires a connection. Your goal is still saved, and Basic starter remains available.';
  return error?.message || 'We could not understand your goal. Your answers are still saved. Try again.';
}

function cleanupInlineVoiceInput(){
  cleanupLiveVoiceSession();
  if(aiBuilder?.voice) aiBuilder.voice = makeVoiceInputState();
}

function applyVoiceError(code, fallback = '', patch = {}){
  const mapped = mapVoiceError(code, fallback);
  aiBuilder.voice = makeVoiceInputState({
    ...aiBuilder.voice,
    ...patch,
    phase:'error',
    errorCode:mapped.code,
    errorMessage:mapped.message,
    retryable:mapped.retryable,
    statusMessage:'Transcription failed',
  });
}

async function startInlineVoiceInput(field){
  const builder = aiBuilder;
  if(!builder || !field || !canStartAIRequest(builder) || voiceIsActive(builder.voice)) return;
  const token = 'voice_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  const target = voiceTargetFromField(field);
  const updateVoiceOnly = (patch = {}) => {
    if(aiBuilder !== builder || builder.voice.requestToken !== token) return;
    builder.voice = makeVoiceInputState({ ...builder.voice, ...patch });
    updateVoiceControlForField(field, builder.voice);
    updateVoiceMetrics(builder.overlay, builder.voice);
    updateVoiceInterim(builder.overlay, builder.voice);
  };
  builder.voice = makeVoiceInputState({
    ...target,
    builderSessionId:builder.sessionId,
    baseText:field.value || '',
    phase:'requesting_permission',
    requestToken:token,
    statusMessage:'Requesting microphone access',
  });
  updateVoiceControlForField(field, builder.voice);
  try{
    await startLiveVoiceSession({
      targetElement:field,
      target,
      builderSessionId:builder.sessionId,
      requestToken:token,
      requestTokenGrant:async ({ sessionId }) => {
        const res = await authFetch('/api/deepgram-token', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'X-Voice-Session-Id':sessionId },
          body:JSON.stringify({ sessionId }),
        });
        const payload = await parseAIResponse(res);
        if(!res.ok || !payload.ok) throw errorFromAIPayload(payload, 'Live transcription could not start.');
        return { accessToken:payload.accessToken, expiresIn:payload.expiresIn, requestId:payload.requestId };
      },
      transcribeFallback:async ({ blob, mimeType, sessionId }) => {
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, VOICE_TRANSCRIBE_TIMEOUT_MS);
        let res;
        try{
          res = await authFetch('/api/transcribe-voice', {
            method:'POST',
            headers:{
              'Content-Type':mimeType || blob.type || 'audio/webm',
              'X-File-Name':'voice-recording',
              'X-Voice-Session-Id':sessionId,
            },
            body:blob,
            signal:controller.signal,
          });
        }catch(error){
          if(timedOut){
            const timeoutError = new Error('The request took too long and was cancelled.');
            timeoutError.code = 'operation_timeout';
            throw timeoutError;
          }
          throw error;
        }finally{
          clearTimeout(timer);
        }
        const payload = await parseAIResponse(res);
        if(!res.ok || !payload.ok) throw errorFromAIPayload(payload, 'Voice transcription failed.');
        return payload;
      },
      callbacks:{
        onPhase:update => updateVoiceOnly(update),
        onMetrics:update => {
          if(aiBuilder !== builder || builder.voice.requestToken !== token) return;
          builder.voice = makeVoiceInputState({ ...builder.voice, ...update });
          updateVoiceMetrics(builder.overlay, builder.voice);
        },
        onVoiceLevel:level => updateVoiceWaveform(builder.overlay, builder.voice.targetId, level),
        onTranscriptPatch:update => {
          if(aiBuilder !== builder || builder.voice.requestToken !== token) return;
          builder.voice = makeVoiceInputState({
            ...builder.voice,
            interimTranscript:update.interimTranscript || '',
            visibleSessionTranscript:update.visibleSessionTranscript || '',
            phase:builder.voice.phase,
          });
          updateVoiceInterim(builder.overlay, builder.voice);
          if(update.final) syncVoiceFieldToBuilder(field);
        },
        onDone:() => {
          if(aiBuilder !== builder || builder.voice.requestToken !== token) return;
          syncVoiceFieldToBuilder(field);
          field.readOnly = false;
          suppressNextAIBuilderFocus = true;
          builder.voice = makeVoiceInputState({ statusMessage:'Transcript added' });
          updateVoiceControlForField(field, builder.voice);
        },
        onCancel:() => {
          if(aiBuilder !== builder) return;
          syncVoiceFieldToBuilder(field);
          builder.voice = makeVoiceInputState();
          updateVoiceControlForField(field, builder.voice);
        },
        onError:error => {
          if(aiBuilder !== builder) return;
          const mapped = mapVoiceError(error?.code || 'voice_failed', error?.message);
          builder.voice = makeVoiceInputState({
            ...builder.voice,
            phase:'error',
            errorCode:mapped.code,
            errorMessage:mapped.message,
            retryable:mapped.retryable,
            blob:mapped.retryable ? error?.blob || null : null,
            statusMessage:'Voice failed',
          });
          updateVoiceControlForField(field, builder.voice);
        },
      },
    });
  }catch(error){
    if(aiBuilder === builder && builder.voice.requestToken === token){
      applyVoiceError(error?.code || error?.name || 'not_readable', error?.message);
      updateVoiceControlForField(field, builder.voice);
    }
  }
}

function stopInlineVoiceInput(){
  if(!voiceIsActive(aiBuilder?.voice)) return;
  stopLiveVoiceSession('manual');
}

function cancelInlineVoiceInput(){
  if(voiceIsActive(aiBuilder?.voice)) cancelLiveVoiceSession();
  abortAIRequest('voice', aiBuilder);
  const field = aiBuilder?.voice?.targetId ? $(aiBuilder.voice.targetId) : null;
  if(aiBuilder) aiBuilder.voice = makeVoiceInputState();
  if(field) updateVoiceControlForField(field, aiBuilder.voice);
}

async function retryInlineVoiceInput(){
  const field = aiBuilder?.voice?.targetId ? $(aiBuilder.voice.targetId) : null;
  const blob = aiBuilder?.voice?.blob;
  if(!field || !blob) return;
  await transcribeInlineVoiceFallback(field, blob, aiBuilder.voice.mimeType || blob.type || 'audio/webm');
}

function clearInlineVoiceInput(){
  const field = aiBuilder?.voice?.targetId ? $(aiBuilder.voice.targetId) : null;
  if(aiBuilder) aiBuilder.voice = makeVoiceInputState();
  if(field) updateVoiceControlForField(field, aiBuilder.voice);
}

function handleBuilderVoiceAction(event){
  const button = event.target?.closest?.('[data-voice-action]');
  if(!button || !aiBuilder?.overlay?.contains(button)) return;
  event.preventDefault();
  const action = button.dataset.voiceAction;
  if(action === 'start'){
    stopAIExampleRotation(true);
    const field = button.closest('.voice-field')?.querySelector('input, textarea');
    if(field) void startInlineVoiceInput(field);
  }
  if(action === 'stop') stopInlineVoiceInput();
  if(action === 'cancel') cancelInlineVoiceInput();
  if(action === 'retry') void retryInlineVoiceInput();
  if(action === 'clear') clearInlineVoiceInput();
}

function syncVoiceFieldToBuilder(field){
  if(!field) return;
  field.dispatchEvent(new Event('input', { bubbles:true }));
}

async function transcribeInlineVoiceFallback(field, blob, mimeType){
  const builder = aiBuilder;
  const voice = builder?.voice;
  if(!builder || !blob || !field) return;
  const request = beginAIClientRequest(builder, 'voice');
  builder.voice = makeVoiceInputState({ ...voice, phase:'fallback_transcribing', statusMessage:'Transcribing fallback' });
  updateVoiceControlForField(field, builder.voice);
  try{
    const res = await authenticatedAIRequest(request, '/api/transcribe-voice', {
      method:'POST',
      headers:{
        'Content-Type':mimeType || 'audio/webm',
        'X-File-Name':'voice-recording',
      },
      body:blob,
    }, VOICE_TRANSCRIBE_TIMEOUT_MS);
    const payload = await parseAIResponse(res);
    if(!res.ok || !payload.ok) throw errorFromAIPayload(payload, 'Voice transcription failed.');
    if(!aiRequestIsCurrent(request) || aiBuilder !== builder) return;
    field.value = payload.transcript || field.value;
    syncVoiceFieldToBuilder(field);
    field.focus({ preventScroll:true });
    suppressNextAIBuilderFocus = true;
    builder.voice = makeVoiceInputState({ statusMessage:'Transcript added' });
    updateVoiceControlForField(field, builder.voice);
  }catch(error){
    if(aiRequestIsCurrent(request) && aiBuilder === builder){
      const mapped = mapVoiceError(error.code, error.message);
      builder.voice = makeVoiceInputState({
        ...builder.voice,
        phase:'error',
        errorCode:mapped.code,
        errorMessage:mapped.message,
        retryable:mapped.retryable,
        blob:mapped.retryable ? blob : null,
        statusMessage:'Transcription failed',
      });
      updateVoiceControlForField(field, builder.voice);
    }
  }finally{
    finishAIClientRequest(request);
  }
}

function cadenceFieldsHTML(commitment, scope, index){
  const cadence = commitment.cadence || {};
  const prefix = 'ai-' + scope + '-commitment-' + index;
  if(cadence.type === 'selected_days'){
    return '<div class="field"><label for="' + prefix + '-days">Days of week</label><input id="' + prefix + '-days" name="' + prefix + '-days" class="ai-commitment-cadence" data-scope="' + scope + '" data-i="' + index + '" data-key="daysOfWeek" value="' + esc((cadence.daysOfWeek || []).join(', ')) + '" placeholder="mon, wed, fri"/></div>';
  }
  if(cadence.type === 'times_per_week'){
    return '<div class="field"><label for="' + prefix + '-times">Times per week</label><input id="' + prefix + '-times" name="' + prefix + '-times" type="number" min="1" max="7" class="ai-commitment-cadence" data-scope="' + scope + '" data-i="' + index + '" data-key="timesPerWeek" value="' + esc(cadence.timesPerWeek || '') + '"/></div>';
  }
  if(cadence.type === 'interval'){
    return '<div class="field"><label for="' + prefix + '-interval">Every N days</label><input id="' + prefix + '-interval" name="' + prefix + '-interval" type="number" min="1" max="365" class="ai-commitment-cadence" data-scope="' + scope + '" data-i="' + index + '" data-key="intervalDays" value="' + esc(cadence.intervalDays || '') + '"/></div>';
  }
  if(['once', 'sequential'].includes(cadence.type)){
    return '<div class="field"><label for="' + prefix + '-day">Scheduled day</label><input id="' + prefix + '-day" name="' + prefix + '-day" type="number" min="1" max="365" class="ai-commitment-cadence" data-scope="' + scope + '" data-i="' + index + '" data-key="scheduledDay" value="' + esc(cadence.scheduledDay || '') + '"/></div>';
  }
  return '';
}

function commitmentRowHTML(commitment, scope, index){
  const c = normalizeCoreCommitment(commitment, index);
  const prefix = 'ai-' + scope + '-commitment-' + index;
  return '<div class="ai-commitment-row">'
    + '<div class="ai-review-head"><b>Commitment ' + (index + 1) + '</b><button id="' + prefix + '-remove" name="' + prefix + '-remove" type="button" class="icon-btn danger" data-commitment-action="remove" data-scope="' + scope + '" data-i="' + index + '" aria-label="Remove commitment ' + (index + 1) + '">x</button></div>'
    + '<div class="ai-grid">'
    + '<div class="field"><label for="' + prefix + '-title">Title</label><input id="' + prefix + '-title" name="' + prefix + '-title" class="ai-commitment-field" data-scope="' + scope + '" data-i="' + index + '" data-key="title" value="' + esc(c.title) + '"/></div>'
    + '<div class="field"><label for="' + prefix + '-cadence">How often?</label><select id="' + prefix + '-cadence" name="' + prefix + '-cadence" class="ai-commitment-field" data-scope="' + scope + '" data-i="' + index + '" data-key="cadenceType">' + naturalCadenceOptions(c.cadence.type) + '</select></div>'
    + cadenceFieldsHTML(c, scope, index)
    + '<div class="field"><label for="' + prefix + '-minutes">Estimated minutes</label><input id="' + prefix + '-minutes" name="' + prefix + '-minutes" type="number" min="0" max="1440" class="ai-commitment-field" data-scope="' + scope + '" data-i="' + index + '" data-key="estimatedMinutes" value="' + esc(c.estimatedMinutes == null ? '' : c.estimatedMinutes) + '"/></div>'
    + '<div class="field"><label for="' + prefix + '-evidence">Evidence type</label><input id="' + prefix + '-evidence" name="' + prefix + '-evidence" class="ai-commitment-field" data-scope="' + scope + '" data-i="' + index + '" data-key="evidenceType" value="' + esc(c.evidenceType) + '" placeholder="reflection, URL, run log..."/></div>'
    + '</div>'
    + '<div class="field"><label for="' + prefix + '-description">Description</label><textarea id="' + prefix + '-description" name="' + prefix + '-description" class="ai-commitment-field" data-scope="' + scope + '" data-i="' + index + '" data-key="description">' + esc(c.description) + '</textarea></div>'
    + '<div class="field"><label for="' + prefix + '-reason">Why this matters</label><textarea id="' + prefix + '-reason" name="' + prefix + '-reason" class="ai-commitment-field" data-scope="' + scope + '" data-i="' + index + '" data-key="reason">' + esc(c.reason) + '</textarea></div>'
    + '<label class="checkline" for="' + prefix + '-required"><input id="' + prefix + '-required" name="' + prefix + '-required" type="checkbox" class="ai-commitment-field" data-scope="' + scope + '" data-i="' + index + '" data-key="required" ' + (c.required ? 'checked' : '') + '/> Required</label>'
    + '</div>';
}

function commitmentsHTML(commitments, scope){
  const items = (Array.isArray(commitments) ? commitments : []).map((item, index) => normalizeCoreCommitment(item, index));
  return '<div class="ai-commitments" data-commitment-scope="' + scope + '">'
    + (items.length ? items.map((item, index) => commitmentRowHTML(item, scope, index)).join('') : '<div class="hint">No commitments added yet.</div>')
    + '<button id="ai-' + scope + '-add-commitment" name="ai-' + scope + '-add-commitment" class="add-link" type="button" data-commitment-action="add" data-scope="' + scope + '">+ Add commitment</button></div>';
}

function naturalCadenceOptions(selected){
  const labels = {
    daily:'Every day', weekdays:'Weekdays', selected_days:'Specific days',
    times_per_week:'A number of times each week', weekly:'Once each week',
    interval:'Every few days', once:'One time', sequential:'In sequence',
  };
  return AI_CADENCE_TYPES.map(value => '<option value="' + esc(value) + '" ' + (value === selected ? 'selected' : '') + '>' + esc(labels[value]) + '</option>').join('');
}

function wizardProgressHTML(){
  const current = creationStageForPhase(aiBuilder.phase);
  return '<ol class="ai-stage-progress" aria-label="Path creation progress">' + AI_GUIDED_STAGES.map(stage => {
    const currentIndex = AI_GUIDED_STAGES.indexOf(current);
    const stageIndex = AI_GUIDED_STAGES.indexOf(stage);
    const state = stage === current ? 'current' : (stageIndex < currentIndex ? 'done' : 'upcoming');
    return '<li class="' + state + '" ' + (stage === current ? 'aria-current="step"' : '') + '><span></span>' + esc(stage) + '</li>';
  }).join('') + '</ol>';
}

function guidedSummaryHTML(){
  const brief = aiBuilder.brief ? normalizeGoalBrief(aiBuilder.brief) : null;
  const commitments = brief?.coreCommitments || aiBuilder.draft?.coreCommitments || [];
  if(!brief && !aiBuilder.draft) return '';
  return '<aside class="ai-wizard-summary" aria-label="Path brief so far">'
    + '<div class="ai-summary-head"><b>Path brief so far</b><button class="linklike" id="aiToggleSummary" type="button">' + (aiBuilder.summaryOpen ? 'Hide' : 'View') + '</button></div>'
    + '<div class="ai-summary-body ' + (aiBuilder.summaryOpen ? 'open' : '') + '">'
    + '<span class="ai-summary-label">Goal</span><p>' + esc(brief?.goal || aiBuilder.draft?.goal || aiBuilder.prompt.goal) + '</p>'
    + (brief?.durationDays || aiBuilder.draft?.durationDays ? '<span class="ai-summary-label">Duration</span><p>' + esc(brief?.durationDays || aiBuilder.draft.durationDays) + ' days</p>' : '')
    + (brief?.intensity || aiBuilder.draft?.intensity ? '<span class="ai-summary-label">Intensity</span><p>' + esc((brief?.intensity || aiBuilder.draft.intensity || 'balanced').replace(/^\w/, c => c.toUpperCase())) + '</p>' : '')
    + (commitments.length ? '<span class="ai-summary-label">Core Commitments</span><ul>' + commitments.slice(0, 4).map((item, index) => '<li>' + esc(commitmentSummary(item, index).title) + '</li>').join('') + '</ul>' : '')
    + '</div></aside>';
}

function aiErrorDiagnosticHTML(){
  return aiBuilder.errorRequestId
    ? '<div class="ai-error-diagnostic">Request ID: ' + esc(aiBuilder.errorRequestId) + '</div>'
    : '';
}

function guidedShellHTML(content, actions = ''){
  const summary = guidedSummaryHTML();
  return '<div class="modal-box ai-modal guided-builder" role="dialog" aria-modal="true" aria-labelledby="aiStepHeading">'
    + '<div class="modal-head ai-wizard-head"><div><span class="ai-builder-kicker">Create a path</span>' + wizardProgressHTML() + '</div><button class="modal-x" type="button" aria-label="Close path creation">x</button></div>'
    + '<div class="modal-body ai-wizard-body"><div class="ai-wizard-layout"><main class="ai-wizard-main">'
    + (aiBuilder.message ? '<div class="ai-note" role="status">' + esc(aiBuilder.message) + '</div>' : '')
    + (aiBuilder.error ? '<div class="form-error" role="alert">' + esc(aiBuilder.error) + aiErrorDiagnosticHTML() + '</div>' : '')
    + content + '</main>' + summary + '</div></div>'
    + (actions ? '<div class="ai-wizard-actions">' + actions + '</div>' : '') + '</div>';
}

function goalStepHTML(){
  const busy = hasActiveAIRequest(aiBuilder.requests) || voiceIsActive(aiBuilder.voice);
  const hasGoalText = !!(aiBuilder.prompt.goal || '').trim();
  const placeholder = userPrefersReducedMotion()
    ? AI_ROTATING_GOAL_EXAMPLES[0]
    : AI_ROTATING_GOAL_EXAMPLES[Number(aiBuilder.exampleIndex || 0) % AI_ROTATING_GOAL_EXAMPLES.length];
  const content = '<section class="ai-step ai-goal-step"><h2 id="aiStepHeading" tabindex="-1">What do you want to achieve?</h2>'
    + '<p class="ai-step-copy">Start in your own words. The next questions will focus only on details that change the plan.</p>'
    + '<div class="field ai-goal-field"><label for="aiGoal">Your goal</label><textarea id="aiGoal" name="aiGoal" data-voice-enabled="true" data-voice-label="goal" placeholder="' + esc(placeholder) + '">' + esc(aiBuilder.prompt.goal) + '</textarea></div>'
    + '<div class="ai-example-list" aria-label="Goal suggestions">' + AI_GOAL_SUGGESTIONS.map(example => '<button class="ai-example" type="button" data-goal-suggestion="' + esc(example) + '" aria-label="Use suggestion: ' + esc(example) + '" ' + (hasGoalText ? 'disabled aria-disabled="true"' : 'aria-disabled="false"') + '>' + esc(example) + '</button>').join('') + '</div>'
    + (hasGoalText ? '<p class="hint">Clear the goal field before choosing a suggestion so your text is not overwritten.</p>' : '')
    + '</section>';
  const actions = '<button class="btn" id="aiBasic" type="button" ' + (busy ? 'disabled' : '') + '>Basic starter</button>'
    + '<button class="btn gold" id="aiBuild" type="button" ' + (busy ? 'disabled' : '') + '>Build with AI</button>';
  return guidedShellHTML(content, actions);
}

function processingStepHTML(kind){
  const messages = kind === 'generating'
    ? ['Designing your progression...', 'Building your Core Commitments...', 'Structuring your milestones...', 'Preparing your first week...', 'Finalising your roadmap...']
    : ['Understanding your goal...', 'Identifying what matters most...', 'Checking whether anything important is missing...', 'Preparing your recommendations...'];
  const index = Math.min(messages.length - 1, Number(aiBuilder.processingMessageIndex || 0));
  const heading = kind === 'generating' ? 'Building your roadmap' : 'Understanding your goal';
  const content = '<section class="ai-step ai-processing" role="status" aria-live="polite"><div class="ai-processing-mark" aria-hidden="true"><span></span><span></span><span></span></div>'
    + '<h2 id="aiStepHeading" tabindex="-1">' + heading + '</h2><p id="aiProcessingMessage">' + esc(messages[index]) + '</p><p class="hint">Your information stays here if the request needs to be retried.</p></section>';
  return guidedShellHTML(content, '<button class="btn" id="aiCancel" type="button">Cancel request</button>');
}

function questionControlHTML(question){
  const saved = aiBuilder.clarifyingAnswers[question.id] || {};
  const selected = new Set(Array.isArray(saved.selected) ? saved.selected : (saved.selected ? [saved.selected] : []));
  const type = question.type;
  if(['single_select', 'multi_select', 'yes_no', 'days_of_week'].includes(type)){
    let options = question.options;
    if(type === 'yes_no' && !options.length) options = [{id:'yes',label:'Yes',value:'Yes'},{id:'no',label:'No',value:'No'}];
    if(type === 'days_of_week' && !options.length) options = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day => ({id:day.toLowerCase(),label:day,value:day}));
    const multiple = ['multi_select', 'days_of_week'].includes(type);
    return '<fieldset class="ai-option-grid"><legend class="sr-only">' + esc(question.prompt) + '</legend>'
      + options.map(option => '<label class="ai-option-card"><input type="' + (multiple ? 'checkbox' : 'radio') + '" name="aiQuestionChoice" value="' + esc(option.id) + '" data-question-choice ' + (selected.has(option.id) ? 'checked' : '') + '/><span><b>' + esc(option.label) + '</b></span></label>').join('')
      + (question.allowCustomAnswer ? '<label class="ai-option-card custom"><input type="' + (multiple ? 'checkbox' : 'radio') + '" name="aiQuestionChoice" value="__custom" data-question-choice ' + (saved.custom ? 'checked' : '') + '/><span><b>Write my own answer</b></span></label>' : '')
      + '</fieldset>'
      + (question.allowCustomAnswer ? '<div class="field ai-custom-answer"><label for="aiQuestionCustom">Custom answer</label><textarea id="aiQuestionCustom" placeholder="Write the detail that best fits you.">' + esc(saved.custom || '') + '</textarea></div>' : '');
  }
  if(type === 'resource'){
    return '<div class="ai-resource-question"><div class="field"><label for="aiQuestionResourceTitle">Resource title</label><input id="aiQuestionResourceTitle" value="' + esc(saved.title || '') + '" placeholder="Course, book or plan"/></div>'
      + '<div class="field"><label for="aiQuestionResourceUrl">Resource URL</label><input id="aiQuestionResourceUrl" type="url" value="' + esc(saved.url || '') + '" placeholder="https://..."/></div>'
      + '<div class="field"><label for="aiQuestionResourceNote">Optional note</label><textarea id="aiQuestionResourceNote">' + esc(saved.note || '') + '</textarea></div></div>';
  }
  const inputType = type === 'date' ? 'date' : (['number', 'duration'].includes(type) ? 'number' : 'text');
  const tag = type === 'long_text' ? 'textarea' : 'input';
  const attrs = tag === 'input' ? ' type="' + inputType + '" value="' + esc(saved.value || '') + '"' : '';
  return '<div class="field"><label for="aiQuestionAnswer">Your answer</label><' + tag + ' id="aiQuestionAnswer"' + attrs + ' placeholder="' + (type === 'time_availability' ? 'For example, 30 minutes on weekdays' : 'Your answer') + '">' + (tag === 'textarea' ? esc(saved.value || '') : '') + '</' + tag + '></div>';
}

function clarificationStepHTML(){
  const questions = normalizeClarifyingQuestions(aiBuilder.brief?.clarifyingQuestions || []);
  const index = Math.min(aiBuilder.clarificationIndex || 0, Math.max(0, questions.length - 1));
  const question = questions[index];
  if(!question) return rhythmStepHTML();
  const content = '<section class="ai-step ai-question-step"><div class="ai-question-count">Question ' + (index + 1) + ' of ' + questions.length + '</div>'
    + '<h2 id="aiStepHeading" tabindex="-1">' + esc(question.prompt) + '</h2>'
    + (question.supportingText || question.reason ? '<p class="ai-step-copy">' + esc(question.supportingText || question.reason) + '</p>' : '')
    + questionControlHTML(question) + '</section>';
  const disabled = voiceIsActive(aiBuilder.voice) ? 'disabled' : '';
  const actions = '<button class="btn" id="aiQuestionBack" type="button" ' + disabled + '>Back</button><button class="btn gold" id="aiQuestionContinue" type="button" ' + disabled + '>' + (index === questions.length - 1 ? 'Continue' : 'Next question') + '</button>';
  return guidedShellHTML(content, actions);
}

function rhythmAdvancedHTML(brief){
  return '<div class="ai-advanced-panel" id="aiAdvancedPanel"><div class="ai-grid">'
    + '<div class="field"><label for="aiDuration">How many days?</label><input id="aiDuration" type="number" min="1" max="365" value="' + esc(brief.durationDays || '') + '"/></div>'
    + '<div class="field"><label for="aiDailyTime">How much time is available?</label><input id="aiDailyTime" value="' + esc(brief.dailyTimeAvailable || '') + '" placeholder="30 minutes on weekdays"/></div></div>'
    + '<div class="field"><label for="aiEvidenceStyle">How will you track progress?</label><input id="aiEvidenceStyle" value="' + esc(brief.evidencePreference || '') + '" placeholder="Reflection, URL, photo or activity log"/></div>'
    + '<div class="field"><label for="aiConstraints">What should the plan work around?</label><textarea id="aiConstraints">' + esc(joinLines(brief.constraints)) + '</textarea></div>'
    + '<div class="field"><label for="aiExistingResources">Courses, books or resources already in use</label><textarea id="aiExistingResources">' + esc(joinLines(brief.resourcesMentioned)) + '</textarea></div>'
    + '<div class="ai-review-head"><b>Core Commitments</b></div>' + commitmentsHTML(brief.coreCommitments, 'brief')
    + assumptionsHTML(brief.assumptions) + '</div>';
}

function intensityOptionsHTML(selected){
  const current = normalizeIntensity(selected);
  return '<fieldset class="ai-intensity-options" aria-describedby="aiIntensityHelp"><legend>Path intensity</legend>'
    + AI_INTENSITY_LEVELS.map(value => '<label class="ai-intensity-card"><input type="radio" name="aiIntensityChoice" value="' + value + '" ' + (current === value ? 'checked' : '') + '/><span><b>' + esc(value.charAt(0).toUpperCase() + value.slice(1)) + '</b><small>' + esc(AI_INTENSITY_DETAILS[value]) + '</small></span></label>').join('')
    + '<p id="aiIntensityHelp" class="hint">Intensity changes load, progression, recovery, optional work and evidence expectations. It never overrides safety, fixed rules, supplied resources or your availability.</p></fieldset>';
}

function rhythmStepHTML(){
  const brief = normalizeGoalBrief(aiBuilder.brief || briefFromPrompt(aiBuilder.prompt));
  const commitments = brief.coreCommitments || [];
  const content = '<section class="ai-step"><h2 id="aiStepHeading" tabindex="-1">Here is the rhythm that gives you the best chance of succeeding</h2>'
    + '<p class="ai-step-copy">This is a recommendation, not a lock. Adjust it until it feels realistic.</p>'
    + '<div class="ai-rhythm-stats"><div><span>Recommended duration</span><b>' + esc(brief.durationDays || 30) + ' days</b></div><div><span>Weekly commitment</span><b>' + esc(brief.estimatedWeeklyHours == null ? (brief.dailyTimeAvailable || 'Flexible') : (brief.estimatedWeeklyHours + ' hours')) + '</b></div><div><span>Progress evidence</span><b>' + esc(brief.evidencePreference || 'Simple reflection or activity log') + '</b></div></div>'
    + intensityOptionsHTML(brief.intensity)
    + '<div class="ai-commitment-cards">' + (commitments.length ? commitments.map((item, index) => { const summary = commitmentSummary(item, index); return '<article><b>' + esc(summary.title) + '</b><span>' + esc(summary.rhythm || 'Flexible schedule') + '</span><small>' + (summary.required ? 'Core commitment' : 'Optional') + '</small></article>'; }).join('') : '<div class="ai-note">No Core Commitments were suggested yet. Add them under Adjust schedule.</div>') + '</div>'
    + (brief.assumptions.length ? '<div class="ai-visible-assumptions"><b>Assumptions to review</b><ul>' + brief.assumptions.map(item => '<li>' + esc(item.text) + '</li>').join('') + '</ul></div>' : '')
    + '<button class="btn" id="aiAdvancedToggle" type="button" aria-expanded="' + (aiBuilder.advancedOpen ? 'true' : 'false') + '">' + (aiBuilder.advancedOpen ? 'Hide adjustments' : 'Adjust schedule') + '</button>'
    + (aiBuilder.advancedOpen ? rhythmAdvancedHTML(brief) : '') + '</section>';
  const actions = '<button class="btn" id="aiRhythmBack" type="button">Back</button><button class="btn gold" id="aiRhythmAccept" type="button">Looks right</button>';
  return guidedShellHTML(content, actions);
}

function briefItemHTML(title, value, key){
  const display = Array.isArray(value) ? value.filter(Boolean).join(', ') : value;
  return '<article class="ai-brief-item"><div><span>' + esc(title) + '</span><p>' + esc(display || 'Not specified') + '</p></div><button class="linklike" type="button" data-brief-edit="' + esc(key) + '">Edit</button></article>';
}

function structuredResourceSummary(brief){
  const resources = brief.structuredResources || { courses:[], books:[], programmes:[] };
  return [
    ...(resources.courses || []).map(item => 'Course: ' + (item.title || item.url || item.id)),
    ...(resources.books || []).map(item => 'Book: ' + (item.title || item.author || item.id)),
    ...(resources.programmes || []).map(item => 'Programme: ' + (item.title || item.source || item.id)),
  ].filter(Boolean);
}

function domainSummary(brief){
  const profile = brief.domainProfile || { primary:'general', detected:[] };
  const detected = (profile.detected || []).filter(Boolean);
  return [profile.primary || 'general', detected.length ? 'also ' + detected.filter(item => item !== profile.primary).join(', ') : ''].filter(Boolean).join(' - ');
}

function conciseBriefHTML(){
  const brief = normalizeGoalBrief(aiBuilder.brief);
  const resourceSummary = structuredResourceSummary(brief);
  const content = '<section class="ai-step"><h2 id="aiStepHeading" tabindex="-1">Review your path brief</h2><p class="ai-step-copy">Claude will build from this confirmed brief, not from a vague prompt.</p>'
    + '<div class="ai-brief-list">'
    + briefItemHTML('Goal', brief.goal, 'goal') + briefItemHTML('Desired outcome', brief.desiredEndState, 'outcome')
    + briefItemHTML('Domain context', domainSummary(brief), 'domain')
    + briefItemHTML('Starting point', brief.currentStage, 'starting') + briefItemHTML('Duration', brief.durationDays ? brief.durationDays + ' days' : '', 'duration')
    + briefItemHTML('Intensity', brief.intensity ? brief.intensity.charAt(0).toUpperCase() + brief.intensity.slice(1) : 'Balanced', 'intensity')
    + briefItemHTML('Weekly time', brief.estimatedWeeklyHours == null ? brief.dailyTimeAvailable : brief.estimatedWeeklyHours + ' hours', 'time')
    + briefItemHTML('Core Commitments', brief.coreCommitments.map(item => item.title), 'commitments')
    + briefItemHTML('Milestones', brief.milestones, 'milestones') + briefItemHTML('Constraints', brief.constraints, 'constraints')
    + briefItemHTML('Resources', resourceSummary.length ? resourceSummary : brief.resourcesMentioned, 'resources') + briefItemHTML('Evidence approach', brief.evidencePreference, 'evidence')
    + briefItemHTML('Visible assumptions', brief.assumptions.map(item => item.text), 'assumptions') + '</div></section>';
  return guidedShellHTML(content, '<button class="btn" id="aiBriefBack" type="button">Back</button><button class="btn gold" id="aiGenerateRoadmap" type="button">Generate my roadmap</button>');
}

function visibilityOptionsHTML(selected){
  const options = [['private','Only me'],['unlisted','Anyone with access'],['public','Public']];
  return '<fieldset class="ai-visibility"><legend>Who should be able to see this path?</legend>' + options.map(([value, label]) => '<label><input type="radio" name="aiVisibilityChoice" value="' + value + '" ' + (selected === value ? 'checked' : '') + '/><span>' + label + '</span></label>').join('') + '</fieldset>';
}

function previewStepHTML(){
  const draft = aiBuilder.draft;
  const brief = normalizeGoalBrief(aiBuilder.brief || draft.confirmedBrief || {});
  const firstTasks = draft.tasks.filter(task => Number(task.startDay || task.unlockDay || 1) <= 7).slice(0, 6);
  const milestones = brief.milestones.length ? brief.milestones.slice(0, 4) : draft.sections.slice(0, 4).map(section => section.title);
  const content = '<section class="ai-step ai-preview-step"><h2 id="aiStepHeading" tabindex="-1">Your path is taking shape</h2><p class="ai-step-copy">Review the structure at a glance. The full editor remains available when you want it.</p>'
    + '<div class="ai-preview-hero"><span>' + esc(draft.durationDays) + ' days</span><h3>' + esc(draft.title) + '</h3><p>' + esc(draft.goal || draft.description) + '</p></div>'
    + '<div class="ai-preview-grid"><article><h4>Core Commitments</h4><ul>' + (draft.coreCommitments || []).slice(0, 5).map((item, index) => '<li><b>' + esc(item.title) + '</b><span>' + esc(cadenceLabel(item.cadence)) + '</span></li>').join('') + '</ul></article>'
    + '<article><h4>Major milestones</h4><ol>' + milestones.map(item => '<li>' + esc(item) + '</li>').join('') + '</ol></article>'
    + '<article><h4>First week</h4><ul>' + firstTasks.map(task => '<li>' + esc(task.title) + '</li>').join('') + '</ul></article>'
    + '<article><h4>Weekly effort and evidence</h4><p>' + esc(brief.estimatedWeeklyHours == null ? (brief.dailyTimeAvailable || 'A flexible weekly rhythm') : (brief.estimatedWeeklyHours + ' hours each week')) + '</p><p>' + esc(brief.evidencePreference || 'Reflection or activity logs where useful') + '</p></article></div>'
    + visibilityOptionsHTML(aiBuilder.saveOptions.visibility)
    + '<button class="btn" id="aiViewFullRoadmap" type="button">View full roadmap</button></section>';
  return guidedShellHTML(content, '<button class="btn" id="aiPreviewBack" type="button">Back to brief</button><button class="btn gold" id="aiSave" type="button">Create my path</button>');
}

function savingStepHTML(){
  return guidedShellHTML('<section class="ai-step ai-processing" role="status" aria-live="polite"><div class="ai-processing-mark" aria-hidden="true"><span></span><span></span><span></span></div><h2 id="aiStepHeading" tabindex="-1">Saving your path...</h2><p>Your roadmap is complete. We are writing the path and its tasks now.</p></section>');
}

function readyStepHTML(){
  const path = aiBuilder.savedPath || aiBuilder.draft;
  const firstTasks = (path?.weeks ? getTasksForDay(path, 1) : (path?.tasks || []).filter(task => Number(task.startDay || task.unlockDay || 1) === 1)).slice(0, 5);
  const commitments = path?.coreCommitments || [];
  const nextMilestone = path?.weeks?.[1]?.title || aiBuilder.brief?.milestones?.[0] || path?.sections?.[1]?.title || 'Keep building the routine';
  const content = '<section class="ai-step ai-ready-step"><div class="ai-ready-mark" aria-hidden="true">&#10003;</div><h2 id="aiStepHeading" tabindex="-1">Your path is ready</h2><p class="ai-step-copy">' + esc(path?.title || 'Your new path') + ' is saved and ready to begin.</p>'
    + '<div class="ai-ready-grid"><article><span>Duration</span><b>' + esc(path?.durationDays || 30) + ' days</b></article><article><span>Visibility</span><b>' + esc(aiBuilder.saveOptions.visibility === 'private' ? 'Only me' : (aiBuilder.saveOptions.visibility === 'unlisted' ? 'Anyone with access' : 'Public')) + '</b></article></div>'
    + '<div class="ai-ready-section"><h3>Day 1</h3><ul>' + firstTasks.map(task => '<li>' + esc(task.text || task.title) + '</li>').join('') + '</ul></div>'
    + '<div class="ai-ready-section"><h3>Next milestone</h3><p>' + esc(nextMilestone) + '</p></div>'
    + (commitments.length ? '<div class="ai-ready-section"><h3>Core Commitments</h3><ul>' + commitments.slice(0, 4).map(item => '<li>' + esc(item.title) + '</li>').join('') + '</ul></div>' : '') + '</section>';
  return guidedShellHTML(content, '<button class="btn" id="aiViewSavedPath" type="button">View full path</button><button class="btn gold" id="aiStartDayOne" type="button">Start Day 1</button>');
}

function errorStepHTML(){
  const content = '<section class="ai-step"><h2 id="aiStepHeading" tabindex="-1">Your work is still here</h2><p class="ai-step-copy">We could not finish understanding your goal. You can retry or continue with a local Basic starter.</p><div class="ai-goal-recap">' + esc(aiBuilder.prompt.goal) + '</div></section>';
  return guidedShellHTML(content, '<button class="btn" id="aiBasic" type="button">Use Basic starter</button><button class="btn gold" id="aiRetryInterpret" type="button">Try again</button>');
}

function aiPromptHTML(){
  if(aiBuilder.phase === 'interpreting') return processingStepHTML('interpreting');
  if(aiBuilder.phase === 'generating') return processingStepHTML('generating');
  if(aiBuilder.phase === 'clarifying') return clarificationStepHTML();
  if(aiBuilder.phase === 'rhythm') return rhythmStepHTML();
  if(aiBuilder.phase === 'brief') return conciseBriefHTML();
  if(aiBuilder.phase === 'preview' && aiBuilder.draft) return previewStepHTML();
  if(aiBuilder.phase === 'saving') return savingStepHTML();
  if(aiBuilder.phase === 'ready') return readyStepHTML();
  if(aiBuilder.phase === 'error' && builderHasMeaningfulWork(aiBuilder)) return errorStepHTML();
  return goalStepHTML();
}

function assumptionsHTML(value){
  const assumptions = normalizeBriefAssumptions(value);
  return '<div class="field"><label>Assumptions</label>'
    + '<div class="ai-list assumptions">'
    + (assumptions.length ? assumptions.map((item, index) => '<div class="ai-edit-row">'
      + '<label class="checkline"><input type="checkbox" class="ai-assumption-accepted" data-i="' + index + '" ' + (item.accepted ? 'checked' : '') + '/> Accepted</label>'
      + '<textarea class="ai-assumption-text" data-i="' + index + '" placeholder="Visible assumption">' + esc(item.text) + '</textarea>'
      + '<button class="icon-btn danger" type="button" data-assumption-action="remove" data-i="' + index + '" aria-label="Remove assumption">x</button>'
      + '</div>').join('') : '<div class="hint">No assumptions. Unknown values will remain unknown.</div>')
    + '</div><button class="add-link" type="button" data-assumption-action="add">+ Add assumption</button>'
    + '<div class="hint">Accept, edit, or remove every material assumption before generation.</div></div>';
}

function goalBriefHTML(){
  if(!aiBuilder.brief) return '';
  const b = normalizeGoalBrief(aiBuilder.brief);
  const q = b.clarifyingQuestions || [];
  const clarifying = aiBuilder.phase === 'clarifying' || (aiBuilder.phase === 'interpreting' && !!aiBuilder.brief);
  return '<div class="ai-brief-card">'
    + '<div class="ai-review-head"><b>' + (clarifying ? 'A few details will make your path more accurate' : 'Review your path brief') + '</b></div>'
    + (clarifying ? '<div class="ai-warning">Answer only what you know. Your earlier goal, commitments, and answers will stay in place.</div>' : '')
    + '<div class="ai-grid">'
    + '<div class="field"><label>Summary</label><textarea class="ai-brief-field" data-key="summary">' + esc(b.summary) + '</textarea></div>'
    + '<div class="field"><label>Goal</label><textarea class="ai-brief-field" data-key="goal">' + esc(b.goal) + '</textarea></div>'
    + '<div class="field"><label>Path type</label><select class="ai-brief-field" data-key="pathType">' + selectOptions(AI_PATH_TYPES.filter(type => type !== 'auto'), b.pathType) + '</select></div>'
    + '<div class="field"><label>Goal category</label><input type="text" class="ai-brief-field" data-key="goalCategory" value="' + esc(b.goalCategory) + '"/></div>'
    + '<div class="field"><label>Intensity</label><select class="ai-brief-field" data-key="intensity">' + selectOptions(AI_INTENSITY_LEVELS, normalizeIntensity(b.intensity)) + '</select></div>'
    + '<div class="field"><label>Recommended duration days</label><input type="number" class="ai-brief-field" data-key="durationDays" value="' + esc(b.durationDays || '') + '" placeholder="AI recommendation"/></div>'
    + '<div class="field"><label>Daily time</label><input type="text" class="ai-brief-field" data-key="dailyTimeAvailable" value="' + esc(b.dailyTimeAvailable) + '" placeholder="30 minutes"/></div>'
    + '<div class="field"><label>Estimated daily minutes</label><input type="number" class="ai-brief-field" data-key="estimatedDailyMinutes" value="' + esc(b.estimatedDailyMinutes == null ? '' : b.estimatedDailyMinutes) + '"/></div>'
    + '<div class="field"><label>Estimated weekly hours</label><input type="number" step="0.5" class="ai-brief-field" data-key="estimatedWeeklyHours" value="' + esc(b.estimatedWeeklyHours == null ? '' : b.estimatedWeeklyHours) + '"/></div>'
    + '</div>'
    + '<div class="field"><label>Duration recommendation reason</label><textarea class="ai-brief-field" data-key="recommendedDurationReason">' + esc(b.recommendedDurationReason) + '</textarea></div>'
    + '<div class="field"><label>Current stage</label><textarea class="ai-brief-field" data-key="currentStage">' + esc(b.currentStage) + '</textarea></div>'
    + '<div class="field"><label>Desired end state</label><textarea class="ai-brief-field" data-key="desiredEndState">' + esc(b.desiredEndState) + '</textarea></div>'
    + '<div class="ai-grid">'
    + '<div class="field"><label>Known tasks</label><textarea class="ai-brief-array" data-key="knownTasks" placeholder="One per line">' + esc(joinLines(b.knownTasks)) + '</textarea></div>'
    + '<div class="field"><label>Milestones</label><textarea class="ai-brief-array" data-key="milestones" placeholder="One per line">' + esc(joinLines(b.milestones)) + '</textarea></div>'
    + '<div class="field"><label>Constraints</label><textarea class="ai-brief-array" data-key="constraints" placeholder="One per line">' + esc(joinLines(b.constraints)) + '</textarea></div>'
    + '<div class="field"><label>Resources mentioned</label><textarea class="ai-brief-array" data-key="resourcesMentioned" placeholder="One per line">' + esc(joinLines(b.resourcesMentioned)) + '</textarea></div>'
    + '</div>'
    + '<div class="field"><label>Schedule notes</label><textarea class="ai-brief-field" data-key="scheduleNotes">' + esc(b.scheduleNotes) + '</textarea></div>'
    + '<div class="field"><label>Optional deadline</label><input type="date" class="ai-brief-field" data-key="deadline" value="' + esc(b.deadline || '') + '"/></div>'
    + '<div class="field"><label>Evidence preference</label><input type="text" class="ai-brief-field" data-key="evidencePreference" value="' + esc(b.evidencePreference) + '"/></div>'
    + '<div class="field"><label>Suggested evidence types</label><textarea class="ai-brief-array" data-key="suggestedEvidenceTypes" placeholder="One per line">' + esc(joinLines(b.suggestedEvidenceTypes)) + '</textarea></div>'
    + '<div class="ai-review-head"><b>Core commitments</b><span class="muted">Review these before generating the roadmap.</span></div>'
    + commitmentsHTML(b.coreCommitments, 'brief')
    + '<div class="field"><label>Progressive targets</label><textarea class="ai-brief-targets" placeholder="area | current | target | unit | notes">' + esc(progressiveTargetsToText(b.progressiveTargets)) + '</textarea></div>'
    + assumptionsHTML(b.assumptions)
    + '<div class="field"><label>Material gaps</label><textarea class="ai-brief-array" data-key="materialGaps" placeholder="One per line">' + esc(joinLines(b.materialGaps)) + '</textarea></div>'
    + (clarifying && q.length ? '<div class="ai-questions"><div class="ai-review-head"><b>A few details will make your path more accurate</b><button class="btn gold" id="aiApplyAnswers" type="button" ' + (hasActiveAIRequest(aiBuilder.requests) ? 'disabled' : '') + '>Update my brief</button></div>'
      + q.map(question => '<div class="field"><label>' + esc(question.prompt) + '</label>'
        + (question.reason ? '<div class="hint">' + esc(question.reason) + '</div>' : '')
        + '<textarea class="ai-answer-field" data-question-id="' + esc(question.id) + '" placeholder="Your answer">' + esc(aiBuilder.clarifyingAnswers[question.id] || '') + '</textarea></div>').join('')
      + '</div>' : '')
    + '</div>';
}

function aiReviewHTML(){
  const d = aiBuilder.draft;
  const sectionOptions = d.sections.map(s => s.title);
  return '<div class="modal-box ai-modal guided-builder review full-roadmap" role="dialog" aria-modal="true" aria-labelledby="aiStepHeading"><div class="modal-head ai-wizard-head"><div><span class="ai-builder-kicker">Create a path</span>' + wizardProgressHTML() + '</div><button class="modal-x" type="button" aria-label="Close path creation">x</button></div>'
    + '<div class="modal-body">'
    + '<h2 id="aiStepHeading" tabindex="-1">Review the full roadmap</h2><p class="ai-step-copy">Every field remains editable before you create the path.</p>'
    + (aiBuilder.message ? '<div class="ai-note">' + esc(aiBuilder.message) + '</div>' : '')
    + (aiBuilder.error ? '<div class="form-error">' + esc(aiBuilder.error) + aiErrorDiagnosticHTML() + '</div>' : '')
    + '<div class="ai-grid">'
    + '<div class="field"><label>Title</label><input type="text" class="ai-draft-field" data-key="title" value="' + esc(d.title) + '"/></div>'
    + '<div class="field"><label>Category</label><input type="text" class="ai-draft-field" data-key="category" value="' + esc(d.category) + '"/></div>'
    + '<div class="field"><label>Duration days</label><input type="number" class="ai-draft-field" data-key="durationDays" value="' + esc(d.durationDays) + '"/></div>'
    + '<div class="field"><label>Duration label</label><input type="text" class="ai-draft-field" data-key="durationLabel" value="' + esc(d.durationLabel) + '"/></div>'
    + '<div class="field"><label>Visibility</label><select class="ai-draft-field" data-key="visibility"><option value="private" ' + ((d.visibility || 'private') === 'private' ? 'selected' : '') + '>Only me</option><option value="unlisted" ' + (d.visibility === 'unlisted' ? 'selected' : '') + '>Anyone with access</option><option value="public" ' + (d.visibility === 'public' ? 'selected' : '') + '>Public</option></select></div>'
    + '<div class="field"><label>Preview title</label><input type="text" class="ai-draft-field" data-key="previewTitle" value="' + esc(d.previewTitle) + '"/></div>'
    + '</div>'
    + '<div class="field"><label>Goal</label><textarea class="ai-draft-field" data-key="goal">' + esc(d.goal) + '</textarea></div>'
    + '<div class="field"><label>Description</label><textarea class="ai-draft-field" data-key="description">' + esc(d.description) + '</textarea></div>'
    + '<div class="field"><label>Preview description</label><textarea class="ai-draft-field" data-key="previewDescription">' + esc(d.previewDescription) + '</textarea></div>'
    + '<div class="ai-review-head"><b>Sections</b><button class="add-link" data-ai-act="addSection">+ Add section</button></div>'
    + '<div class="ai-list">' + d.sections.map((s, i) => '<div class="ai-edit-row"><input class="ai-section-field" data-i="' + i + '" data-key="title" value="' + esc(s.title) + '"/><input class="ai-section-field" data-i="' + i + '" data-key="description" value="' + esc(s.description || '') + '" placeholder="Description"/><button class="icon-btn danger" data-ai-act="delSection" data-i="' + i + '">x</button></div>').join('') + '</div>'
    + '<div class="ai-review-head"><b>Tasks</b><button class="add-link" data-ai-act="addTask">+ Add task</button></div>'
    + '<div class="ai-list tasks">' + d.tasks.map((t, i) => aiTaskRowHTML(t, i, sectionOptions)).join('') + '</div>'
    + '<div class="ai-review-head"><b>Resources</b><button class="add-link" data-ai-act="addResource">+ Add resource</button></div>'
    + '<div class="ai-list">' + (d.resources || []).map((r, i) => '<div class="ai-edit-row resource"><input class="ai-resource-field" data-i="' + i + '" data-key="title" value="' + esc(r.title) + '" placeholder="Title"/><input class="ai-resource-field" data-i="' + i + '" data-key="url" value="' + esc(r.url) + '" placeholder="https://..."/><button class="icon-btn danger" data-ai-act="delResource" data-i="' + i + '">x</button><textarea class="ai-resource-field" data-i="' + i + '" data-key="description" placeholder="Description">' + esc(r.description || '') + '</textarea></div>').join('') + '</div>'
    + (d.notes && d.notes.length ? '<div class="ai-note"><b>Notes</b><ul>' + d.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : '')
    + '<div class="ai-actions"><button class="btn" id="aiBackToPreview" type="button">Back to preview</button><button class="btn" id="aiRegenerate" type="button">Regenerate</button><button class="btn gold" id="aiSave" type="button">Create my path</button></div>'
    + '</div></div>';
}

function aiTaskRowHTML(t, i, sectionOptions){
  const prefix = 'ai-task-' + i;
  return '<div class="ai-task-row">'
    + '<input id="' + prefix + '-title" name="' + prefix + '-title" aria-label="Task title" class="ai-task-field ai-title" data-i="' + i + '" data-key="title" value="' + esc(t.title) + '" placeholder="Task title"/>'
    + '<select id="' + prefix + '-section" name="' + prefix + '-section" aria-label="Task section" class="ai-task-field" data-i="' + i + '" data-key="sectionTitle">' + selectOptions(sectionOptions, t.sectionTitle) + '</select>'
    + '<select id="' + prefix + '-cadence" name="' + prefix + '-cadence" aria-label="Task schedule" class="ai-task-field" data-i="' + i + '" data-key="scheduleType">' + naturalCadenceOptions(t.scheduleType) + '</select>'
    + '<select id="' + prefix + '-mode" name="' + prefix + '-mode" aria-label="Task mode" class="ai-task-field" data-i="' + i + '" data-key="taskMode">' + selectOptions(AI_TASK_MODES, t.taskMode || normalizeTaskMode(t.taskMode, t.scheduleType)) + '</select>'
    + '<input id="' + prefix + '-start" name="' + prefix + '-start" aria-label="Task start day" type="number" class="ai-task-field" data-i="' + i + '" data-key="startDay" value="' + esc(t.startDay || 1) + '" min="1"/>'
    + '<input id="' + prefix + '-end" name="' + prefix + '-end" aria-label="Task end day" type="number" class="ai-task-field" data-i="' + i + '" data-key="endDay" value="' + esc(t.endDay || '') + '" min="1" placeholder="End"/>'
    + '<input id="' + prefix + '-unlock" name="' + prefix + '-unlock" aria-label="Task unlock day" type="number" class="ai-task-field" data-i="' + i + '" data-key="unlockDay" value="' + esc(t.unlockDay || '') + '" min="1" placeholder="Unlock"/>'
    + '<input id="' + prefix + '-days" name="' + prefix + '-days" aria-label="Selected days" class="ai-task-field" data-i="' + i + '" data-key="daysOfWeek" value="' + esc((t.daysOfWeek || []).join(', ')) + '" placeholder="Days: mon, wed, fri"/>'
    + '<input id="' + prefix + '-times" name="' + prefix + '-times" aria-label="Times per week" type="number" min="1" max="7" class="ai-task-field" data-i="' + i + '" data-key="timesPerWeek" value="' + esc(t.timesPerWeek || '') + '" placeholder="Times/week"/>'
    + '<input id="' + prefix + '-interval" name="' + prefix + '-interval" aria-label="Interval days" type="number" min="1" class="ai-task-field" data-i="' + i + '" data-key="intervalDays" value="' + esc(t.intervalDays || '') + '" placeholder="Interval days"/>'
    + '<input id="' + prefix + '-scheduled" name="' + prefix + '-scheduled" aria-label="Scheduled day" type="number" min="1" class="ai-task-field" data-i="' + i + '" data-key="scheduledDay" value="' + esc(t.scheduledDay || '') + '" placeholder="Scheduled day"/>'
    + '<label for="' + prefix + '-proof"><input id="' + prefix + '-proof" name="' + prefix + '-proof" type="checkbox" class="ai-task-field" data-i="' + i + '" data-key="evidenceRequired" ' + (t.evidenceRequired ? 'checked' : '') + '/> Proof</label>'
    + '<button id="' + prefix + '-remove" name="' + prefix + '-remove" type="button" class="icon-btn danger" data-ai-act="delTask" data-i="' + i + '" aria-label="Remove task ' + (i + 1) + '">x</button>'
    + '<input id="' + prefix + '-metric" name="' + prefix + '-metric" aria-label="Progression metric" class="ai-task-field" data-i="' + i + '" data-key="progressionMetric" value="' + esc(t.progressionMetric || '') + '" placeholder="Metric"/>'
    + '<input id="' + prefix + '-unit" name="' + prefix + '-unit" aria-label="Progression unit" class="ai-task-field" data-i="' + i + '" data-key="progressionUnit" value="' + esc(t.progressionUnit || '') + '" placeholder="Unit"/>'
    + '<input id="' + prefix + '-start-value" name="' + prefix + '-start-value" aria-label="Progression start value" type="number" step="any" class="ai-task-field" data-i="' + i + '" data-key="startValue" value="' + esc(t.startValue == null ? '' : t.startValue) + '" placeholder="Start value"/>'
    + '<input id="' + prefix + '-target-value" name="' + prefix + '-target-value" aria-label="Progression target value" type="number" step="any" class="ai-task-field" data-i="' + i + '" data-key="targetValue" value="' + esc(t.targetValue == null ? '' : t.targetValue) + '" placeholder="Target value"/>'
    + '<select id="' + prefix + '-curve" name="' + prefix + '-curve" aria-label="Progression curve" class="ai-task-field" data-i="' + i + '" data-key="progressionCurve"><option value="">No curve</option>' + selectOptions(AI_PROGRESSION_CURVES, t.progressionCurve || '') + '</select>'
    + '<input id="' + prefix + '-resource" name="' + prefix + '-resource" aria-label="Task resource URL" class="ai-task-field" data-i="' + i + '" data-key="resourceUrl" value="' + esc(t.resourceUrl || '') + '" placeholder="Task resource URL"/>'
    + '<textarea id="' + prefix + '-progression-notes" name="' + prefix + '-progression-notes" aria-label="Progression notes" class="ai-task-field" data-i="' + i + '" data-key="progressionNotes" placeholder="Progression notes">' + esc(t.progressionNotes || '') + '</textarea>'
    + '<textarea id="' + prefix + '-description" name="' + prefix + '-description" aria-label="Task description" class="ai-task-field" data-i="' + i + '" data-key="description" placeholder="Description">' + esc(t.description || '') + '</textarea>'
    + '</div>';
}

function markBriefFieldConfirmed(key){
  if(!aiBuilder?.brief) return;
  const canonical = ({
    currentStage:'currentBaseline', desiredEndState:'desiredOutcome',
    dailyTimeAvailable:'availableTime', evidencePreference:'evidencePreferences',
    resourcesMentioned:'resources', missingCriticalInfo:'materialGaps',
  })[key] || key;
  aiBuilder.brief.confirmedFields = [...new Set([...(aiBuilder.brief.confirmedFields || []), canonical])];
}

function stopAIProcessingTicker(){
  if(aiProcessingTimer){ clearInterval(aiProcessingTimer); aiProcessingTimer = null; }
}

function userPrefersReducedMotion(){
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function stopAIExampleRotation(markInteracted = false){
  stopExampleRotation(aiBuilder, { markInteracted });
}

function updateGoalSuggestionState(){
  updateGoalSuggestionButtons(aiBuilder?.overlay, $('aiGoal')?.value || '');
}

function startAIExampleRotation(builder){
  startExampleRotation(builder, {
    getGoalInput: () => $('aiGoal'),
    getActiveElement: () => document.activeElement,
    isCurrentBuilder: candidate => aiBuilder === candidate && candidate?.phase === 'goal',
  });
}

function startAIProcessingTicker(builder, count){
  stopAIProcessingTicker();
  builder.processingMessageIndex = 0;
  aiProcessingTimer = setInterval(() => {
    if(aiBuilder !== builder || !['interpreting', 'generating'].includes(builder.phase)) return stopAIProcessingTicker();
    builder.processingMessageIndex = ((builder.processingMessageIndex || 0) + 1) % count;
    renderAIBuilder();
  }, 1800);
}

function syncGoalInput(){
  const goal = $('aiGoal');
  if(goal) aiBuilder.prompt.goal = goal.value.trim();
}

function applyAdvancedInputsToBrief(){
  if(!aiBuilder?.brief) return;
  const brief = aiBuilder.brief;
  const intensityChoice = aiBuilder.overlay?.querySelector('input[name="aiIntensityChoice"]:checked');
  if(intensityChoice){ brief.intensity = normalizeIntensity(intensityChoice.value); markBriefFieldConfirmed('intensity'); }
  if($('aiDuration')){ brief.durationDays = $('aiDuration').value ? clampDay($('aiDuration').value, 30, 365) : null; markBriefFieldConfirmed('durationDays'); }
  if($('aiDailyTime')){ brief.dailyTimeAvailable = brief.availableTime = $('aiDailyTime').value.trim(); markBriefFieldConfirmed('availableTime'); }
  if($('aiEvidenceStyle')){ brief.evidencePreference = brief.evidencePreferences = $('aiEvidenceStyle').value.trim(); markBriefFieldConfirmed('evidencePreferences'); }
  if($('aiConstraints')){ brief.constraints = splitLines($('aiConstraints').value); markBriefFieldConfirmed('constraints'); }
  if($('aiExistingResources')){ brief.resourcesMentioned = brief.resources = splitLines($('aiExistingResources').value); markBriefFieldConfirmed('resources'); }
}

function currentClarifyingQuestion(){
  const questions = normalizeClarifyingQuestions(aiBuilder.brief?.clarifyingQuestions || []);
  return questions[Math.min(aiBuilder.clarificationIndex || 0, Math.max(0, questions.length - 1))] || null;
}

function readQuestionAnswer(question){
  if(!question) return {};
  if(question.type === 'resource'){
    const title = ($('aiQuestionResourceTitle')?.value || '').trim();
    const url = safeExternalUrl($('aiQuestionResourceUrl')?.value || '') || (($('aiQuestionResourceUrl')?.value || '').trim());
    const note = ($('aiQuestionResourceNote')?.value || '').trim();
    if(question.targetField === 'bookResource' || question.targetField.startsWith('book.')){
      return { title, url, notesOrExercises:note, notes:note };
    }
    if(question.targetField === 'courseResource' || question.targetField.startsWith('course.')){
      return { title, url, notes:note };
    }
    if(question.targetField === 'programmeResource' || question.targetField.startsWith('programme.')){
      return { title, url, notes:note };
    }
    return { title, url, note, value:[title, url, note].filter(Boolean).join(' - ') };
  }
  const selected = [...(aiBuilder.overlay?.querySelectorAll('[data-question-choice]:checked') || [])].map(input => input.value).filter(value => value !== '__custom');
  const custom = ($('aiQuestionCustom')?.value || '').trim();
  if(selected.length || custom) return { selected, custom };
  const value = ($('aiQuestionAnswer')?.value || '').trim();
  return { value };
}

function saveCurrentQuestionAnswer(){
  const question = currentClarifyingQuestion();
  if(!question) return true;
  const previous = answerValueForQuestion(question, aiBuilder.clarifyingAnswers[question.id]);
  const answer = readQuestionAnswer(question);
  const value = answerValueForQuestion(question, answer);
  if(question.required && !value){
    aiBuilder.error = 'Answer this question before continuing, or write your own answer.';
    renderAIBuilder();
    return false;
  }
  aiBuilder.clarifyingAnswers[question.id] = answer;
  if(previous && previous !== value && question.targetField){
    aiBuilder.staleFields = [...new Set([...(aiBuilder.staleFields || []), question.targetField])];
    aiBuilder.message = 'This change affects your recommended plan. We will refresh the relevant parts before continuing.';
  }
  return true;
}

async function continueClarification(){
  if(!saveCurrentQuestionAnswer()) return;
  aiBuilder.error = '';
  const questions = normalizeClarifyingQuestions(aiBuilder.brief?.clarifyingQuestions || []);
  if((aiBuilder.clarificationIndex || 0) < questions.length - 1){
    aiBuilder.clarificationIndex += 1;
    renderAIBuilder();
    return;
  }
  await requestGoalInterpretation(true);
}

function goBackClarification(){
  if((aiBuilder.clarificationIndex || 0) > 0){
    saveCurrentQuestionAnswer();
    aiBuilder.clarificationIndex -= 1;
    aiBuilder.error = '';
    renderAIBuilder();
    return;
  }
  aiBuilder.phase = 'goal';
  aiBuilder.error = '';
  renderAIBuilder();
}

function cancelActiveAIRequestFromUI(){
  if(!hasActiveAIRequest(aiBuilder.requests)) return requestCloseAIBuilder();
  abortAIRequest(null, aiBuilder);
  stopAIProcessingTicker();
  aiBuilder.phase = aiBuilder.phase === 'generating' ? 'brief' : 'goal';
  aiBuilder.error = 'The request was cancelled. Your information is still here.';
  aiBuilder.message = '';
  renderAIBuilder();
}

function renderAIBuilder(){
  if(!aiBuilder?.overlay) return;
  if(!aiBuilder.overlay.dataset.voiceDelegated){
    aiBuilder.overlay.addEventListener('click', handleBuilderVoiceAction);
    aiBuilder.overlay.dataset.voiceDelegated = 'true';
  }
  aiBuilder.overlay.innerHTML = aiBuilder.phase === 'preview' && aiBuilder.fullRoadmap && aiBuilder.draft ? aiReviewHTML() : aiPromptHTML();
  const close = aiBuilder.overlay.querySelector('.modal-x');
  if(close) close.onclick = requestCloseAIBuilder;
  const cancel = $('aiCancel'); if(cancel) cancel.onclick = cancelActiveAIRequestFromUI;
  const build = $('aiBuild'); if(build) build.onclick = handleBuildWithAI;
  const generateRoadmap = $('aiGenerateRoadmap'); if(generateRoadmap) generateRoadmap.onclick = generateRoadmapFromBrief;
  const retryInterpret = $('aiRetryInterpret'); if(retryInterpret) retryInterpret.onclick = () => requestGoalInterpretation(false);
  const goal = $('aiGoal'); if(goal){
    goal.addEventListener('focus', () => stopAIExampleRotation(true));
    goal.addEventListener('paste', () => stopAIExampleRotation(true));
    goal.addEventListener('input', () => { stopAIExampleRotation(true); syncGoalInput(); updateGoalSuggestionState(); });
    goal.addEventListener('keydown', e => {
      if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); handleBuildWithAI(); }
    });
  }
  aiBuilder.overlay.querySelectorAll('[data-goal-suggestion]').forEach(button => button.onclick = () => {
    const input = $('aiGoal');
    if((input?.value || aiBuilder.prompt.goal || '').trim()){
      updateGoalSuggestionState();
      input?.focus();
      return;
    }
    stopAIExampleRotation(true);
    aiBuilder.prompt.goal = button.dataset.goalSuggestion || '';
    if(input){ input.value = aiBuilder.prompt.goal; input.focus(); syncGoalInput(); updateGoalSuggestionState(); }
  });
  if(aiBuilder.phase === 'goal') startAIExampleRotation(aiBuilder);
  else stopAIExampleRotation(false);
  const summaryToggle = $('aiToggleSummary'); if(summaryToggle) summaryToggle.onclick = () => { aiBuilder.summaryOpen = !aiBuilder.summaryOpen; renderAIBuilder(); };
  const questionContinue = $('aiQuestionContinue'); if(questionContinue) questionContinue.onclick = continueClarification;
  const questionBack = $('aiQuestionBack'); if(questionBack) questionBack.onclick = goBackClarification;
  const rhythmBack = $('aiRhythmBack'); if(rhythmBack) rhythmBack.onclick = () => { aiBuilder.phase = aiBuilder.brief?.clarifyingQuestions?.length ? 'clarifying' : 'goal'; renderAIBuilder(); };
  const rhythmAccept = $('aiRhythmAccept'); if(rhythmAccept) rhythmAccept.onclick = () => { applyAdvancedInputsToBrief(); aiBuilder.phase = 'brief'; aiBuilder.error = ''; renderAIBuilder(); };
  const advancedToggle = $('aiAdvancedToggle'); if(advancedToggle) advancedToggle.onclick = () => { applyAdvancedInputsToBrief(); aiBuilder.advancedOpen = !aiBuilder.advancedOpen; renderAIBuilder(); };
  aiBuilder.overlay.querySelectorAll('input[name="aiIntensityChoice"]').forEach(input => input.onchange = e => {
    if(!aiBuilder.brief) aiBuilder.brief = aiBriefDefaults();
    aiBuilder.brief.intensity = normalizeIntensity(e.target.value);
    markBriefFieldConfirmed('intensity');
  });
  const briefBack = $('aiBriefBack'); if(briefBack) briefBack.onclick = () => { aiBuilder.phase = 'rhythm'; aiBuilder.advancedOpen = false; renderAIBuilder(); };
  aiBuilder.overlay.querySelectorAll('[data-brief-edit]').forEach(button => button.onclick = () => { aiBuilder.phase = 'rhythm'; aiBuilder.advancedOpen = true; aiBuilder.briefEditSection = button.dataset.briefEdit || ''; renderAIBuilder(); });
  const previewBack = $('aiPreviewBack'); if(previewBack) previewBack.onclick = () => { aiBuilder.phase = 'brief'; aiBuilder.fullRoadmap = false; renderAIBuilder(); };
  const fullRoadmap = $('aiViewFullRoadmap'); if(fullRoadmap) fullRoadmap.onclick = () => { aiBuilder.fullRoadmap = true; renderAIBuilder(); };
  const backToPreview = $('aiBackToPreview'); if(backToPreview) backToPreview.onclick = () => { aiBuilder.fullRoadmap = false; aiBuilder.phase = 'preview'; renderAIBuilder(); };
  aiBuilder.overlay.querySelectorAll('input[name="aiVisibilityChoice"]').forEach(input => input.onchange = e => {
    aiBuilder.saveOptions.visibility = e.target.value;
    if(aiBuilder.draft) aiBuilder.draft.visibility = e.target.value;
    aiBuilder.prompt.visibility = e.target.value;
  });
  const viewSaved = $('aiViewSavedPath'); if(viewSaved) viewSaved.onclick = async () => { const id = aiBuilder.savedPathId; closeAIBuilder(); if(id) await openSkill(id, { tab:'plan' }); };
  const startDayOne = $('aiStartDayOne'); if(startDayOne) startDayOne.onclick = startSavedPathDayOne;
  const backToInput = $('aiBackToInput'); if(backToInput) backToInput.onclick = () => {
    aiBuilder.phase = 'goal';
    aiBuilder.error = '';
    aiBuilder.message = '';
    renderAIBuilder();
  };
  const basic = $('aiBasic'); if(basic) basic.onclick = createBasicDraft;
  const editPrompt = $('aiEditPrompt'); if(editPrompt) editPrompt.onclick = () => {
    aiBuilder.mode = 'prompt';
    aiBuilder.phase = aiBuilder.brief ? 'brief' : 'goal';
    renderAIBuilder();
  };
  const regenerate = $('aiRegenerate'); if(regenerate) regenerate.onclick = () => {
    if(aiBuilder.dirty && !confirm('Regenerate this draft and replace your edits?')) return;
    if(aiBuilder.brief){
      aiBuilder.mode = 'prompt';
      aiBuilder.phase = 'brief';
      generateRoadmapFromBrief();
    }
    else createBasicDraft();
  };
  const save = $('aiSave'); if(save) save.onclick = saveGeneratedPath;
  const applyAnswers = $('aiApplyAnswers'); if(applyAnswers) applyAnswers.onclick = () => requestGoalInterpretation(true);
  aiBuilder.overlay.querySelectorAll('.ai-brief-field').forEach(el => {
    const handler = e => {
      const key = e.target.dataset.key;
      if(!aiBuilder.brief) aiBuilder.brief = aiBriefDefaults();
      if(key === 'durationDays') aiBuilder.brief[key] = e.target.value ? clampDay(e.target.value, 30, 365) : null;
      else if(['estimatedDailyMinutes', 'estimatedWeeklyHours'].includes(key)) aiBuilder.brief[key] = nullableNumber(e.target.value);
      else aiBuilder.brief[key] = e.target.value;
      if(key === 'goal') aiBuilder.brief.interpretedGoal = aiBuilder.brief.goal;
      if(key === 'currentStage') aiBuilder.brief.currentBaseline = aiBuilder.brief.currentStage;
      if(key === 'desiredEndState') aiBuilder.brief.desiredOutcome = aiBuilder.brief.desiredEndState;
      if(key === 'dailyTimeAvailable') aiBuilder.brief.availableTime = aiBuilder.brief.dailyTimeAvailable;
      if(key === 'evidencePreference') aiBuilder.brief.evidencePreferences = aiBuilder.brief.evidencePreference;
      markBriefFieldConfirmed(key);
    };
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', handler);
  });
  aiBuilder.overlay.querySelectorAll('.ai-brief-array').forEach(el => el.addEventListener('input', e => {
    if(!aiBuilder.brief) aiBuilder.brief = aiBriefDefaults();
    const key = e.target.dataset.key;
    aiBuilder.brief[key] = splitLines(e.target.value);
    if(key === 'resourcesMentioned') aiBuilder.brief.resources = [...aiBuilder.brief.resourcesMentioned];
    if(key === 'materialGaps') aiBuilder.brief.missingCriticalInfo = [...aiBuilder.brief.materialGaps];
    markBriefFieldConfirmed(key);
  }));
  const targetInput = aiBuilder.overlay.querySelector('.ai-brief-targets');
  if(targetInput) targetInput.addEventListener('input', e => {
    if(!aiBuilder.brief) aiBuilder.brief = aiBriefDefaults();
    aiBuilder.brief.progressiveTargets = progressiveTargetsFromText(e.target.value);
    markBriefFieldConfirmed('progressiveTargets');
  });
  aiBuilder.overlay.querySelectorAll('.ai-answer-field').forEach(el => el.addEventListener('input', e => {
    aiBuilder.clarifyingAnswers[e.target.dataset.questionId] = e.target.value;
  }));
  aiBuilder.overlay.querySelectorAll('.ai-assumption-text').forEach(el => el.addEventListener('input', e => {
    const item = aiBuilder.brief.assumptions[Number(e.target.dataset.i)];
    if(item) item.text = e.target.value;
  }));
  aiBuilder.overlay.querySelectorAll('.ai-assumption-accepted').forEach(el => el.addEventListener('change', e => {
    const item = aiBuilder.brief.assumptions[Number(e.target.dataset.i)];
    if(item){ item.accepted = e.target.checked; item.source = item.source || 'user'; }
  }));
  aiBuilder.overlay.querySelectorAll('[data-assumption-action]').forEach(button => button.onclick = () => {
    aiBuilder.brief.assumptions = normalizeBriefAssumptions(aiBuilder.brief.assumptions);
    if(button.dataset.assumptionAction === 'add'){
      aiBuilder.brief.assumptions.push({ id:'assumption-user-' + Date.now().toString(36), field:'', text:'', accepted:false, source:'user', material:true });
    } else {
      aiBuilder.brief.assumptions.splice(Number(button.dataset.i), 1);
    }
    renderAIBuilder();
  });
  aiBuilder.overlay.querySelectorAll('.ai-commitment-field, .ai-commitment-cadence').forEach(el => {
    const handler = e => {
      const scope = e.target.dataset.scope;
      const list = scope === 'brief' ? aiBuilder.brief.coreCommitments : aiBuilder.prompt.coreCommitments;
      const item = list[Number(e.target.dataset.i)];
      if(!item) return;
      const key = e.target.dataset.key;
      if(key === 'required') item.required = e.target.checked;
      else if(key === 'cadenceType'){
        item.cadence = { ...item.cadence, type:e.target.value };
        renderAIBuilder();
      } else if(key === 'daysOfWeek') item.cadence.daysOfWeek = e.target.value.split(',').map(value => value.trim()).filter(Boolean);
      else if(['timesPerWeek', 'intervalDays', 'scheduledDay'].includes(key)) item.cadence[key] = nullableNumber(e.target.value);
      else if(key === 'estimatedMinutes') item.estimatedMinutes = nullableNumber(e.target.value);
      else item[key] = e.target.value;
      if(scope === 'brief') markBriefFieldConfirmed('coreCommitments');
    };
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', handler);
  });
  aiBuilder.overlay.querySelectorAll('[data-commitment-action]').forEach(button => button.onclick = () => {
    const scope = button.dataset.scope;
    const list = scope === 'brief' ? aiBuilder.brief.coreCommitments : aiBuilder.prompt.coreCommitments;
    if(button.dataset.commitmentAction === 'add') list.push(emptyCoreCommitment(list.length));
    if(button.dataset.commitmentAction === 'remove') list.splice(Number(button.dataset.i), 1);
    if(scope === 'brief') markBriefFieldConfirmed('coreCommitments');
    renderAIBuilder();
  });
  aiBuilder.overlay.querySelectorAll('.ai-draft-field').forEach(el => el.addEventListener('input', e => {
    const key = e.target.dataset.key;
    aiBuilder.draft[key] = key === 'durationDays' ? clampDay(e.target.value, aiBuilder.draft.durationDays, 365) : e.target.value;
    aiBuilder.dirty = true;
  }));
  aiBuilder.overlay.querySelectorAll('.ai-section-field').forEach(el => el.addEventListener('input', e => {
    aiBuilder.draft.sections[Number(e.target.dataset.i)][e.target.dataset.key] = e.target.value;
    aiBuilder.dirty = true;
  }));
  aiBuilder.overlay.querySelectorAll('.ai-resource-field').forEach(el => el.addEventListener('input', e => {
    aiBuilder.draft.resources[Number(e.target.dataset.i)][e.target.dataset.key] = e.target.value;
    aiBuilder.dirty = true;
  }));
  aiBuilder.overlay.querySelectorAll('.ai-task-field').forEach(el => {
    const handler = e => {
      const task = aiBuilder.draft.tasks[Number(e.target.dataset.i)];
      const key = e.target.dataset.key;
      if(key === 'evidenceRequired') task[key] = e.target.checked;
      else if(['startDay', 'endDay', 'unlockDay', 'timesPerWeek', 'intervalDays', 'scheduledDay'].includes(key)) task[key] = e.target.value ? clampDay(e.target.value, 1, aiBuilder.draft.durationDays) : null;
      else if(key === 'daysOfWeek') task[key] = e.target.value.split(',').map(value => value.trim()).filter(Boolean);
      else if(['startValue', 'targetValue'].includes(key)) task[key] = nullableNumber(e.target.value);
      else if(key === 'progressionCurve') task[key] = e.target.value || null;
      else task[key] = e.target.value;
      if(key === 'scheduleType'){
        task.taskMode = normalizeTaskMode(task.taskMode, task.scheduleType);
        renderAIBuilder();
      }
      aiBuilder.dirty = true;
    };
    el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', handler);
  });
  aiBuilder.overlay.querySelectorAll('[data-ai-act]').forEach(btn => btn.onclick = () => runAIAction(btn.dataset.aiAct, Number(btn.dataset.i)));
  enhanceVoiceFields(aiBuilder.overlay, aiBuilder.voice);
  if(voiceIsActive(aiBuilder.voice)){
    aiBuilder.overlay.querySelectorAll('button').forEach(button => {
      if(button.closest('.voice-inline-controls')) return;
      if(button.id === 'aiCancel') return;
      button.disabled = true;
    });
  }
  if(!voiceIsActive(aiBuilder.voice) && !suppressNextAIBuilderFocus) focusAIBuilderStep();
  suppressNextAIBuilderFocus = false;
}

function runAIAction(action, i){
  const d = aiBuilder.draft;
  if(action === 'addSection') d.sections.push({ title:'New section', description:'', order:d.sections.length });
  if(action === 'delSection' && d.sections.length > 1) d.sections.splice(i, 1);
  if(action === 'addTask') d.tasks.push({ title:'New task', description:'', sectionTitle:d.sections[0].title, scheduleType:'once', taskMode:'one_off', startDay:1, endDay:null, unlockDay:1, daysOfWeek:[], timesPerWeek:null, intervalDays:null, scheduledDay:1, progressionMetric:null, progressionUnit:null, startValue:null, targetValue:null, progressionCurve:null, progressionNotes:null, evidenceRequired:false, resourceUrl:null, order:d.tasks.length });
  if(action === 'delTask') d.tasks.splice(i, 1);
  if(action === 'addResource') d.resources.push({ title:'Resource', url:'', description:'' });
  if(action === 'delResource') d.resources.splice(i, 1);
  aiBuilder.dirty = true;
  renderAIBuilder();
}

async function handleBuildWithAI(){
  if(!canStartBuilderAction()) return;
  const validationError = validateAIBuilderInputs() || validateMeaningfulGoal();
  if(validationError){
    aiBuilder.error = validationError;
    aiBuilder.phase = 'error';
    renderAIBuilder();
    return;
  }
  aiBuilder.prompt = collectAIPrompt();
  if(!store.currentUser){
    aiBuilder.error = 'Sign in to use Build with AI. Basic starter remains available without an AI request.';
    aiBuilder.phase = 'error';
    renderAIBuilder();
    if(configPresent()) openAuthModal('login');
    return;
  }
  aiBuilder.prompt.assumptions = [];
  aiBuilder.prompt.progressiveTargets = [];
  aiBuilder.prompt.clarifiedBrief = null;
  if(typeof navigator !== 'undefined' && navigator.onLine === false){
    aiBuilder.error = 'Build with AI requires a connection. Your goal is still saved, and Basic starter remains available.';
    aiBuilder.phase = 'error';
    renderAIBuilder();
    return;
  }
  aiBuilder.brief = null;
  aiBuilder.clarifyingAnswers = {};
  aiBuilder.clarificationRound = 0;
  await requestGoalInterpretation(false);
}

async function requestGoalInterpretation(withAnswers){
  if(!canStartBuilderAction()) return;
  const builder = aiBuilder;
  const previousPhase = builder.phase;
  const questions = normalizeClarifyingQuestions(builder.brief?.clarifyingQuestions || []);
  const answers = withAnswers ? questions.map(question => ({
    id:question.id,
    targetField:question.targetField,
    question:question.prompt,
    value:answerPayloadForQuestion(question, builder.clarifyingAnswers[question.id]),
    answer:answerValueForQuestion(question, builder.clarifyingAnswers[question.id]),
  })).filter(item => item.answer || (item.value && typeof item.value === 'object' && Object.keys(item.value).length)) : [];
  if(withAnswers && !answers.length){
    aiBuilder.error = 'Answer at least one question before updating your brief.';
    renderAIBuilder();
    return;
  }
  const request = beginAIClientRequest(builder, 'interpret');
  builder.phase = 'interpreting';
  startAIProcessingTicker(builder, 4);
  builder.error = '';
  builder.errorRequestId = '';
  builder.message = withAnswers ? 'Preparing your updated brief...' : 'Understanding your goal...';
  renderAIBuilder();
  try{
    const response = await authenticatedAIRequest(request, '/api/interpret-goal', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        roughGoal:builder.prompt.goal,
        context:builder.prompt,
        previousBrief:builder.brief || briefFromPrompt(builder.prompt),
        answers,
        clarificationRound:withAnswers ? builder.clarificationRound + 1 : builder.clarificationRound,
        maxClarificationRounds:MAX_AI_CLARIFICATION_ROUNDS,
      }),
    }, AI_INTERPRET_TIMEOUT_MS);
    const payload = await parseAIResponse(response);
    if(!response.ok || !payload.ok){
      throw errorFromAIPayload(payload, 'Could not understand this goal.');
    }
    if(!aiRequestIsCurrent(request)) return;
    const brief = normalizeGoalBrief(payload.brief);
    if(!isMeaningfulAIGoal(brief.goal || brief.summary)){
      const error = new Error('The AI returned an incomplete goal brief. Please retry.');
      error.code = 'invalid_goal_brief';
      throw error;
    }
    if(withAnswers) builder.clarificationRound += 1;
    const routedPhase = routeInterpretedBrief(brief, builder.clarificationRound);
    if(routedPhase === 'reviewing' && !brief.readyToGenerate){
      brief.assumptions = assumptionsForFinalClarification(brief);
      brief.clarifyingQuestions = [];
    }
    builder.brief = brief;
    builder.errorRequestId = '';
    builder.clarificationIndex = 0;
    builder.phase = routedPhase === 'clarifying' ? 'clarifying' : 'rhythm';
    builder.message = builder.phase === 'clarifying'
      ? 'Answer the focused questions below so the roadmap can fit your situation.'
      : 'Your recommended rhythm is ready to review.';
  }catch(error){
    if(!aiRequestIsCurrent(request)) return;
    const recoveryPhase = builder.brief ? (['brief', 'rhythm'].includes(previousPhase) ? previousPhase : 'clarifying') : 'error';
    Object.assign(builder, recoverAIBuilderState(builder, aiInterpretationError(error), recoveryPhase), { message:'' });
    builder.errorRequestId = error.requestId || '';
  }finally{
    finishAIClientRequest(request);
    stopAIProcessingTicker();
    if(aiBuilder === builder) renderAIBuilder();
  }
}

function createBasicDraft(){
  if(!canStartBuilderAction()) return;
  const validationError = validateAIBuilderInputs() || validateMeaningfulGoal();
  if(validationError){
    aiBuilder.error = validationError;
    aiBuilder.phase = 'error';
    renderAIBuilder();
    return;
  }
  const prompt = collectAIPrompt();
  prompt.assumptions = [];
  prompt.progressiveTargets = [];
  prompt.clarifiedBrief = null;
  aiBuilder.loading = true;
  aiBuilder.error = '';
  aiBuilder.message = '';
  try{
    const draft = createLocalGeneratedDraft(prompt);
    aiBuilder.brief = confirmBrief(briefFromPrompt(prompt));
    aiBuilder.draft = normalizeAIGeneratedDraft(draft, { ...prompt, confirmedBrief:aiBuilder.brief });
    aiBuilder.draft.source = 'fallback';
    aiBuilder.message = 'Basic starter template created without AI. Review it before saving.';
    aiBuilder.mode = 'guided';
    aiBuilder.phase = 'preview';
    aiBuilder.fullRoadmap = false;
    aiBuilder.dirty = false;
  }catch(error){
    aiBuilder.phase = 'error';
    aiBuilder.error = error.message || 'Could not create a basic starter draft.';
  }finally{
    aiBuilder.loading = false;
    renderAIBuilder();
  }
}

async function generateRoadmapFromBrief(){
  if(!canStartBuilderAction() || aiBuilder.phase !== 'brief' || !aiBuilder.brief) return;
  applyAdvancedInputsToBrief();
  const validationError = validateAIBuilderInputs();
  if(validationError){
    aiBuilder.error = validationError;
    renderAIBuilder();
    return;
  }
  const brief = normalizeGoalBrief(aiBuilder.brief);
  if(!isMeaningfulAIGoal(brief.goal || brief.summary)){
    aiBuilder.error = 'Review the interpreted goal before generating your roadmap.';
    renderAIBuilder();
    return;
  }
  if(!brief.durationDays){
    aiBuilder.error = 'Set a duration in the brief before generating your roadmap.';
    renderAIBuilder();
    return;
  }
  const unaccepted = unacceptedMaterialAssumptions(brief);
  if(unaccepted.length){
    aiBuilder.error = 'Accept, edit, or remove every material assumption before generating the roadmap.';
    renderAIBuilder();
    return;
  }
  brief.description = aiBuilder.prompt.description || brief.description || brief.goal || '';
  brief.requestedTasks = aiBuilder.prompt.includeTasks || brief.requestedTasks || '';
  brief.excludedTasks = aiBuilder.prompt.excludeTasks || brief.excludedTasks || '';
  const promptResources = [aiBuilder.prompt.existingResources, aiBuilder.prompt.resourceLinks]
    .filter(Boolean).join('\n').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if(promptResources.length) brief.resources = brief.resourcesMentioned = promptResources.slice(0, 12);
  const confirmedBrief = confirmBrief(brief);
  const patch = briefToPromptPatch(brief);
  const prompt = {
    ...aiBuilder.prompt,
    ...patch,
    visibility:aiBuilder.prompt.visibility || 'private',
    description:aiBuilder.prompt.description || patch.goal || '',
    excludeTasks:aiBuilder.prompt.excludeTasks || '',
    resourceLinks:aiBuilder.prompt.resourceLinks || '',
    clarifiedBrief:confirmedBrief,
    confirmedBrief,
  };
  aiBuilder.prompt = prompt;
  aiBuilder.brief = confirmedBrief;
  const builder = aiBuilder;
  const request = beginAIClientRequest(builder, 'generate');
  builder.phase = 'generating';
  startAIProcessingTicker(builder, 5);
  builder.error = '';
  builder.errorRequestId = '';
  builder.message = '';
  renderAIBuilder();
  try{
    const response = await authenticatedAIRequest(request, '/api/generate-path', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        confirmedBrief,
        saveOptions:{ visibility:prompt.visibility },
      }),
    }, AI_GENERATE_TIMEOUT_MS);
    const payload = await parseAIResponse(response);
    if(!response.ok || !payload.ok){
      throw errorFromAIPayload(payload, 'AI generation failed.');
    }
    if(!aiRequestIsCurrent(request)) return;
    builder.draft = normalizeAIGeneratedDraft(payload.draft, prompt);
    builder.errorRequestId = '';
    builder.draft.source = payload.source || 'anthropic';
    builder.message = payload.message || 'AI draft generated. Review before saving.';
    builder.mode = 'guided';
    builder.phase = 'preview';
    builder.fullRoadmap = false;
    builder.dirty = false;
  }catch(error){
    if(!aiRequestIsCurrent(request)) return;
    builder.phase = 'brief';
    if(error.code === 'unauthorized') builder.error = 'Your session has expired. Sign in again to continue.';
    else if(error.code === 'rate_limited') builder.error = 'You have reached the current AI usage limit. Your brief is saved. Try again later.';
    else if(error.code === 'server_function_failed') builder.error = SERVER_FUNCTION_FAILED_MESSAGE;
    else if(error.code === 'invalid_server_response') builder.error = 'The server returned an unreadable response. Your confirmed brief is still saved. Try again.';
    else if(['operation_timeout', 'provider_timeout'].includes(error.code)) builder.error = 'The AI request took too long and was cancelled. Your information is still saved.';
    else if(error.code === 'provider_output_truncated') builder.error = "Claude's roadmap was cut off before it finished. Your confirmed brief is still saved. Please regenerate.";
    else if(error.code === 'missing_tool_use') builder.error = 'Claude did not return the required roadmap format. Your confirmed brief is still saved. Please regenerate.';
    else if(error.code === 'provider_refusal') builder.error = 'Claude could not generate this roadmap as written. Review the brief and try again.';
    else if(error.code === 'provider_context_limit') builder.error = 'The roadmap request was too large to complete in one response. Your confirmed brief is still saved.';
    else if(error.code === 'invalid_provider_response') builder.error = 'The roadmap response could not be validated. Your confirmed brief is still saved.';
    else if(error.code === 'provider_unavailable') builder.error = 'The AI service is temporarily unavailable. Try again, or use Basic starter.';
    else if(error.code === 'brief_not_confirmed') builder.error = 'Review and confirm your path brief before generating the roadmap.';
    else builder.error = error.message || 'Could not generate a roadmap. Your confirmed brief is still saved.';
    builder.errorRequestId = error.requestId || '';
  }finally{
    finishAIClientRequest(request);
    stopAIProcessingTicker();
    if(aiBuilder === builder) renderAIBuilder();
  }
}

async function saveGeneratedPath(){
  if(!aiBuilder?.draft || aiBuilder.saving) return;
  if(voiceIsActive(aiBuilder.voice)) return;
  aiBuilder.saving = true;
  aiBuilder.error = '';
  aiBuilder.message = 'Saving generated path...';
  aiBuilder.phase = 'saving';
  if(aiBuilder.saveOptions?.visibility){
    aiBuilder.draft.visibility = aiBuilder.saveOptions.visibility;
    aiBuilder.prompt.visibility = aiBuilder.saveOptions.visibility;
  }
  aiSaveClientId = aiSaveClientId || ('ai_' + Date.now().toString(36) + Math.floor(Math.random()*99999).toString(36));
  renderAIBuilder();
  try{
    if(configPresent() && store.currentUser && !cloudAvailable()) throw new Error(cloudFailureMessage());
    const localPath = {
      ...aiGeneratedDraftToLocalPath(normalizeAIGeneratedDraft(aiBuilder.draft, aiBuilder.prompt), store.currentUser),
      clientSaveId: aiSaveClientId,
    };
    let id = 'up_' + Date.now().toString(36) + Math.floor(Math.random()*999).toString(36);
    if(cloudActive()){
      const cloudId = await trackOperation('save generated path', withTimeout(dbCreatePlatformPath(localPath), AI_SAVE_TIMEOUT_MS, 'save generated path'));
      if(!cloudId){
        throw new Error('Could not save generated path. Check Firebase rules, connection, or permissions.');
      }
      id = cloudId;
    } else if(configPresent()){
      aiBuilder.error = 'Sign in to save this generated path to the platform. Your draft will stay open.';
      aiBuilder.saving = false;
      aiBuilder.phase = 'preview';
      renderAIBuilder();
      openAuthModal('signup');
      return;
    } else {
      store.state.userPaths[id] = localPath;
      await dbSaveState();
    }
    ensureSkill(id);
    aiBuilder.savedPathId = id;
    aiBuilder.savedPath = store.state.userPaths[id] || localPath;
    aiBuilder.phase = 'ready';
    aiBuilder.saving = false;
    aiBuilder.message = '';
    aiBuilder.error = '';
    renderAIBuilder();
    flash('Generated path saved');
    aiSaveClientId = null;
  }catch(e){
    aiBuilder.saving = false;
    aiBuilder.phase = 'preview';
    aiBuilder.error = e?.code === 'operation_timeout'
      ? 'Saving is taking too long. Please check your connection/Firebase rules and try again.'
      : (e.message || 'Could not save generated path. Check Firebase rules, connection, or permissions.');
    renderAIBuilder();
  }
}

function createPath(){
  const bySkill = {};
  TEMPLATES.forEach(t => { (bySkill[t.skill] = bySkill[t.skill] || []).push(t); });
  let list = '<button class="tpl-row sel" data-tpl="blank"><div class="tpl-name">Blank path</div><div class="tpl-meta">Start empty and build every week yourself</div></button>';
  Object.keys(bySkill).forEach(skill => {
    list += '<div class="tpl-skill">' + esc(skill) + '</div>';
    bySkill[skill].forEach(t => {
      list += '<button class="tpl-row" data-tpl="' + esc(t.id) + '"><div class="tpl-name">' + esc(t.title) + '</div><div class="tpl-meta">' + t.weeks.length + ' weeks · ' + esc(t.goal) + '</div></button>';
    });
  });
  const o = document.createElement('div'); o.className = 'modal-overlay';
  o.innerHTML = '<div class="modal-box wide"><div class="modal-head"><h3>Create a new path</h3><button class="modal-x">×</button></div>'
    + '<div class="modal-body">'
    + '<div class="form-error" id="npErr" style="display:none"></div>'
    + '<div class="muted" style="font-size:12px;margin-bottom:10px">Start from a template or blank. Everything stays fully editable after you create it.</div>'
    + '<div class="tpl-list">' + list + '</div>'
    + '<div class="field" style="margin-top:14px"><label>Path name</label><input type="text" id="npTitle" placeholder="Name your path" maxlength="80"/></div>'
    + '<div class="field" style="margin-top:10px"><label>Your goal (optional)</label><textarea id="npGoal" placeholder="What does finishing this path look like?"></textarea></div>'
    + '<div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:16px;flex-wrap:wrap"><button class="btn" id="npAi">Build with AI</button><div style="display:flex;gap:10px"><button class="btn" id="npCancel">Cancel</button><button class="btn gold" id="npCreate">Create path</button></div></div>'
    + '</div></div>';
  document.body.appendChild(o);
  let busy = false;
  const creationClientId = 'tpl_' + Date.now().toString(36) + Math.floor(Math.random()*99999).toString(36);
  const close = () => { if(!busy) o.remove(); };
  const setErr = msg => {
    const el = o.querySelector('#npErr');
    if(el){ el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
  };
  const setBusy = val => {
    busy = val;
    const createBtn = o.querySelector('#npCreate');
    const cancelBtn = o.querySelector('#npCancel');
    const aiBtn = o.querySelector('#npAi');
    if(createBtn){ createBtn.disabled = val; createBtn.textContent = val ? 'Creating...' : 'Create path'; }
    if(cancelBtn) cancelBtn.disabled = val;
    if(aiBtn) aiBtn.disabled = val;
    o.querySelectorAll('.tpl-row').forEach(row => row.disabled = val);
  };
  o.addEventListener('click', e => { if(e.target === o) close(); });
  o.querySelector('.modal-x').onclick = close;
  o.querySelector('#npCancel').onclick = close;
  o.querySelector('#npAi').onclick = () => { if(busy) return; close(); openAIPathBuilder(); };
  let pick = 'blank';
  const titleIn = o.querySelector('#npTitle'), goalIn = o.querySelector('#npGoal');
  o.querySelectorAll('.tpl-row').forEach(row => row.onclick = () => {
    o.querySelectorAll('.tpl-row').forEach(r => r.classList.remove('sel'));
    row.classList.add('sel');
    pick = row.dataset.tpl;
    if(pick === 'blank'){ titleIn.value = ''; goalIn.value = ''; titleIn.placeholder = 'Name your path'; }
    else { const t = TEMPLATES.find(x => x.id === pick); if(t){ titleIn.value = t.title; goalIn.value = t.goal; } }
  });
  o.querySelector('#npCreate').onclick = async () => {
    if(busy || isCreatingPath) return;
    setErr('');
    let title = titleIn.value.trim(); const goal = goalIn.value.trim();
    let weeks;
    if(pick === 'blank'){
      if(!title){ titleIn.focus(); return; }
      weeks = [{ title:'Week 1 - Foundations', tasks:[{text:'Define what good looks like for this skill'},{text:'Find 3 references or examples to study'}], resources:[] }];
    } else {
      const t = TEMPLATES.find(x => x.id === pick); if(!t){ return; }
      if(!title) title = t.title;
      weeks = t.weeks.map(w => ({
        title: w.title,
        tasks: (w.tasks || []).map(tk => ({
          text: tk.text,
          scheduleType: tk.scheduleType || null,
          taskMode: tk.taskMode || null,
          unlockDay: tk.unlockDay == null ? null : tk.unlockDay,
          startDay: tk.startDay == null ? null : tk.startDay,
          endDay: tk.endDay == null ? null : tk.endDay,
          progressionMetric: tk.progressionMetric || null,
          progressionUnit: tk.progressionUnit || null,
          startValue: tk.startValue == null ? null : tk.startValue,
          targetValue: tk.targetValue == null ? null : tk.targetValue,
          progressionCurve: tk.progressionCurve || null,
          progressionNotes: tk.progressionNotes || null,
          evidenceRequired: !!tk.evidenceRequired,
        })),
        resources: (w.resources || []).map(r => ({ label: r.label, url: r.url })),
      }));
    }
    let id = 'up_' + Date.now().toString(36) + Math.floor(Math.random()*999).toString(36);
    const pickedTemplate = TEMPLATES.find(x => x.id === pick);
    const localPath = {
      title, goal, description: goal, category: '',
      durationDays: pickedTemplate ? (pickedTemplate.durationDays || weeks.length * 7) : weeks.length * 7,
      durationLabel: pickedTemplate ? (pickedTemplate.durationLabel || (weeks.length + ' weeks')) : (weeks.length + ' weeks'),
      creatorName: store.currentUser ? (store.currentUser.displayName || (store.currentUser.email || '').split('@')[0]) : '',
      creatorId: store.currentUser?.uid || '',
      creatorEmail: store.currentUser?.email || '',
      visibility: 'private', discoverable: false, previewEnabled: true,
      previewTitle: title, previewDescription: goal, previewIncludesScheme: false,
      coverImage: null, profileImage: null, created: Date.now(), weeks,
      clientSaveId: creationClientId,
      intentionallyEmpty: false,
    };
    setBusy(true);
    isCreatingPath = true;
    try{
      if(configPresent() && store.currentUser && !cloudAvailable()) throw new Error(cloudFailureMessage());
      if(cloudActive()){
        const cloudId = await trackOperation('create template path', withTimeout(dbCreatePlatformPath(localPath), AI_SAVE_TIMEOUT_MS, 'create template path'));
        if(!cloudId) throw new Error('Could not create path. Please try again.');
        id = cloudId;
      } else {
        store.state.userPaths[id] = localPath;
        await dbSaveState();
      }
      ensureSkill(id);
      busy = false;
      close(); await openSkill(id, { tab:'plan' });
      if(pick === 'blank'){ store.editMode = true; }
      store.nav.switchTab('plan');
      flash('Path created');
    }catch(e){
      setErr(e?.code === 'operation_timeout' ? 'This is taking too long. Check your connection and try again.' : (e.message || 'Could not create path. Please try again.'));
      setBusy(false);
    }finally{
      isCreatingPath = false;
    }
  };
}

/* ---- enter / leave a skill ---- */
function renderOpenedPath(id, options = {}){
  store.state.current = id; ensureSkill(id); store.editMode = false;
  store.route = { kind:'path', id };
  clearPendingPathRoute(id);
  selectedJourneyDay = options.day ? (Number(options.day) || null) : null;
  focusScreenActive = false;
  const def = (store.state.skills[id] && store.state.skills[id].meta) || {};
  store.currentWeek = def.lastWeek || 1;
  const allowedUserTabs = ['plan', 'log'];
  const allowedBuiltInTabs = ['today', 'week', 'map', 'ladders', 'drills', 'res', 'log'];
  const requestedTab = options.tab || curState().meta.lastTab;
  const startTab = isUserPath(id)
    ? (allowedUserTabs.includes(requestedTab) ? requestedTab : 'plan')
    : (allowedBuiltInTabs.includes(requestedTab) ? requestedTab : 'today');
  store.activeTab = startTab;
  dbSaveState(); applyHeader();
  if(!isUserPath(id)) refreshSuggest();
  updateOverall(); store.nav.switchTab(startTab);
  if(options.focus && selectedJourneyDay){
    navigateToFocus(id, selectedJourneyDay);
  } else {
    setRoute(pathHash(id, startTab, selectedJourneyDay));
  }
  openingPathId = null;
  window.scrollTo({ top:0, behavior:'smooth' });
}

function syncOpenedPathInBackground(id){
  if(!isUserPath(id)) return;
  const def = store.state.userPaths[id];
  if(def?.platform && !canOpenFullPath(id, def)) return;
  const syncToken = Date.now() + ':' + id;
  store.activeEnrollmentSync = syncToken;
  trackOperation('start enrollment', withTimeout((async () => {
    const enrollment = await dbEnsureEnrollment(id);
    const def = store.state.userPaths[id];
    const todayDay = enrollment?.startDate ? journeyDayForDate(enrollment.startDate) : 1;
    const taskCount = getTasksForDay(def, Math.max(1, Number(enrollment?.currentDay || todayDay))).length;
    await dbReconcileEnrollment(id, taskCount);
    const reconciled = currentEnrollmentForPath(id);
    if(reconciled?.id){
      const day = selectedJourneyDay || Number(reconciled.currentDay || todayDay || 1);
      listEvidenceSubmissions(reconciled.id, day).then(() => {
        if(store.state.current === id && store.activeTab === 'plan') renderPlan();
      }).catch(e => console.warn('load evidence:', e && e.message ? e.message : e));
    }
  })(), ENROLLMENT_TIMEOUT_MS, 'start enrollment')).then(() => {
    if(store.activeEnrollmentSync === syncToken && store.state.current === id && store.activeTab === 'plan') renderPlan();
  }).catch(e => {
    console.warn('enrollment sync:', e && e.message ? e.message : e);
    flash(enrollmentStartErrorMessage(e));
    if(store.state.current === id && store.activeTab === 'plan') renderPlan();
  });
}

export async function openSkill(id, options = {}){
  if(openingPathId && openingPathId !== id) openingPathId = id;
  store.state.current = id; ensureSkill(id); store.editMode = false;
  selectedJourneyDay = options.day ? (Number(options.day) || null) : null;
  if(isUserPath(id)){
    let existingDef = store.state.userPaths[id];
    if(existingDef?.platform && !canOpenFullPath(id, existingDef)){
      let previewRecord = platformAccessRecord(id, existingDef);
      if(cloudAvailable()){
        try{
          const loaded = await trackOperation('path preview access check', withTimeout(dbLoadPlatformPath(id), PATH_OPEN_TIMEOUT_MS, 'load path preview'));
          existingDef = store.state.userPaths[id] || existingDef;
          if(canAccessFullPath(loaded?.path, loaded?.membership, store.currentUser)){
            previewRecord = loaded;
          } else {
            previewRecord = loaded || platformAccessRecord(id, existingDef);
          }
        }catch(e){
          console.warn('path access check:', e && e.message ? e.message : e);
        }
      }
      if(!canOpenFullPath(id, existingDef)){
        openingPathId = null;
        setRoute(pathPreviewHash(id));
        if(canPreviewPath(previewRecord.path, store.currentUser)) renderPathPreview(previewRecord);
        else renderAccessBlocked(previewRecord);
        return false;
      }
    }
    if(existingDef?.platform && !pathTasksReady(existingDef)){
      renderPathOpening('Opening path...', 'Loading path tasks before enabling the roadmap.');
      setRoute(pathHash(id, options.tab || 'plan', selectedJourneyDay));
      if(!cloudAvailable()){
        openingPathId = null;
        renderPathLoadError(id, cloudFailureMessage());
        return;
      }
      trackOperation('path children load', withTimeout(dbLoadPlatformPath(id), PATH_OPEN_TIMEOUT_MS, 'load path tasks'))
        .then(() => {
          if(store.state.current === id){
            renderOpenedPath(id, options);
            syncOpenedPathInBackground(id);
          }
        })
        .catch(e => {
          if(store.state.current === id){
            openingPathId = null;
            renderPathLoadError(id, userSyncMessage(e, 'Could not load path tasks. Try again.'));
          }
        });
      return;
    }
    if(existingDef?.platform) store.cloudDiagnostics.selectedPathChildrenStatus = 'cached';
  }
  renderOpenedPath(id, options);
  syncOpenedPathInBackground(id);
}
export function goCatalog(){
  clearPendingPathRoute();
  focusScreenActive = false;
  store.route = { kind:'app', page:'discover' };
  store.state.current = null; store.editMode = false;
  dbSaveState(); applyHeader(); renderCatalog();
  setRoute(appHash('discover'));
  window.scrollTo({ top:0, behavior:'smooth' });
}

export function goWorkspace(){
  clearPendingPathRoute();
  focusScreenActive = false;
  store.route = { kind:'app', page:'paths' };
  store.state.current = null; store.editMode = false;
  dbSaveState(); applyHeader(); renderWorkspace();
  setRoute(appHash('paths'));
  window.scrollTo({ top:0, behavior:'smooth' });
}

export async function handleHashRoute(){
  const hash = (location.hash || '').replace(/^#\/?/, '');
  if(hash === 'dev/design-system' || hash === 'design-system'){
    renderDesignSystemGalleryRoute();
    return true;
  }
  const appRoute = parseAppRoute({ hash:location.hash });
  if(appRoute){
    clearPendingPathRoute();
    if(appRoute.page === 'discover'){
      store.route = { kind:'app', page:'discover' };
      store.state.current = null;
      store.editMode = false;
      renderCatalog();
    } else if(appRoute.page === 'paths'){
      store.route = { kind:'app', page:'paths' };
      store.state.current = null;
      store.editMode = false;
      renderWorkspace();
    } else if(appRoute.page === 'progress'){
      renderProgress();
    } else if(appRoute.page === 'profile'){
      renderProfile();
    } else {
      store.route = { kind:'app', page:'today' };
      store.editMode = false;
      renderToday();
    }
    return true;
  }
  const route = parsePathRoute({ hash:location.hash, pathname:location.pathname, search:location.search });
  if(!route) return false;
  await openPathRoute(route.id, route.preview, route.options || {}, { source:route.source || 'hash' });
  return true;
}

function renderDesignSystemGalleryRoute(){
  clearPendingPathRoute();
  focusScreenActive = false;
  store.route = { kind:'design-system-gallery' };
  store.state.current = null;
  store.editMode = false;
  applyHeader();
  $('content').innerHTML = renderDesignSystemGallery();
}

async function openPathRoute(id, forcePreview, options = {}, routeMeta = {}){
  if(isUserPath(id) || SKILLS.some(s => s.id === id)){
    if(forcePreview && isUserPath(id)){
      const def = store.state.userPaths[id];
      clearPendingPathRoute(id);
      store.route = { kind:'path-preview', id, source:routeMeta.source || 'hash' };
      renderPathPreview({ id, path:def.platformData || def, membership:def.membership || null, sections:[], tasks:[] });
    } else await openSkill(id, options);
    return;
  }
  let record = null;
  try{
    renderPathOpening('Opening path...', 'Loading platform path details.');
    if(!cloudAvailable()){
      setPendingPathRoute({ kind:'path', id, preview:forcePreview, options, source:routeMeta.source || 'hash' }, 'cloud');
      renderPendingPathRouteState();
      return;
    }
    record = await trackOperation('path children load', withTimeout(dbLoadPlatformPath(id), PATH_OPEN_TIMEOUT_MS, 'load platform path'));
  }catch(e){
    if(!cloudAvailable()){
      setPendingPathRoute({ kind:'path', id, preview:forcePreview, options, source:routeMeta.source || 'hash' }, 'cloud');
      renderPendingPathRouteState();
    } else {
      clearPendingPathRoute(id);
      renderPathLoadError(id, userSyncMessage(e, 'Could not load path tasks. Try again.'));
    }
    return;
  }
  if(!record){
    clearPendingPathRoute(id);
    renderMissingPath();
    return;
  }
  if(!forcePreview && canAccessFullPath(record.path, record.membership, store.currentUser)){
    clearPendingPathRoute(id);
    await openSkill(id, options);
    return;
  }
  if(canPreviewPath(record.path, store.currentUser)){
    if(store.currentUser) await dbLoadMyAccessRequest(id);
    clearPendingPathRoute(id);
    store.route = { kind:'path-preview', id, source:routeMeta.source || 'hash' };
    renderPathPreview(record);
  } else {
    clearPendingPathRoute(id);
    renderAccessBlocked(record);
  }
}

function renderMissingPath(){
  store.state.current = null; store.editMode = false; store.route = { kind:'path-error', reason:'missing' }; applyHeader();
  $('content').innerHTML = '<div class="panel card empty-state"><div class="section-title">Path not found.</div><div class="muted">This path may have been removed, hidden, or shared with the wrong link.</div><button class="btn" id="backDiscover" style="margin-top:14px">Back to discover</button></div>';
  const b = $('backDiscover'); if(b) b.onclick = goCatalog;
}

function renderAccessBlocked(record){
  store.state.current = null; store.editMode = false; store.route = { kind:'path-error', reason:'private', id:record?.id || null }; applyHeader();
  $('content').innerHTML = '<div class="panel card empty-state"><div class="section-title">' + esc(record.path.title) + '</div><div class="muted">This path is private. The creator has not enabled a public preview.</div></div>';
}

function renderLegacyPathPreview(record){
  const path = record.path;
  const coverImage = safeExternalUrl(path.coverImage);
  const profileImage = safeExternalUrl(path.profileImage);
  const req = store.accessRequests[record.id];
  store.state.current = null; store.editMode = false; applyHeader();
  let h = '<div class="preview-hero panel">'
    + (coverImage ? '<div class="preview-cover" style="background-image:url(\'' + esc(coverImage.replace(/'/g, '%27')) + '\')"></div>' : '')
    + '<div class="preview-body">'
    + (profileImage ? '<img class="preview-avatar" src="' + esc(profileImage) + '" alt=""/>' : '')
    + '<div class="chip">' + esc(path.visibility) + ' preview</div>'
    + '<div class="section-title" style="margin-top:10px">' + esc(path.previewTitle || path.title) + '</div>'
    + '<div class="muted" style="max-width:680px;margin-top:8px">' + esc(path.previewDescription || path.description || path.goal || '') + '</div>'
    + '<div class="preview-meta">' + esc(path.category || 'Learning path') + (path.durationLabel ? ' · ' + esc(path.durationLabel) : '') + (path.creatorName ? ' · by ' + esc(path.creatorName) : '') + '</div>'
    + '<div class="preview-actions">';
  if(canViewPath(path, record.membership, store.currentUser)){
    h += '<button class="btn gold" id="openFullPath">Open full path</button>';
  } else if(!store.currentUser){
    h += '<button class="btn gold" id="previewSignIn">Sign in to request access</button>';
  } else if(req && req.status === 'pending'){
    h += '<button class="btn" disabled>Access requested</button>';
  } else if(canRequestAccess(path, record.membership, store.currentUser)){
    h += '<button class="btn gold" id="requestAccess">Request access</button>';
  }
  h += '</div></div></div>';
  if(path.previewIncludesScheme && record.sections && record.sections.length){
    h += '<div class="panel card preview-scheme"><h3>Path scheme</h3>'
      + record.sections.sort((a, b) => (a.order || 0) - (b.order || 0)).map(s => '<div class="scheme-row"><b>' + esc(s.title) + '</b><span>' + esc(s.description || '') + '</span></div>').join('')
      + '</div>';
  }
  $('content').innerHTML = h;
  const open = $('openFullPath'); if(open) open.onclick = () => openSkill(record.id);
  const si = $('previewSignIn'); if(si) si.onclick = () => openAuthModal('signup');
  const ra = $('requestAccess'); if(ra) ra.onclick = async () => {
    await dbRequestAccess(record.id);
    await dbLoadMyAccessRequest(record.id);
    renderPathPreview(record);
  };
}

function joinedCountCopy(stats){
  const count = normalizePathStats(stats).joinedCount;
  if(!count) return 'Be one of the first to join this path.';
  return count + ' ' + (count === 1 ? 'person has' : 'people have') + ' joined';
}

function statCardHTML(label, value, copy){
  return '<article><span>' + esc(label) + '</span><b>' + esc(value) + '</b><small>' + esc(copy) + '</small></article>';
}

function trustBadgesHTML(stats){
  const badges = trustBadgesForStats(stats);
  if(!badges.length) return '';
  return '<div class="trust-badges" aria-label="Path trust badges">'
    + badges.map(badge => '<span>' + esc(badge) + '</span>').join('')
    + '</div>';
}

function publicPathTrustStatsHTML(stats, path){
  const active = displayableActiveThisWeek(stats);
  const staleActive = !activeThisWeekIsCurrent(stats) && stats.activeThisWeek > 0;
  const cards = [
    statCardHTML('Joined', stats.joinedCount || 0, stats.joinedCount ? 'Real participant count' : 'Be one of the first to join.'),
  ];
  if(active != null){
    cards.push(statCardHTML('Active this week', active, active ? 'Signed-in learners active this UTC week' : 'No activity recorded this week yet.'));
  } else if(staleActive){
    cards.push(statCardHTML('Active this week', 0, 'No activity recorded this week yet.'));
  }
  cards.push(statCardHTML('Completed', stats.completedCount || 0, stats.completedCount ? 'Learners completed this path' : 'No completions yet.'));
  cards.push(statCardHTML('Public progress', stats.publicProgressCount || 0, stats.publicProgressCount ? 'Sanitized completed-day updates' : 'No public proof yet.'));
  cards.push(statCardHTML('Day 1 started', stats.day1StartedCount || 0, stats.day1StartedCount ? 'Learners who started Day 1' : 'No Day 1 starts yet.'));
  cards.push(statCardHTML('Reached Day 7', stats.day7ReachedCount || 0, stats.day7ReachedCount ? 'Learners who reached Day 7' : 'No Day 7 milestones yet.'));
  cards.push(statCardHTML('Reached halfway', stats.halfwayReachedCount || 0, stats.halfwayReachedCount ? 'Learners who reached halfway' : 'No halfway milestones yet.'));
  cards.push(statCardHTML('Proof submitted', stats.proofSubmissionCount || 0, stats.proofSubmissionCount ? 'Public proof items shared' : 'No public proof yet.'));
  if(path.durationDays || path.durationLabel){
    cards.push(statCardHTML('Duration', path.durationDays ? (path.durationDays + ' days') : path.durationLabel, 'Creator-defined roadmap length'));
  }
  return '<section class="public-path-stats" aria-label="Path credibility signals">' + cards.join('') + '</section>';
}

function ownerStatsHTML(stats){
  const active = displayableActiveThisWeek(stats);
  const items = [
    ['joined', stats.joinedCount || 0],
    ['public progress', stats.publicProgressCount || 0],
    ['proof submitted', stats.proofSubmissionCount || 0],
    ['completed', stats.completedCount || 0],
  ];
  if(stats.day7ReachedCount) items.push(['reached Day 7', stats.day7ReachedCount]);
  if(stats.halfwayReachedCount) items.push(['halfway', stats.halfwayReachedCount]);
  if(active) items.push(['active this week', active]);
  return '<div class="owner-share-tools stats-managed">'
    + items.map(([label, value]) => '<div><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div>').join('')
    + '<small>Stats are server-managed.</small></div>';
}

function evidenceExpectationCopy(path, record){
  const commitmentEvidence = (path.coreCommitments || []).map(item => item.evidenceType).filter(Boolean);
  const taskEvidence = (record.tasks || []).some(task => task.evidenceRequired);
  if(commitmentEvidence.length) return commitmentEvidence.slice(0, 3).join(', ');
  if(taskEvidence) return 'Proof is required on selected tasks.';
  return 'Simple reflections or activity notes where useful.';
}

function publicDomainSummary(path){
  const bits = [];
  if(path.domainProfile?.primary && path.domainProfile.primary !== 'general') bits.push(path.domainProfile.primary + ' focused');
  if(path.structuredResources?.courses?.length) bits.push(path.structuredResources.courses.length + ' course resource' + (path.structuredResources.courses.length === 1 ? '' : 's'));
  if(path.structuredResources?.books?.length) bits.push(path.structuredResources.books.length + ' book resource' + (path.structuredResources.books.length === 1 ? '' : 's'));
  if(path.structuredResources?.programmes?.length) bits.push(path.structuredResources.programmes.length + ' programme resource' + (path.structuredResources.programmes.length === 1 ? '' : 's'));
  if(path.fitnessContext?.activity || path.fitnessContext?.target) bits.push('fitness progression');
  if(path.fitnessContext?.limitations || path.fitnessContext?.safetyNotes) bits.push('includes creator constraints');
  return bits.length ? bits.join(' - ') : 'Structured learning journey';
}

function milestonePreviewHTML(record){
  const sections = [...(record.sections || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).slice(0, 6);
  if(!sections.length){
    return canAccessFullPath(record.path, record.membership, store.currentUser)
      ? '<div class="muted">Milestones will appear here when the creator adds sections.</div>'
      : '<div class="muted">Join this path to unlock the full daily roadmap.</div>';
  }
  return sections.map(section => '<div class="scheme-row"><b>' + esc(section.title) + '</b><span>' + esc(section.description || 'Milestone in this path') + '</span></div>').join('');
}

function progressEntriesForPath(pathId, record = null){
  const entries = record?.publicProgress?.length ? record.publicProgress : (store.publicProgress?.[pathId] || []);
  return entries
    .map(normalizePublicProgressEntry)
    .filter(entry => entry.visibility === 'public')
    .slice(0, 12);
}

function interactionKey(pathId, entryId, suffix = ''){
  return pathId + ':' + entryId + (suffix ? ':' + suffix : '');
}

function pathReportKey(pathId){
  return 'path:' + pathId;
}

function commentReportKey(pathId, entryId, commentId){
  return 'comment:' + pathId + ':' + entryId + ':' + commentId;
}

function reportReasonOptionsHTML(selected = 'spam'){
  return REPORT_REASONS.map(reason => {
    const label = reason === 'spam' ? 'Spam'
      : reason === 'harassment' ? 'Harassment'
        : reason === 'unsafe' ? 'Unsafe content'
          : reason === 'misleading' ? 'Misleading'
            : 'Other';
    return '<option value="' + esc(reason) + '" ' + (reason === selected ? 'selected' : '') + '>' + esc(label) + '</option>';
  }).join('');
}

function reportFormHTML(key, targetType, options = {}){
  const draft = reportDrafts[key] || {};
  const targetLabel = options.label || reportTargetLabel(targetType);
  const busy = reportBusyKey === key;
  const message = reportMessages[key] || '';
  const reasonId = 'report-reason-' + key.replace(/[^a-zA-Z0-9_-]/g, '-');
  const noteId = 'report-note-' + key.replace(/[^a-zA-Z0-9_-]/g, '-');
  return '<form class="report-form" data-report-key="' + esc(key) + '" data-report-target="' + esc(targetType) + '" ' + (options.entryId ? 'data-entry-id="' + esc(options.entryId) + '" ' : '') + (options.commentId ? 'data-comment-id="' + esc(options.commentId) + '" ' : '') + '>'
    + '<label for="' + esc(reasonId) + '">Reason for reporting this ' + esc(targetLabel.toLowerCase()) + '<select id="' + esc(reasonId) + '" name="reason" aria-label="Report reason">' + reportReasonOptionsHTML(draft.reason || 'spam') + '</select></label>'
    + '<label for="' + esc(noteId) + '">Optional note<textarea id="' + esc(noteId) + '" name="note" maxlength="500" placeholder="Add short context for moderators">' + esc(draft.note || '') + '</textarea></label>'
    + '<div class="report-actions"><button class="btn" type="submit" ' + (busy ? 'disabled' : '') + '>' + (busy ? 'Sending...' : 'Submit report') + '</button><button class="link-btn report-cancel" type="button" data-report-key="' + esc(key) + '">Cancel</button></div>'
    + (message ? '<p class="' + (message.includes('received') ? 'form-success' : 'form-error') + '" role="status">' + esc(message) + '</p>' : '')
    + '</form>';
}

function publicProgressInteractionsHTML(record, entry){
  const key = interactionKey(record.id, entry.id);
  const busy = progressInteractionBusyKey === key;
  const commentBusy = progressInteractionBusyKey === interactionKey(record.id, entry.id, 'comment');
  const user = store.currentUser;
  const currentReaction = entry.currentUserReaction || null;
  const cheered = currentReaction === 'cheer';
  const cheerCount = Number(entry.reactionCounts?.cheer || 0);
  const commentCount = Number(entry.visibleCommentCount || entry.comments.length || 0);
  const error = progressInteractionErrors[key] || '';
  const owner = isOwner(record.path, user);
  let h = '<div class="progress-interactions proof-action-row" data-entry-id="' + esc(entry.id) + '">'
    + '<div class="progress-interaction-row">'
    + '<button class="btn progress-cheer" type="button" data-entry-id="' + esc(entry.id) + '" aria-pressed="' + (cheered ? 'true' : 'false') + '" ' + (busy ? 'disabled' : '') + '>'
    + (cheered ? 'Respected' : 'Respect') + '</button>'
    + '<span aria-label="' + esc(cheerCount + ' respects') + '">' + esc(cheerCount) + ' respect' + (cheerCount === 1 ? '' : 's') + '</span>'
    + '<span>Comment</span>'
    + '<span aria-label="' + esc(commentCount + ' comments') + '">' + esc(commentCount) + ' comment' + (commentCount === 1 ? '' : 's') + '</span>'
    + '<span>Report</span>'
    + '</div>';
  if(!user){
    h += '<button class="btn subtle progress-signin" type="button" data-entry-id="' + esc(entry.id) + '">Sign in to respect or comment</button>';
  } else {
    const draft = progressCommentDrafts[key] || '';
    h += '<form class="progress-comment-form" data-entry-id="' + esc(entry.id) + '">'
      + '<label for="comment-' + esc(entry.id) + '">Add a comment</label>'
      + '<div><input id="comment-' + esc(entry.id) + '" name="body" maxlength="500" value="' + esc(draft) + '" placeholder="Reply with encouragement">'
      + '<button class="btn" type="submit" ' + (commentBusy ? 'disabled' : '') + '>' + (commentBusy ? 'Posting...' : 'Post') + '</button></div>'
      + '</form>';
  }
  if(error) h += '<p class="form-error" role="alert">' + esc(error) + '</p>';
  if(entry.comments.length){
    h += '<div class="progress-comments" aria-label="Visible comments">';
    entry.comments.forEach(comment => {
      const canHide = !!(user && (comment.userId === user.uid || owner));
      const commentKey = commentReportKey(record.id, entry.id, comment.id);
      const reporting = reportPanelKey === commentKey;
      const reportMessage = reportMessages[commentKey] || '';
      h += '<article class="progress-comment">'
        + '<div><b>' + esc(comment.authorName) + '</b><small>' + esc(dateText(comment.createdAt) || '') + '</small></div>'
        + '<p>' + esc(comment.body) + '</p>'
        + '<div class="progress-comment-actions">'
        + (canHide ? '<button class="link-btn progress-comment-hide" type="button" data-entry-id="' + esc(entry.id) + '" data-comment-id="' + esc(comment.id) + '">Hide comment</button>' : '')
        + '<button class="link-btn progress-comment-report" type="button" data-entry-id="' + esc(entry.id) + '" data-comment-id="' + esc(comment.id) + '" aria-label="Report comment by ' + esc(comment.authorName) + '">Report</button>'
        + '</div>'
        + (reporting && user ? reportFormHTML(commentKey, 'publicProgressComment', { label:'Comment', entryId:entry.id, commentId:comment.id }) : '')
        + (!reporting && reportMessage ? '<p class="' + (reportMessage.includes('received') ? 'form-success' : 'form-error') + '" role="status">' + esc(reportMessage) + '</p>' : '')
        + '</article>';
    });
    h += '</div>';
  }
  return h + '</div>';
}

function publicProgressTimelineHTML(record){
  const entries = progressEntriesForPath(record.id, record);
  let h = '<section class="panel card public-progress-section" aria-label="Recent public progress">'
    + '<div class="public-progress-head"><div><h3>Recent public progress</h3><p>Proof-first learner updates from completed days. Every number here is proof-backed.</p></div>'
    + '<span>' + esc(entries.length) + '</span></div>';
  if(!entries.length){
    h += '<div class="muted">No public progress has been shared yet.</div>';
  } else {
    h += '<div class="public-progress-list">';
    entries.forEach(entry => {
      const evidence = entry.hasEvidence
        ? (entry.evidenceCount + ' proof item' + (entry.evidenceCount === 1 ? '' : 's') + (entry.evidenceTypes.length ? ' - ' + entry.evidenceTypes.map(evidenceTypeLabel).join(', ') : ''))
        : 'No public proof details';
      const score = entry.completionScore ? '<span>' + esc(entry.completionScore) + '% ' + esc((entry.completionTier || 'completed').replace(/_/g, ' ')) + '</span>' : '';
      const proofTitle = entry.publicCaption || ('Day ' + entry.dayNumber + ' proof');
      const proofSummary = entry.taskSummary.length
        ? entry.taskSummary.map(item => item.title).join(' - ')
        : evidence;
      h += '<article class="public-progress-entry proof-first-progress-card" data-proof-state="submitted">'
        + '<div class="progress-author">' + (entry.authorPhotoURL ? '<img src="' + esc(entry.authorPhotoURL) + '" alt=""/>' : '<span></span>')
        + '<div><b>' + esc(entry.authorName) + '</b><small>Day ' + esc(entry.dayNumber) + ' - ' + esc(record.path?.title || record.path?.goal || 'Path') + (dateText(entry.publishedAt) ? ' - ' + esc(dateText(entry.publishedAt)) : '') + '</small></div></div>'
        + '<h4>' + esc(proofTitle) + '</h4>'
        + '<p class="progress-caption proof-card-specimen">' + esc(proofSummary) + '</p>'
        + '<div class="progress-metrics proof-card-meta"><span>Proof submitted</span><span>' + esc((entry.completionTier || 'completed').replace(/_/g, ' ')) + '</span><span>' + esc(entry.requiredCompletedCount) + '/' + esc(entry.requiredTotalCount) + ' required</span><span>' + esc(entry.optionalCompletedCount) + '/' + esc(entry.optionalTotalCount) + ' optional</span><span>' + esc(evidence) + '</span>' + score + '</div>';
      if(entry.taskSummary.length){
        h += '<div class="progress-tasks">' + entry.taskSummary.map(item => '<em>' + esc(item.title) + '</em>').join('') + '</div>';
      }
      h += publicProgressInteractionsHTML(record, entry) + '</article>';
    });
    h += '</div>';
  }
  return h + '</section>';
}

function publicProgressFeedHTML(){
  const records = Object.entries(store.state.userPaths || {}).map(([id, def]) => ({
    id,
    path:def.platformData || def,
    publicProgress:store.publicProgress?.[id] || def.publicProgress || [],
  }));
  const entries = [];
  records.forEach(record => {
    progressEntriesForPath(record.id, record).forEach(entry => {
      entries.push({ record, entry });
    });
  });
  entries.sort((a, b) => {
    const aTime = new Date(a.entry.publishedAt || a.entry.createdAt || 0).getTime() || 0;
    const bTime = new Date(b.entry.publishedAt || b.entry.createdAt || 0).getTime() || 0;
    return bTime - aTime;
  });
  if(!entries.length){
    return '<section class="panel card public-progress-section aurora-progress-empty"><div class="public-progress-head"><div><h3>Public progress</h3><p>Real public proof updates from loaded paths will appear here.</p></div></div>'
      + '<div class="muted">No public progress is loaded yet. Open public path previews or publish proof-backed updates to populate this page.</div></section>';
  }
  let h = '<section class="public-progress-section aurora-progress-feed" aria-label="Loaded public progress"><div class="public-progress-head"><div><h3>Public progress</h3><p>Only real loaded public proof entries are shown here.</p></div></div><div class="public-progress-list">';
  entries.slice(0, 20).forEach(({ record, entry }) => {
    const pathName = record.path?.title || record.path?.goal || 'Path';
    const proofTitle = entry.publicCaption || ('Day ' + entry.dayNumber + ' proof');
    const summary = entry.taskSummary?.length
      ? entry.taskSummary.map(item => item.title).join(' - ')
      : (entry.hasEvidence ? (entry.evidenceCount + ' proof item' + (entry.evidenceCount === 1 ? '' : 's')) : 'Public proof details are limited.');
    h += '<article class="public-progress-entry proof-first-progress-card" data-proof-state="submitted">'
      + '<div class="progress-author">' + (entry.authorPhotoURL ? '<img src="' + esc(entry.authorPhotoURL) + '" alt=""/>' : '<span></span>')
      + '<div><b>' + esc(entry.authorName) + '</b><small>Day ' + esc(entry.dayNumber) + ' - ' + esc(pathName) + (dateText(entry.publishedAt) ? ' - ' + esc(dateText(entry.publishedAt)) : '') + '</small></div></div>'
      + '<h4>' + esc(proofTitle) + '</h4>'
      + '<p class="progress-caption proof-card-specimen">' + esc(summary) + '</p>'
      + '<div class="progress-metrics proof-card-meta"><span>Proof submitted</span><span>' + esc((entry.completionTier || 'completed').replace(/_/g, ' ')) + '</span><span>' + esc(entry.requiredCompletedCount) + '/' + esc(entry.requiredTotalCount) + ' required</span></div>'
      + '</article>';
  });
  return h + '</div></section>';
}

export function renderProgress(){
  clearPendingPathRoute();
  focusScreenActive = false;
  store.route = { kind:'app', page:'progress' };
  store.state.current = null;
  store.editMode = false;
  const body = '<div class="aurora-progress-page"><header class="aurora-workspace-header"><div><span class="aurora-section-kicker">Progress</span><h2>Public proof updates</h2><p>No rankings, follower counts, or estimated activity. This page only uses public progress data already loaded by the app.</p></div></header>'
    + publicProgressFeedHTML()
    + '</div>';
  $('content').innerHTML = appShellHTML('progress', body, { title:'Progress', className:'aurora-progress-route' });
  applyHeader();
}

export function renderProfile(){
  clearPendingPathRoute();
  focusScreenActive = false;
  store.route = { kind:'app', page:'profile' };
  store.state.current = null;
  store.editMode = false;
  const user = store.currentUser;
  const name = user?.displayName || user?.email || 'Signed out';
  const body = '<div class="aurora-profile-page"><header class="aurora-workspace-header"><div><span class="aurora-section-kicker">Profile</span><h2>' + esc(name) + '</h2><p>' + esc(user ? 'Account details and workspace identity.' : 'Sign in to manage a synced learning workspace.') + '</p></div></header>'
    + (user
      ? '<section class="panel card"><h3>Account</h3><p class="muted">' + esc(user.email || user.uid || 'Signed-in user') + '</p></section>'
      : '<section class="panel card"><h3>Sign in required</h3><p class="muted">Profile tools are available after signing in.</p><button class="btn gold" id="signinCard" type="button">Sign in</button></section>')
    + '</div>';
  $('content').innerHTML = appShellHTML('profile', body, { title:'Profile', className:'aurora-profile-route' });
  applyHeader();
  const signIn = $('signinCard'); if(signIn) signIn.onclick = () => openAuthModal('signin');
}

function updateProgressEntry(pathId, entryId, updater){
  const apply = entry => entry.id === entryId ? normalizePublicProgressEntry(updater({ ...entry })) : entry;
  store.publicProgress[pathId] = (store.publicProgress?.[pathId] || []).map(apply);
  const record = store.platformPaths[pathId];
  if(record?.publicProgress) record.publicProgress = record.publicProgress.map(apply);
  return record;
}

function entryFromRecord(record, entryId){
  return progressEntriesForPath(record.id, record).find(entry => entry.id === entryId) || null;
}

async function refreshPublicProgressForRecord(record){
  const entries = await dbLoadPublicProgress(record.id, { limit:12, includeComments:true, includeCurrentUserReaction:true });
  record.publicProgress = entries;
  if(store.platformPaths[record.id]) store.platformPaths[record.id].publicProgress = entries;
  return entries;
}

async function reactToPublicEntry(record, entryId){
  const key = interactionKey(record.id, entryId);
  if(progressInteractionBusyKey) return;
  if(!store.currentUser){
    progressInteractionErrors[key] = 'Sign in to respect this progress.';
    openAuthModal('signup');
    renderPathPreview(record);
    return;
  }
  const entry = entryFromRecord(record, entryId);
  const nextReaction = entry?.currentUserReaction === 'cheer' ? null : 'cheer';
  progressInteractionBusyKey = key;
  progressInteractionErrors[key] = '';
  renderPathPreview(record);
  try{
    const payload = await reactToProgress(record.id, entryId, nextReaction);
    updateProgressEntry(record.id, entryId, item => ({
      ...item,
      currentUserReaction:payload.reaction || null,
      reactionCounts:payload.reactionCounts,
      totalReactionCount:payload.totalReactionCount,
    }));
  }catch(error){
    progressInteractionErrors[key] = error.message || 'Could not update this reaction.';
  }finally{
    progressInteractionBusyKey = null;
    renderPathPreview(record);
  }
}

async function commentOnPublicEntry(record, entryId, body){
  const key = interactionKey(record.id, entryId);
  const busyKey = interactionKey(record.id, entryId, 'comment');
  if(progressInteractionBusyKey) return;
  if(!store.currentUser){
    progressInteractionErrors[key] = 'Sign in to comment.';
    openAuthModal('signup');
    renderPathPreview(record);
    return;
  }
  progressInteractionBusyKey = busyKey;
  progressInteractionErrors[key] = '';
  progressCommentDrafts[key] = body;
  renderPathPreview(record);
  try{
    const payload = await commentOnProgress(record.id, entryId, body);
    progressCommentDrafts[key] = '';
    updateProgressEntry(record.id, entryId, item => ({
      ...item,
      visibleCommentCount:payload.visibleCommentCount,
      comments:[...(item.comments || []), normalizePublicComment(payload.comment)],
    }));
  }catch(error){
    progressInteractionErrors[key] = error.message || 'Could not post this comment.';
  }finally{
    progressInteractionBusyKey = null;
    renderPathPreview(record);
  }
}

async function hidePublicProgressComment(record, entryId, commentId){
  const key = interactionKey(record.id, entryId);
  const busyKey = interactionKey(record.id, entryId, commentId);
  if(progressInteractionBusyKey) return;
  progressInteractionBusyKey = busyKey;
  progressInteractionErrors[key] = '';
  renderPathPreview(record);
  try{
    const payload = await hideProgressComment(record.id, entryId, commentId);
    updateProgressEntry(record.id, entryId, item => ({
      ...item,
      visibleCommentCount:payload.visibleCommentCount,
      comments:(item.comments || []).filter(comment => comment.id !== commentId),
    }));
  }catch(error){
    progressInteractionErrors[key] = error.message || 'Could not hide this comment.';
  }finally{
    progressInteractionBusyKey = null;
    renderPathPreview(record);
  }
}

async function submitPublicPathReport(record, reason, note){
  const key = pathReportKey(record.id);
  if(reportBusyKey) return;
  if(!store.currentUser){
    reportMessages[key] = 'Sign in to report this path.';
    openAuthModal('signup');
    renderPathPreview(record);
    return;
  }
  reportBusyKey = key;
  reportMessages[key] = '';
  reportDrafts[key] = { reason, note };
  renderPathPreview(record);
  try{
    await reportPath(record.id, reason, note);
    reportDrafts[key] = {};
    reportPanelKey = '';
    reportMessages[key] = 'Report received. Thank you for helping keep public paths safe.';
  }catch(error){
    reportMessages[key] = error.message || 'Could not report this path.';
  }finally{
    reportBusyKey = '';
    renderPathPreview(record);
  }
}

async function submitPublicCommentReport(record, entryId, commentId, reason, note){
  const key = commentReportKey(record.id, entryId, commentId);
  if(reportBusyKey) return;
  if(!store.currentUser){
    reportMessages[key] = 'Sign in to report this comment.';
    openAuthModal('signup');
    renderPathPreview(record);
    return;
  }
  reportBusyKey = key;
  reportMessages[key] = '';
  reportDrafts[key] = { reason, note };
  renderPathPreview(record);
  try{
    await reportProgressComment(record.id, entryId, commentId, reason, note);
    reportDrafts[key] = {};
    reportPanelKey = '';
    reportMessages[key] = 'Report received. The comment remains visible unless a moderator or owner hides it.';
  }catch(error){
    reportMessages[key] = error.message || 'Could not report this comment.';
  }finally{
    reportBusyKey = '';
    renderPathPreview(record);
  }
}

function renderPathPreview(record){
  const path = record.path;
  const coverImage = safeExternalUrl(path.coverImage);
  const profileImage = safeExternalUrl(path.profileImage);
  const creator = resolveCreatorName(path, store.currentUser);
  const stats = normalizePathStats(path.stats, path);
  const req = store.accessRequests[record.id];
  const owner = isOwner(path, store.currentUser);
  const joined = isPathParticipant(path, record.membership, store.currentUser);
  const joinable = canJoinPath(path, record.membership, store.currentUser);
  const joining = joiningPathId === record.id;
  const shareable = owner && ['public', 'unlisted'].includes(path.visibility);
  const shareLink = pathShareLink(record.id);
  clearPendingPathRoute(record.id);
  store.route = { kind:'path-preview', id:record.id };
  store.state.current = null; store.editMode = false; applyHeader();
  let h = '<div class="public-path-page">'
    + '<section class="public-path-hero panel">'
    + (coverImage ? '<div class="preview-cover" style="background-image:url(\'' + esc(coverImage.replace(/'/g, '%27')) + '\')"></div>' : '')
    + '<div class="public-path-hero-body">'
    + '<div class="public-path-kicker"><span>' + esc(path.visibility) + ' path</span><span>Created by ' + esc(creator) + '</span></div>'
    + trustBadgesHTML(stats)
    + '<div class="public-path-title">' + esc(path.previewTitle || path.title) + '</div>'
    + '<p class="public-path-summary">' + esc(path.previewDescription || path.description || path.goal || 'A proof-backed path for steady progress.') + '</p>'
    + '<div class="public-path-creator">' + (profileImage ? '<img class="preview-avatar" src="' + esc(profileImage) + '" alt=""/>' : '') + '<span>' + esc(joinedCountCopy(stats)) + '</span></div>'
    + '<div class="public-path-actions" aria-live="polite">';
  if(owner){
    h += '<button class="btn gold" id="openFullPath">Open full path</button><button class="btn" id="managePath">Manage path</button>';
    h += shareable ? '<button class="btn" id="copyShareLink">Copy share link</button>' : '<button class="btn" disabled>Set Public or Unlisted to share</button>';
  } else if(joined){
    h += '<button class="btn gold" id="openFullPath">Open my path</button><button class="btn" id="startJoinedPath">Start Day 1</button>';
  } else if(!store.currentUser){
    h += '<button class="btn gold" id="previewSignIn">Sign in to join this path</button>';
  } else if(joinable){
    h += '<button class="btn gold" id="joinPathBtn" ' + (joining ? 'disabled' : '') + '>' + (joining ? 'Joining...' : 'Join this path') + '</button>';
  } else if(req && req.status === 'pending'){
    h += '<button class="btn" disabled>Access requested</button>';
  } else if(canRequestAccess(path, record.membership, store.currentUser)){
    h += '<button class="btn gold" id="requestAccess">Request access</button>';
  } else {
    h += '<button class="btn" disabled>This path is private</button>';
  }
  h += '</div>'
    + (shareLinkMessage ? '<div class="share-fallback" role="status"><label>Share link<input readonly value="' + esc(shareLinkMessage === 'copied' ? shareLink : shareLinkMessage) + '"></label></div>' : '')
    + '<div class="public-path-report" aria-live="polite">'
    + '<button class="link-btn" id="reportPathBtn" type="button" aria-label="Report this public path">Report path</button>'
    + (reportPanelKey === pathReportKey(record.id) && store.currentUser ? reportFormHTML(pathReportKey(record.id), 'path', { label:'Path' }) : '')
    + (reportMessages[pathReportKey(record.id)] && reportPanelKey !== pathReportKey(record.id) ? '<p class="' + (reportMessages[pathReportKey(record.id)].includes('received') ? 'form-success' : 'form-error') + '" role="status">' + esc(reportMessages[pathReportKey(record.id)]) + '</p>' : '')
    + '</div>'
    + '</div></section>'
    + publicPathTrustStatsHTML(stats, path)
    + '<section class="public-path-grid">'
    + '<article class="panel card"><h3>What you will do</h3><p>' + esc(path.goal || path.description || path.previewDescription || 'Follow the creator pathway and build consistent progress.') + '</p></article>'
    + '<article class="panel card"><h3>Who this fits</h3><p>' + esc(publicDomainSummary(path)) + '</p></article>'
    + '<article class="panel card"><h3>Proof expected</h3><p>' + esc(evidenceExpectationCopy(path, record)) + '</p></article>'
    + '<article class="panel card"><h3>Ownership</h3><p>The source path remains owned by ' + esc(creator) + '. Joiners get their own private enrollment and progress.</p></article>'
    + '</section>'
    + publicProgressTimelineHTML(record)
    + '<section class="panel card preview-scheme"><h3>Milestones</h3>' + milestonePreviewHTML(record) + '</section>'
    + '</div>';
  $('content').innerHTML = appShellHTML('discover', h, { title:'Path preview', className:'aurora-path-preview-route' });
  const open = $('openFullPath'); if(open) open.onclick = () => openSkill(record.id);
  const start = $('startJoinedPath'); if(start) start.onclick = () => openSkill(record.id, { tab:'roadmap', day:1 });
  const manage = $('managePath'); if(manage) manage.onclick = async () => { await openSkill(record.id); store.editMode = true; renderPlan(); };
  const copy = $('copyShareLink'); if(copy) copy.onclick = () => copyShareLink(record.id, record);
  const join = $('joinPathBtn'); if(join) join.onclick = () => joinPublicPath(record);
  const si = $('previewSignIn'); if(si) si.onclick = () => openAuthModal('signup');
  const ra = $('requestAccess'); if(ra) ra.onclick = async () => {
    await dbRequestAccess(record.id);
    await dbLoadMyAccessRequest(record.id);
    renderPathPreview(record);
  };
  document.querySelectorAll('.progress-cheer').forEach(btn => {
    btn.onclick = () => reactToPublicEntry(record, btn.dataset.entryId);
  });
  document.querySelectorAll('.progress-signin').forEach(btn => {
    btn.onclick = () => {
      const key = interactionKey(record.id, btn.dataset.entryId);
      progressInteractionErrors[key] = 'Sign in to respect this progress.';
      openAuthModal('signup');
      renderPathPreview(record);
    };
  });
  document.querySelectorAll('.progress-comment-form').forEach(form => {
    form.onsubmit = event => {
      event.preventDefault();
      const entryId = form.dataset.entryId;
      const body = new FormData(form).get('body') || '';
      commentOnPublicEntry(record, entryId, String(body));
    };
    const input = form.querySelector('input[name="body"]');
    if(input){
      input.oninput = () => {
        progressCommentDrafts[interactionKey(record.id, form.dataset.entryId)] = input.value;
      };
    }
  });
  document.querySelectorAll('.progress-comment-hide').forEach(btn => {
    btn.onclick = () => hidePublicProgressComment(record, btn.dataset.entryId, btn.dataset.commentId);
  });
  document.querySelectorAll('.progress-comment-report').forEach(btn => {
    btn.onclick = () => {
      const key = commentReportKey(record.id, btn.dataset.entryId, btn.dataset.commentId);
      if(!store.currentUser){
        reportMessages[key] = 'Sign in to report this comment.';
        openAuthModal('signup');
      }else{
        reportPanelKey = reportPanelKey === key ? '' : key;
        reportMessages[key] = '';
      }
      renderPathPreview(record);
    };
  });
  document.querySelectorAll('.report-form').forEach(form => {
    form.onsubmit = event => {
      event.preventDefault();
      const data = new FormData(form);
      const reason = String(data.get('reason') || 'spam');
      const note = String(data.get('note') || '');
      const key = form.dataset.reportKey;
      reportDrafts[key] = { reason, note };
      if(form.dataset.reportTarget === 'publicProgressComment'){
        submitPublicCommentReport(record, form.dataset.entryId, form.dataset.commentId, reason, note);
      }else{
        submitPublicPathReport(record, reason, note);
      }
    };
    form.querySelectorAll('select[name="reason"], textarea[name="note"]').forEach(field => {
      field.oninput = () => {
        const key = form.dataset.reportKey;
        const data = new FormData(form);
        reportDrafts[key] = {
          reason:String(data.get('reason') || 'spam'),
          note:String(data.get('note') || ''),
        };
      };
    });
  });
  document.querySelectorAll('.report-cancel').forEach(btn => {
    btn.onclick = () => {
      reportPanelKey = '';
      reportDrafts[btn.dataset.reportKey] = {};
      renderPathPreview(record);
    };
  });
}

async function copyShareLink(id, record = null){
  const path = record?.path || store.state.userPaths[id] || {};
  if(!['public', 'unlisted'].includes(path.visibility)){
    shareLinkMessage = 'Set this path to Public or Unlisted before sharing.';
    if(record) renderPathPreview(record);
    return;
  }
  const link = pathShareLink(id);
  try{
    if(!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(link);
    shareLinkMessage = 'copied';
    flash('Share link copied');
  }catch(error){
    shareLinkMessage = link;
  }
  if(record) renderPathPreview(record);
}

async function joinPublicPath(record){
  if(!record?.id || joiningPathId) return;
  if(!store.currentUser){
    openAuthModal('signup');
    return;
  }
  joiningPathId = record.id;
  shareLinkMessage = '';
  renderPathPreview(record);
  try{
    const payload = await joinPath(record.id);
    const stats = normalizePathStats(record.path.stats, record.path);
    const nextRecord = {
      ...record,
      membership:payload.membership || record.membership || { uid:store.currentUser.uid, role:'viewer', joinStatus:'active', source:'join' },
      path:{
        ...record.path,
        stats:payload.stats ? normalizePathStats(payload.stats, record.path) : { ...stats, joinedCount:Number(payload.joinCount || stats.joinedCount), updatedAt:new Date().toISOString() },
      },
    };
    if(payload.enrollment?.id){
      store.enrollments[payload.enrollment.id] = { ...(store.enrollments[payload.enrollment.id] || {}), ...payload.enrollment };
      store.state.enrollments = store.state.enrollments || {};
      store.state.enrollments[payload.enrollment.id] = store.enrollments[payload.enrollment.id];
    }
    let refreshed = null;
    try{ refreshed = await dbLoadPlatformPath(record.id); }
    catch(error){ refreshed = nextRecord; }
    joiningPathId = null;
    flash(payload.alreadyJoined ? 'Path already joined' : 'Path joined');
    renderPathPreview(refreshed || nextRecord);
  }catch(error){
    joiningPathId = null;
    flash(error.message || 'Could not join this path.');
    renderPathPreview(record);
  }
}

function currentEnrollmentForPath(id){
  const userId = (store.currentUser && store.currentUser.uid) || 'local';
  const enrollmentId = enrollmentIdFor(id, userId);
  return store.enrollments[enrollmentId] || (store.state.enrollments && store.state.enrollments[enrollmentId]) || null;
}

function cloneJourneyEnrollment(enrollment){
  if(!enrollment) return null;
  const clone = { ...enrollment };
  clone.dayLogs = {};
  Object.entries(enrollment.dayLogs || {}).forEach(([day, log]) => {
    clone.dayLogs[day] = {
      ...log,
      completedTaskIds:[...(log?.completedTaskIds || [])],
      verifiedTaskIds:[...(log?.verifiedTaskIds || [])],
      unverifiedTaskIds:[...(log?.unverifiedTaskIds || [])],
      pendingTaskIds:[...(log?.pendingTaskIds || [])],
      optionalSkippedTaskIds:[...(log?.optionalSkippedTaskIds || [])],
      taskReflections:{ ...(log?.taskReflections || {}) },
    };
  });
  return clone;
}

function snapshotJourneyStart(enrollmentId){
  let savedLocalState = null;
  try{ savedLocalState = localStorage.getItem(STATE_KEY); }catch(e){}
  return {
    live:cloneJourneyEnrollment(store.enrollments[enrollmentId]),
    persisted:cloneJourneyEnrollment(store.state.enrollments && store.state.enrollments[enrollmentId]),
    selectedJourneyDay,
    evidenceFormTaskId,
    evidenceProofType,
    evidenceError,
    savedLocalState,
  };
}

function restoreJourneyStart(enrollmentId, snapshot){
  if(snapshot.live) store.enrollments[enrollmentId] = snapshot.live;
  else delete store.enrollments[enrollmentId];
  store.state.enrollments = store.state.enrollments || {};
  if(snapshot.persisted) store.state.enrollments[enrollmentId] = snapshot.persisted;
  else delete store.state.enrollments[enrollmentId];
  selectedJourneyDay = snapshot.selectedJourneyDay;
  evidenceFormTaskId = snapshot.evidenceFormTaskId;
  evidenceProofType = snapshot.evidenceProofType;
  evidenceError = snapshot.evidenceError;
  try{
    if(snapshot.savedLocalState == null) localStorage.removeItem(STATE_KEY);
    else localStorage.setItem(STATE_KEY, snapshot.savedLocalState);
  }catch(e){}
}

function setJourneyPending(enrollmentId, pending){
  [store.enrollments, store.state.enrollments || {}].forEach(bucket => {
    if(!bucket[enrollmentId]) return;
    if(pending) bucket[enrollmentId].syncPending = true;
    else delete bucket[enrollmentId].syncPending;
  });
}

function dayLogFor(enrollment, day){
  return (enrollment && enrollment.dayLogs && (enrollment.dayLogs[day] || enrollment.dayLogs[String(day)])) || null;
}

function statusLabel(status){
  return ({
    active: 'Today',
    completed: 'Completed',
    locked: 'Locked',
    missed: 'Missed',
    frozen: 'Frozen',
  })[status] || status;
}

function cachedEvidenceFor(enrollmentId, dayNumber = null, taskId = null){
  const bucket = (store.evidenceSubmissions && store.evidenceSubmissions[enrollmentId])
    || (store.state.evidenceSubmissions && store.state.evidenceSubmissions[enrollmentId])
    || {};
  return Object.values(bucket)
    .filter(s => dayNumber == null || Number(s.dayNumber) === Number(dayNumber))
    .filter(s => taskId == null || s.taskId === taskId)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function dateText(value){
  if(!value) return '';
  if(typeof value.toDate === 'function') return value.toDate().toLocaleDateString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

function taskIsDone(task, log){
  const completed = new Set(log?.completedTaskIds || []);
  const verified = new Set(log?.verifiedTaskIds || []);
  return task.evidenceRequired ? verified.has(task.id) : completed.has(task.id);
}

function evidenceCountFor(enrollmentId, dayNumber){
  return cachedEvidenceFor(enrollmentId, dayNumber).length;
}

function evidenceListHTML(enrollmentId, dayNumber){
  const submissions = cachedEvidenceFor(enrollmentId, dayNumber);
  if(!submissions.length) return '<div class="hint">No proof submissions for this day yet.</div>';
  return '<div class="evidence-list">' + submissions.map(s => {
    const title = s.taskTitle || 'Task proof';
    const label = s.evidenceType === 'file' ? (s.fileName || 'Uploaded file') : 'URL proof';
    const href = safeExternalUrl(s.evidenceUrl);
    return '<div class="evidence-item"><div><b>' + esc(title) + '</b>'
      + '<span>' + esc(dateText(s.createdAt)) + '</span>'
      + (s.note ? '<p>' + esc(s.note) + '</p>' : '') + '</div>'
      + (href ? externalLinkHTML(href, label) : '<em>' + esc(label) + '</em>')
      + '</div>';
  }).join('') + '</div>';
}

function publishedProgressEntry(id, day){
  const userId = store.currentUser?.uid;
  if(!userId) return null;
  const expectedId = publicProgressEntryId(userId, day);
  return (store.publicProgress?.[id] || []).map(normalizePublicProgressEntry)
    .find(entry => entry.id === expectedId || (entry.userId === userId && Number(entry.dayNumber) === Number(day))) || null;
}

function publicProgressControlsHTML(id, def, enrollment, day, log){
  const path = def.platformData || def;
  if(!def.platform || !['public', 'unlisted'].includes(path.visibility)) return '';
  if(!canPublishCompletedDay({ path, enrollment, dayLog:log, currentUser:store.currentUser })) return '';
  const key = id + ':' + day;
  const busy = publicProgressBusyKey === key;
  const entry = publishedProgressEntry(id, day);
  let h = '<div class="public-progress-controls" aria-live="polite">';
  if(!cloudActive()){
    h += '<div><b>Public progress</b><p>Publishing requires cloud sync.</p></div>';
  } else if(entry){
    h += '<div><b>Published on public timeline</b><p>This shared update shows sanitized day progress only.</p></div>'
      + '<button class="btn" id="unpublishProgress" data-day="' + esc(day) + '" ' + (busy ? 'disabled' : '') + '>' + (busy ? 'Unpublishing...' : 'Unpublish') + '</button>';
  } else {
    h += '<label><b>Share this completed day</b><span>Optional public caption</span><textarea id="publicProgressCaption" maxlength="500" placeholder="What did you finish or learn?"></textarea></label>'
      + '<button class="btn gold" id="publishProgress" data-day="' + esc(day) + '" ' + (busy ? 'disabled' : '') + '>' + (busy ? 'Publishing...' : 'Publish this day') + '</button>';
  }
  if(publicProgressError) h += '<p class="form-error">' + esc(publicProgressError) + '</p>';
  return h + '</div>';
}

function evidenceFormHTML(task){
  if(evidenceFormTaskId !== task.id) return '';
  const accepts = ACCEPTED_EVIDENCE_TYPES.join(',');
  const type = evidenceProofType === 'file' ? 'file' : 'url';
  return '<div class="evidence-form" data-task="' + esc(task.id) + '">'
    + '<label>Proof type<select id="evidenceType"><option value="url" ' + (type === 'url' ? 'selected' : '') + '>URL</option><option value="file" ' + (type === 'file' ? 'selected' : '') + '>File</option></select></label>'
    + (type === 'url'
      ? '<label>Proof URL<input type="url" id="evidenceUrl" placeholder="https://..."/></label>'
      : '<label>File<input type="file" id="evidenceFile" accept="' + esc(accepts) + '"/></label>')
    + '<label>Note<textarea id="evidenceNote" placeholder="Short context for this proof"></textarea></label>'
    + (evidenceError ? '<div class="form-error">' + esc(evidenceError) + '</div>' : '')
    + '<div class="evidence-actions"><button class="btn gold" id="submitEvidence" data-task="' + esc(task.id) + '" ' + (evidenceBusy ? 'disabled' : '') + '>' + (evidenceBusy ? 'Submitting...' : 'Submit proof') + '</button>'
    + '<button class="btn" id="cancelEvidence" type="button">Cancel</button></div>'
    + '</div>';
}

function dailySessionNextPhase(dayTasks, nextTaskId, log, evidenceSubmissions, intensity = 'balanced'){
  if(nextTaskId) return 'task';
  return canCompleteDailySession(dayTasks, log, evidenceSubmissions, { intensity }) ? 'completion-check' : 'partial-summary';
}

function normalizeDailyFocusFor(id, day, dayTasks, log, evidence, patch = {}){
  store.dailyFocus = normalizeDailyFocusState({
    ...(store.dailyFocus || {}),
    ...patch,
  }, {
    pathId:id,
    dayNumber:day,
    tasks:dayTasks,
    dayLog:log,
    evidenceSubmissions:evidence,
  });
  return store.dailyFocus;
}

async function saveDailySessionLog(enrollment, day, dayTasks, patch){
  const existing = dayLogFor(enrollment, day);
  dailySessionSaveState = 'saving';
  dailySessionError = '';
  renderPlan();
  try{
    const saved = await dbSaveDayLog(enrollment.id, makeDayLog(day, {
      ...existing,
      ...patch,
      dayNumber: day,
      date: dateForJourneyDay(enrollment.startDate, day),
      status: patch.status || existing?.status || 'active',
      totalTaskCount: dayTasks.length,
      evidenceCount: evidenceCountFor(enrollment.id, day),
      sessionLastActiveAt: new Date(),
    }));
    dailySessionSaveState = store.enrollments[enrollment.id]?.syncPending ? 'local' : 'saved';
    return saved;
  }catch(e){
    dailySessionSaveState = 'error';
    dailySessionError = /permission|denied/i.test(e?.code || e?.message || '')
      ? 'This day could not be updated because your access changed. Refresh the path and try again.'
      : 'This update could not sync yet. Your progress is saved locally and will retry when the connection returns.';
    throw e;
  }finally{
    setTimeout(() => {
      if(dailySessionSaveState === 'saved') dailySessionSaveState = 'idle';
      if(store.state.current === enrollment.pathId && store.activeTab === 'plan') renderPlan();
    }, 350);
  }
}

async function setDailySessionView(id, def, phase, taskId = null){
  const enrollment = currentEnrollmentForPath(id);
  if(!enrollment?.startDate) return;
  const day = selectedJourneyDay || Number(enrollment.currentDay || 1);
  const dayTasks = getTasksForDay(def, day);
  const existing = dayLogFor(enrollment, day);
  const evidence = cachedEvidenceFor(enrollment.id, day);
  if(phase === 'focus' || phase === 'overview'){
    normalizeDailyFocusFor(id, day, dayTasks, existing, evidence, {
      mode:phase === 'overview' ? 'overview' : 'focus',
      feedback:null,
      lastActionAt:Date.now(),
    });
    renderPlan();
    return;
  }
  if(phase === 'focus-task'){
    normalizeDailyFocusFor(id, day, dayTasks, existing, evidence, {
      mode:'focus',
      taskIndex:Number(taskId || 0),
      feedback:null,
      lastActionAt:Date.now(),
    });
    renderPlan();
    return;
  }
  if(phase === 'focus-prev' || phase === 'focus-next'){
    const current = normalizeDailyFocusFor(id, day, dayTasks, existing, evidence);
    normalizeDailyFocusFor(id, day, dayTasks, existing, evidence, {
      mode:'focus',
      taskIndex:Number(current.taskIndex || 0) + (phase === 'focus-next' ? 1 : -1),
      feedback:null,
      lastActionAt:Date.now(),
    });
    renderPlan();
    return;
  }
  let nextTaskId = taskId || existing?.lastActiveTaskId || resumeTaskId(dayTasks, existing, evidence);
  if(phase === 'start-session' || phase === 'task'){
    nextTaskId = resumeTaskId(dayTasks, existing, evidence);
    phase = nextTaskId ? 'task' : 'completion-check';
  }
  if(phase === 'finish-pending'){
    nextTaskId = resumeTaskId(dayTasks, { ...existing, lastActiveTaskId:null }, evidence);
    phase = nextTaskId ? 'task' : 'completion-check';
  }
  if(phase === 'evidence-preparation' && !dayTasks.some(taskNeedsEvidence)){
    nextTaskId = resumeTaskId(dayTasks, existing, evidence);
    phase = nextTaskId ? 'task' : 'completion-check';
  }
  const nextIndex = nextTaskId ? sessionTaskStates(dayTasks, existing, evidence).findIndex(item => item.id === nextTaskId) : Number(store.dailyFocus?.taskIndex || 0);
  normalizeDailyFocusFor(id, day, dayTasks, existing, evidence, {
    mode:'focus',
    taskIndex:nextIndex >= 0 ? nextIndex : Number(store.dailyFocus?.taskIndex || 0),
    feedback:phase === 'task-evidence' ? 'This task needs proof before it can count.' : null,
    lastActionAt:Date.now(),
  });
  evidenceFormTaskId = phase === 'task-evidence' ? nextTaskId : null;
  await saveDailySessionLog(enrollment, day, dayTasks, {
    sessionStartedAt: existing?.sessionStartedAt || (phase === 'agenda' ? null : new Date()),
    sessionViewState: phase,
    lastActiveTaskId: nextTaskId,
  });
}

async function markDailySessionTask(id, def, taskId, mode){
  const token = ++dailySessionActionToken;
  const enrollment = currentEnrollmentForPath(id);
  if(!enrollment?.startDate) return;
  const today = localDateString();
  const day = selectedJourneyDay || Number(enrollment.currentDay || 1);
  if(!canCompleteDay(day, enrollment, today)) return;
  const dayTasks = getTasksForDay(def, day);
  const item = sessionTaskStates(dayTasks, dayLogFor(enrollment, day), cachedEvidenceFor(enrollment.id, day)).find(candidate => candidate.id === taskId);
  if(!item) return;
  const existing = dayLogFor(enrollment, day);
  const completed = new Set(existing?.completedTaskIds || []);
  const verified = new Set(existing?.verifiedTaskIds || []);
  const unverified = new Set(existing?.unverifiedTaskIds || []);
  const pending = new Set(existing?.pendingTaskIds || []);
  const skipped = new Set(existing?.optionalSkippedTaskIds || []);
  if(mode === 'done'){
    if(item.state.needsEvidence && !verified.has(taskId)) return;
    completed.add(taskId);
    if(!item.state.needsEvidence) unverified.add(taskId);
    pending.delete(taskId);
    skipped.delete(taskId);
  } else if(mode === 'not-done'){
    pending.add(taskId);
  } else if(mode === 'skip-optional'){
    if(!isOptionalTask(item.task)) return;
    skipped.add(taskId);
    pending.delete(taskId);
    completed.delete(taskId);
    verified.delete(taskId);
    unverified.delete(taskId);
  }
  const baseLog = {
    ...existing,
    completedTaskIds:Array.from(completed),
    verifiedTaskIds:Array.from(verified),
    unverifiedTaskIds:Array.from(unverified),
    pendingTaskIds:Array.from(pending),
    optionalSkippedTaskIds:Array.from(skipped),
  };
  const evidence = cachedEvidenceFor(enrollment.id, day);
  const nextTaskId = mode === 'not-done'
    ? nextUnresolvedTaskId(dayTasks, baseLog, evidence, taskId)
    : resumeTaskId(dayTasks, { ...baseLog, lastActiveTaskId:null }, evidence);
  const phase = dailySessionNextPhase(dayTasks, nextTaskId, baseLog, evidence, def.intensity);
  const nextIndex = nextTaskId
    ? sessionTaskStates(dayTasks, baseLog, evidence).findIndex(candidate => candidate.id === nextTaskId)
    : Number(store.dailyFocus?.taskIndex || 0);
  await saveDailySessionLog(enrollment, day, dayTasks, {
    ...baseLog,
    sessionStartedAt: existing?.sessionStartedAt || new Date(),
    sessionViewState: phase,
    lastActiveTaskId: nextTaskId,
  });
  if(token !== dailySessionActionToken) return;
  normalizeDailyFocusFor(id, day, dayTasks, baseLog, evidence, {
    mode:'focus',
    taskIndex:nextIndex >= 0 ? nextIndex : Number(store.dailyFocus?.taskIndex || 0),
    feedback:focusFeedbackForAction(mode, dailyCompletionScore(dayTasks, baseLog, evidence, { intensity:def.intensity || def.aiBrief?.intensity }), item),
    lastActionAt:Date.now(),
  });
  evidenceFormTaskId = null;
}

async function saveDailyReflection(id, def, taskId){
  const enrollment = currentEnrollmentForPath(id);
  if(!enrollment?.startDate) return;
  const day = selectedJourneyDay || Number(enrollment.currentDay || 1);
  if(!canCompleteDay(day, enrollment, localDateString())) return;
  const text = window.prompt('Add a short reflection for this task') || '';
  if(!text.trim()) return;
  const dayTasks = getTasksForDay(def, day);
  const existing = dayLogFor(enrollment, day);
  await saveDailySessionLog(enrollment, day, dayTasks, {
    ...existing,
    taskReflections:{
      ...(existing?.taskReflections || {}),
      [taskId]:text.trim().slice(0, 1200),
    },
    lastActiveTaskId:taskId,
    sessionViewState:'task',
  });
}

function roadmapHTML(id, def){
  const enrollment = currentEnrollmentForPath(id);
  const tasksReady = pathTasksReady(def);
  const logs = enrollment?.dayLogs || {};
  const today = localDateString();
  const totalDays = getMaxRoadmapDay(def, enrollment);
  const activeDay = enrollment?.startDate ? journeyDayForDate(enrollment.startDate, today) : 1;
  let h = '<section class="aurora-roadmap-panel proof-studio-roadmap">'
    + '<header class="aurora-roadmap-header"><div><span class="aurora-section-kicker">Your path</span><h3>Proof journey</h3></div>'
    + '<div class="aurora-roadmap-summary"><span>Streak ' + esc(enrollment?.streak || 0) + '</span><span>Freezes ' + esc(enrollment?.freezeCount ?? 1) + '</span></div></header>';
  if(enrollment?.syncPending){
    h += '<div class="sync-banner offline"><span>Started locally &mdash; waiting to sync</span></div>';
  }
  if(!tasksReady){
    h += '<div class="journey-start"><div><b>Loading tasks...</b><p>Roadmap controls will unlock once this platform path finishes loading.</p></div><button class="btn" disabled>Loading...</button></div>';
  } else if(!enrollment?.startDate){
    const starting = startingJourneyId === id;
    const canStart = pathCanStart(def);
    h += '<div class="journey-start"><div><b>' + (canStart ? 'Start this path' : 'Day 1 tasks are unavailable') + '</b><p>'
      + (canStart ? 'Set today as Day 1 and begin tracking daily progress.' : 'Add or load at least one Day 1 task before starting this path.')
      + '</p></div><button class="btn gold" id="startJourney" ' + (starting || !canStart ? 'disabled' : '') + '>' + (starting ? 'Starting...' : 'Start this path') + '</button></div>';
  }
  h += '<ol class="aurora-journey-list">';
  for(let day = 1; day <= totalDays; day++){
    const status = getDayStatus(day, enrollment, logs, today);
    const open = canOpenDay(day, status);
    const date = enrollment?.startDate ? dateForJourneyDay(enrollment.startDate, day) : null;
    const taskCount = tasksReady ? getTasksForDay(def, day).length : 0;
    const log = logs[day] || logs[String(day)] || {};
    const tier = log.completionTier || log.tier || '';
    const proofSubmitted = Number(log.evidenceCount || 0) > 0 || (log.verifiedTaskIds || []).length > 0;
    h += auroraRoadmapDayItemHTML({
      day,
      status,
      label:statusLabel(status),
      date:date ? date.slice(5) : '',
      title:status === 'active' ? "Today's proof session" : status === 'completed' ? 'Completed proof day' : 'Scheduled proof day',
      taskSummary:tasksReady ? (open ? (taskCount + ' task' + (taskCount === 1 ? '' : 's')) : 'Unlocks later') : 'Loading tasks',
      tier,
      proofSubmitted,
      open,
      isToday:day === activeDay,
    });
  }
  h += '</ol></section>';
  return h;
}

function journeyDetailHTML(id, def){
  const enrollment = currentEnrollmentForPath(id);
  const tasksReady = pathTasksReady(def);
  if(!tasksReady){
    return '<div class="panel card journey-detail"><h3>Loading tasks...</h3><p class="muted">This platform path is still loading its sections and tasks. Start and completion controls will appear when the tasks are ready.</p></div>';
  }
  if(!enrollment?.startDate){
    return '<div class="panel card journey-detail"><h3>Not started yet</h3><p class="muted">Start the path to activate Day 1 and begin storing daily progress in your enrollment.</p></div>';
  }
  const logs = enrollment.dayLogs || {};
  const today = localDateString();
  const activeDay = journeyDayForDate(enrollment.startDate, today);
  const day = selectedJourneyDay || Math.min(Number(enrollment.currentDay || 1), activeDay);
  const status = getDayStatus(day, enrollment, logs, today);
  const date = dateForJourneyDay(enrollment.startDate, day);
  const log = dayLogFor(enrollment, day) || makeDayLog(day, { date, status, totalTaskCount: getTasksForDay(def, day).length });
  const dayTasks = getTasksForDay(def, day);
  const dayEvidence = cachedEvidenceFor(enrollment.id, day);
  const focusState = normalizeDailyFocusFor(id, day, dayTasks, log, dayEvidence);
  const completed = new Set(log.completedTaskIds || []);
  const verified = new Set(log.verifiedTaskIds || []);
  const completeCount = dayTasks.filter(task => taskIsDone(task, log)).length;
  const evidenceCount = evidenceCountFor(enrollment.id, day);
  let h = '<div class="panel card journey-detail" id="journeyDetail">'
    + '<div class="detail-head"><div><div class="chip">' + esc(statusLabel(status)) + '</div><h3>Day ' + day + '</h3><p class="muted">' + esc(date || 'Date set when started') + '</p></div>'
    + '<div class="detail-progress">' + completeCount + '/' + dayTasks.length + ' tasks</div></div>';
  if(status === 'locked'){
    h += '<p class="muted">This day unlocks later.</p>';
  } else if(status === 'completed' || status === 'frozen' || status === 'missed'){
    if(status === 'completed'){
      h += dailySessionHTML({
        pathId:id,
        dayNumber:day,
        date,
        tasks:dayTasks,
        dayLog:log,
        evidenceSubmissions:dayEvidence,
        saveState:dailySessionSaveState,
        error:dailySessionError,
        intensity:def.intensity || def.aiBrief?.intensity || 'balanced',
        focusState,
      });
    }
    h += '<div class="history-list">';
    if(dayTasks.length){
      dayTasks.forEach(task => {
        const title = taskTitleForDay(task, day);
        const isVerified = verified.has(task.id);
        const isCompleted = completed.has(task.id);
        const label = task.evidenceRequired
          ? (isVerified ? 'Proof submitted' : (isCompleted ? 'Completed before proof tracking' : 'Not completed'))
          : (isCompleted ? 'Completed' : 'Not completed');
        h += '<div class="history-task ' + (completed.has(task.id) ? 'done' : '') + '"><b>' + esc(title) + '</b>'
          + '<span>' + esc(label) + '</span></div>';
      });
    } else {
      h += '<div class="muted">No tasks were assigned to this day.</div>';
    }
    h += '</div>'
      + (log.summary ? '<p class="summary">' + esc(log.summary) + '</p>' : '')
      + '<div class="hint">Evidence count: ' + evidenceCount + '</div>'
      + evidenceListHTML(enrollment.id, day);
    if(status === 'completed'){
      h += publicProgressControlsHTML(id, def, enrollment, day, log);
    }
    if(status === 'missed'){
      h += '<div class="missed-copy"><b>You missed this day.</b><p>'
        + (Number(enrollment.freezeCount || 0) > 0
          ? 'Use a freeze to preserve your streak, or reset your streak and continue.'
          : 'You are out of freezes. Reset your streak to continue.')
        + '</p></div><div class="missed-actions">';
      if(Number(enrollment.freezeCount || 0) > 0){
        h += '<button class="btn gold" id="freezeDay" data-day="' + day + '">Use freeze</button>';
      }
      h += '<button class="btn" id="resetMissedDay" data-day="' + day + '">Reset streak and continue</button></div>';
    }
  } else {
    const score = dailyCompletionScore(dayTasks, log, dayEvidence, { intensity:def.intensity || def.aiBrief?.intensity || 'balanced' });
    const sessionStarted = !!log.sessionStartedAt;
    const ctaLabel = sessionStarted ? 'Continue Day ' + day : 'Start Day ' + day;
    h += '<div class="daily-session-cta">'
      + '<div class="daily-session-stats">'
      + '<div><span>Progress</span><b>' + esc(score.score) + '%</b></div>'
      + '<div><span>Day status</span><b>' + esc(score.tier === 'not_started' ? 'Not started' : score.tier.replace(/_/g, ' ')) + '</b></div>'
      + '<div><span>Tasks</span><b>' + esc(completeCount) + '/' + esc(dayTasks.length) + '</b></div>'
      + '</div>'
      + '<button class="btn gold open-focus-session" type="button" data-focus-day="' + esc(day) + '">' + esc(ctaLabel) + '</button>'
      + '</div>';
    if(status === 'active' && !canCompleteDay(day, enrollment, today)) h += '<div class="hint">This day is not eligible for completion today.</div>';
  }
  h += '</div>';
  return h;
}


async function updateJourneyTask(id, def, taskId, checked){
  const enrollment = currentEnrollmentForPath(id);
  if(!enrollment?.startDate) return;
  const today = localDateString();
  const day = selectedJourneyDay || Number(enrollment.currentDay || 1);
  if(!canCompleteDay(day, enrollment, today)) return;
  const dayTasks = getTasksForDay(def, day);
  const task = dayTasks.find(t => t.id === taskId);
  if(task?.evidenceRequired) return;
  const existing = dayLogFor(enrollment, day);
  const ids = new Set(existing?.completedTaskIds || []);
  const unverified = new Set(existing?.unverifiedTaskIds || []);
  if(checked) ids.add(taskId); else ids.delete(taskId);
  if(checked) unverified.add(taskId); else unverified.delete(taskId);
  await dbSaveDayLog(enrollment.id, makeDayLog(day, {
    ...existing,
    dayNumber: day,
    date: dateForJourneyDay(enrollment.startDate, day),
    status: 'active',
    completedTaskIds: Array.from(ids),
    verifiedTaskIds: existing?.verifiedTaskIds || [],
    unverifiedTaskIds: Array.from(unverified),
    totalTaskCount: dayTasks.length,
    evidenceCount: evidenceCountFor(enrollment.id, day),
  }));
  renderPlan();
}

async function submitEvidenceForTask(id, def, taskId){
  const enrollment = currentEnrollmentForPath(id);
  if(!enrollment?.startDate) return;
  const day = selectedJourneyDay || Number(enrollment.currentDay || 1);
  if(!canCompleteDay(day, enrollment, localDateString())) return;
  const dayTasks = getTasksForDay(def, day);
  const task = dayTasks.find(t => t.id === taskId);
  if(!task) return;
  const type = ($('evidenceType')?.value || evidenceProofType || 'url') === 'file' ? 'file' : 'url';
  const note = ($('evidenceNote')?.value || '').trim();
  let evidenceUrl = null;
  let fileName = null;
  let fileType = null;
  let fileSize = null;
  try{
    evidenceBusy = true;
    evidenceError = '';
    if(type === 'url'){
      evidenceUrl = safeExternalUrl($('evidenceUrl')?.value);
      if(!evidenceUrl) throw new Error('Add a valid HTTP or HTTPS proof URL.');
    } else {
      if(!cloudActive()) throw new Error('File uploads require Firebase Storage. Add Storage config or submit URL proof instead.');
      const file = $('evidenceFile')?.files?.[0];
      if(!file) throw new Error('Choose a file to upload.');
      evidenceUrl = await uploadEvidenceFile(enrollment.userId, enrollment.id, day, taskId, file);
      fileName = file.name;
      fileType = file.type;
      fileSize = file.size;
    }
    await createEvidenceSubmission(enrollment.id, {
      pathId:id,
      userId:enrollment.userId,
      dayNumber:day,
      taskId,
      taskTitle:task.title || task.text || 'Task',
      evidenceType:type,
      evidenceUrl,
      fileName,
      fileType,
      fileSize,
      note: note || null,
    });
    const existing = dayLogFor(enrollment, day);
    const completed = new Set(existing?.completedTaskIds || []);
    const verified = new Set(existing?.verifiedTaskIds || []);
    const unverified = new Set(existing?.unverifiedTaskIds || []);
    const pending = new Set(existing?.pendingTaskIds || []);
    const skipped = new Set(existing?.optionalSkippedTaskIds || []);
    completed.add(taskId);
    verified.add(taskId);
    unverified.delete(taskId);
    pending.delete(taskId);
    skipped.delete(taskId);
    const nextBase = {
      ...existing,
      completedTaskIds: Array.from(completed),
      verifiedTaskIds: Array.from(verified),
      unverifiedTaskIds: Array.from(unverified),
      pendingTaskIds: Array.from(pending),
      optionalSkippedTaskIds: Array.from(skipped),
    };
    const evidence = cachedEvidenceFor(enrollment.id, day);
    const nextTaskId = resumeTaskId(dayTasks, { ...nextBase, lastActiveTaskId:null }, evidence);
    const phase = dailySessionNextPhase(dayTasks, nextTaskId, nextBase, evidence, def.intensity);
    const nextIndex = nextTaskId
      ? sessionTaskStates(dayTasks, nextBase, evidence).findIndex(candidate => candidate.id === nextTaskId)
      : Number(store.dailyFocus?.taskIndex || 0);
    await dbSaveDayLog(enrollment.id, makeDayLog(day, {
      ...nextBase,
      dayNumber: day,
      date: dateForJourneyDay(enrollment.startDate, day),
      status: 'active',
      totalTaskCount: dayTasks.length,
      evidenceCount: evidenceCountFor(enrollment.id, day),
      sessionStartedAt: existing?.sessionStartedAt || new Date(),
      sessionLastActiveAt: new Date(),
      lastActiveTaskId: nextTaskId,
      sessionViewState: phase,
    }));
    normalizeDailyFocusFor(id, day, dayTasks, nextBase, evidence, {
      mode:'focus',
      taskIndex:nextIndex >= 0 ? nextIndex : Number(store.dailyFocus?.taskIndex || 0),
      feedback:focusFeedbackForAction('proof-saved', dailyCompletionScore(dayTasks, nextBase, evidence, { intensity:def.intensity || def.aiBrief?.intensity }), { task, state:{ needsEvidence:true, completed:true } }),
      lastActionAt:Date.now(),
    });
    evidenceFormTaskId = null;
    evidenceProofType = 'url';
    flash('Proof submitted');
  }catch(e){
    evidenceError = e.message || 'Could not submit proof.';
  }finally{
    evidenceBusy = false;
    renderPlan();
  }
}

async function completeJourneyDay(id, def, day){
  const enrollment = currentEnrollmentForPath(id);
  if(!enrollment?.startDate || !canCompleteDay(day, enrollment)) return;
  if(!pathTasksReady(def)){
    flash('Loading tasks. Try again in a moment.');
    return;
  }
  const dayTasks = getTasksForDay(def, day);
  if(dayTasks.length === 0){
    flash('Day tasks are unavailable. Completion remains disabled.');
    return;
  }
  const existing = dayLogFor(enrollment, day);
  const completedTaskIds = existing?.completedTaskIds || [];
  const verifiedTaskIds = existing?.verifiedTaskIds || [];
  const evidence = cachedEvidenceFor(enrollment.id, day);
  const score = dailyCompletionScore(dayTasks, existing, evidence, { intensity:def.intensity || def.aiBrief?.intensity });
  if(!score.canComplete){
    flash(score.tier === 'blocked_anchor'
      ? 'Complete the core task before finishing this day.'
      : `Reach ${score.passThreshold}% meaningful progress before completing this day.`);
    return;
  }
  const wasCompleted = existing?.status === 'completed';
  await dbSaveDayLog(enrollment.id, makeDayLog(day, {
    ...existing,
    dayNumber: day,
    date: dateForJourneyDay(enrollment.startDate, day),
    status: 'completed',
    completedAt: existing?.completedAt || new Date(),
    completedTaskIds,
    verifiedTaskIds,
    unverifiedTaskIds: existing?.unverifiedTaskIds || [],
    pendingTaskIds: existing?.pendingTaskIds || [],
    optionalSkippedTaskIds: existing?.optionalSkippedTaskIds || [],
    totalTaskCount: dayTasks.length,
    evidenceCount: evidenceCountFor(enrollment.id, day),
    sessionViewState: 'complete',
    sessionCompletedAt: existing?.sessionCompletedAt || new Date(),
    ...completionScoreMetadata(score),
  }));
  await dbSaveEnrollment({
    ...store.enrollments[enrollment.id],
    lastCompletedDay: Math.max(Number(enrollment.lastCompletedDay || 0), day),
    lastActivityDate: localDateString(),
    missedDate: null,
    streak: wasCompleted ? Number(enrollment.streak || 0) : Number(enrollment.streak || 0) + 1,
    currentDay: Math.max(Number(enrollment.currentDay || 1), day + 1),
  });
  await syncPathMetricsQuiet(id, 'day_completed', day);
  selectedJourneyDay = day;
  flash('Day complete. Come back tomorrow to continue.');
  renderPlan();
}

async function freezeMissedDay(id, day){
  const enrollment = currentEnrollmentForPath(id);
  if(!enrollment || Number(enrollment.freezeCount || 0) <= 0) return;
  const existing = dayLogFor(enrollment, day);
  if(existing?.status !== 'missed') return;
  await dbSaveDayLog(enrollment.id, makeDayLog(day, {
    ...existing,
    status: 'frozen',
    frozenAt: new Date(),
  }));
  await dbSaveEnrollment({
    ...store.enrollments[enrollment.id],
    freezeCount: Math.max(0, Number(enrollment.freezeCount || 0) - 1),
    missedDate: null,
    lastActivityDate: localDateString(),
    currentDay: Math.max(Number(enrollment.currentDay || 1), day + 1),
  });
  selectedJourneyDay = day;
  flash('Freeze used');
  renderPlan();
}

async function resetMissedDay(id, def, day){
  const enrollment = currentEnrollmentForPath(id);
  if(!enrollment?.startDate) return;
  const existing = dayLogFor(enrollment, day);
  if(existing?.status !== 'missed') return;
  const today = localDateString();
  const todayDay = journeyDayForDate(enrollment.startDate, today);
  const nextDay = Math.max(Number(day || 1) + 1, todayDay);
  const nextLog = dayLogFor(enrollment, nextDay);
  await dbSaveEnrollment({
    ...store.enrollments[enrollment.id],
    streak: 0,
    missedDate: null,
    lastActivityDate: today,
    currentDay: nextDay,
  });
  if(!nextLog || nextLog.status === 'locked'){
    await dbSaveDayLog(enrollment.id, makeDayLog(nextDay, {
      ...nextLog,
      dayNumber: nextDay,
      date: dateForJourneyDay(enrollment.startDate, nextDay),
      status: 'active',
      totalTaskCount: getTasksForDay(def, nextDay).length,
    }));
  }
  selectedJourneyDay = nextDay;
  flash('Streak reset. Continue from today.');
  renderPlan();
}

function applyPathStats(id, statsPatch){
  if(!statsPatch || typeof statsPatch !== 'object') return;
  const def = store.state.userPaths[id];
  const mergeStats = (current, owner = {}) => normalizePathStats({ ...normalizePathStats(current, owner), ...statsPatch }, owner);
  if(def){
    def.stats = mergeStats(def.stats, def);
    if(def.platformData){
      def.platformData = {
        ...def.platformData,
        stats:mergeStats(def.platformData.stats, def.platformData),
      };
    }
  }
  const record = store.platformPaths[id];
  if(record?.path){
    record.path = {
      ...record.path,
      stats:mergeStats(record.path.stats, record.path),
    };
  }
}

function updatePublicProgressCount(id, count, stats = null){
  applyPathStats(id, stats || { publicProgressCount:Math.max(0, Number(count || 0)), updatedAt:new Date().toISOString() });
}

async function syncPathMetricsQuiet(id, event, dayNumber = null){
  if(!id || !store.currentUser || !cloudActive()) return null;
  try{
    const payload = await syncPathMetrics(id, event, dayNumber);
    if(payload.stats) applyPathStats(id, payload.stats);
    store.cloudDiagnostics.metricsSyncStatus = 'connected';
    store.cloudDiagnostics.metricsSyncMessage = '';
    store.cloudDiagnostics.metricsSyncFailedAt = null;
    return payload;
  }catch(error){
    store.cloudDiagnostics.metricsSyncStatus = error.code || 'metrics_sync_failed';
    store.cloudDiagnostics.metricsSyncMessage = error.message || 'Path metrics could not sync.';
    store.cloudDiagnostics.metricsSyncFailedAt = Date.now();
    console.warn('metrics sync:', store.cloudDiagnostics.metricsSyncMessage);
    return null;
  }
}

async function publishCompletedProgress(id, day){
  if(publicProgressBusyKey) return;
  const caption = $('publicProgressCaption')?.value || '';
  publicProgressBusyKey = id + ':' + day;
  publicProgressError = '';
  renderPlan();
  try{
    const payload = await publishProgress(id, day, { publicCaption:caption });
    updatePublicProgressCount(id, payload.publicProgressCount, payload.stats || null);
    await dbLoadPublicProgress(id, { limit:12 });
    flash(payload.alreadyPublished ? 'Progress already published' : 'Progress published');
  }catch(error){
    publicProgressError = error.message || 'Could not publish progress.';
  }finally{
    publicProgressBusyKey = null;
    renderPlan();
  }
}

async function unpublishCompletedProgress(id, day){
  if(publicProgressBusyKey) return;
  publicProgressBusyKey = id + ':' + day;
  publicProgressError = '';
  renderPlan();
  try{
    const payload = await unpublishProgress(id, day);
    updatePublicProgressCount(id, payload.publicProgressCount, payload.stats || null);
    await dbLoadPublicProgress(id, { limit:12 });
    flash(payload.alreadyUnpublished ? 'Progress was already unpublished' : 'Progress unpublished');
  }catch(error){
    publicProgressError = error.message || 'Could not unpublish progress.';
  }finally{
    publicProgressBusyKey = null;
    renderPlan();
  }
}

async function startPathJourney(id, def, triggerButton = null){
  if(def?.platform && !canOpenFullPath(id, def)){
    flash('Join this path before starting it.');
    const record = platformAccessRecord(id, def);
    if(canPreviewPath(record.path, store.currentUser)) renderPathPreview(record);
    return false;
  }
  if(!pathCanStart(def)){
    flash('Loading tasks. Try again in a moment.');
    return false;
  }
  startingJourneyId = id;
  if(triggerButton){
    triggerButton.disabled = true;
    triggerButton.textContent = 'Starting...';
  }
  const today = localDateString();
  const userId = (store.currentUser && store.currentUser.uid) || 'local';
  const enrollmentId = enrollmentIdFor(id, userId);
  const existing = currentEnrollmentForPath(id);
  const snapshot = snapshotJourneyStart(enrollmentId);
  const next = makeEnrollment(id, userId, {
    ...(existing || {}),
    id: enrollmentId,
    startDate: existing?.startDate || today,
    currentDay: 1,
    status: 'active',
    missedDate: null,
  });
  next.dayLogs = { ...(existing?.dayLogs || {}) };
  next.dayLogs[1] = makeDayLog(1, {
    ...(next.dayLogs[1] || {}),
    dayNumber: 1,
    date: next.startDate,
    status: 'active',
    totalTaskCount: getTasksForDay(def, 1).length,
  });
  store.enrollments[enrollmentId] = next;
  store.state.enrollments = store.state.enrollments || {};
  store.state.enrollments[enrollmentId] = next;
  await dbSaveState();
  selectedJourneyDay = 1;
  evidenceFormTaskId = null;
  evidenceProofType = 'url';
  navigateToFocus(id, 1);
  try{
    if(configPresent() && store.currentUser && !cloudAvailable()) throw cloudConnectionError();
    await trackOperation(
      'start enrollment',
      withTimeout(dbStartEnrollment(id, getTasksForDay(def, 1).length), ENROLLMENT_TIMEOUT_MS, 'start enrollment')
    );
    setJourneyPending(enrollmentId, false);
    store.syncStatus = '';
    await syncPathMetricsQuiet(id, 'day_started', 1);
    await dbSaveState();
    return true;
  }catch(e){
    console.warn('start enrollment:', e && e.message ? e.message : e);
    if(isTemporaryFirebaseError(e)){
      setJourneyPending(enrollmentId, true);
      store.syncStatus = 'Started locally - waiting to sync';
      await dbSaveState();
      flash(enrollmentStartErrorMessage(e));
      return true;
    }
    restoreJourneyStart(enrollmentId, snapshot);
    store.syncStatus = '';
    await dbSaveState();
    flash(enrollmentStartErrorMessage(e));
    return false;
  }finally{
    startingJourneyId = null;
    if(store.state.current === id && store.activeTab === 'plan') renderPlan();
  }
}

async function startSavedPathDayOne(){
  const id = aiBuilder?.savedPathId;
  let def = id ? store.state.userPaths[id] : null;
  if(!id || !def) return;
  if(def.platform && !pathTasksReady(def) && cloudAvailable()){
    try{ await trackOperation('path children load', withTimeout(dbLoadPlatformPath(id), PATH_OPEN_TIMEOUT_MS, 'load path tasks')); }
    catch(e){ flash(userSyncMessage(e, 'Could not load path tasks. Try again.')); return; }
    def = store.state.userPaths[id];
  }
  closeAIBuilder();
  await openSkill(id, { tab:'plan', day:1 });
  await startPathJourney(id, def, null);
}

function wireJourneyControls(id, def){
  const start = $('startJourney');
  if(start) start.onclick = async () => {
    await startPathJourney(id, def, start);
  };
  $('content').querySelectorAll('.daily-session-action').forEach(btn => {
    btn.onclick = async () => {
      const action = btn.dataset.sessionAction;
      const taskId = btn.dataset.task || null;
      try{
        if(action === 'agenda') await setDailySessionView(id, def, 'agenda');
        else if(action === 'evidence-preparation') await setDailySessionView(id, def, 'evidence-preparation');
        else if(action === 'start-session') await setDailySessionView(id, def, 'start-session');
        else if(action === 'focus-mode') await setDailySessionView(id, def, 'focus');
        else if(action === 'overview-mode') await setDailySessionView(id, def, 'overview');
        else if(action === 'focus-prev') await setDailySessionView(id, def, 'focus-prev');
        else if(action === 'focus-next') await setDailySessionView(id, def, 'focus-next');
        else if(action === 'focus-task') await setDailySessionView(id, def, 'focus-task', btn.dataset.taskIndex);
        else if(action === 'task-evidence') await setDailySessionView(id, def, 'task-evidence', taskId);
        else if(action === 'review') await setDailySessionView(id, def, 'partial-summary');
        else if(action === 'finish-pending') await setDailySessionView(id, def, 'finish-pending');
        else if(action === 'mark-done') await markDailySessionTask(id, def, taskId, 'done');
        else if(action === 'not-done') await markDailySessionTask(id, def, taskId, 'not-done');
        else if(action === 'skip-optional') await markDailySessionTask(id, def, taskId, 'skip-optional');
        else if(action === 'reflection') await saveDailyReflection(id, def, taskId);
      }catch(e){
        console.warn('daily session action:', e && e.message ? e.message : e);
      }
    };
  });
  $('content').querySelectorAll('[data-road-day]').forEach(btn => {
    btn.onclick = async () => {
      selectedJourneyDay = Number(btn.dataset.roadDay || 1);
      setRoute(pathHash(id, 'plan', selectedJourneyDay));
      evidenceFormTaskId = null;
      evidenceProofType = 'url';
      evidenceError = '';
      publicProgressError = '';
      renderPlan();
      const enrollment = currentEnrollmentForPath(id);
      if(enrollment?.id){
        listEvidenceSubmissions(enrollment.id, selectedJourneyDay)
          .then(() => { if(store.state.current === id && store.activeTab === 'plan') renderPlan(); })
          .catch(e => console.warn('load evidence:', e && e.message ? e.message : e));
      }
      const detail = $('journeyDetail');
      if(detail) detail.scrollIntoView({ behavior:'smooth', block:'start' });
    };
  });
  $('content').querySelectorAll('.open-focus-session[data-focus-day]').forEach(btn => {
    btn.onclick = () => {
      const day = Number(btn.dataset.focusDay || 1);
      navigateToFocus(id, day);
    };
  });
  $('content').querySelectorAll('.journey-ck').forEach(cb => {
    cb.addEventListener('change', e => updateJourneyTask(id, def, e.target.dataset.task, e.target.checked));
  });
  const complete = $('completeDay');
  if(complete) complete.onclick = () => completeJourneyDay(id, def, Number(complete.dataset.day || 1));
  $('content').querySelectorAll('.add-evidence').forEach(btn => {
    btn.onclick = () => {
      evidenceFormTaskId = btn.dataset.task;
      evidenceProofType = 'url';
      evidenceError = '';
      renderPlan();
    };
  });
  const evidenceType = $('evidenceType');
  if(evidenceType) evidenceType.onchange = () => {
    evidenceProofType = evidenceType.value === 'file' ? 'file' : 'url';
    evidenceError = '';
    renderPlan();
  };
  const cancelEvidence = $('cancelEvidence');
  if(cancelEvidence) cancelEvidence.onclick = () => {
    evidenceFormTaskId = null;
    evidenceProofType = 'url';
    evidenceError = '';
    renderPlan();
  };
  const submitEvidence = $('submitEvidence');
  if(submitEvidence) submitEvidence.onclick = () => submitEvidenceForTask(id, def, submitEvidence.dataset.task);
  const freeze = $('freezeDay');
  if(freeze) freeze.onclick = () => freezeMissedDay(id, Number(freeze.dataset.day || 1));
  const reset = $('resetMissedDay');
  if(reset) reset.onclick = () => resetMissedDay(id, def, Number(reset.dataset.day || 1));
  const publish = $('publishProgress');
  if(publish) publish.onclick = () => publishCompletedProgress(id, Number(publish.dataset.day || 1));
  const unpublish = $('unpublishProgress');
  if(unpublish) unpublish.onclick = () => unpublishCompletedProgress(id, Number(unpublish.dataset.day || 1));
}

/* ============================================================ */
/* ---------- DEDICATED FOCUS SCREEN ---- */
/* ============================================================ */
function navigateToFocus(id, day){
  focusScreenActive = true;
  selectedJourneyDay = day;
  setRoute(focusHash(id, day));
  renderFocusScreen();
  window.scrollTo({ top:0, behavior:'smooth' });
}

function exitFocusScreen(){
  focusScreenActive = false;
  const id = store.state.current;
  setRoute(pathHash(id, 'plan', selectedJourneyDay));
  renderPlan();
}

function renderFocusScreen(){
  const id = store.state.current;
  const def = curUser();
  if(!def){ exitFocusScreen(); return; }
  if(def.platform && !canOpenFullPath(id, def)){
    exitFocusScreen(); return;
  }
  const enrollment = currentEnrollmentForPath(id);
  if(!enrollment?.startDate){ exitFocusScreen(); return; }
  const today = localDateString();
  const day = selectedJourneyDay || Math.min(Number(enrollment.currentDay || 1), journeyDayForDate(enrollment.startDate, today));
  const dayTasks = getTasksForDay(def, day);
  const log = dayLogFor(enrollment, day) || makeDayLog(day, { date:dateForJourneyDay(enrollment.startDate, day), status:'active', totalTaskCount:dayTasks.length });
  const dayEvidence = cachedEvidenceFor(enrollment.id, day);
  const focusState = normalizeDailyFocusFor(id, day, dayTasks, log, dayEvidence);
  const h = focusScreenHTML({
    pathId:id,
    pathTitle:pathTitle(id),
    dayNumber:day,
    roadmapHash:pathHash(id, 'plan', day),
    tasks:dayTasks,
    dayLog:log,
    evidenceSubmissions:dayEvidence,
    proofType:evidenceProofType,
    evidenceTaskId:evidenceFormTaskId,
    evidenceError,
    evidenceBusy,
    accepts:ACCEPTED_EVIDENCE_TYPES.join(','),
    saveState:dailySessionSaveState,
    error:dailySessionError,
    intensity:def.intensity || def.aiBrief?.intensity || 'balanced',
    focusState,
  });
  $('content').innerHTML = h;
  applyHeader();
  wireFocusScreenControls(id, def);
}

function wireFocusScreenControls(id, def){
  const back = $('focusBackToRoadmap');
  if(back) back.onclick = e => { e.preventDefault(); exitFocusScreen(); };
  $('content').querySelectorAll('.daily-session-action').forEach(btn => {
    btn.onclick = async () => {
      const action = btn.dataset.sessionAction;
      const taskId = btn.dataset.task || null;
      try{
        if(action === 'agenda') await setDailySessionView(id, def, 'agenda');
        else if(action === 'evidence-preparation') await setDailySessionView(id, def, 'evidence-preparation');
        else if(action === 'start-session') await setDailySessionView(id, def, 'start-session');
        else if(action === 'focus-mode') await setDailySessionView(id, def, 'focus');
        else if(action === 'overview-mode') await setDailySessionView(id, def, 'overview');
        else if(action === 'focus-prev') await setDailySessionView(id, def, 'focus-prev');
        else if(action === 'focus-next') await setDailySessionView(id, def, 'focus-next');
        else if(action === 'focus-task') await setDailySessionView(id, def, 'focus-task', btn.dataset.taskIndex);
        else if(action === 'task-evidence') await setDailySessionView(id, def, 'task-evidence', taskId);
        else if(action === 'review') await setDailySessionView(id, def, 'partial-summary');
        else if(action === 'finish-pending') await setDailySessionView(id, def, 'finish-pending');
        else if(action === 'mark-done') await markDailySessionTask(id, def, taskId, 'done');
        else if(action === 'not-done') await markDailySessionTask(id, def, taskId, 'not-done');
        else if(action === 'skip-optional') await markDailySessionTask(id, def, taskId, 'skip-optional');
        else if(action === 'reflection') await saveDailyReflection(id, def, taskId);
      }catch(e){
        console.warn('daily session action:', e && e.message ? e.message : e);
      }
    };
  });
  const complete = $('completeDay');
  if(complete) complete.onclick = async () => {
    await completeJourneyDay(id, def, Number(complete.dataset.day || 1));
    if(focusScreenActive) renderFocusScreen();
  };
  const evidenceType = $('evidenceType');
  if(evidenceType) evidenceType.onchange = () => {
    evidenceProofType = evidenceType.value === 'file' ? 'file' : 'url';
    evidenceError = '';
    renderFocusScreen();
  };
  const cancelEvidence = $('cancelEvidence');
  if(cancelEvidence) cancelEvidence.onclick = () => {
    evidenceFormTaskId = null;
    evidenceProofType = 'url';
    evidenceError = '';
    renderFocusScreen();
  };
  const submitEvidence = $('submitEvidence');
  if(submitEvidence) submitEvidence.onclick = () => submitEvidenceForTask(id, def, submitEvidence.dataset.task);
}

/* ============================================================ */
/* ---------- USER-CREATED PATH (Plan view + inline editor) --- */
/* ============================================================ */
export function renderPlan(){
  if(focusScreenActive){ renderFocusScreen(); return; }
  const id = store.state.current, def = curUser();
  if(!def){ if(store.currentUser) renderWorkspace(); else renderCatalog(); return; }
  if(def.platform && !canOpenFullPath(id, def)){
    const record = platformAccessRecord(id, def);
    if(canPreviewPath(record.path, store.currentUser)) renderPathPreview(record);
    else renderAccessBlocked(record);
    return;
  }
  const editable = canEditUserPath(id);
  if(store.editMode && !editable) store.editMode = false;
  const pathStats = normalizePathStats(def.stats, def);
  const ownerShareable = ['public', 'unlisted'].includes(def.visibility);
  const p = P(); const t = totalsFor(id); const pct = t.total ? Math.round(t.done/t.total*100) : 0;
  let h = '<div class="aurora-unified-core">';
  h += '<div class="aurora-path-header"><div><div class="chip" style="margin-bottom:8px">Your path</div>'
    + '<div class="section-title" style="margin:0">' + esc(pathTitle(id)) + '</div>'
    + (pathGoal(id) ? ('<div class="muted" style="margin-top:6px;max-width:640px">' + esc(pathGoal(id)) + '</div>') : '')
    + '</div><div class="aurora-path-header-actions">' + (editable ? '<button class="btn lpt-button ' + (store.editMode ? 'lpt-button-primary' : 'lpt-button-secondary') + '" id="planEdit">' + (store.editMode ? 'Done editing' : '✎ Edit') + '</button>' : '')
    + '<div class="muted" style="font-size:12px;margin-top:10px">' + t.done + ' / ' + t.total + ' done · ' + pct + '%</div>'
    + '<div class="progress-bar" style="width:220px;max-width:60vw"><div style="width:' + pct + '%"></div></div></div></div>';

  h += syncStatusHTML();
  h += platformDailyFocusHTML(id, def);
  h += roadmapHTML(id, def);
  h += journeyDetailHTML(id, def);

  if(store.editMode){
    h += '<div class="panel card edit-meta"><div class="field"><label>Path name</label><input type="text" id="pmTitle" value="' + esc(def.title) + '" maxlength="80"/></div>'
      + '<div class="field" style="margin-top:10px"><label>Goal / description</label><textarea id="pmGoal" placeholder="What does finishing look like?">' + esc(def.goal || '') + '</textarea></div>'
      + '<div class="edit-grid">'
      + '<div class="field"><label>Category</label><input type="text" id="pmCategory" value="' + esc(def.category || '') + '" placeholder="Fitness, 3D, business..."/></div>'
      + '<div class="field"><label>Duration in days</label><input type="number" id="pmDurationDays" min="1" value="' + esc(def.durationDays || '') + '" placeholder="30"/></div>'
      + '<div class="field"><label>Duration label</label><input type="text" id="pmDuration" value="' + esc(def.durationLabel || '') + '" placeholder="8 weeks, 75 days..."/></div>'
      + '<div class="field"><label>Creator name</label><input type="text" id="pmCreator" value="' + esc(def.creatorName || '') + '"/></div>'
      + '<div class="field"><label>Visibility</label><select id="pmVisibility"><option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option></select></div>'
      + '<div class="field"><label>Cover image URL</label><input type="text" id="pmCover" value="' + esc(def.coverImage || '') + '" placeholder="https://..."/></div>'
      + '<div class="field"><label>Profile image URL</label><input type="text" id="pmProfile" value="' + esc(def.profileImage || '') + '" placeholder="https://..."/></div>'
      + '</div>'
      + '<div class="toggle-row"><label><input type="checkbox" id="pmDiscoverable" ' + (def.discoverable ? 'checked' : '') + '/> Discoverable</label><label><input type="checkbox" id="pmPreviewEnabled" ' + (def.previewEnabled !== false ? 'checked' : '') + '/> Preview enabled</label><label><input type="checkbox" id="pmPreviewScheme" ' + (def.previewIncludesScheme ? 'checked' : '') + '/> Preview includes scheme</label></div>'
      + '<div class="field" style="margin-top:10px"><label>Preview title</label><input type="text" id="pmPreviewTitle" value="' + esc(def.previewTitle || def.title || '') + '"/></div>'
      + '<div class="field" style="margin-top:10px"><label>Preview description</label><textarea id="pmPreviewDescription" placeholder="What should non-members see?">' + esc(def.previewDescription || def.goal || '') + '</textarea></div>'
      + ownerStatsHTML(pathStats)
      + '<div class="owner-share-tools"><button class="btn" id="pmOpenPreview">Open public page</button><button class="btn" id="pmCopyShare" ' + (ownerShareable ? '' : 'disabled') + '>' + (ownerShareable ? 'Copy share link' : 'Set Public or Unlisted to share') + '</button></div>'
      + (canManageMembers(def.platformData || def, def.membership, store.currentUser) ? '<div class="owner-note">Member sharing and role management coming next.</div>' : '')
      + (!def.platform && cloudActive() ? '<button class="btn gold" id="pmImport" style="margin-top:12px">Publish/import this path to platform</button>' : '')
      + '</div>';
  }

  if(store.editMode){
  (def.weeks || []).forEach((wk, wi) => {
    h += '<div class="panel card week-block" data-wi="' + wi + '">';
    if(store.editMode){
      h += '<div class="wb-head"><input type="text" class="wb-title-input" data-wi="' + wi + '" value="' + esc(wk.title || ('Week ' + (wi+1))) + '" placeholder="Week title"/>'
        + '<button class="icon-btn danger" data-act="delWeek" data-wi="' + wi + '" title="Delete week">🗑</button></div>';
    } else {
      h += '<div class="wb-head"><h3 style="margin:0">' + esc(wk.title || ('Week ' + (wi+1))) + '</h3></div>';
    }
    (wk.tasks || []).forEach((tk, ti) => {
      const tid = id + ':w' + wi + ':t' + ti;
      if(store.editMode){
        h += '<div class="row-edit"><input type="text" class="task-input" data-wi="' + wi + '" data-ti="' + ti + '" value="' + esc(tk.text || '') + '" placeholder="Task"/>'
          + '<button class="icon-btn danger" data-act="delTask" data-wi="' + wi + '" data-ti="' + ti + '" title="Remove">×</button></div>';
        h += '<div class="schedule-edit">'
          + '<label>Schedule<select class="task-schedule" data-wi="' + wi + '" data-ti="' + ti + '">' + selectOptions(AI_CADENCE_TYPES, tk.scheduleType || 'once') + '</select></label>'
          + '<label>Start/unlock day<input type="number" min="1" class="task-start" data-wi="' + wi + '" data-ti="' + ti + '" value="' + esc(tk.startDay || tk.unlockDay || '') + '"/></label>'
          + '<label>End day<input type="number" min="1" class="task-end" data-wi="' + wi + '" data-ti="' + ti + '" value="' + esc(tk.endDay || '') + '"/></label>'
          + '<label class="checkline"><input type="checkbox" class="task-evidence" data-wi="' + wi + '" data-ti="' + ti + '" ' + (tk.evidenceRequired ? 'checked' : '') + '/> Require proof for this task</label>'
          + '</div>';
      } else {
        h += '<label class="task-row ' + (p[tid] ? 'done' : '') + '"><input type="checkbox" class="ck" data-id="' + tid + '" ' + (p[tid] ? 'checked' : '') + '/><span>' + esc(tk.text || '') + '</span></label>';
      }
    });
    if(store.editMode) h += '<button class="add-link" data-act="addTask" data-wi="' + wi + '">+ Add task</button>';
    (wk.resources || []).forEach((r, ri) => {
      const rid = id + ':w' + wi + ':r' + ri;
      if(store.editMode){
        h += '<div class="row-edit res"><input type="text" class="res-label" data-wi="' + wi + '" data-ri="' + ri + '" value="' + esc(r.label || '') + '" placeholder="Resource name"/>'
          + '<input type="text" class="res-url" data-wi="' + wi + '" data-ri="' + ri + '" value="' + esc(r.url || '') + '" placeholder="https://..."/>'
          + '<button class="icon-btn danger" data-act="delRes" data-wi="' + wi + '" data-ri="' + ri + '" title="Remove">×</button></div>';
      } else if(r.url || r.label){
        h += '<div class="res-item"><input type="checkbox" class="ck sm" data-id="' + rid + '" ' + (p[rid] ? 'checked' : '') + '/>' + resourceLinksHTML(r.url, r.label || r.url) + '</div>';
      }
    });
    if(store.editMode) h += '<button class="add-link" data-act="addRes" data-wi="' + wi + '">+ Add resource</button>';
    h += '</div>';
  });

  if(store.editMode){
    h += '<button class="btn add-week" data-act="addWeek">+ Add week</button>';
    h += '<div class="danger-zone"><button class="linklike danger" data-act="delPath">Delete this path</button></div>';
  }
  }
  h += '</div>';
  $('content').innerHTML = appShellHTML('paths', h, { title:'Path detail', rightRail:platformRightRailHTML(id, def), className:'aurora-path-detail-route' });
  wireJourneyControls(id, def);

  // view-mode checkboxes
  $('content').querySelectorAll('input.ck[data-id]').forEach(cb => cb.addEventListener('change', async e => {
    await toggle(e.target.dataset.id, e.target.checked);
    const r = e.target.closest('.task-row'); if(r) r.classList.toggle('done', e.target.checked);
  }));
  const editBtn = $('planEdit');
  if(editBtn){
    editBtn.style.display = editable ? '' : 'none';
    editBtn.onclick = () => { if(!editable) return; store.editMode = !store.editMode; renderPlan(); };
  }
  if(!store.editMode) return;

  // edit-mode wiring
  const pm = $('pmTitle'); if(pm) pm.addEventListener('input', e => { def.title = e.target.value; applyHeader(); upSaveSoft(); });
  const pg = $('pmGoal');  if(pg) pg.addEventListener('input', e => { def.goal  = e.target.value; def.description = e.target.value; upSaveSoft(); });
  const pv = $('pmVisibility'); if(pv){ pv.value = def.visibility || 'private'; pv.addEventListener('change', e => { def.visibility = e.target.value; if(def.visibility !== 'public') def.discoverable = !!def.discoverable; upSave(); renderPlan(); }); }
  const bindText = (id, key) => { const el = $(id); if(el) el.addEventListener('input', e => { def[key] = e.target.value; upSaveSoft(); }); };
  const bindCheck = (id, key) => { const el = $(id); if(el) el.addEventListener('change', e => { def[key] = e.target.checked; upSave(); }); };
  bindText('pmCategory', 'category');
  bindText('pmDuration', 'durationLabel');
  const pdl = $('pmDuration'); if(pdl) pdl.addEventListener('change', () => {
    if(!def.durationDays) def.durationDays = normalizeDurationDays(null, def.durationLabel);
    upSave();
    renderPlan();
  });
  const pdd = $('pmDurationDays'); if(pdd) pdd.addEventListener('input', e => {
    const n = Number(e.target.value);
    def.durationDays = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    upSaveSoft();
  });
  bindText('pmCreator', 'creatorName');
  const bindUrl = (id, key) => {
    const el = $(id);
    if(!el) return;
    el.addEventListener('input', e => { def[key] = e.target.value; });
    el.addEventListener('change', e => {
      def[key] = safeExternalUrl(e.target.value);
      e.target.value = def[key] || '';
      upSave();
    });
  };
  bindUrl('pmCover', 'coverImage');
  bindUrl('pmProfile', 'profileImage');
  bindText('pmPreviewTitle', 'previewTitle');
  bindText('pmPreviewDescription', 'previewDescription');
  bindCheck('pmDiscoverable', 'discoverable');
  bindCheck('pmPreviewEnabled', 'previewEnabled');
  bindCheck('pmPreviewScheme', 'previewIncludesScheme');
  const pop = $('pmOpenPreview'); if(pop) pop.onclick = () => openPathRoute(id, true);
  const pcs = $('pmCopyShare'); if(pcs) pcs.onclick = () => copyShareLink(id, { id, path:def.platformData || def, membership:def.membership || null, sections:[], tasks:[] });
  const pi = $('pmImport'); if(pi) pi.onclick = () => importLocalPath(id);
  $('content').querySelectorAll('.wb-title-input').forEach(inp => inp.addEventListener('input', e => { def.weeks[+e.target.dataset.wi].title = e.target.value; upSaveSoft(); }));
  $('content').querySelectorAll('.task-input').forEach(inp => inp.addEventListener('input', e => { def.weeks[+e.target.dataset.wi].tasks[+e.target.dataset.ti].text = e.target.value; upSaveSoft(); }));
  $('content').querySelectorAll('.task-schedule').forEach(sel => {
    const task = def.weeks[+sel.dataset.wi].tasks[+sel.dataset.ti];
    sel.value = task.scheduleType || (task.unlockDay != null || task.startDay != null ? 'once' : 'once');
    sel.addEventListener('change', e => { task.scheduleType = e.target.value; upSave(); renderPlan(); });
  });
  $('content').querySelectorAll('.task-start').forEach(inp => inp.addEventListener('input', e => {
    const task = def.weeks[+e.target.dataset.wi].tasks[+e.target.dataset.ti];
    const n = Number(e.target.value);
    task.startDay = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    task.unlockDay = ['daily', 'weekdays', 'selected_days', 'times_per_week', 'weekly', 'interval'].includes(task.scheduleType) ? null : task.startDay;
    upSaveSoft();
  }));
  $('content').querySelectorAll('.task-end').forEach(inp => inp.addEventListener('input', e => {
    const task = def.weeks[+e.target.dataset.wi].tasks[+e.target.dataset.ti];
    const n = Number(e.target.value);
    task.endDay = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    upSaveSoft();
  }));
  $('content').querySelectorAll('.task-evidence').forEach(inp => inp.addEventListener('change', e => {
    def.weeks[+e.target.dataset.wi].tasks[+e.target.dataset.ti].evidenceRequired = e.target.checked;
    upSave();
  }));
  $('content').querySelectorAll('.res-label').forEach(inp => inp.addEventListener('input', e => { def.weeks[+e.target.dataset.wi].resources[+e.target.dataset.ri].label = e.target.value; upSaveSoft(); }));
  $('content').querySelectorAll('.res-url').forEach(inp => {
    inp.addEventListener('input', e => { def.weeks[+e.target.dataset.wi].resources[+e.target.dataset.ri].url = e.target.value; });
    inp.addEventListener('change', e => {
      const resource = def.weeks[+e.target.dataset.wi].resources[+e.target.dataset.ri];
      resource.url = safeExternalUrl(e.target.value) || '';
      e.target.value = resource.url;
      upSave();
    });
  });
  $('content').querySelectorAll('[data-act]').forEach(btn => btn.onclick = async () => {
    const act = btn.dataset.act, wi = +btn.dataset.wi, ti = +btn.dataset.ti, ri = +btn.dataset.ri;
    if(act === 'addTask'){
      (def.weeks[wi].tasks = def.weeks[wi].tasks || []).push({ text:'', scheduleType:'once', taskMode:'one_off', startDay:1, endDay:null });
      def.intentionallyEmpty = false;
    }
    else if(act === 'delTask'){
      def.weeks[wi].tasks.splice(ti, 1);
      def.intentionallyEmpty = !pathHasTasks(def);
    }
    else if(act === 'addRes'){ (def.weeks[wi].resources = def.weeks[wi].resources || []).push({ label:'', url:'' }); }
    else if(act === 'delRes'){ def.weeks[wi].resources.splice(ri, 1); }
    else if(act === 'addWeek'){
      def.weeks.push({ title:'Week ' + (def.weeks.length+1), tasks:[{text:''}], resources:[] });
      def.intentionallyEmpty = false;
    }
    else if(act === 'delWeek'){
      // Snapshot the week so Undo can reinsert it at the same index.
      const snap = JSON.parse(JSON.stringify(def.weeks[wi]));
      const wasIntentionallyEmpty = def.intentionallyEmpty === true;
      def.weeks.splice(wi, 1);
      def.intentionallyEmpty = !pathHasTasks(def);
      upSave(); renderPlan();
      undoToast('Week removed', () => { def.weeks.splice(wi, 0, snap); def.intentionallyEmpty = wasIntentionallyEmpty; upSave(); renderPlan(); });
      return;
    }
    else if(act === 'delPath'){
      // Snapshot path definition, progress state, and all render entries for this skill.
      const snap = {
        userPath: store.state.userPaths[id] ? JSON.parse(JSON.stringify(store.state.userPaths[id])) : null,
        skill:    store.state.skills[id]    ? JSON.parse(JSON.stringify(store.state.skills[id]))    : null,
        renders:  store.catalogue.filter(e => (e.skill || 'cinematic') === id).map(e => JSON.parse(JSON.stringify(e))),
      };
      const title = snap.userPath ? (snap.userPath.title || 'path') : 'path';
      // Apply cascade delete.
      store.catalogue = store.catalogue.filter(e => (e.skill || 'cinematic') !== id);
      delete store.state.userPaths[id];
      delete store.state.skills[id];
      await Promise.all(snap.renders.map(r => dbDelRender(r.id).catch(() => {})));
      await dbSaveState();
      goCatalog();
      undoToast('Deleted "' + title + '"', async () => {
        if(snap.userPath) store.state.userPaths[id] = snap.userPath;
        if(snap.skill)    store.state.skills[id]    = snap.skill;
        for(const r of snap.renders){ store.catalogue.push(r); try{ await dbSaveRender(r); }catch(e){} }
        await dbSaveState();
        renderCatalog();
      });
      return;
    }
    upSave(); renderPlan();
  });
}

/* ============================================================ */
/* ---------- TODAY ------------------------------------------- */
/* ============================================================ */

function findActiveEnrolledPath(){
  const userId = (store.currentUser && store.currentUser.uid) || 'local';
  let best = null, bestDate = '';
  const allEnrollments = { ...store.enrollments, ...(store.state.enrollments || {}) };
  for(const [eid, en] of Object.entries(allEnrollments)){
    if(!en || !en.pathId || !en.startDate) continue;
    const def = store.state.userPaths[en.pathId];
    if(!def || !def.platform) continue;
    if(!canOpenFullPath(en.pathId, def)) continue;
    const act = en.lastActivityDate || en.startDate || '';
    if(!best || act > bestDate){ best = en; bestDate = act; }
  }
  return best;
}

function compactRoadmapHTML(id, def, windowSize){
  const enrollment = currentEnrollmentForPath(id);
  const tasksReady = pathTasksReady(def);
  const logs = enrollment?.dayLogs || {};
  const today = localDateString();
  const totalDays = getMaxRoadmapDay(def, enrollment);
  const activeDay = enrollment?.startDate ? journeyDayForDate(enrollment.startDate, today) : 1;
  const lo = Math.max(1, activeDay - windowSize);
  const hi = Math.min(totalDays, activeDay + windowSize);
  let h = '<section class="aurora-roadmap-panel aurora-compact-roadmap proof-studio-roadmap">'
    + '<header class="aurora-roadmap-header"><div><span class="aurora-section-kicker">Proof journey</span><h3>' + esc(def.title || 'Your path') + '</h3></div></header>';
  h += '<ol class="aurora-journey-list">';
  for(let day = lo; day <= hi; day++){
    const status = getDayStatus(day, enrollment, logs, today);
    const open = canOpenDay(day, status);
    const date = enrollment?.startDate ? dateForJourneyDay(enrollment.startDate, day) : null;
    const taskCount = tasksReady ? getTasksForDay(def, day).length : 0;
    const log = logs[day] || logs[String(day)] || {};
    const tier = log.completionTier || log.tier || '';
    const proofSubmitted = Number(log.evidenceCount || 0) > 0 || (log.verifiedTaskIds || []).length > 0;
    h += auroraRoadmapDayItemHTML({
      day,
      status,
      label:statusLabel(status),
      date:date ? date.slice(5) : '',
      title:status === 'active' ? "Today's proof session" : status === 'completed' ? 'Completed proof day' : 'Scheduled proof day',
      taskSummary:tasksReady ? (open ? (taskCount + ' task' + (taskCount === 1 ? '' : 's')) : 'Unlocks later') : 'Loading tasks',
      tier,
      proofSubmitted,
      open,
      isToday:day === activeDay,
    });
  }
  h += '</ol>';
  if(totalDays > (hi - lo + 1)){
    h += '<div class="aurora-roadmap-expander"><button class="btn lpt-button lpt-button-secondary" id="viewFullRoadmap" type="button">View full path (' + totalDays + ' days)</button></div>';
  }
  h += '</section>';
  return h;
}

function platformDailyFocusHTML(id, def){
  const enrollment = currentEnrollmentForPath(id);
  const tasksReady = pathTasksReady(def);
  if(!enrollment?.startDate){
    const canStart = pathCanStart(def);
    return '<section class="panel card aurora-daily-focus" aria-label="Daily focus">'
      + '<span class="aurora-section-kicker">Daily focus</span>'
      + '<h2>' + esc(def.title || 'Your path') + '</h2>'
      + '<p>' + esc(canStart ? 'Set today as Day 1 and begin tracking progress.' : 'Add at least one Day 1 task before starting.') + '</p>'
      + '<button class="btn gold lpt-button lpt-button-primary" id="startJourney" ' + (!canStart || startingJourneyId === id ? 'disabled' : '') + '>'
      + (startingJourneyId === id ? 'Starting...' : 'Start this path') + '</button></section>';
  }
  const today = localDateString();
  const activeDay = journeyDayForDate(enrollment.startDate, today);
  const day = Math.min(Number(enrollment.currentDay || 1), activeDay);
  const status = getDayStatus(day, enrollment, enrollment.dayLogs || {}, today);
  const dayTasks = tasksReady ? getTasksForDay(def, day) : [];
  const log = dayLogFor(enrollment, day) || {};
  const completedCount = dayTasks.filter(task => taskIsDone(task, log)).length;
  const totalDays = getMaxRoadmapDay(def, enrollment);
  const evidenceCount = evidenceCountFor(enrollment.id, day);
  const date = dateForJourneyDay(enrollment.startDate, day);
  const sessionStarted = !!log.sessionStartedAt;
  const ctaLabel = status === 'completed' ? 'Review Day ' + day : (sessionStarted ? 'Continue day' : 'Start day');
  const proofNeeded = dayTasks.some(t => t.evidenceRequired);
  let h = '<section class="panel card aurora-daily-focus" aria-label="Daily focus">';
  h += '<span class="aurora-section-kicker">Daily focus</span>';
  h += '<div class="aurora-daily-focus-meta">'
    + '<span>Day ' + day + ' of ' + totalDays + '</span>'
    + '<span>' + esc(date || '') + '</span>'
    + '<span class="aurora-chip">' + esc(statusLabel(status)) + '</span>'
    + '</div>';
  h += '<h2>' + esc(def.title || 'Day ' + day) + '</h2>';
  if(dayTasks.length){
    h += '<div class="aurora-daily-tasks">';
    dayTasks.forEach(task => {
      const title = task.title || task.text || 'Task';
      const done = taskIsDone(task, log);
      h += '<div class="aurora-daily-task ' + (done ? 'is-done' : '') + '">'
        + '<span class="aurora-daily-task-check" aria-hidden="true">' + (done ? '&#10003;' : '') + '</span>'
        + '<span class="aurora-daily-task-title">' + esc(title) + '</span>'
        + '<span class="aurora-daily-task-status">'
        + (task.evidenceRequired ? '<span class="aurora-chip aurora-chip-proof">Proof required</span>' : '')
        + '</span>'
        + '</div>';
    });
    h += '</div>';
    h += '<div class="aurora-daily-progress"><span>' + completedCount + ' / ' + dayTasks.length + ' tasks</span>'
      + (evidenceCount > 0 ? '<span>' + evidenceCount + ' proof submitted</span>' : '')
      + '</div>';
  }
  if(proofNeeded) h += '<div class="aurora-daily-proof-note">This day requires proof before completion.</div>';
  if(status !== 'completed' && status !== 'locked'){
    h += '<button class="btn gold lpt-button lpt-button-primary open-focus-session" type="button" data-focus-day="' + esc(day) + '">' + esc(ctaLabel) + '</button>';
  }
  h += '</section>';
  return h;
}

function platformRightRailHTML(id, def){
  const enrollment = currentEnrollmentForPath(id);
  const streak = Number(enrollment?.streak || 0);
  const totalDays = getMaxRoadmapDay(def, enrollment);
  const completedDays = enrollment?.lastCompletedDay || 0;
  const hasConsistency = !!(streak || completedDays);
  const stats = normalizePathStats(def.stats, def);
  const joined = stats.joinedCount || 0;
  const proofs = stats.proofSubmissionCount || 0;
  const completed = stats.completedCount || 0;
  const hasPathTrust = !!(joined || proofs || completed);
  let h = '<article class="aurora-workspace-rail-card proof-consistency-card ' + (hasConsistency ? 'has-data' : 'is-empty') + '">'
    + '<span>Your consistency</span>'
    + '<b>' + esc(hasConsistency ? (streak + ' day streak') : 'Not enough data yet') + '</b>'
    + '<p>' + esc(hasConsistency ? (completedDays + ' of ' + totalDays + ' days completed from real progress.') : 'Complete a few sessions to see your consistency.') + '</p></article>';
  h += '<article class="aurora-workspace-rail-card">'
    + '<span>Path trust</span>'
    + (hasPathTrust
      ? '<b>' + joined + ' joined · ' + proofs + ' proofs · ' + completed + ' completed</b><p>Real metrics from verified participation.</p>'
      : '<b>Not enough data yet</b><p>Metrics appear as participants join and submit proof.</p>')
    + '</article>';
  h += '<div class="muted" style="font-size:12px;margin-top:12px;line-height:1.5">Every number here is proof-backed from real progress. No rankings or follower counts are estimated.</div>';
  return h;
}

export function renderToday(){
  const userDef = curUser();
  if(userDef && userDef.platform){
    renderPlatformToday(store.state.current, userDef);
    return;
  }
  if(!store.state.current && store.currentUser){
    const enrolled = findActiveEnrolledPath();
    if(enrolled){
      const def = store.state.userPaths[enrolled.pathId];
      if(def && def.platform){
        renderPlatformToday(enrolled.pathId, def);
        return;
      }
    }
  }
  const def = curDef(), cs = curState();
  const ep = effPlan();
  if(!def || !cs || !ep.length){
    let activePath = null;
    for(const [id, d] of Object.entries(store.state.userPaths || {})){
      if(d.platform && canOpenFullPath(id, d)){
        const enrollment = currentEnrollmentForPath(id);
        if(enrollment?.startDate){ activePath = { id, def:d }; break; }
      }
    }
    if(activePath){
      renderPlatformToday(activePath.id, activePath.def);
      return;
    }
    const emptyToday = '<div class="aurora-unified-layout"><div class="aurora-unified-core"><section class="panel card aurora-daily-focus is-empty"><span class="aurora-section-kicker">Today</span><h2>No active path</h2><p>Create or join a path to start today.</p></section></div></div>';
    $('content').innerHTML = appShellHTML('today', emptyToday, { title:'Today', className:'aurora-today-route' });
    return;
  }
  let wkNum = cs.meta.startDate ? currentWeekFromStart() : store.currentWeek;
  let wk = weekObj(wkNum); if(!wk){ wk = ep[0]; wkNum = wk ? wk.w : 1; }
  const q = quarters()[wk.q] || { name:'Custom' };
  const tdPos = (ep.findIndex(x => x.w === wk.w) + 1) || 1, tdTotal = ep.length;
  const tk = (function(){ const order=['mon','tue','wed','thu','fri','sat','sun']; return order[(new Date().getDay()+6)%7]; })();
  const dayDef = def.days.find(d => d.k === tk) || def.days[0];
  const bid = 'w' + wk.w + '.' + dayDef.k, tid = bid + '.t';
  const streak = computeStreak(), wp = weekProg(wk), wpct = wp.total ? Math.round(wp.done/wp.total*100) : 0;
  const dayNames = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday', sun:'Sunday' };
  const todayDate = localDateString();
  const proofSummary = dayDef.ship
    ? 'Shipping day: save or publish one proof piece when finished.'
    : 'No required proof today; save a note if useful.';
  let h = '<div class="aurora-unified-core">';
  h += '<div class="panel card aurora-daily-focus">';
  h += '<span class="aurora-section-kicker">Today</span>';
  h += '<div class="aurora-daily-focus-meta"><span>' + esc(pathTitle(store.state.current)) + '</span><span>' + esc(dayNames[tk] || 'Today') + ' · Week ' + tdPos + ' of ' + tdTotal + '</span><span>' + esc(todayDate) + '</span></div>';
  h += '<h2>' + esc(dayLabel(wk, dayDef)) + '</h2>';
  h += '<p>One focused daily action before the rest of the interface.</p>';
  if(!cs.meta.startDate) h += '<div class="hint" style="margin:10px 0">Set a <b>start date</b> in the header to lock your weekly schedule. Showing Week 1 for now.</div>';
  h += '<div class="aurora-daily-tasks">';
  h += '<div class="aurora-daily-task ' + (P()[bid] ? 'is-done' : '') + '"><input type="checkbox" class="ck" data-id="' + bid + '" ' + (P()[bid] ? 'checked' : '') + '/>'
    + '<span class="aurora-daily-task-title">' + esc(dayLabel(wk, dayDef)) + '</span><span class="aurora-daily-task-sub">' + esc(dayDef.s) + '</span></div>';
  h += '<div class="aurora-daily-task"><label><input type="checkbox" class="ck sm ox" data-id="' + tid + '" ' + (P()[tid] ? 'checked' : '') + '/> Taste 15m</label></div>';
  h += '</div>';
  if(dayDef.ship) h += '<div class="aurora-daily-proof-note">Shipping day. Finish and publish one piece.</div>';
  h += '<div class="aurora-daily-proof-note">' + esc(proofSummary) + '</div>';
  h += '<div class="aurora-daily-actions"><button class="btn gold lpt-button lpt-button-primary" id="openWeek">Continue day</button><button class="btn lpt-button lpt-button-secondary" id="openRoadmapFromToday">View roadmap</button></div>';
  h += '</div></div>';
  const tot = allTotals(), tpct = tot.total ? Math.round(tot.done/tot.total*100) : 0;
  const completedValues = Math.max(0, Number(tot.done || 0));
  const hasConsistencyData = Boolean(streak || completedValues);
  let railHTML = '<article class="aurora-workspace-rail-card proof-consistency-card ' + (hasConsistencyData ? 'has-data' : 'is-empty') + '">'
    + '<span>Your consistency</span>'
    + '<b>' + esc(hasConsistencyData ? (streak + ' day streak') : 'Not enough completed days yet.') + '</b>'
    + '<p>' + esc(hasConsistencyData ? (completedValues + ' completed progress value' + (completedValues === 1 ? '' : 's') + ' from real local progress.') : 'Complete a few sessions to see your consistency map.') + '</p></article>';
  railHTML += '<article class="aurora-workspace-rail-card"><span>This week</span><b>' + wpct + '%</b><div class="progress-bar"><div style="width:' + wpct + '%"></div></div></article>';
  railHTML += '<article class="aurora-workspace-rail-card"><span>Path trust</span><b>' + (tot.total ? tpct + '%' : 'Not enough data yet') + '</b><div class="progress-bar"><div style="width:' + tpct + '%"></div></div></article>';
  railHTML += '<div class="muted" style="font-size:12px;margin-top:12px;line-height:1.5">Every number here is proof-backed from your local progress. No rankings or follower counts are estimated.</div>';
  $('content').innerHTML = appShellHTML('today', h, { title:'Today', rightRail:railHTML, className:'aurora-today-route' });
  wireChecks();
  const ow = $('openWeek'); if(ow) ow.onclick = () => { store.currentWeek = wk.w; curState().meta.lastWeek = wk.w; store.nav.switchTab('week'); };
  const rm = $('openRoadmapFromToday'); if(rm) rm.onclick = () => store.nav.switchTab('week');
  $('content').querySelectorAll('input.ck').forEach(cb => cb.addEventListener('change', () => setTimeout(renderToday, 60)));
}

function renderPlatformToday(id, def){
  const body = '<div class="aurora-unified-core">'
    + platformDailyFocusHTML(id, def)
    + compactRoadmapHTML(id, def, 2)
    + '</div>';
  $('content').innerHTML = appShellHTML('today', body, { title:'Today', rightRail:platformRightRailHTML(id, def), className:'aurora-today-route' });
  wireJourneyControls(id, def);
  const fullRoadmap = $('viewFullRoadmap');
  if(fullRoadmap) fullRoadmap.onclick = () => {
    store.state.current = id;
    store.editMode = false;
    renderPlan();
  };
}

/* ============================================================ */
/* ---------- EDIT PATH toggle (owner of a built-in path) ----- */
/* ============================================================ */
export function editPath(){
  if(!store.state.current || isUserPath(store.state.current)) return;
  store.editMode = !store.editMode;
  applyHeader();
  if(store.editMode){ if(store.activeTab !== 'week') store.nav.switchTab('week'); else renderWeek(); }
  else { store.nav.switchTab(store.activeTab); }
}

/* ============================================================ */
/* ---------- WEEK (cinematic) -------------------------------- */
/* ============================================================ */
function ladderRowHTML(l){
  const done = ladderCount(l.key, l.rungs), ni = nextRungIdx(l.key, l.rungs);
  const next = ni >= 0
    ? '<label class="lad-next"><input type="checkbox" class="ck sm" data-id="L' + l.key + ni + '"> <span>' + esc((ni+1) + '. ' + l.rungs[ni][0]) + (l.rungs[ni][1] ? (' · ' + esc(l.rungs[ni][1])) : '') + '</span></label>'
    : '<span class="lad-done">All ' + l.rungs.length + ' rungs mastered ★</span>';
  return '<div class="lad-row"><div class="lad-head"><b>' + esc(l.title) + '</b><span class="lad-count">' + done + '/' + l.rungs.length + '</span></div>' + next + '</div>';
}
function ladderFullHTML(l){
  const done = ladderCount(l.key, l.rungs);
  let h = '<div class="panel card ladfull"><h3>' + esc(l.title) + '</h3><div class="cap">' + esc(l.cap) + ' · <b style="color:var(--gold)">' + done + '/' + l.rungs.length + '</b></div>';
  l.rungs.forEach((r, i) => {
    const id = 'L' + l.key + i, dn = !!P()[id];
    h += '<div class="rung ' + (dn ? 'done' : '') + '"><div class="rn">' + (i+1) + '</div>'
      + '<input type="checkbox" class="ck sm" data-id="' + id + '" ' + (dn ? 'checked' : '') + '/>'
      + '<div class="rt">' + esc(r[0]) + (r[1] ? ('<span class="tag">' + esc(r[1]) + '</span>') : '') + '</div></div>';
  });
  h += '</div>'; return h;
}

export function renderWeek(){
  const ep = effPlan();
  if(!ep.length){ $('content').innerHTML = '<div class="empty">No weeks. Add one in edit mode.</div>'; return; }
  let idx = ep.findIndex(x => x.w === store.currentWeek); if(idx < 0){ idx = 0; store.currentWeek = ep[0].w; }
  const wk = ep[idx], p = weekProg(wk), q = quarters()[wk.q] || { name:'Custom' };
  const cw = curState().meta.startDate ? currentWeekFromStart() : null;
  const num = idx + 1, total = ep.length;
  let h = '';
  const focusHtml = store.editMode
    ? '<textarea class="week-focus-edit" id="focusEdit" placeholder="What is this week about?">' + esc(wk.focus || '') + '</textarea>'
    : '<div class="week-focus">' + esc(wk.focus) + '</div>';
  h += '<div class="week-head"><div><div class="chip" style="margin-bottom:10px">' + esc(q.name) + (wk._added ? ' · added' : '') + '</div>'
    + '<div class="week-num">' + String(num).padStart(2,'0') + '<span> / ' + total + '</span></div>'
    + focusHtml + '</div>'
    + '<div style="text-align:right"><div class="nav-btns">'
    + '<button class="btn" id="prevW" ' + (idx === 0 ? 'disabled' : '') + '>← Prev</button>'
    + ((cw && cw !== wk.w) ? ('<button class="btn gold" id="jumpCur">Jump to current</button>') : '')
    + '<button class="btn" id="nextW" ' + (idx === total - 1 ? 'disabled' : '') + '>Next →</button></div>'
    + '<div style="margin-top:14px"><div class="muted" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;display:flex;justify-content:space-between"><span>Week progress</span><span id="weekBarTxt">' + p.done + '/' + p.total + '</span></div>'
    + '<div class="progress-bar" style="width:240px;max-width:60vw"><div id="weekBar" style="width:' + (p.total ? p.done/p.total*100 : 0) + '%"></div></div></div></div></div>';
  if(store.editMode){
    h += '<div class="panel card edit-meta"><div class="field"><label>Path name</label><input type="text" id="cmTitle" value="' + esc(pathTitle(store.state.current)) + '" maxlength="80"/></div>'
      + '<div class="field" style="margin-top:10px"><label>Goal / description</label><textarea id="cmGoal" placeholder="Your goal">' + esc(curState().meta.goal != null ? curState().meta.goal : '') + '</textarea></div>'
      + '<div class="muted" style="font-size:12px;margin-top:8px">Edit each week\u2019s focus and resources below, and add or remove weeks. The daily rhythm, ladders, and drills stay fixed as the program\u2019s engine.</div>'
      + '<div class="week-edit-actions"><button class="btn" id="addWeekBtn">+ Add a week</button><button class="linklike danger" id="rmWeekBtn">Remove this week</button></div></div>';
  }
  if(wk.ms) h += '<div class="milestone"><div class="star">★</div><div><b>Milestone</b>' + esc(wk.ms) + '</div></div>';
  h += '<div class="days">';
  days().forEach(d => {
    const bid = 'w' + wk.w + '.' + d.k, tid = bid + '.t', bDone = !!P()[bid];
    h += '<div class="day ' + (d.ship ? 'ship' : '') + ' ' + (bDone ? 'done' : '') + '"><div class="dname">' + d.n + '</div>'
      + '<input type="checkbox" class="ck" data-id="' + bid + '" ' + (bDone ? 'checked' : '') + ' title="Deep block done"/>'
      + '<div class="dlabel">' + esc(dayLabel(wk, d)) + '<small>' + esc(d.s) + '</small></div>'
      + '<label class="taste"><input type="checkbox" class="ck sm ox" data-id="' + tid + '" ' + (P()[tid] ? 'checked' : '') + '/> Taste 15m</label></div>';
  });
  h += '</div>';
  h += '<div class="panel card ladder-strip"><h3>🪜 Craft ladders - always-on, every week</h3>';
  ladders().forEach(l => { h += ladderRowHTML(l); });
  h += '<div class="lad-link"><button class="linklike" id="ladLink">view full ladders →</button></div></div>';
  h += '<details class="proto"><summary>The 90-minute deep-block protocol</summary><div class="body"><ol>'
    + '<li><b>5 min · Set the target.</b> One sentence, edge-of-ability.</li>'
    + '<li><b>10 min · Study the reference.</b> Note <i>why</i> it works.</li>'
    + '<li><b>55 min · Reps.</b> Recreate to critique to adjust to recreate. One improving adjustment every rep. Then one original rep.</li>'
    + '<li><b>10 min · Feedback.</b> Side-by-side with reference. Record a brutal 60-sec self-critique.</li>'
    + '<li><b>10 min · Log + queue.</b> One line in your log. Write tomorrows target.</li>'
    + '</ol><p style="margin-top:10px;color:var(--sand-dim)">Protect this block like an invoice - schedule it <b>before</b> client work.</p></div></details>';
  h += '<div class="twocol"><div class="panel card"><h3>📚 This weeks courses & resources</h3>';
  if(store.editMode){
    const arr = weekResArr(wk.w);
    arr.forEach((r, i) => {
      h += '<div class="row-edit res"><input type="text" class="cres-l" data-i="' + i + '" value="' + esc(r.l || '') + '" placeholder="Resource name"/>'
        + '<input type="text" class="cres-u" data-i="' + i + '" value="' + esc(r.u || '') + '" placeholder="https://..."/>'
        + '<button class="icon-btn danger" data-cact="delRes" data-i="' + i + '" title="Remove">×</button></div>';
    });
    h += '<button class="add-link" data-cact="addRes">+ Add resource</button>';
  } else if((wk.res || []).length){
    wk.res.forEach((r, i) => {
      const rid = 'w' + wk.w + '.r' + i;
      h += '<div class="res-item"><input type="checkbox" class="ck sm" data-id="' + rid + '" ' + (P()[rid] ? 'checked' : '') + '/>'
        + resourceLinksHTML(r.u, r.l) + '</div>';
    });
  } else h += '<div class="muted" style="font-size:13px">Reference study week - pull from the Drill Library and the masters channels.</div>';
  h += '<div class="hint" style="margin-top:14px">Tick a resource once youve worked through it. Full library in the <b>Resources</b> tab.</div></div>'
    + '<div class="panel card note-wrap"><label>What I learned this week</label>'
    + '<textarea class="note" id="weekNote" placeholder="One honest paragraph: what clicked, what broke, what to fix next week...">' + esc(curState().notes['w' + wk.w] || '') + '</textarea>'
    + '<button class="btn ox" id="goLog" style="margin-top:12px">＋ Log this weeks render →</button></div></div>';
  $('content').innerHTML = h;
  wireChecks();
  const pv = $('prevW');   if(pv) pv.onclick = () => { if(idx > 0) goWeek(ep[idx-1].w); };
  const nx = $('nextW');   if(nx) nx.onclick = () => { if(idx < total - 1) goWeek(ep[idx+1].w); };
  const jc = $('jumpCur'); if(jc) jc.onclick = () => { const c = currentWeekFromStart(); if(c) goWeek(c); };
  const ll = $('ladLink'); if(ll) ll.onclick = () => store.nav.switchTab('ladders');
  const note = $('weekNote');
  note.addEventListener('input', e => { curState().notes['w' + wk.w] = e.target.value; scheduleSave(); });
  $('goLog').onclick = () => { logPrefillWeek = num; store.nav.switchTab('log'); };
  if(store.editMode){
    const ti = $('cmTitle'); if(ti) ti.addEventListener('input', e => { curState().meta.title = e.target.value || undefined; applyHeader(); scheduleSave(); });
    const go = $('cmGoal');  if(go) go.addEventListener('input', e => { curState().meta.goal  = e.target.value || undefined; scheduleSave(); });
    const fe = $('focusEdit'); if(fe) fe.addEventListener('input', e => { setWeekFocus(wk.w, e.target.value); scheduleSave(); });
    $('content').querySelectorAll('.cres-l').forEach(inp => inp.addEventListener('input', e => { weekResArr(wk.w)[+e.target.dataset.i].l = e.target.value; scheduleSave(); }));
    $('content').querySelectorAll('.cres-u').forEach(inp => {
      inp.addEventListener('input', e => { weekResArr(wk.w)[+e.target.dataset.i].u = e.target.value; });
      inp.addEventListener('change', e => {
        weekResArr(wk.w)[+e.target.dataset.i].u = safeExternalUrl(e.target.value) || '';
        e.target.value = weekResArr(wk.w)[+e.target.dataset.i].u;
        dbSaveState();
      });
    });
    $('content').querySelectorAll('[data-cact]').forEach(btn => btn.onclick = () => {
      const act = btn.dataset.cact;
      if(act === 'addRes'){ weekResArr(wk.w).push({ l:'', u:'' }); }
      else if(act === 'delRes'){ weekResArr(wk.w).splice(+btn.dataset.i, 1); }
      dbSaveState(); renderWeek();
    });
    const aw = $('addWeekBtn'); if(aw) aw.onclick = () => { const nw = addCineWeek(wk.q); dbSaveState(); goWeek(nw); };
    const rw = $('rmWeekBtn');  if(rw) rw.onclick = () => {
      const back = idx > 0 ? ep[idx-1].w : (ep[1] ? ep[1].w : null);
      const w = wk.w;
      removeCineWeek(w);
      dbSaveState();
      const np = effPlan();
      goWeek(back && np.some(x => x.w === back) ? back : (np[0] ? np[0].w : 1));
      undoToast('Week ' + w + ' hidden', () => {
        const e = weekEdits();
        e.removed = (e.removed || []).filter(x => x !== w);
        dbSaveState();
        goWeek(w);
      });
    };
  }
}

/* ---- checkbox wiring (shared across renders) ---- */
export function wireChecks(){
  $('content').querySelectorAll('input.ck').forEach(cb => {
    cb.addEventListener('change', async e => {
      const id = e.target.dataset.id;
      await toggle(id, e.target.checked);
      if(id && id[0] === 'L'){
        if(store.activeTab === 'week') renderWeek();
        else if(store.activeTab === 'ladders') renderLadders();
      } else {
        const dayEl = e.target.closest('.day');
        if(dayEl && !e.target.classList.contains('sm')) dayEl.classList.toggle('done', e.target.checked);
      }
    });
  });
}

export function goWeek(w){
  const ep = effPlan(); if(!ep.some(x => x.w === w)) w = ep[0] ? ep[0].w : 1;
  store.currentWeek = w; curState().meta.lastWeek = w;
  dbSaveState(); renderWeek();
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ============================================================ */
/* ---------- MAP --------------------------------------------- */
/* ============================================================ */
export function renderMap(){
  const plan = effPlan(); const pos = {}; plan.forEach((wk, i) => { pos[wk.w] = i + 1; });
  const qmap = {}; plan.forEach(wk => { (qmap[wk.q] = qmap[wk.q] || []).push(wk); });
  let h = '<div class="section-title" style="margin-bottom:16px">The full <em>arc</em> - click any week to jump in.</div>';
  Object.keys(qmap).forEach(q => {
    const def = quarters()[q] || { name:'Custom', sub:'Added weeks' }, wks = qmap[q];
    let qd = 0, qt = 0;
    wks.forEach(wk => { const p = weekProg(wk); qd += p.done; qt += p.total; });
    const qpct = qt ? Math.round(qd/qt*100) : 0;
    h += '<div class="quarter"><div class="qhead"><div><div class="qname">' + esc(def.name) + '</div><div class="muted" style="font-size:13px">' + esc(def.sub || '') + '</div></div><div class="chip">' + qpct + '% complete</div></div><div class="wgrid">';
    wks.forEach(wk => {
      const p = weekProg(wk), pct = p.total ? p.done/p.total*100 : 0, full = pct >= 100;
      h += '<button class="wcell ' + (wk.ms ? 'ms' : '') + ' ' + (wk.w === store.currentWeek ? 'cur' : '') + ' ' + (full ? 'full' : '') + '" data-w="' + wk.w + '">'
        + '<div class="wn">Week ' + String(pos[wk.w]).padStart(2,'0') + (wk._added ? ' +' : '') + '</div>'
        + '<div class="wf">' + esc(wk.focus.length > 72 ? wk.focus.slice(0,70) + '…' : wk.focus) + '</div>'
        + '<div class="wbar"><div style="width:' + pct + '%"></div></div></button>';
    });
    h += '</div></div>';
  });
  $('content').innerHTML = h;
  $('content').querySelectorAll('.wcell').forEach(c => c.onclick = () => {
    store.currentWeek = +c.dataset.w; curState().meta.lastWeek = store.currentWeek;
    dbSaveState(); store.nav.switchTab('week');
  });
}

/* ============================================================ */
/* ---------- LADDERS ----------------------------------------- */
/* ============================================================ */
export function renderLadders(){
  let h = '<div class="section-title" style="margin-bottom:6px">Craft <em>Ladders</em></div>'
    + '<div class="muted" style="margin-bottom:20px;max-width:640px">Skills you climb continuously alongside the weekly plan. Master one rung at a time, at the edge of your ability. Tick a rung only when you can do it reliably - these count toward your progress.</div>'
    + '<div class="grid2">';
  ladders().forEach(l => { h += ladderFullHTML(l); });
  h += '</div>';
  $('content').innerHTML = h; wireChecks();
}

/* ============================================================ */
/* ---------- DRILLS ------------------------------------------ */
/* ============================================================ */
export function renderDrills(){
  let h = '<div class="section-title" style="margin-bottom:6px">The <em>Drill Library</em></div>'
    + '<div class="muted" style="margin-bottom:20px;max-width:640px">One sub-skill per session, at the edge of your ability. Copy a master, then originate. Pull from these to fill each days block.</div><div class="grid2">';
  curDef().drills.forEach(grp => {
    h += '<div class="panel card drill-grp"><h3>' + esc(grp.g) + '</h3>';
    grp.items.forEach(it => { h += '<div class="drill"><b>' + esc(it[0]) + '</b><p>' + esc(it[1]) + '</p></div>'; });
    h += '</div>';
  });
  h += '</div>';
  $('content').innerHTML = h;
}

/* ============================================================ */
/* ---------- RESOURCES --------------------------------------- */
/* ============================================================ */
export function renderRes(){
  let h = '<div class="section-title" style="margin-bottom:6px">All <em>resources</em>, links & guides</div>'
    + '<div class="muted" style="margin-bottom:20px;max-width:640px">Courses are mapped to specific weeks in <b style="color:var(--cream)">This Week</b>. Everything else lives here.</div><div class="grid2">';
  curDef().resources.forEach(grp => {
    h += '<div class="panel card"><h3>' + esc(grp.g) + '</h3>';
    grp.items.forEach(r => { h += '<div class="res-item">' + resourceLinksHTML(r.u, r.l) + '</div>'; });
    h += '</div>';
  });
  h += '</div>';
  $('content').innerHTML = h;
}

/* ============================================================ */
/* ---------- LOG / RENDER CATALOGUE -------------------------- */
/* ============================================================ */
let logPrefillWeek = null, pendingThumb = null, pendingKind = null, pendingName = null;

function thumbFromImage(file, max = 480, q = .62){
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let w = img.width, h = img.height;
      const s = Math.min(1, max / Math.max(w, h));
      w = Math.round(w*s); h = Math.round(h*s);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(); };
    img.src = url;
  });
}
function thumbFromVideo(file, max = 480, q = .62){
  return new Promise((res, rej) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    v.muted = true; v.preload = 'metadata'; v.src = url;
    let done = false;
    const grab = () => {
      if(done) return; done = true;
      try{
        let w = v.videoWidth, h = v.videoHeight;
        const s = Math.min(1, max / Math.max(w, h));
        w = Math.round(w*s); h = Math.round(h*s);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d').drawImage(v, 0, 0, w, h);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', q));
      }catch(e){ URL.revokeObjectURL(url); rej(); }
    };
    v.onloadeddata = () => { try{ v.currentTime = Math.min(1, (v.duration || 2) / 2); }catch(e){ grab(); } };
    v.onseeked = grab;
    v.onerror = () => { URL.revokeObjectURL(url); rej(); };
    setTimeout(grab, 2500);
  });
}
async function handleFile(file){
  pendingThumb = null; pendingKind = null; pendingName = file.name;
  const fn = $('fname'); if(fn) fn.textContent = 'processing...';
  try{
    if(file.type.startsWith('image/')){ pendingThumb = await thumbFromImage(file); pendingKind = 'image'; }
    else if(file.type.startsWith('video/')){ pendingThumb = await thumbFromVideo(file); pendingKind = 'video'; }
    else pendingKind = 'file';
  }catch(e){
    pendingKind = file.type.startsWith('video/') ? 'video' : 'file';
  }
  if(fn) fn.textContent = file.name + (pendingThumb ? ' · thumbnail ready ✓' : ' · saved as note');
}

export function renderLog(){
  const def = logPrefillWeek || store.currentWeek; logPrefillWeek = null;
  const maxWk = isUserPath(store.state.current)
    ? Math.max(1, (curUser().weeks || []).length)
    : Math.max(1, effPlan().length);
  let h = '<div class="section-title" style="margin-bottom:6px">Render <em>Log</em> & progress catalogue</div>'
    + '<div class="muted" style="margin-bottom:18px;max-width:660px">Document what you ship. Upload an image or video and a thumbnail snapshot is saved + ' + (cloudActive() ? 'synced to your account' : 'kept in this browser') + '. For the full-res file, paste a link (Drive / Vercel / YouTube).</div>'
    + '<div class="panel card"><div class="log-form">'
    + '<div class="field"><label>Week</label><input type="number" id="lWeek" min="1" max="' + maxWk + '" value="' + def + '"/></div>'
    + '<div class="field"><label>Title of the piece</label><input type="text" id="lTitle" placeholder="e.g. Week 06 - One-frame lighting study"/></div>'
    + '<div class="field" style="grid-column:1 / -1"><label>What I learned / notes</label><textarea id="lNote" placeholder="The technique, what broke, the breakthrough..."></textarea></div>'
    + '<div class="field" style="grid-column:1 / -1"><label>Upload render (image / video) - optional</label><div class="filebox"><span class="btn filebtn">Choose file<input type="file" id="lFile" accept="image/*,video/*"/></span><span class="fname" id="fname">no file chosen</span></div></div>'
    + '<div class="field" style="grid-column:1 / -1"><label>...or link to the full render - optional</label><input type="text" id="lLink" placeholder="https://...  (Drive, Vercel, YouTube)"/></div>'
    + '<div class="field" style="grid-column:1 / -1"><button class="btn gold" id="lAdd">＋ Add to catalogue</button></div>'
    + '</div></div><div id="gallery"></div>';
  $('content').innerHTML = h;
  $('lFile').addEventListener('change', e => { if(e.target.files[0]) handleFile(e.target.files[0]); });
  $('lAdd').onclick = addEntry; renderGallery();
}

function skillRenders(){ return store.catalogue.filter(e => (e.skill || 'cinematic') === store.state.current); }

function renderGallery(){
  const g = $('gallery'); if(!g) return;
  const items = skillRenders();
  if(!items.length){
    g.innerHTML = '<div class="empty"><div class="big">🎞️</div>No renders logged yet for this path. Ship something this week and add it here.</div>';
    return;
  }
  const sorted = [...items].sort((a, b) => (b.date || 0) - (a.date || 0));
  let h = '<div class="gallery">';
  sorted.forEach(en => {
    const thumb = en.thumb ? ('style="background-image:url(\'' + en.thumb + '\')"') : '';
    const icon = en.kind === 'video' ? '🎬' : en.kind === 'link' ? '🔗' : en.kind === 'file' ? '📄' : '🖼️';
    const d = en.date ? new Date(en.date) : null;
    const ds = d ? d.toLocaleDateString(undefined, { month:'short', day:'numeric' }) : '';
    h += '<div class="logcard"><div class="thumb" ' + thumb + '>' + (en.thumb ? '' : icon) + '<span class="kind">' + esc(en.kind || 'note') + '</span></div>'
      + '<div class="lc-body"><div class="lc-top"><span class="lc-wk">Week ' + esc(en.week || '-') + '</span><span class="lc-date">' + esc(ds) + '</span></div>'
      + '<h4>' + esc(en.title || 'Untitled') + '</h4><p>' + esc(en.learned || '') + '</p>'
      + '<div class="lc-foot">' + (en.url ? externalLinkHTML(en.url, 'open render', { className:'ext' }) : '<span></span>') + '<button class="del" data-id="' + esc(en.id) + '">delete</button></div></div></div>';
  });
  h += '</div>';
  g.innerHTML = h;
  g.querySelectorAll('.del').forEach(b => b.onclick = () => delEntry(b.dataset.id));
}

async function addEntry(){
  const week    = $('lWeek').value,
        title   = $('lTitle').value.trim(),
        learned = $('lNote').value.trim(),
        url     = $('lLink').value.trim();
  if(!title && !url && !pendingThumb && !learned) return;
  const id = 'e' + Date.now() + Math.floor(Math.random()*999);
  let kind = pendingKind; if(!kind && url) kind = 'link';
  const entry = {
    id, skill: store.state.current, week, title, learned,
    url: safeExternalUrl(url), kind: kind || 'note',
    thumb: pendingThumb || null, name: pendingName || null,
    date: Date.now(),
  };
  store.catalogue.push(entry);
  await dbSaveRender(entry);
  flash(); updateLogDot();
  pendingThumb = null; pendingKind = null; pendingName = null;
  $('lTitle').value = ''; $('lNote').value = ''; $('lLink').value = '';
  const fn = $('fname'); if(fn) fn.textContent = 'no file chosen';
  const lf = $('lFile'); if(lf) lf.value = '';
  renderGallery();
}

async function delEntry(id){
  const snap = store.catalogue.find(e => e.id === id);
  if(!snap) return;
  const copy = JSON.parse(JSON.stringify(snap));
  store.catalogue = store.catalogue.filter(e => e.id !== id);
  await dbDelRender(id);
  flash(); updateLogDot(); renderGallery();
  undoToast('Render removed', async () => {
    store.catalogue.push(copy);
    try{ await dbSaveRender(copy); }catch(e){}
    updateLogDot(); renderGallery();
  });
}

export function updateLogDot(){
  const dd = $('logDot'); if(!dd) return;
  dd.textContent = (store.state.current && skillRenders().length)
    ? ('(' + skillRenders().length + ')')
    : '';
}

/* ============================================================ */
/* ---------- START DATE SUGGEST ------------------------------ */
/* ============================================================ */
export function refreshSuggest(){
  const el = $('suggest'), di = $('startDate'); if(!el || !di) return;
  const m = curState() ? curState().meta : null;
  if(m && m.startDate){
    di.value = m.startDate;
    const cw = currentWeekFromStart();
    const ep = effPlan();
    const pos = (ep.findIndex(x => x.w === cw) + 1) || 1;
    el.innerHTML = '→ Week <b style="color:var(--gold)">' + pos + '</b>';
  } else {
    di.value = ''; el.textContent = '';
  }
}
