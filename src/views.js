// ── views.js ──────────────────────────────────────────────────────────────
// All view renderers (catalog, today, week, plan, map, ladders, drills,
// resources, log) and their event wiring. View-internal navigation
// (goCatalog, goWeek, openSkill) lives here too. Tab switching itself sits
// in main.js and is reached via store.nav.switchTab().

import { SKILLS } from './data.js';
import { TEMPLATES } from './templates.js';
import { store, STATE_KEY } from './store.js';
import { $, esc, flash, undoToast } from './helpers.js';
import {
  dbSaveState, dbSaveRender, dbDelRender, dbCreatePlatformPath, dbLoadPlatformPath,
  dbRequestAccess, dbLoadMyAccessRequest, dbSavePlatformPath,
  dbEnsureEnrollment, dbReconcileEnrollment, dbSaveEnrollment, dbSaveDayLog,
  dbStartEnrollment, enrollmentIdFor, makeDayLog, makeEnrollment,
  createEvidenceSubmission, listEvidenceSubmissions, uploadEvidenceFile,
  ACCEPTED_EVIDENCE_TYPES,
} from './db.js';
import {
  ensureSkill, curState, curDef, P, quarters, days, ladders,
  weekEdits, effPlan, setWeekFocus, weekResArr, addCineWeek, removeCineWeek,
  isUserPath, curUser, pathTitle, pathGoal, canEditUserPath,
  weekObj, dayLabel, weekProg, ladderCount, totalsFor, allTotals,
  nextRungIdx, currentWeekFromStart, computeStreak,
} from './plan.js';
import { openAuthModal } from './auth.js';
import { authFetch } from './api.js';
import { applyHeader, updateOverall } from './header.js';
import { configPresent, cloudActive, cloudAvailable, cloudConnectionError, cloudFailureMessage } from './db.js';
import { cachedAuthLabel } from './auth.js';
import { canManageMembers, canPreviewPath, canRequestAccess, canViewPath, resolveCreatorName } from './platform.js';
import {
  AI_CADENCE_TYPES, AI_PATH_TYPES, AI_PROGRESSION_CURVES, AI_TASK_MODES,
  MAX_AI_CLARIFICATION_ROUNDS, assumptionsForFinalClarification,
  aiBriefDefaults, aiPromptDefaults, briefFromPrompt, confirmBrief, emptyCoreCommitment,
  canStartAIRequest, isMeaningfulAIGoal, normalizeCoreCommitment,
  normalizeCoreCommitments, normalizeBriefAssumptions, normalizeClarifyingQuestions,
  normalizeConfirmedBrief, recoverAIBuilderState, routeInterpretedBrief,
  unacceptedMaterialAssumptions,
} from './ai-builder-model.js';
import {
  canCompleteDay, canOpenDay, dateForJourneyDay, getDayStatus,
  formatProgressiveTaskTitle, getMaxRoadmapDay, getTasksForDay, journeyDayForDate,
  localDateString, normalizeDurationDays,
} from './journey.js';
import {
  AI_SAVE_TIMEOUT_MS, ENROLLMENT_TIMEOUT_MS, PATH_OPEN_TIMEOUT_MS,
  enrollmentStartErrorMessage, isTemporaryFirebaseError, trackOperation, userSyncMessage, withTimeout,
} from './sync.js';

/* ---- debounced save (formerly the file-level noteTimer pattern) ---- */
let _noteTimer = null;
let selectedJourneyDay = null;
let evidenceFormTaskId = null;
let evidenceProofType = 'url';
let evidenceBusy = false;
let evidenceError = '';
let aiBuilder = null;
let voiceDurationTimer = null;
let discardVoiceOnStop = false;
let isCreatingPath = false;
let openingPathId = null;
let startingJourneyId = null;
let aiSaveClientId = null;
const AI_INTERPRET_TIMEOUT_MS = 30000;
const AI_GENERATE_TIMEOUT_MS = 60000;
const VOICE_TRANSCRIBE_TIMEOUT_MS = 50000;

function abortAIRequest(kind = null){
  const controllers = aiBuilder?.requestControllers || {};
  Object.entries(controllers).forEach(([key, controller]) => {
    if(!kind || key === kind) controller?.abort();
  });
  if(aiBuilder?.requestControllers){
    if(kind) delete aiBuilder.requestControllers[kind];
    else aiBuilder.requestControllers = {};
  }
}

async function authenticatedAIRequest(kind, url, options, timeoutMs){
  abortAIRequest(kind);
  const controller = new AbortController();
  aiBuilder.requestControllers[kind] = controller;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try{
    return await authFetch(url, { ...options, signal:controller.signal });
  }catch(error){
    if(timedOut){
      const timeoutError = new Error('The request took too long and was cancelled.');
      timeoutError.code = 'provider_timeout';
      throw timeoutError;
    }
    throw error;
  }finally{
    clearTimeout(timer);
    if(aiBuilder?.requestControllers?.[kind] === controller) delete aiBuilder.requestControllers[kind];
  }
}

function scheduleSave(ms = 650){
  clearTimeout(_noteTimer);
  _noteTimer = setTimeout(saveCurrentPath, ms);
}

function setRoute(hash){
  try{ localStorage.setItem('lpt_last_route', hash); }catch(e){}
  if(location.hash !== hash) history.replaceState(null, '', hash);
}

function pathHash(id, tab = store.activeTab || 'plan', day = null){
  let hash = '#/path/' + encodeURIComponent(id) + '/' + encodeURIComponent(tab || 'plan');
  if(day != null) hash += '/roadmap/day/' + encodeURIComponent(day);
  return hash;
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

function upSave(){     saveCurrentPath(); }
function upSaveSoft(){ scheduleSave(); }
async function saveCurrentPath(){
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
export function renderCatalog(){
  let h = '<div class="cat-intro"><div class="section-title">Discover <em>Learning Paths</em></div>'
    + '<div class="muted" style="max-width:640px">Explore public journeys, keep your own private paths close, and turn local drafts into shareable learning paths when you are ready.</div></div>';
  h += syncStatusHTML();
  if(authRestoring()){
    h += '<div class="panel card restoring-state"><div class="chip">Restoring</div><h3>Restoring your session...</h3><p class="muted">Loading your workspace before showing account actions.</p></div>';
    $('content').innerHTML = h;
    applyHeader();
    return;
  }
  h += '<div class="cat-grid">';
  SKILLS.forEach(s => {
    const t = totalsFor(s.id); const pct = t.total ? Math.round(t.done/t.total*100) : 0;
    const started = !!(store.state.skills[s.id] && Object.keys(store.state.skills[s.id].progress || {}).length);
    h += '<button class="skill-card" data-id="' + esc(s.id) + '">'
      + '<div class="sc-top">' + esc(pathTitle(s.id)) + '</div>'
      + '<div class="sc-tag">' + esc(pathGoal(s.id)) + '</div>'
      + '<div class="sc-blurb">' + esc(s.blurb) + '</div>'
      + '<div class="sc-foot"><div class="progress-bar" style="flex:1"><div style="width:' + pct + '%"></div></div><span class="sc-pct">' + pct + '%</span></div>'
      + '<div class="sc-cta">' + (started ? 'Continue' : 'Start') + ' →</div></button>';
  });
  Object.keys(store.state.userPaths || {}).filter(id => shouldShowUserPath(id)).forEach(id => {
    const def = store.state.userPaths[id];
    const t = totalsFor(id); const pct = t.total ? Math.round(t.done/t.total*100) : 0;
    const goal = pathGoal(id);
    const badge = def.platform
      ? ('By ' + resolveCreatorName(def, store.currentUser))
      : (cloudActive() ? 'Local draft' : 'Your path');
    h += '<button class="skill-card" data-id="' + esc(id) + '">'
      + '<div class="sc-badge">' + esc(badge) + '</div>'
      + '<div class="sc-top">' + esc(pathTitle(id)) + '</div>'
      + (goal ? ('<div class="sc-tag">' + esc(goal) + '</div>') : '')
      + '<div class="sc-blurb">' + pathCardBlurb(def, t.total) + '</div>'
      + '<div class="sc-foot"><div class="progress-bar" style="flex:1"><div style="width:' + pct + '%"></div></div><span class="sc-pct">' + pct + '%</span></div>'
      + '<div class="sc-cta">Open →</div></button>';
    if(!def.platform && cloudActive()){
      h += '<button class="mini-import standalone" data-import="' + esc(id) + '">Publish/import "' + esc(pathTitle(id)) + '" to platform</button>';
    }
  });
  if(store.currentUser || !configPresent()){
    h += '<button class="skill-card create" id="createCard"><div class="sc-plus">＋</div>'
      + '<div class="sc-top">Create new path</div>'
      + '<div class="sc-blurb">Build a path you own, keep it private, publish it publicly, or share it by direct link.</div>'
      + '<div class="sc-cta">New path →</div></button>';
    h += '<button class="skill-card create ai-create" id="aiCreateCard"><div class="sc-plus">AI</div>'
      + '<div class="sc-top">Build path with AI</div>'
      + '<div class="sc-blurb">Describe a goal, review the generated draft, edit it, then save it as a private path.</div>'
      + '<div class="sc-cta">Generate a path</div></button>';
  } else if(configPresent()){
    h += '<button class="skill-card create" id="signinCard"><div class="sc-plus">＋</div>'
      + '<div class="sc-top">Build your own path</div>'
      + '<div class="sc-blurb">Sign in to create and track your own learning paths, synced across your devices.</div>'
      + '<div class="sc-cta">Sign in to start →</div></button>';
  }
  h += '</div>';
  $('content').innerHTML = h;
  $('content').querySelectorAll('.skill-card[data-id]').forEach(c => c.onclick = () => {
    if(openingPathId === c.dataset.id) return;
    openingPathId = c.dataset.id;
    c.disabled = true;
    c.classList.add('is-opening');
    const cta = c.querySelector('.sc-cta');
    if(cta) cta.textContent = 'Opening...';
    openSkill(c.dataset.id);
  });
  $('content').querySelectorAll('[data-import]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    importLocalPath(b.dataset.import);
  });
  const cc = $('createCard'); if(cc) cc.onclick = createPath;
  const ai = $('aiCreateCard'); if(ai) ai.onclick = openAIPathBuilder;
  const sc = $('signinCard'); if(sc) sc.onclick = () => openAuthModal('signup');
}

function shouldShowUserPath(id){
  const def = store.state.userPaths[id];
  if(!def) return false;
  if(!def.platform) return true;
  if(def.ownerId === (store.currentUser && store.currentUser.uid)) return true;
  return def.visibility === 'public' && def.discoverable !== false;
}

function pathCardBlurb(def, total){
  const bits = [];
  if(def.category) bits.push(esc(def.category));
  if(def.durationLabel) bits.push(esc(def.durationLabel));
  if(def.visibility) bits.push(esc(def.visibility));
  const meta = bits.length ? bits.join(' · ') + '. ' : '';
  const taskCount = total || Number(def.taskCount || 0);
  const sectionCount = (def.weeks || []).length || Number(def.sectionCount || 0);
  if(def.platform && !pathTasksReady(def) && !taskCount && !sectionCount) return meta + 'Open to load sections and tasks.';
  if(def.platform && !pathTasksReady(def) && !taskCount && sectionCount) return meta + sectionCount + ' sections. Open to load task details.';
  return meta + (taskCount ? (taskCount + ' tasks across ' + sectionCount + ' sections') : 'Empty path. Open it to add sections, tasks, and resources.');
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


function makeVoiceState(prev = {}){
  const supported = typeof MediaRecorder !== 'undefined'
    && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  return {
    supported,
    recording:false,
    mediaRecorder:null,
    stream:null,
    chunks:[],
    blob:null,
    audioUrl:'',
    duration:0,
    startedAt:null,
    transcript:prev.transcript || '',
    loading:false,
    error:'',
    mimeType:prev.mimeType || '',
  };
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
      resourceUrl:t.resourceUrl || null,
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
    intensity:['light', 'moderate', 'intense'].includes(raw.intensity) ? raw.intensity : prompt.intensity,
    previewTitle:String(raw.previewTitle || raw.title || titleFromGoal(prompt.goal)).slice(0, 100),
    previewDescription:String(raw.previewDescription || raw.description || prompt.goal || '').slice(0, 500),
    visibility:['private', 'unlisted', 'public'].includes(raw.visibility || prompt.visibility) ? (raw.visibility || prompt.visibility) : 'private',
    sections:sections.sort((a, b) => a.order - b.order),
    tasks:tasks.sort((a, b) => a.order - b.order),
    resources:(Array.isArray(raw.resources) ? raw.resources : []).slice(0, 12).map((r, i) => ({
      title:String(r.title || ('Resource ' + (i + 1))).slice(0, 100),
      url:r.url ? String(r.url).slice(0, 300) : '',
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
    intensity:prompt.intensity,
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
    creatorName:store.currentUser ? (store.currentUser.displayName || (store.currentUser.email || '').split('@')[0]) : '',
    creatorId:store.currentUser?.uid || '',
    creatorEmail:store.currentUser?.email || '',
    coreCommitments:normalizeCoreCommitments(draft.coreCommitments),
    aiBrief:draft.confirmedBrief || null,
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
  overlay.className = 'modal-overlay';
  document.body.appendChild(overlay);
  aiBuilder = {
    overlay,
    mode:'prompt',
    phase:'input',
    prompt: aiBuilder?.prompt || aiPromptDefaults(),
    draft: aiBuilder?.draft || null,
    loading:false,
    clarifyLoading:false,
    error:'',
    message:'',
    brief: aiBuilder?.brief || null,
    clarifyingAnswers: aiBuilder?.clarifyingAnswers || {},
    clarificationRound:0,
    requestToken:0,
    requestControllers:{},
    voice: makeVoiceState(aiBuilder?.voice || {}),
    saving:false,
    dirty:false,
  };
  overlay.addEventListener('click', e => { if(e.target === overlay && !aiBuilder?.saving) closeAIBuilder(); });
  renderAIBuilder();
}

function closeAIBuilder(){
  abortAIRequest();
  cleanupVoiceRecording();
  if(aiBuilder?.overlay) aiBuilder.overlay.remove();
  aiBuilder = null;
}

function collectAIPrompt(){
  aiBuilder.prompt = {
    goal:($('aiGoal')?.value || '').trim(),
    durationDays:$('aiDuration')?.value ? clampDay($('aiDuration').value, 30, 365) : null,
    deadline:($('aiDeadline')?.value || '').trim(),
    currentLevel:$('aiLevel')?.value || '',
    currentStage:($('aiCurrentStage')?.value || '').trim(),
    desiredEndState:($('aiDesiredEndState')?.value || '').trim(),
    baseline:($('aiBaseline')?.value || '').trim(),
    targetOutcome:($('aiTargetOutcome')?.value || '').trim(),
    constraints:($('aiConstraints')?.value || '').trim(),
    preferredSchedule:($('aiPreferredSchedule')?.value || '').trim(),
    existingResources:($('aiExistingResources')?.value || '').trim(),
    intensity:$('aiIntensity')?.value || '',
    pathType:$('aiType')?.value || 'auto',
    resourceLinks:($('aiResources')?.value || '').trim(),
    dailyTime:($('aiDailyTime')?.value || '').trim(),
    evidenceStyle:($('aiEvidenceStyle')?.value || '').trim(),
    includeTasks:($('aiInclude')?.value || '').trim(),
    excludeTasks:($('aiExclude')?.value || '').trim(),
    visibility:$('aiVisibility')?.value || 'private',
    description:($('aiDescription')?.value || '').trim(),
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

function aiInterpretationError(error){
  if(error?.code === 'unauthorized') return 'Your session has expired. Sign in again to continue.';
  if(error?.code === 'rate_limited') return 'You have reached the current AI usage limit. Your brief is saved. Try again later.';
  if(['operation_timeout', 'provider_timeout'].includes(error?.code)) return 'The AI request took too long and was cancelled. Your information is still saved.';
  if(['invalid_goal_brief', 'invalid_ai_json', 'missing_tool_use', 'empty_ai_response', 'invalid_provider_response'].includes(error?.code)){
    return 'The AI returned an incomplete goal brief. Please retry.';
  }
  if(error?.code === 'provider_unavailable') return 'The AI service is temporarily unavailable. Try again, or use Basic starter.';
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return 'Build with AI requires a connection. Your goal is still saved, and Basic starter remains available.';
  if(error instanceof TypeError) return 'Build with AI requires a connection. Your goal is still saved, and Basic starter remains available.';
  return error?.message || 'We could not understand your goal. Your answers are still saved. Try again.';
}

async function parseAIResponse(response, code, message){
  try{
    return await response.json();
  }catch(error){
    const invalid = new Error(message);
    invalid.code = code;
    throw invalid;
  }
}

function cleanupVoiceRecording(clearTranscript = false){
  if(voiceDurationTimer){
    clearInterval(voiceDurationTimer);
    voiceDurationTimer = null;
  }
  const voice = aiBuilder?.voice;
  if(!voice) return;
  if(voice.mediaRecorder && voice.recording){
    discardVoiceOnStop = true;
    try{ voice.mediaRecorder.stop(); }catch(e){}
  }
  if(voice.stream){
    try{ voice.stream.getTracks().forEach(track => track.stop()); }catch(e){}
  }
  if(voice.audioUrl){
    try{ URL.revokeObjectURL(voice.audioUrl); }catch(e){}
  }
  aiBuilder.voice = {
    ...makeVoiceState({ transcript: clearTranscript ? '' : voice.transcript }),
    supported: voice.supported,
  };
}

function supportedRecordingMimeType(){
  if(typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function updateVoiceDurationLabel(){
  if(!aiBuilder?.voice?.recording || !aiBuilder.voice.startedAt) return;
  aiBuilder.voice.duration = Math.max(0, Math.round((Date.now() - aiBuilder.voice.startedAt) / 1000));
  const el = $('voiceDuration');
  if(el) el.textContent = formatSeconds(aiBuilder.voice.duration);
}

function formatSeconds(value){
  const seconds = Math.max(0, Number(value || 0));
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return m + ':' + s;
}

async function startVoiceRecording(){
  const voice = aiBuilder.voice;
  if(!voice.supported){
    voice.error = 'Voice recording is not supported in this browser yet. You can still type or paste your goal.';
    renderAIBuilder();
    return;
  }
  cleanupVoiceRecording(false);
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const mimeType = supportedRecordingMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    discardVoiceOnStop = false;
    recorder.ondataavailable = e => {
      if(e.data && e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if(!aiBuilder?.voice) return;
      if(discardVoiceOnStop){
        discardVoiceOnStop = false;
        return;
      }
      if(voiceDurationTimer){
        clearInterval(voiceDurationTimer);
        voiceDurationTimer = null;
      }
      stream.getTracks().forEach(track => track.stop());
      const blobType = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type:blobType });
      const previousUrl = aiBuilder.voice.audioUrl;
      if(previousUrl) try{ URL.revokeObjectURL(previousUrl); }catch(e){}
      aiBuilder.voice = {
        ...aiBuilder.voice,
        recording:false,
        mediaRecorder:null,
        stream:null,
        chunks:[],
        blob,
        audioUrl:URL.createObjectURL(blob),
        mimeType:blobType,
        duration:aiBuilder.voice.duration || Math.max(1, Math.round((Date.now() - aiBuilder.voice.startedAt) / 1000)),
      };
      renderAIBuilder();
    };
    aiBuilder.voice = {
      ...voice,
      recording:true,
      mediaRecorder:recorder,
      stream,
      chunks,
      blob:null,
      audioUrl:'',
      duration:0,
      startedAt:Date.now(),
      error:'',
      loading:false,
      mimeType:mimeType || '',
    };
    recorder.start();
    voiceDurationTimer = setInterval(updateVoiceDurationLabel, 1000);
    renderAIBuilder();
  }catch(e){
    aiBuilder.voice.error = 'Could not start voice recording. You can still type your goal manually.';
    renderAIBuilder();
  }
}

function stopVoiceRecording(){
  const voice = aiBuilder.voice;
  if(!voice?.mediaRecorder || !voice.recording) return;
  try{ voice.mediaRecorder.stop(); }
  catch(e){
    voice.error = 'Could not stop recording. Try clearing the recording.';
    renderAIBuilder();
  }
}

function clearVoiceRecording(){
  cleanupVoiceRecording(false);
  renderAIBuilder();
}

async function transcribeVoiceRecording(){
  const voice = aiBuilder.voice;
  if(voice?.loading) return;
  if(!voice?.blob){
    voice.error = 'Record a voice idea before transcribing.';
    renderAIBuilder();
    return;
  }
  voice.loading = true;
  voice.error = '';
  const requestToken = ++aiBuilder.requestToken;
  renderAIBuilder();
  try{
    const res = await authenticatedAIRequest('voice', '/api/transcribe-voice', {
      method:'POST',
      headers:{
        'Content-Type':voice.blob.type || voice.mimeType || 'audio/webm',
        'X-File-Name':'voice-recording',
      },
      body:voice.blob,
    }, VOICE_TRANSCRIBE_TIMEOUT_MS);
    const payload = await res.json();
    if(!res.ok || !payload.ok){
      const err = new Error(payload.message || 'Voice transcription failed.');
      err.code = payload.error || payload.code || '';
      throw err;
    }
    if(!aiBuilder || requestToken !== aiBuilder.requestToken) return;
    aiBuilder.voice.transcript = payload.transcript || '';
    aiBuilder.voice.error = '';
  }catch(e){
    if(aiBuilder && requestToken === aiBuilder.requestToken) aiBuilder.voice.error = voiceErrorCopy(e.code, e.message);
  }finally{
    if(aiBuilder && requestToken === aiBuilder.requestToken){
      aiBuilder.voice.loading = false;
      renderAIBuilder();
    }
  }
}

function voiceErrorCopy(code, fallback){
  if(code === 'unauthorized') return 'Your session has expired. Sign in again to transcribe this recording.';
  if(code === 'rate_limited') return 'You have reached the current transcription limit. Try again later.';
  if(code === 'provider_timeout') return 'Voice transcription took too long and was cancelled. Your recording is still available.';
  if(code === 'provider_unavailable') return 'Voice transcription is temporarily unavailable. You can still type your goal manually.';
  if(code === 'invalid_request') return fallback || 'This recording could not be accepted. Try recording again.';
  if(code === 'payload_too_large') return 'This recording is larger than the 25 MB upload limit.';
  if(code === 'invalid_provider_response') return fallback || 'We could not detect speech clearly. Try recording again or type your goal manually.';
  return fallback || 'Voice transcription failed. You can still type your goal manually.';
}

function useTranscriptAsGoalInput(){
  const transcript = (aiBuilder.voice?.transcript || '').trim();
  if(!transcript) return;
  aiBuilder.prompt.goal = transcript;
  const goal = $('aiGoal');
  if(goal) goal.value = transcript;
  aiBuilder.error = '';
  aiBuilder.message = 'Transcript added as rough goal input. Edit it, then choose Build with AI.';
  renderAIBuilder();
}

function voiceMemoHTML(){
  const voice = aiBuilder.voice || makeVoiceState();
  return '<div class="ai-voice-box">'
    + '<div class="ai-voice-copy"><b>Say it naturally.</b><span>You do not need a perfect prompt. The app will help turn your thoughts into a structured goal brief.</span></div>'
    + '<div class="hint">Audio is only used to create your transcript in this version. Raw audio is not permanently saved by the app.</div>'
    + (!voice.supported ? '<div class="form-error">Voice recording is not supported in this browser yet. You can still type or paste your goal.</div>' : '')
    + (voice.error ? '<div class="form-error">' + esc(voice.error) + '</div>' : '')
    + '<div class="ai-voice-actions">'
    + '<button class="btn gold voice-primary" id="aiRecordVoice" ' + (!voice.supported || voice.recording ? 'disabled' : '') + '>Record voice idea</button>'
    + '<button class="btn voice-primary" id="aiStopVoice" ' + (voice.recording ? '' : 'disabled') + '>Stop recording</button>'
    + '<span class="voice-duration" id="voiceDuration">' + esc(formatSeconds(voice.duration)) + '</span>'
    + '</div>'
    + (voice.audioUrl ? '<audio id="aiAudioPreview" src="' + esc(voice.audioUrl) + '" controls></audio>' : '')
    + '<div class="ai-voice-actions">'
    + '<button class="btn" id="aiPlayVoice" ' + (voice.audioUrl ? '' : 'disabled') + '>Play recording</button>'
    + '<button class="btn" id="aiClearVoice" ' + (voice.audioUrl || voice.recording ? '' : 'disabled') + '>Clear recording</button>'
    + '<button class="btn" id="aiTranscribeVoice" ' + (voice.audioUrl && !voice.loading ? '' : 'disabled') + '>' + (voice.loading ? 'Transcribing...' : 'Transcribe voice') + '</button>'
    + '</div>'
    + '<div class="field"><label>Transcript</label><textarea id="aiVoiceTranscript" placeholder="Your transcript will appear here after transcription. You can edit it before using it.">' + esc(voice.transcript || '') + '</textarea></div>'
    + '<button class="btn" id="aiUseTranscript" ' + ((voice.transcript || '').trim() ? '' : 'disabled') + '>Use transcript as goal input</button>'
    + '</div>';
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
    + '<div class="field"><label for="' + prefix + '-cadence">Cadence</label><select id="' + prefix + '-cadence" name="' + prefix + '-cadence" class="ai-commitment-field" data-scope="' + scope + '" data-i="' + index + '" data-key="cadenceType">' + selectOptions(AI_CADENCE_TYPES, c.cadence.type) + '</select></div>'
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

function aiInputFieldsHTML(){
  const p = aiBuilder.prompt;
  return '<div class="field"><label for="aiGoal">Goal</label><textarea id="aiGoal" name="aiGoal" placeholder="I want to learn video editing in 90 days">' + esc(p.goal) + '</textarea></div>'
    + voiceMemoHTML()
    + '<div class="ai-grid">'
    + '<div class="field"><label for="aiDuration">Duration in days</label><input type="number" id="aiDuration" name="aiDuration" min="1" max="365" value="' + esc(p.durationDays == null ? '' : p.durationDays) + '" placeholder="Let AI recommend"/></div>'
    + '<div class="field"><label for="aiDeadline">Optional deadline</label><input type="date" id="aiDeadline" name="aiDeadline" value="' + esc(p.deadline || '') + '"/></div>'
    + '<div class="field"><label>Current level</label><select id="aiLevel"><option value="">Let AI determine</option>' + selectOptions(['beginner', 'intermediate', 'advanced'], p.currentLevel) + '</select></div>'
    + '<div class="field"><label>Intensity</label><select id="aiIntensity"><option value="">Let AI determine</option>' + selectOptions(['light', 'moderate', 'intense'], p.intensity) + '</select></div>'
    + '<div class="field"><label for="aiType">Path type</label><select id="aiType" name="aiType">' + selectOptions(AI_PATH_TYPES, p.pathType) + '</select></div>'
    + '</div>'
    + '<div class="field"><label>Current ability / stage</label><textarea id="aiCurrentStage" placeholder="Where are you starting from?">' + esc(p.currentStage) + '</textarea></div>'
    + '<div class="field"><label>Desired end state</label><textarea id="aiDesiredEndState" placeholder="What should you be able to do by the end?">' + esc(p.desiredEndState) + '</textarea></div>'
    + '<div class="ai-grid">'
    + '<div class="field"><label>Current baseline</label><input type="text" id="aiBaseline" value="' + esc(p.baseline) + '" placeholder="Run 1km, A1 French, beginner Blender..."/></div>'
    + '<div class="field"><label>Target outcome</label><input type="text" id="aiTargetOutcome" value="' + esc(p.targetOutcome) + '" placeholder="Run 15km, 10-minute conversation..."/></div>'
    + '</div>'
    + '<div class="field"><label>Constraints / limitations</label><textarea id="aiConstraints" placeholder="Time, equipment, injury limits, days off, budget...">' + esc(p.constraints) + '</textarea></div>'
    + '<div class="field"><label for="aiPreferredSchedule">Preferred schedule</label><textarea id="aiPreferredSchedule" name="aiPreferredSchedule" placeholder="Weekdays only, weekends free, Tuesday and Thursday evenings...">' + esc(p.preferredSchedule || '') + '</textarea></div>'
    + '<div class="ai-nn-wrap"><div class="ai-review-head"><b>Core commitments</b></div><p class="hint">The AI will suggest the essential commitments after understanding your goal. You will be able to edit them before generating your path.</p>' + commitmentsHTML(p.coreCommitments, 'prompt') + '</div>'
    + '<div class="ai-grid">'
    + '<div class="field"><label>Daily time available</label><input type="text" id="aiDailyTime" value="' + esc(p.dailyTime) + '" placeholder="30 minutes, 2 hours..."/></div>'
    + '<div class="field"><label>Default visibility</label><select id="aiVisibility">' + selectOptions(['private', 'unlisted', 'public'], p.visibility) + '</select></div>'
    + '</div>'
    + '<div class="field"><label>Preferred proof/evidence style</label><input type="text" id="aiEvidenceStyle" value="' + esc(p.evidenceStyle) + '" placeholder="URL posts, screenshots, photos, final files..."/></div>'
    + '<div class="field"><label>Existing resource links</label><textarea id="aiResources" placeholder="Paste links, one or many">' + esc(p.resourceLinks) + '</textarea></div>'
    + '<div class="field"><label>Resources or courses you want to follow</label><textarea id="aiExistingResources" placeholder="Names, links, books, courses, channels...">' + esc(p.existingResources) + '</textarea></div>'
    + '<div class="field"><label>Tasks to include</label><textarea id="aiInclude" placeholder="Tasks you already know you want">' + esc(p.includeTasks) + '</textarea></div>'
    + '<div class="field"><label>Tasks to avoid</label><textarea id="aiExclude" placeholder="Anything you do not want included">' + esc(p.excludeTasks) + '</textarea></div>'
    + '<div class="field"><label>Path description</label><textarea id="aiDescription" placeholder="Optional public-facing description">' + esc(p.description) + '</textarea></div>';
}

function aiPromptHTML(){
  const phase = aiBuilder.phase || 'input';
  const showBrief = !!aiBuilder.brief && ['interpreting', 'clarifying', 'reviewing', 'generating'].includes(phase);
  const busy = ['interpreting', 'generating'].includes(phase) || aiBuilder.clarifyLoading || aiBuilder.loading;
  let actions = '<button class="btn" id="aiCancel" type="button">Cancel</button>';
  if(showBrief){
    actions += '<button class="btn" id="aiBackToInput" type="button" ' + (busy ? 'disabled' : '') + '>Back to original form</button>';
    if(phase === 'reviewing'){
      actions += '<button class="btn gold" id="aiGenerateRoadmap" type="button" ' + (busy ? 'disabled' : '') + '>Generate my roadmap</button>';
    } else if(phase === 'generating'){
      actions += '<button class="btn gold" type="button" disabled>Generating roadmap...</button>';
    } else if(phase === 'interpreting'){
      actions += '<button class="btn gold" type="button" disabled>Preparing your brief...</button>';
    }
  } else {
    const buildLabel = phase === 'interpreting' ? 'Understanding your goal...' : 'Build with AI';
    actions += '<button class="btn" id="aiBasic" type="button" ' + (busy ? 'disabled' : '') + '>Basic starter</button>'
      + '<button class="btn gold" id="aiBuild" type="button" ' + (busy ? 'disabled' : '') + '>' + buildLabel + '</button>';
  }
  return '<div class="modal-box ai-modal"><div class="modal-head"><h3>Build path with AI</h3><button class="modal-x" aria-label="Close">x</button></div>'
    + '<div class="modal-body">'
    + '<div class="ai-note">AI will review your goal, ask only the questions it needs, and prepare a personalised roadmap brief.</div>'
    + (aiBuilder.message ? '<div class="ai-note">' + esc(aiBuilder.message) + '</div>' : '')
    + (aiBuilder.error ? '<div class="form-error">' + esc(aiBuilder.error) + '</div>' : '')
    + (showBrief ? goalBriefHTML() : aiInputFieldsHTML())
    + '<div class="ai-actions">' + actions + '</div>'
    + '</div></div>';
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
    + '<div class="field"><label>Intensity</label><select class="ai-brief-field" data-key="intensity"><option value="">Unknown</option>' + selectOptions(['light', 'moderate', 'intense'], b.intensity) + '</select></div>'
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
    + (clarifying && q.length ? '<div class="ai-questions"><div class="ai-review-head"><b>A few details will make your path more accurate</b><button class="btn gold" id="aiApplyAnswers" type="button">Update my brief</button></div>'
      + q.map(question => '<div class="field"><label>' + esc(question.prompt) + '</label>'
        + (question.reason ? '<div class="hint">' + esc(question.reason) + '</div>' : '')
        + '<textarea class="ai-answer-field" data-question-id="' + esc(question.id) + '" placeholder="Your answer">' + esc(aiBuilder.clarifyingAnswers[question.id] || '') + '</textarea></div>').join('')
      + '</div>' : '')
    + '</div>';
}

function aiReviewHTML(){
  const d = aiBuilder.draft;
  const sectionOptions = d.sections.map(s => s.title);
  return '<div class="modal-box ai-modal review"><div class="modal-head"><h3>Review generated path</h3><button class="modal-x">x</button></div>'
    + '<div class="modal-body">'
    + (aiBuilder.message ? '<div class="ai-note">' + esc(aiBuilder.message) + '</div>' : '')
    + (aiBuilder.error ? '<div class="form-error">' + esc(aiBuilder.error) + '</div>' : '')
    + '<div class="ai-grid">'
    + '<div class="field"><label>Title</label><input type="text" class="ai-draft-field" data-key="title" value="' + esc(d.title) + '"/></div>'
    + '<div class="field"><label>Category</label><input type="text" class="ai-draft-field" data-key="category" value="' + esc(d.category) + '"/></div>'
    + '<div class="field"><label>Duration days</label><input type="number" class="ai-draft-field" data-key="durationDays" value="' + esc(d.durationDays) + '"/></div>'
    + '<div class="field"><label>Duration label</label><input type="text" class="ai-draft-field" data-key="durationLabel" value="' + esc(d.durationLabel) + '"/></div>'
    + '<div class="field"><label>Visibility</label><select class="ai-draft-field" data-key="visibility">' + selectOptions(['private', 'unlisted', 'public'], d.visibility || 'private') + '</select></div>'
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
    + '<div class="ai-actions"><button class="btn" id="aiEditPrompt" ' + (aiBuilder.saving ? 'disabled' : '') + '>Edit prompt</button><button class="btn" id="aiRegenerate" ' + (aiBuilder.saving ? 'disabled' : '') + '>Regenerate</button><button class="btn" id="aiCancel" ' + (aiBuilder.saving ? 'disabled' : '') + '>Cancel</button><button class="btn gold" id="aiSave" ' + (aiBuilder.saving ? 'disabled' : '') + '>' + (aiBuilder.saving ? 'Saving path...' : 'Save path') + '</button></div>'
    + '</div></div>';
}

function aiTaskRowHTML(t, i, sectionOptions){
  const prefix = 'ai-task-' + i;
  return '<div class="ai-task-row">'
    + '<input id="' + prefix + '-title" name="' + prefix + '-title" aria-label="Task title" class="ai-task-field ai-title" data-i="' + i + '" data-key="title" value="' + esc(t.title) + '" placeholder="Task title"/>'
    + '<select id="' + prefix + '-section" name="' + prefix + '-section" aria-label="Task section" class="ai-task-field" data-i="' + i + '" data-key="sectionTitle">' + selectOptions(sectionOptions, t.sectionTitle) + '</select>'
    + '<select id="' + prefix + '-cadence" name="' + prefix + '-cadence" aria-label="Task cadence" class="ai-task-field" data-i="' + i + '" data-key="scheduleType">' + selectOptions(AI_CADENCE_TYPES, t.scheduleType) + '</select>'
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

function renderAIBuilder(){
  if(!aiBuilder?.overlay) return;
  aiBuilder.overlay.innerHTML = aiBuilder.mode === 'review' && aiBuilder.draft ? aiReviewHTML() : aiPromptHTML();
  const close = aiBuilder.overlay.querySelector('.modal-x');
  if(close) close.onclick = closeAIBuilder;
  const cancel = $('aiCancel'); if(cancel) cancel.onclick = closeAIBuilder;
  const build = $('aiBuild'); if(build) build.onclick = handleBuildWithAI;
  const generateRoadmap = $('aiGenerateRoadmap'); if(generateRoadmap) generateRoadmap.onclick = generateRoadmapFromBrief;
  const backToInput = $('aiBackToInput'); if(backToInput) backToInput.onclick = () => {
    aiBuilder.phase = 'input';
    aiBuilder.error = '';
    aiBuilder.message = '';
    renderAIBuilder();
  };
  const basic = $('aiBasic'); if(basic) basic.onclick = createBasicDraft;
  const recordVoice = $('aiRecordVoice'); if(recordVoice) recordVoice.onclick = startVoiceRecording;
  const stopVoice = $('aiStopVoice'); if(stopVoice) stopVoice.onclick = stopVoiceRecording;
  const playVoice = $('aiPlayVoice'); if(playVoice) playVoice.onclick = () => $('aiAudioPreview')?.play();
  const clearVoice = $('aiClearVoice'); if(clearVoice) clearVoice.onclick = clearVoiceRecording;
  const transcribeVoice = $('aiTranscribeVoice'); if(transcribeVoice) transcribeVoice.onclick = transcribeVoiceRecording;
  const useTranscript = $('aiUseTranscript'); if(useTranscript) useTranscript.onclick = useTranscriptAsGoalInput;
  const voiceTranscript = $('aiVoiceTranscript'); if(voiceTranscript) voiceTranscript.addEventListener('input', e => { aiBuilder.voice.transcript = e.target.value; });
  const editPrompt = $('aiEditPrompt'); if(editPrompt) editPrompt.onclick = () => {
    aiBuilder.mode = 'prompt';
    aiBuilder.phase = aiBuilder.brief ? 'reviewing' : 'input';
    renderAIBuilder();
  };
  const regenerate = $('aiRegenerate'); if(regenerate) regenerate.onclick = () => {
    if(aiBuilder.dirty && !confirm('Regenerate this draft and replace your edits?')) return;
    if(aiBuilder.brief){
      aiBuilder.mode = 'prompt';
      aiBuilder.phase = 'reviewing';
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
  if(!canStartAIRequest(aiBuilder)) return;
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
  if(!canStartAIRequest(aiBuilder)) return;
  const previousPhase = aiBuilder.phase;
  const questions = normalizeClarifyingQuestions(aiBuilder.brief?.clarifyingQuestions || []);
  const answers = withAnswers ? questions.map(question => ({
    id:question.id,
    targetField:question.targetField,
    question:question.prompt,
    answer:String(aiBuilder.clarifyingAnswers[question.id] || '').trim(),
  })).filter(item => item.answer) : [];
  if(withAnswers && !answers.length){
    aiBuilder.error = 'Answer at least one question before updating your brief.';
    renderAIBuilder();
    return;
  }
  const requestToken = ++aiBuilder.requestToken;
  aiBuilder.clarifyLoading = true;
  aiBuilder.phase = 'interpreting';
  aiBuilder.error = '';
  aiBuilder.message = withAnswers ? 'Preparing your updated brief...' : 'Understanding your goal...';
  renderAIBuilder();
  try{
    const response = await authenticatedAIRequest('interpret', '/api/interpret-goal', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        roughGoal:aiBuilder.prompt.goal,
        context:aiBuilder.prompt,
        previousBrief:aiBuilder.brief || briefFromPrompt(aiBuilder.prompt),
        answers,
        clarificationRound:withAnswers ? aiBuilder.clarificationRound + 1 : aiBuilder.clarificationRound,
        maxClarificationRounds:MAX_AI_CLARIFICATION_ROUNDS,
      }),
    }, AI_INTERPRET_TIMEOUT_MS);
    const payload = await parseAIResponse(response, 'invalid_goal_brief', 'The AI returned an incomplete goal brief. Please retry.');
    if(!response.ok || !payload.ok){
      const error = new Error(payload.message || 'Could not understand this goal.');
      error.code = payload.error || payload.code || '';
      throw error;
    }
    if(!aiBuilder || requestToken !== aiBuilder.requestToken) return;
    const brief = normalizeGoalBrief(payload.brief);
    if(!isMeaningfulAIGoal(brief.goal || brief.summary)){
      const error = new Error('The AI returned an incomplete goal brief. Please retry.');
      error.code = 'invalid_goal_brief';
      throw error;
    }
    if(withAnswers) aiBuilder.clarificationRound += 1;
    const nextPhase = routeInterpretedBrief(brief, aiBuilder.clarificationRound);
    if(nextPhase === 'reviewing' && !brief.readyToGenerate){
      brief.assumptions = assumptionsForFinalClarification(brief);
      brief.clarifyingQuestions = [];
    }
    aiBuilder.brief = brief;
    aiBuilder.clarifyingAnswers = {};
    aiBuilder.phase = nextPhase;
    aiBuilder.message = nextPhase === 'clarifying'
      ? 'Answer the focused questions below so the roadmap can fit your situation.'
      : 'Your editable path brief is ready. Review it before generating the roadmap.';
  }catch(error){
    if(!aiBuilder || requestToken !== aiBuilder.requestToken) return;
    const recoveryPhase = aiBuilder.brief ? (previousPhase === 'reviewing' ? 'reviewing' : 'clarifying') : 'error';
    Object.assign(aiBuilder, recoverAIBuilderState(aiBuilder, aiInterpretationError(error), recoveryPhase), { message:'' });
  }finally{
    if(aiBuilder && requestToken === aiBuilder.requestToken){
      aiBuilder.clarifyLoading = false;
      renderAIBuilder();
    }
  }
}

function createBasicDraft(){
  if(!canStartAIRequest(aiBuilder)) return;
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
    const draft = localGeneratedDraft(prompt);
    aiBuilder.draft = normalizeGeneratedDraft(draft, prompt);
    aiBuilder.draft.source = 'fallback';
    aiBuilder.message = 'Basic starter template created without AI. Review it before saving.';
    aiBuilder.mode = 'review';
    aiBuilder.phase = 'complete';
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
  if(!canStartAIRequest(aiBuilder) || aiBuilder.phase !== 'reviewing' || !aiBuilder.brief) return;
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
  const requestToken = ++aiBuilder.requestToken;
  aiBuilder.loading = true;
  aiBuilder.phase = 'generating';
  aiBuilder.error = '';
  aiBuilder.message = '';
  renderAIBuilder();
  try{
    const response = await authenticatedAIRequest('generate', '/api/generate-path', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        confirmedBrief,
        visibility:prompt.visibility,
        description:prompt.description,
        resourceLinks:prompt.resourceLinks,
        includeTasks:prompt.includeTasks,
        excludeTasks:prompt.excludeTasks,
      }),
    }, AI_GENERATE_TIMEOUT_MS);
    const payload = await parseAIResponse(response, 'invalid_ai_output', 'Claude returned a path draft that could not be validated. Please regenerate.');
    if(!response.ok || !payload.ok){
      const error = new Error(payload.message || 'AI generation failed.');
      error.code = payload.error || payload.code || '';
      throw error;
    }
    if(!aiBuilder || requestToken !== aiBuilder.requestToken) return;
    aiBuilder.draft = normalizeGeneratedDraft(payload.draft, prompt);
    aiBuilder.draft.source = payload.source || 'anthropic';
    aiBuilder.message = payload.message || 'AI draft generated. Review before saving.';
    aiBuilder.mode = 'review';
    aiBuilder.phase = 'complete';
    aiBuilder.dirty = false;
  }catch(error){
    if(!aiBuilder || requestToken !== aiBuilder.requestToken) return;
    aiBuilder.phase = 'reviewing';
    if(error.code === 'unauthorized') aiBuilder.error = 'Your session has expired. Sign in again to continue.';
    else if(error.code === 'rate_limited') aiBuilder.error = 'You have reached the current AI usage limit. Your brief is saved. Try again later.';
    else if(['operation_timeout', 'provider_timeout'].includes(error.code)) aiBuilder.error = 'The AI request took too long and was cancelled. Your information is still saved.';
    else if(error.code === 'invalid_provider_response') aiBuilder.error = 'Claude returned an invalid roadmap response. Please regenerate.';
    else if(error.code === 'provider_unavailable') aiBuilder.error = 'The AI service is temporarily unavailable. Try again, or use Basic starter.';
    else if(error.code === 'brief_not_confirmed') aiBuilder.error = 'Review and confirm your path brief before generating the roadmap.';
    else aiBuilder.error = error.message || 'Could not generate a roadmap. Your confirmed brief is still saved.';
  }finally{
    if(aiBuilder && requestToken === aiBuilder.requestToken){
      aiBuilder.loading = false;
      renderAIBuilder();
    }
  }
}

async function saveGeneratedPath(){
  if(!aiBuilder?.draft || aiBuilder.saving) return;
  aiBuilder.saving = true;
  aiBuilder.error = '';
  aiBuilder.message = 'Saving generated path...';
  aiSaveClientId = aiSaveClientId || ('ai_' + Date.now().toString(36) + Math.floor(Math.random()*99999).toString(36));
  renderAIBuilder();
  try{
    if(configPresent() && store.currentUser && !cloudAvailable()) throw new Error(cloudFailureMessage());
    const localPath = {
      ...aiDraftToLocalPath(normalizeGeneratedDraft(aiBuilder.draft, aiBuilder.prompt)),
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
      renderAIBuilder();
      openAuthModal('signup');
      return;
    } else {
      store.state.userPaths[id] = localPath;
      await dbSaveState();
    }
    ensureSkill(id);
    closeAIBuilder();
    await openSkill(id, { tab:'plan' });
    store.editMode = true;
    renderPlan();
    flash('Generated path saved as private');
    aiSaveClientId = null;
  }catch(e){
    aiBuilder.saving = false;
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
  selectedJourneyDay = options.day ? (Number(options.day) || null) : null;
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
  setRoute(pathHash(id, startTab, selectedJourneyDay));
  openingPathId = null;
  window.scrollTo({ top:0, behavior:'smooth' });
}

function syncOpenedPathInBackground(id){
  if(!isUserPath(id)) return;
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
    const existingDef = store.state.userPaths[id];
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
  store.state.current = null; store.editMode = false;
  dbSaveState(); applyHeader(); renderCatalog();
  setRoute('#/discover');
  window.scrollTo({ top:0, behavior:'smooth' });
}

export async function handleHashRoute(){
  const hash = (location.hash || '').replace(/^#\/?/, '');
  if(!hash) return false;
  if(hash === 'discover' || hash === 'my-paths'){
    goCatalog();
    return true;
  }
  const parts = hash.split('/').map(decodeURIComponent);
  if(parts[0] !== 'path' || !parts[1]) return false;
  const tab = parts[2] === 'preview' ? null : parts[2];
  const dayIdx = parts.indexOf('day');
  const day = dayIdx >= 0 ? Number(parts[dayIdx + 1] || 0) : null;
  await openPathRoute(parts[1], parts[2] === 'preview', { tab, day });
  return true;
}

async function openPathRoute(id, forcePreview, options = {}){
  if(isUserPath(id) || SKILLS.some(s => s.id === id)){
    if(forcePreview && isUserPath(id)){
      const def = store.state.userPaths[id];
      renderPathPreview({ id, path:def.platformData || def, membership:def.membership || null, sections:[], tasks:[] });
    } else await openSkill(id, options);
    return;
  }
  let record = null;
  try{
    renderPathOpening('Opening path...', 'Loading platform path details.');
    if(!cloudAvailable()) throw new Error(cloudFailureMessage());
    record = await trackOperation('path children load', withTimeout(dbLoadPlatformPath(id), PATH_OPEN_TIMEOUT_MS, 'load platform path'));
  }catch(e){
    renderPathLoadError(id, !cloudAvailable() ? cloudFailureMessage() : userSyncMessage(e, 'Could not load path tasks. Try again.'));
    return;
  }
  if(!record){
    renderMissingPath();
    return;
  }
  if(!forcePreview && canViewPath(record.path, record.membership, store.currentUser)){
    await openSkill(id, options);
    return;
  }
  if(canPreviewPath(record.path, store.currentUser)){
    if(store.currentUser) await dbLoadMyAccessRequest(id);
    renderPathPreview(record);
  } else {
    renderAccessBlocked(record);
  }
}

function renderMissingPath(){
  store.state.current = null; store.editMode = false; applyHeader();
  $('content').innerHTML = '<div class="panel card empty-state"><div class="section-title">Path not found</div><div class="muted">This path may have been removed, hidden, or shared with the wrong link.</div><button class="btn" id="backDiscover" style="margin-top:14px">Back to discover</button></div>';
  const b = $('backDiscover'); if(b) b.onclick = goCatalog;
}

function renderAccessBlocked(record){
  store.state.current = null; store.editMode = false; applyHeader();
  $('content').innerHTML = '<div class="panel card empty-state"><div class="section-title">' + esc(record.path.title) + '</div><div class="muted">This path is private. The creator has not enabled a public preview.</div></div>';
}

function renderPathPreview(record){
  const path = record.path;
  const req = store.accessRequests[record.id];
  store.state.current = null; store.editMode = false; applyHeader();
  let h = '<div class="preview-hero panel">'
    + (path.coverImage ? '<div class="preview-cover" style="background-image:url(\'' + esc(path.coverImage) + '\')"></div>' : '')
    + '<div class="preview-body">'
    + (path.profileImage ? '<img class="preview-avatar" src="' + esc(path.profileImage) + '" alt=""/>' : '')
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
    const href = s.evidenceUrl || '#';
    return '<div class="evidence-item"><div><b>' + esc(title) + '</b>'
      + '<span>' + esc(dateText(s.createdAt)) + '</span>'
      + (s.note ? '<p>' + esc(s.note) + '</p>' : '') + '</div>'
      + (s.evidenceUrl ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(label) + '</a>' : '<em>' + esc(label) + '</em>')
      + '</div>';
  }).join('') + '</div>';
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

function roadmapHTML(id, def){
  const enrollment = currentEnrollmentForPath(id);
  const tasksReady = pathTasksReady(def);
  const logs = enrollment?.dayLogs || {};
  const today = localDateString();
  const totalDays = getMaxRoadmapDay(def, enrollment);
  const activeDay = enrollment?.startDate ? journeyDayForDate(enrollment.startDate, today) : 1;
  let h = '<div class="panel card roadmap-foundation">'
    + '<div class="road-head"><div><div class="chip">Roadmap</div><h3>Daily journey</h3></div>'
    + '<div class="road-stats"><span>Streak ' + esc(enrollment?.streak || 0) + '</span><span>Freezes ' + esc(enrollment?.freezeCount ?? 1) + '</span></div></div>';
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
  h += '<div class="road-days vertical">';
  for(let day = 1; day <= totalDays; day++){
    const status = getDayStatus(day, enrollment, logs, today);
    const open = canOpenDay(day, status);
    const date = enrollment?.startDate ? dateForJourneyDay(enrollment.startDate, day) : null;
    const taskCount = tasksReady ? getTasksForDay(def, day).length : 0;
    h += '<button type="button" class="road-day ' + status + (day === activeDay ? ' today' : '') + '" data-road-day="' + day + '" ' + (open ? '' : 'disabled') + '>'
      + '<span>Day ' + day + '</span><small>' + esc(statusLabel(status)) + (date ? ' · ' + esc(date.slice(5)) : '') + '</small>'
      + '<em>' + (tasksReady ? (open ? (taskCount + ' task' + (taskCount === 1 ? '' : 's')) : 'Unlocks later') : 'Loading tasks') + '</em></button>';
  }
  h += '</div></div>';
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
    if(dayTasks.length){
      h += '<div class="journey-tasks">';
      dayTasks.forEach(task => {
        const title = taskTitleForDay(task, day);
        if(task.evidenceRequired){
          const isVerified = verified.has(task.id);
          h += '<div class="journey-task proof-required ' + (isVerified ? 'done' : '') + '">'
            + '<span><b>' + esc(title) + '</b>'
            + (task.description ? '<small>' + esc(task.description) + '</small>' : '')
            + (task.progressionNotes ? '<small>' + esc(task.progressionNotes) + '</small>' : '')
            + '<small class="evidence-note">' + (isVerified ? 'Proof submitted' : 'Require proof for this task') + '</small></span>'
            + (isVerified ? '<span class="proof-pill">Verified</span>' : '<button class="btn add-evidence" data-task="' + esc(task.id) + '">Add proof</button>')
            + evidenceFormHTML(task)
            + '</div>';
        } else {
          h += '<label class="journey-task ' + (completed.has(task.id) ? 'done' : '') + '"><input type="checkbox" class="ck journey-ck" data-task="' + esc(task.id) + '" ' + (completed.has(task.id) ? 'checked' : '') + '/>'
            + '<span><b>' + esc(title) + '</b>'
            + (task.description ? '<small>' + esc(task.description) + '</small>' : '')
            + (task.progressionNotes ? '<small>' + esc(task.progressionNotes) + '</small>' : '')
            + (completed.has(task.id) ? '<small class="evidence-note">Completed without proof</small>' : '')
            + '</span></label>';
        }
      });
      h += '</div>';
    } else {
      h += '<div class="muted">No tasks are available for this day. Completion stays disabled until task data is available.</div>';
    }
    const ready = dayTasks.length > 0 && completeCount === dayTasks.length;
    const canComplete = canCompleteDay(day, enrollment, today);
    h += '<button class="btn gold" id="completeDay" data-day="' + day + '" ' + (ready && canComplete ? '' : 'disabled') + '>Complete day</button>';
    if(!canComplete && status === 'active') h += '<div class="hint">This day is not eligible for completion today.</div>';
    if(ready && canComplete) h += '<div class="hint">All required proof has been submitted.</div>';
  }
  h += '</div>';
  return h;
}

function journeyStatusHTML(id, def){
  const enrollment = currentEnrollmentForPath(id);
  const tasksReady = pathTasksReady(def);
  const today = localDateString();
  const totalDays = getMaxRoadmapDay(def, enrollment);
  const day = enrollment?.startDate ? Math.min(journeyDayForDate(enrollment.startDate, today), totalDays) : 0;
  const status = enrollment?.startDate ? getDayStatus(day || 1, enrollment, enrollment.dayLogs || {}, today) : 'not started';
  const todayTasks = (tasksReady && enrollment?.startDate) ? getTasksForDay(def, day || 1) : [];
  const log = enrollment?.dayLogs && (enrollment.dayLogs[day] || enrollment.dayLogs[String(day)]);
  const done = todayTasks.filter(task => taskIsDone(task, log)).length;
  return '<div class="panel card journey-status">'
    + '<div><span>Day</span><b>' + (day || '-') + ' of ' + totalDays + '</b></div>'
    + '<div><span>Streak</span><b>' + esc(enrollment?.streak || 0) + '</b></div>'
    + '<div><span>Freezes</span><b>' + esc(enrollment?.freezeCount ?? 1) + '</b></div>'
    + '<div><span>Started</span><b>' + esc(enrollment?.startDate || 'Not yet') + '</b></div>'
    + '<div><span>Today</span><b>' + esc(statusLabel(status)) + '</b></div>'
    + '<div><span>Progress</span><b>' + (tasksReady ? (done + '/' + todayTasks.length) : 'Loading') + '</b></div>'
    + '</div>';
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
      evidenceUrl = ($('evidenceUrl')?.value || '').trim();
      try{ new URL(evidenceUrl); }
      catch(e){ throw new Error('Add a valid proof URL.'); }
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
    completed.add(taskId);
    verified.add(taskId);
    unverified.delete(taskId);
    await dbSaveDayLog(enrollment.id, makeDayLog(day, {
      ...existing,
      dayNumber: day,
      date: dateForJourneyDay(enrollment.startDate, day),
      status: 'active',
      completedTaskIds: Array.from(completed),
      verifiedTaskIds: Array.from(verified),
      unverifiedTaskIds: Array.from(unverified),
      totalTaskCount: dayTasks.length,
      evidenceCount: evidenceCountFor(enrollment.id, day),
    }));
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
  if(dayTasks.some(task => task.evidenceRequired ? !verifiedTaskIds.includes(task.id) : !completedTaskIds.includes(task.id))){
    flash('This task needs proof before Day can be completed.');
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
    totalTaskCount: dayTasks.length,
    evidenceCount: evidenceCountFor(enrollment.id, day),
  }));
  await dbSaveEnrollment({
    ...store.enrollments[enrollment.id],
    lastCompletedDay: Math.max(Number(enrollment.lastCompletedDay || 0), day),
    lastActivityDate: localDateString(),
    missedDate: null,
    streak: wasCompleted ? Number(enrollment.streak || 0) : Number(enrollment.streak || 0) + 1,
    currentDay: Math.max(Number(enrollment.currentDay || 1), day + 1),
  });
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

function wireJourneyControls(id, def){
  const start = $('startJourney');
  if(start) start.onclick = async () => {
    if(!pathCanStart(def)){
      flash('Loading tasks. Try again in a moment.');
      return;
    }
    startingJourneyId = id;
    start.disabled = true;
    start.textContent = 'Starting...';
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
    renderPlan();
    try{
      if(configPresent() && store.currentUser && !cloudAvailable()) throw cloudConnectionError();
      await trackOperation(
        'start enrollment',
        withTimeout(dbStartEnrollment(id, getTasksForDay(def, 1).length), ENROLLMENT_TIMEOUT_MS, 'start enrollment')
      );
      setJourneyPending(enrollmentId, false);
      store.syncStatus = '';
      await dbSaveState();
    }catch(e){
      console.warn('start enrollment:', e && e.message ? e.message : e);
      if(isTemporaryFirebaseError(e)){
        setJourneyPending(enrollmentId, true);
        store.syncStatus = 'Started locally \u2014 waiting to sync';
        await dbSaveState();
      } else {
        restoreJourneyStart(enrollmentId, snapshot);
        store.syncStatus = '';
        await dbSaveState();
      }
      flash(enrollmentStartErrorMessage(e));
    }finally{
      startingJourneyId = null;
      if(store.state.current === id && store.activeTab === 'plan') renderPlan();
    }
  };
  $('content').querySelectorAll('[data-road-day]').forEach(btn => {
    btn.onclick = async () => {
      selectedJourneyDay = Number(btn.dataset.roadDay || 1);
      setRoute(pathHash(id, 'plan', selectedJourneyDay));
      evidenceFormTaskId = null;
      evidenceProofType = 'url';
      evidenceError = '';
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
}

/* ============================================================ */
/* ---------- USER-CREATED PATH (Plan view + inline editor) --- */
/* ============================================================ */
export function renderPlan(){
  const id = store.state.current, def = curUser();
  if(!def){ renderCatalog(); return; }
  const editable = canEditUserPath(id);
  if(store.editMode && !editable) store.editMode = false;
  const p = P(); const t = totalsFor(id); const pct = t.total ? Math.round(t.done/t.total*100) : 0;
  let h = '<div class="plan-head"><div><div class="chip" style="margin-bottom:8px">Your path</div>'
    + '<div class="section-title" style="margin:0">' + esc(pathTitle(id)) + '</div>'
    + (pathGoal(id) ? ('<div class="muted" style="margin-top:6px;max-width:640px">' + esc(pathGoal(id)) + '</div>') : '')
    + '</div><div style="text-align:right"><button class="btn ' + (store.editMode ? 'gold' : '') + '" id="planEdit">' + (store.editMode ? 'Done editing' : '✎ Edit') + '</button>'
    + '<div class="muted" style="font-size:12px;margin-top:10px">' + t.done + ' / ' + t.total + ' done · ' + pct + '%</div>'
    + '<div class="progress-bar" style="width:220px;max-width:60vw;margin-left:auto"><div style="width:' + pct + '%"></div></div></div></div>';

  h += syncStatusHTML();
  h += journeyStatusHTML(id, def);
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
        h += '<div class="res-item"><input type="checkbox" class="ck sm" data-id="' + rid + '" ' + (p[rid] ? 'checked' : '') + '/><div class="rl"><a href="' + esc(r.url || '#') + '" target="_blank" rel="noopener">' + esc(r.label || r.url) + '</a></div><a class="ext" href="' + esc(r.url || '#') + '" target="_blank" rel="noopener">open ↗</a></div>';
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
  $('content').innerHTML = h;
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
  bindText('pmCover', 'coverImage');
  bindText('pmProfile', 'profileImage');
  bindText('pmPreviewTitle', 'previewTitle');
  bindText('pmPreviewDescription', 'previewDescription');
  bindCheck('pmDiscoverable', 'discoverable');
  bindCheck('pmPreviewEnabled', 'previewEnabled');
  bindCheck('pmPreviewScheme', 'previewIncludesScheme');
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
  $('content').querySelectorAll('.res-url').forEach(inp   => inp.addEventListener('input', e => { def.weeks[+e.target.dataset.wi].resources[+e.target.dataset.ri].url   = e.target.value; upSaveSoft(); }));
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
export function renderToday(){
  const def = curDef(), cs = curState();
  const ep = effPlan();
  let wkNum = cs.meta.startDate ? currentWeekFromStart() : store.currentWeek;
  let wk = weekObj(wkNum); if(!wk){ wk = ep[0]; wkNum = wk ? wk.w : 1; }
  const q = quarters()[wk.q] || { name:'Custom' };
  const tdPos = (ep.findIndex(x => x.w === wk.w) + 1) || 1, tdTotal = ep.length;
  const tk = (function(){ const order=['mon','tue','wed','thu','fri','sat','sun']; return order[(new Date().getDay()+6)%7]; })();
  const dayDef = def.days.find(d => d.k === tk) || def.days[0];
  const bid = 'w' + wk.w + '.' + dayDef.k, tid = bid + '.t';
  const streak = computeStreak(), wp = weekProg(wk), wpct = wp.total ? Math.round(wp.done/wp.total*100) : 0;
  const dayNames = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday', sun:'Sunday' };
  let h = '<div class="today-grid">';
  // left: today's session
  h += '<div class="panel card today-main">';
  h += '<div class="goal-line">' + esc(pathGoal(store.state.current)) + '</div>';
  h += '<div class="today-kicker">' + esc(dayNames[tk] || 'Today') + ' · Week ' + tdPos + ' of ' + tdTotal + '</div>';
  if(!cs.meta.startDate) h += '<div class="hint" style="margin:10px 0">Set a <b>start date</b> in the header to lock your weekly schedule. Showing Week 1 for now.</div>';
  h += '<div class="today-task ' + (P()[bid] ? 'done' : '') + '"><input type="checkbox" class="ck" data-id="' + bid + '" ' + (P()[bid] ? 'checked' : '') + '/>'
    + '<div><div class="tt-title">' + esc(dayLabel(wk, dayDef)) + '</div><div class="tt-sub">' + esc(dayDef.s) + '</div></div></div>';
  h += '<label class="taste today-taste"><input type="checkbox" class="ck sm ox" data-id="' + tid + '" ' + (P()[tid] ? 'checked' : '') + '/> Taste 15m (a quick rep, even on a busy day)</label>';
  if(dayDef.ship) h += '<div class="ship-note">★ Shipping day. Finish and publish one piece. Shipping is the skill.</div>';
  h += '<div class="lad-strip-today"><div class="muted" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Always-on ladders</div>';
  ladders().forEach(l => { h += ladderRowHTML(l); });
  h += '</div>';
  h += '<div class="today-actions"><button class="btn" id="openWeek">Open full week →</button></div>';
  h += '</div>';
  // right: momentum
  h += '<div class="panel card today-side">';
  h += '<div class="stat-big"><div class="sb-num">' + streak + '</div><div class="sb-lab">day streak</div></div>';
  h += '<div class="stat-row"><span>This week</span><b>' + wpct + '%</b></div><div class="progress-bar"><div style="width:' + wpct + '%"></div></div>';
  const tot = allTotals(), tpct = tot.total ? Math.round(tot.done/tot.total*100) : 0;
  h += '<div class="stat-row" style="margin-top:14px"><span>Whole path</span><b>' + tpct + '%</b></div><div class="progress-bar"><div style="width:' + tpct + '%"></div></div>';
  h += '<div class="muted" style="font-size:12px;margin-top:16px;line-height:1.5">Tick any task to extend your streak. Consistency is the engine: a short rep every day beats a long block once a week.</div>';
  h += '</div></div>';
  $('content').innerHTML = h;
  wireChecks();
  const ow = $('openWeek'); if(ow) ow.onclick = () => { store.currentWeek = wk.w; curState().meta.lastWeek = wk.w; store.nav.switchTab('week'); };
  $('content').querySelectorAll('input.ck').forEach(cb => cb.addEventListener('change', () => setTimeout(renderToday, 60)));
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
        + '<div class="rl"><a href="' + esc(r.u) + '" target="_blank" rel="noopener">' + esc(r.l) + '</a></div>'
        + '<a class="ext" href="' + esc(r.u) + '" target="_blank" rel="noopener">open ↗</a></div>';
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
    $('content').querySelectorAll('.cres-u').forEach(inp => inp.addEventListener('input', e => { weekResArr(wk.w)[+e.target.dataset.i].u = e.target.value; scheduleSave(); }));
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
    grp.items.forEach(r => { h += '<div class="res-item"><div class="rl"><a href="' + esc(r.u) + '" target="_blank" rel="noopener">' + esc(r.l) + '</a></div><a class="ext" href="' + esc(r.u) + '" target="_blank" rel="noopener">open ↗</a></div>'; });
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
      + '<div class="lc-foot">' + (en.url ? ('<a href="' + esc(en.url) + '" target="_blank" rel="noopener" class="ext">open render ↗</a>') : '<span></span>') + '<button class="del" data-id="' + esc(en.id) + '">delete</button></div></div></div>';
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
    url: url || null, kind: kind || 'note',
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
