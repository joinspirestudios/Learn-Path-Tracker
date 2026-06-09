// ── db.js ─────────────────────────────────────────────────────────────────
// Persistence layer. All Firestore + localStorage access funnels through here
// so the rest of the app can stay storage-agnostic. Cloud writes are debounced;
// local mirror is instant.

import { fb } from './firebase.js';
import { store, STATE_KEY, CAT_PREFIX, LEGACY_KEY, migrateState } from './store.js';
import { Store, flash } from './helpers.js';
import {
  canViewPath, localToPlatformParts, normalizePathDoc, platformToLocalPath,
} from './platform.js';
import {
  dateForJourneyDay, journeyDayForDate, localDateString,
} from './journey.js';
import {
  ENROLLMENT_TIMEOUT_MS, PATH_OPEN_TIMEOUT_MS, READ_TIMEOUT_MS, WRITE_TIMEOUT_MS,
  trackOperation, userSyncMessage, withTimeout,
} from './sync.js';

export function configPresent(){ return fb.present; }
export function cloudActive(){ return fb.ready && !!store.currentUser; }

let _cloudSaveTimer = null;

function syncErrorMessage(error, fallback){
  return userSyncMessage(error, fallback);
}

export async function dbLoadState(){
  if(cloudActive()){
    try{
      const ref = fb.doc(fb.db, 'users', store.currentUser.uid, 'state', 'main');
      const snap = await trackOperation('cloud state load', withTimeout(fb.getDoc(ref), READ_TIMEOUT_MS, 'cloud state load'));
      if(snap.exists()) return migrateState(snap.data().bundle || {});
    }catch(e){ console.warn('cloud state load:', syncErrorMessage(e, 'This is taking too long. Check your connection and try again.')); }
    return migrateState({});
  }
  return loadLocalState();
}

export async function dbSaveState(){
  // Local mirror is instant (local-first) — a refresh never waits on the network.
  try{ localStorage.setItem(STATE_KEY, JSON.stringify(store.state)); }catch(e){}
  flash(cloudActive() ? 'Saved ✓' : 'Saved ✓');
  // Cloud write is debounced — a burst of toggles collapses into one Firestore write.
  if(cloudActive()){
    clearTimeout(_cloudSaveTimer);
    _cloudSaveTimer = setTimeout(async () => {
      try{
        const ref = fb.doc(fb.db, 'users', store.currentUser.uid, 'state', 'main');
        await trackOperation('cloud state save', withTimeout(fb.setDoc(ref, { bundle: store.state }, { merge: true }), WRITE_TIMEOUT_MS, 'cloud state save'));
        flash('Synced ✓');
      }catch(e){ console.warn('cloud sync:', syncErrorMessage(e, 'This is taking too long. Check your connection and try again.')); }
    }, 500);
  }
}

export async function dbLoadRenders(){
  if(cloudActive()){
    try{
      const col = fb.collection(fb.db, 'users', store.currentUser.uid, 'renders');
      const snap = await trackOperation('render log load', withTimeout(fb.getDocs(col), READ_TIMEOUT_MS, 'render log load'));
      const arr = []; snap.forEach(d => arr.push(d.data()));
      return arr;
    }catch(e){ console.warn('render log load:', syncErrorMessage(e, 'This is taking too long. Check your connection and try again.')); return []; }
  }
  const keys = await Store.list(CAT_PREFIX);
  const arr = [];
  for(const k of keys){
    try{ const v = await Store.get(k); if(v) arr.push(JSON.parse(v)); }catch(e){}
  }
  return arr;
}

export async function dbSaveRender(en){
  if(cloudActive()){
    try{
      const ref = fb.doc(fb.db, 'users', store.currentUser.uid, 'renders', en.id);
      await withTimeout(fb.setDoc(ref, en), WRITE_TIMEOUT_MS, 'render save');
    }catch(e){ console.warn('render save:', syncErrorMessage(e, 'This is taking too long. Check your connection and try again.')); }
    return;
  }
  await Store.set(CAT_PREFIX + en.id, JSON.stringify(en));
}

export async function dbDelRender(id){
  if(cloudActive()){
    try{
      const ref = fb.doc(fb.db, 'users', store.currentUser.uid, 'renders', id);
      await withTimeout(fb.deleteDoc(ref), WRITE_TIMEOUT_MS, 'render delete');
    }catch(e){ console.warn('render delete:', syncErrorMessage(e, 'This is taking too long. Check your connection and try again.')); }
    return;
  }
  await Store.del(CAT_PREFIX + id);
}

export function loadLocalState(){
  // Versioned state present? Migrate it forward and return.
  const raw = localStorage.getItem(STATE_KEY);
  if(raw){ try{ return migrateState(JSON.parse(raw)); }catch(e){} }
  // Otherwise look for the legacy single-skill bundle, migrate ONCE, persist, and clear it.
  const old = localStorage.getItem(LEGACY_KEY);
  if(old){
    try{
      const o = JSON.parse(old);
      const migrated = migrateState({
        current: null,
        skills: { cinematic: {
          progress: o.progress || {},
          notes:    o.notes    || {},
          meta:     o.meta     || { startDate:null, lastWeek:1 },
        }},
        userPaths: {},
      });
      localStorage.setItem(STATE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_KEY); // never read this key again
      return migrated;
    }catch(e){}
  }
  return migrateState({});
}

/* ---- platform paths (cloud only) ----
   Local mode intentionally keeps using the private `userPaths` bundle above.
   Cloud platform mode stores shareable paths as top-level `paths/{pathId}`
   documents plus sections/tasks/members subcollections. */
function pathRef(id){ return fb.doc(fb.db, 'paths', id); }
function sectionRef(pathId, sectionId){ return fb.doc(fb.db, 'paths', pathId, 'sections', sectionId); }
function taskRef(pathId, taskId){ return fb.doc(fb.db, 'paths', pathId, 'tasks', taskId); }
function memberRef(pathId, uid){ return fb.doc(fb.db, 'paths', pathId, 'members', uid); }
function accessRequestRef(pathId, uid){ return fb.doc(fb.db, 'paths', pathId, 'accessRequests', uid); }
function enrollmentRef(enrollmentId){ return fb.doc(fb.db, 'enrollments', enrollmentId); }
function dayLogRef(enrollmentId, dayNumber){ return fb.doc(fb.db, 'enrollments', enrollmentId, 'dayLogs', String(dayNumber)); }
function submissionRef(enrollmentId, submissionId){ return fb.doc(fb.db, 'enrollments', enrollmentId, 'submissions', submissionId); }
function submissionsCol(enrollmentId){ return fb.collection(fb.db, 'enrollments', enrollmentId, 'submissions'); }

export const ACCEPTED_EVIDENCE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function enrollmentIdFor(pathId, userId){
  return String(userId || 'local') + '_' + String(pathId || '').replace(/[\/\\]/g, '_');
}

function cleanEnrollmentStatus(status){
  return ['active', 'paused', 'completed'].includes(status) ? status : 'active';
}

function cleanDayLogStatus(status){
  return ['locked', 'active', 'completed', 'missed', 'frozen'].includes(status) ? status : 'locked';
}

function stamp(){ return new Date(); }

function cleanEvidenceType(type){
  return type === 'file' ? 'file' : 'url';
}

function safeFileName(fileName){
  const base = String(fileName || 'evidence').trim() || 'evidence';
  return base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'evidence';
}

export function makeEnrollment(pathId, userId, data = {}){
  const id = data.id || enrollmentIdFor(pathId, userId);
  const createdAt = data.createdAt || stamp();
  return {
    id,
    pathId: data.pathId || pathId,
    userId: data.userId || userId,
    startDate: data.startDate || null,
    currentDay: Number(data.currentDay || 1),
    streak: Number(data.streak || 0),
    freezeCount: data.freezeCount == null ? 1 : Number(data.freezeCount || 0),
    status: cleanEnrollmentStatus(data.status),
    lastCompletedDay: data.lastCompletedDay == null ? null : Number(data.lastCompletedDay),
    lastActivityDate: data.lastActivityDate || null,
    missedDate: data.missedDate || null,
    createdAt,
    updatedAt: data.updatedAt || createdAt,
  };
}

export function makeDayLog(dayNumber, data = {}){
  const n = Number(data.dayNumber || dayNumber);
  const createdAt = data.createdAt || stamp();
  return {
    dayNumber: n,
    date: data.date || null,
    status: cleanDayLogStatus(data.status),
    completedAt: data.completedAt || null,
    frozenAt: data.frozenAt || null,
    summary: data.summary || null,
    evidenceCount: Number(data.evidenceCount || 0),
    completedTaskIds: Array.isArray(data.completedTaskIds) ? data.completedTaskIds : [],
    verifiedTaskIds: Array.isArray(data.verifiedTaskIds) ? data.verifiedTaskIds : [],
    unverifiedTaskIds: Array.isArray(data.unverifiedTaskIds) ? data.unverifiedTaskIds : [],
    totalTaskCount: Number(data.totalTaskCount || 0),
    createdAt,
    updatedAt: data.updatedAt || createdAt,
  };
}

function makeEvidenceSubmission(enrollmentId, payload = {}){
  const enrollment = store.enrollments[enrollmentId] || (store.state.enrollments && store.state.enrollments[enrollmentId]) || {};
  const createdAt = payload.createdAt || stamp();
  return {
    id: payload.id || ('sub_' + Date.now().toString(36) + Math.floor(Math.random() * 100000).toString(36)),
    pathId: payload.pathId || enrollment.pathId || null,
    userId: payload.userId || enrollment.userId || (store.currentUser && store.currentUser.uid) || 'local',
    dayNumber: Number(payload.dayNumber || 1),
    taskId: String(payload.taskId || ''),
    taskTitle: String(payload.taskTitle || ''),
    evidenceType: cleanEvidenceType(payload.evidenceType),
    evidenceUrl: payload.evidenceUrl || null,
    fileName: payload.fileName || null,
    fileType: payload.fileType || null,
    fileSize: payload.fileSize == null ? null : Number(payload.fileSize || 0),
    note: payload.note || null,
    status: 'submitted',
    createdAt,
    updatedAt: payload.updatedAt || createdAt,
  };
}

function cacheEvidenceSubmission(enrollmentId, submission){
  if(!enrollmentId || !submission || !submission.id) return null;
  store.evidenceSubmissions = store.evidenceSubmissions || {};
  store.state.evidenceSubmissions = store.state.evidenceSubmissions || {};
  const live = store.evidenceSubmissions[enrollmentId] || {};
  const persisted = store.state.evidenceSubmissions[enrollmentId] || {};
  const next = { ...persisted, ...live, [submission.id]: submission };
  store.evidenceSubmissions[enrollmentId] = next;
  store.state.evidenceSubmissions[enrollmentId] = next;
  return submission;
}

function cachedEvidenceSubmissions(enrollmentId, dayNumber = null, taskId = null){
  const bucket = (store.evidenceSubmissions && store.evidenceSubmissions[enrollmentId])
    || (store.state.evidenceSubmissions && store.state.evidenceSubmissions[enrollmentId])
    || {};
  return Object.values(bucket)
    .filter(s => dayNumber == null || Number(s.dayNumber) === Number(dayNumber))
    .filter(s => taskId == null || s.taskId === taskId)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}

function cacheEnrollment(enrollment, dayLogs = null){
  if(!enrollment || !enrollment.id) return null;
  const previous = store.enrollments[enrollment.id] || (store.state.enrollments && store.state.enrollments[enrollment.id]) || {};
  const logs = dayLogs || previous.dayLogs || {};
  const cached = { ...previous, ...enrollment, dayLogs: logs };
  store.enrollments[enrollment.id] = cached;
  store.state.enrollments = store.state.enrollments || {};
  store.state.enrollments[enrollment.id] = cached;
  return cached;
}

async function loadDayLogs(enrollmentId){
  const logs = {};
  const snap = await fb.getDocs(fb.collection(fb.db, 'enrollments', enrollmentId, 'dayLogs'));
  snap.forEach(d => {
    const dayNumber = Number(d.id);
    if(dayNumber) logs[dayNumber] = makeDayLog(dayNumber, d.data());
  });
  return logs;
}

export async function dbSaveEnrollment(enrollment){
  if(!enrollment || !enrollment.id) return null;
  const next = makeEnrollment(enrollment.pathId, enrollment.userId, { ...enrollment, updatedAt: stamp() });
  delete next.dayLogs;
  if(cloudActive()){
    try{ await withTimeout(fb.setDoc(enrollmentRef(next.id), next, { merge:true }), ENROLLMENT_TIMEOUT_MS, 'save enrollment'); }
    catch(e){ console.warn('save enrollment:', syncErrorMessage(e, 'Could not start this path. Try again.')); }
  }
  cacheEnrollment(next);
  if(!cloudActive()) await dbSaveState();
  return store.enrollments[next.id];
}

export async function dbSaveDayLog(enrollmentId, dayLog){
  if(!enrollmentId || !dayLog) return null;
  const next = makeDayLog(dayLog.dayNumber, { ...dayLog, updatedAt: stamp() });
  if(cloudActive()){
    try{ await withTimeout(fb.setDoc(dayLogRef(enrollmentId, next.dayNumber), next, { merge:true }), ENROLLMENT_TIMEOUT_MS, 'save day log'); }
    catch(e){ console.warn('save day log:', syncErrorMessage(e, 'Could not start this path. Try again.')); }
  }
  const enrollment = store.enrollments[enrollmentId] || cacheEnrollment({ id: enrollmentId });
  enrollment.dayLogs = enrollment.dayLogs || {};
  enrollment.dayLogs[next.dayNumber] = next;
  cacheEnrollment(enrollment, enrollment.dayLogs);
  if(!cloudActive()) await dbSaveState();
  return next;
}

export async function createEvidenceSubmission(enrollmentId, payload){
  if(!enrollmentId) return null;
  const submission = makeEvidenceSubmission(enrollmentId, { ...payload, updatedAt: stamp() });
  if(cloudActive()){
    try{
      await withTimeout(fb.setDoc(submissionRef(enrollmentId, submission.id), submission, { merge:true }), WRITE_TIMEOUT_MS, 'create evidence submission');
    }catch(e){
      console.warn('create evidence submission:', e);
      throw e;
    }
  }
  cacheEvidenceSubmission(enrollmentId, submission);
  if(!cloudActive()) await dbSaveState();
  return submission;
}

export async function listEvidenceSubmissions(enrollmentId, dayNumber = null){
  if(!enrollmentId) return [];
  if(cloudActive()){
    try{
      const snap = await withTimeout(fb.getDocs(submissionsCol(enrollmentId)), READ_TIMEOUT_MS, 'load evidence');
      snap.forEach(d => cacheEvidenceSubmission(enrollmentId, makeEvidenceSubmission(enrollmentId, { id:d.id, ...d.data() })));
    }catch(e){
      console.warn('list evidence submissions:', e);
    }
  }
  return cachedEvidenceSubmissions(enrollmentId, dayNumber);
}

export async function listTaskEvidenceSubmissions(enrollmentId, dayNumber, taskId){
  const submissions = await listEvidenceSubmissions(enrollmentId, dayNumber);
  return submissions.filter(s => s.taskId === taskId);
}

export async function createLocalEvidenceSubmission(enrollmentId, payload){
  return createEvidenceSubmission(enrollmentId, payload);
}

export async function listLocalEvidenceSubmissions(enrollmentId, dayNumber = null){
  return cachedEvidenceSubmissions(enrollmentId, dayNumber);
}

export async function listLocalTaskEvidenceSubmissions(enrollmentId, dayNumber, taskId){
  return cachedEvidenceSubmissions(enrollmentId, dayNumber, taskId);
}

export async function uploadEvidenceFile(userId, enrollmentId, dayNumber, taskId, file){
  if(!fb.storageReady || !fb.storage){
    throw new Error('File uploads require Firebase Storage. Add Storage config or submit URL proof instead.');
  }
  if(!file) throw new Error('Choose a file to upload.');
  if(!ACCEPTED_EVIDENCE_TYPES.includes(file.type)){
    throw new Error('Use a JPG, PNG, WebP, or PDF file.');
  }
  if(Number(file.size || 0) > MAX_EVIDENCE_BYTES){
    throw new Error('Evidence files must be 10MB or smaller.');
  }
  const name = safeFileName(file.name);
  const path = [
    'evidence',
    String(userId || 'local'),
    String(enrollmentId),
    'day-' + Number(dayNumber || 1),
    String(taskId || 'task').replace(/[\/\\]/g, '_'),
    Date.now() + '-' + name,
  ].join('/');
  const ref = fb.storageRef(fb.storage, path);
  await withTimeout(fb.uploadBytes(ref, file, { contentType:file.type }), WRITE_TIMEOUT_MS, 'upload evidence file');
  return withTimeout(fb.getDownloadURL(ref), READ_TIMEOUT_MS, 'load evidence URL');
}

export async function dbStartEnrollment(pathId, totalTaskCount = 0){
  const enrollment = await dbEnsureEnrollment(pathId);
  if(!enrollment) return null;
  const today = localDateString();
  const next = {
    ...enrollment,
    startDate: enrollment.startDate || today,
    currentDay: 1,
    status: 'active',
    freezeCount: enrollment.freezeCount == null ? 1 : Number(enrollment.freezeCount),
    lastCompletedDay: enrollment.lastCompletedDay == null ? null : enrollment.lastCompletedDay,
    missedDate: null,
  };
  await dbSaveEnrollment(next);
  await dbSaveDayLog(next.id, makeDayLog(1, {
    ...(enrollment.dayLogs && enrollment.dayLogs[1] ? enrollment.dayLogs[1] : {}),
    dayNumber: 1,
    date: next.startDate,
    status: 'active',
    totalTaskCount,
  }));
  return store.enrollments[next.id];
}

export async function dbReconcileEnrollment(pathId, totalTaskCount = 0){
  const enrollment = await dbEnsureEnrollment(pathId);
  if(!enrollment || !enrollment.startDate || enrollment.status !== 'active') return enrollment;
  const today = localDateString();
  const todayDay = journeyDayForDate(enrollment.startDate, today);
  const currentDay = Number(enrollment.currentDay || 1);
  const logs = enrollment.dayLogs || {};
  const currentLog = logs[currentDay] || logs[String(currentDay)];
  const doneOrFrozen = ['completed', 'frozen'].includes(currentLog?.status);

  if(todayDay > currentDay && !doneOrFrozen){
    const missedDate = dateForJourneyDay(enrollment.startDate, currentDay);
    await dbSaveDayLog(enrollment.id, makeDayLog(currentDay, {
      ...currentLog,
      dayNumber: currentDay,
      date: missedDate,
      status: 'missed',
      totalTaskCount: currentLog?.totalTaskCount || totalTaskCount,
    }));
    await dbSaveEnrollment({
      ...store.enrollments[enrollment.id],
      missedDate,
    });
    return store.enrollments[enrollment.id];
  }

  if(todayDay > currentDay && doneOrFrozen){
    const next = {
      ...enrollment,
      currentDay: todayDay,
      missedDate: null,
    };
    await dbSaveEnrollment(next);
    const existing = logs[todayDay] || logs[String(todayDay)];
    if(!existing || existing.status === 'locked'){
      await dbSaveDayLog(next.id, makeDayLog(todayDay, {
        ...existing,
        dayNumber: todayDay,
        date: today,
        status: 'active',
        totalTaskCount,
      }));
    }
    return store.enrollments[next.id];
  }

  if(todayDay === currentDay){
    const existing = logs[currentDay] || logs[String(currentDay)];
    if(!existing || existing.status === 'locked'){
      await dbSaveDayLog(enrollment.id, makeDayLog(currentDay, {
        ...existing,
        dayNumber: currentDay,
        date: today,
        status: 'active',
        totalTaskCount,
      }));
    }
  }
  return store.enrollments[enrollment.id] || enrollment;
}

export async function dbEnsureEnrollment(pathId){
  const userId = (store.currentUser && store.currentUser.uid) || 'local';
  const enrollmentId = enrollmentIdFor(pathId, userId);
  if(cloudActive()){
    try{
      const ref = enrollmentRef(enrollmentId);
      const snap = await withTimeout(fb.getDoc(ref), ENROLLMENT_TIMEOUT_MS, 'load enrollment');
      let enrollment;
      if(snap.exists()){
        enrollment = makeEnrollment(pathId, userId, { id: enrollmentId, ...snap.data() });
        if(
          snap.data().pathId == null ||
          snap.data().userId == null ||
          snap.data().currentDay == null ||
          snap.data().status == null
        ){
          await withTimeout(fb.setDoc(ref, enrollment, { merge:true }), ENROLLMENT_TIMEOUT_MS, 'repair enrollment');
        }
      } else {
        enrollment = makeEnrollment(pathId, userId, {
          id: enrollmentId,
          status: 'active',
          currentDay: 1,
          streak: 0,
          freezeCount: 1,
          lastCompletedDay: null,
        });
        await withTimeout(fb.setDoc(ref, enrollment, { merge:true }), ENROLLMENT_TIMEOUT_MS, 'create enrollment');
      }
      const dayLogs = await withTimeout(loadDayLogs(enrollmentId), ENROLLMENT_TIMEOUT_MS, 'load day logs');
      return cacheEnrollment(enrollment, dayLogs);
    }catch(e){
      console.warn('ensure enrollment:', syncErrorMessage(e, 'Could not start this path. Try again.'));
    }
  }
  const local = store.state.enrollments && store.state.enrollments[enrollmentId];
  if(local) return cacheEnrollment(makeEnrollment(pathId, userId, local), local.dayLogs || {});
  const enrollment = makeEnrollment(pathId, userId, {
    id: enrollmentId,
    status: 'active',
    currentDay: 1,
    streak: 0,
    freezeCount: 1,
    lastCompletedDay: null,
  });
  cacheEnrollment(enrollment, {});
  await dbSaveState();
  return store.enrollments[enrollmentId];
}

function upsertPlatformPath(record){
  if(!record || !record.id) return null;
  const existingRecord = store.platformPaths[record.id];
  if(!record.childrenLoaded && existingRecord?.childrenLoaded){
    record = {
      ...record,
      sections: existingRecord.sections || [],
      tasks: existingRecord.tasks || [],
      membership: record.membership || existingRecord.membership || null,
      childrenLoaded: true,
    };
  }
  const local = platformToLocalPath(record);
  const existing = store.state.userPaths[record.id];
  if((!record.sections || !record.sections.length) && existing && existing.weeks && existing.weeks.length){
    local.weeks = existing.weeks;
    local.childrenLoaded = existing.childrenLoaded !== false;
  }
  store.platformPaths[record.id] = record;
  store.state.userPaths[record.id] = local;
  return local;
}

async function loadMembership(pathId){
  if(!cloudActive()) return null;
  try{
    const snap = await withTimeout(fb.getDoc(memberRef(pathId, store.currentUser.uid)), READ_TIMEOUT_MS, 'load path membership');
    return snap.exists() ? snap.data() : null;
  }catch(e){ return null; }
}

async function loadPathChildren(pathId){
  const sections = [], tasks = [];
  const secSnap = await withTimeout(fb.getDocs(fb.collection(fb.db, 'paths', pathId, 'sections')), PATH_OPEN_TIMEOUT_MS, 'load path sections');
  secSnap.forEach(d => sections.push({ id:d.id, ...d.data() }));
  const taskSnap = await withTimeout(fb.getDocs(fb.collection(fb.db, 'paths', pathId, 'tasks')), PATH_OPEN_TIMEOUT_MS, 'load path tasks');
  taskSnap.forEach(d => tasks.push({ id:d.id, ...d.data() }));
  return { sections, tasks };
}

async function loadPlatformRecordFromDoc(docSnap, includeChildren = true){
  const path = normalizePathDoc(docSnap.id, docSnap.data());
  const membership = includeChildren ? await loadMembership(docSnap.id) : null;
  let children = { sections:[], tasks:[] };
  if(includeChildren && canViewPath(path, membership, store.currentUser)){
    children = await loadPathChildren(docSnap.id);
  }
  return { id:docSnap.id, path, membership, ...children, childrenLoaded: !!includeChildren };
}

export async function dbLoadPlatformPath(id){
  if(!fb.ready) return null;
  try{
    const snap = await trackOperation('path children load', withTimeout(fb.getDoc(pathRef(id)), PATH_OPEN_TIMEOUT_MS, 'load platform path'));
    if(!snap.exists()) return null;
    const record = await loadPlatformRecordFromDoc(snap, true);
    if(canViewPath(record.path, record.membership, store.currentUser)) upsertPlatformPath(record);
    else store.platformPaths[id] = record;
    return record;
  }catch(e){
    console.warn('load platform path:', syncErrorMessage(e, 'Could not load path tasks. Try again.'));
    throw e;
  }
}

export async function dbLoadPlatformPaths(){
  if(!fb.ready) return [];
  const seen = new Set();
  const records = [];
  async function collect(q){
    try{
      const snap = await withTimeout(fb.getDocs(q), READ_TIMEOUT_MS, 'platform summaries load');
      for(const d of snap.docs){
        if(seen.has(d.id)) continue;
        seen.add(d.id);
        records.push(await loadPlatformRecordFromDoc(d, false));
      }
    }catch(e){ console.warn('load platform paths:', e); }
  }
  const pathsCol = fb.collection(fb.db, 'paths');
  await collect(fb.query(pathsCol, fb.where('visibility', '==', 'public')));
  if(store.currentUser){
    await collect(fb.query(pathsCol, fb.where('ownerId', '==', store.currentUser.uid)));
  }
  records.forEach(upsertPlatformPath);
  return records;
}

export async function dbSavePlatformPath(id){
  if(!cloudActive()) return null;
  const local = store.state.userPaths[id];
  if(!local || (local.platform && local.ownerId && local.ownerId !== store.currentUser.uid && local.membership?.role !== 'editor')) return null;
  const ownerId = local.ownerId || store.currentUser.uid;
  const ownerSaving = ownerId === store.currentUser.uid;
  const { path, sections, tasks } = localToPlatformParts(id, local, store.currentUser, ownerId);
  try{
    const previous = store.platformPaths[id];
    const isExistingCloudPath = !!(previous && previous.childrenLoaded);
    const batch = fb.writeBatch(fb.db);
    batch.set(pathRef(id), {
      ...path,
      ownerId,
      updatedAt: new Date(),
      createdAt: (previous && previous.path && previous.path.createdAt) || path.createdAt,
    }, { merge:true });
    if(ownerSaving){
      batch.set(memberRef(id, ownerId), {
        uid: ownerId,
        role: 'owner',
        addedAt: (previous && previous.path && previous.path.createdAt) || new Date(),
      }, { merge:true });
    }
    if(isExistingCloudPath){
      const wantedSections = new Set(sections.map(s => s.id));
      const wantedTasks = new Set(tasks.map(t => t.id));
      const oldSections = await withTimeout(fb.getDocs(fb.collection(fb.db, 'paths', id, 'sections')), READ_TIMEOUT_MS, 'load old sections');
      oldSections.docs.filter(d => !wantedSections.has(d.id)).forEach(d => batch.delete(d.ref));
      const oldTasks = await withTimeout(fb.getDocs(fb.collection(fb.db, 'paths', id, 'tasks')), READ_TIMEOUT_MS, 'load old tasks');
      oldTasks.docs.filter(d => !wantedTasks.has(d.id)).forEach(d => batch.delete(d.ref));
    }
    sections.forEach(s => batch.set(sectionRef(id, s.id), {
      title:s.title, description:s.description || '', order:s.order || 0,
    }, { merge:true }));
    tasks.forEach(t => batch.set(taskRef(id, t.id), {
      sectionId:t.sectionId,
      title:t.title,
      description:t.description || '',
      resourceUrl:t.resourceUrl || null,
      evidenceRequired:!!t.evidenceRequired,
      order:t.order || 0,
      unlockDay:t.unlockDay == null ? null : t.unlockDay,
      scheduleType:t.scheduleType || null,
      taskMode:t.taskMode || null,
      startDay:t.startDay == null ? null : t.startDay,
      endDay:t.endDay == null ? null : t.endDay,
      progressionMetric:t.progressionMetric || null,
      progressionUnit:t.progressionUnit || null,
      startValue:t.startValue == null ? null : t.startValue,
      targetValue:t.targetValue == null ? null : t.targetValue,
      progressionCurve:t.progressionCurve || null,
      progressionNotes:t.progressionNotes || null,
      kind:t.kind || 'task',
    }, { merge:true }));
    await trackOperation('platform path save', withTimeout(batch.commit(), WRITE_TIMEOUT_MS, 'save platform path'));
    const record = { id, path:{ ...path, ownerId }, sections, tasks, membership: ownerSaving ? { uid:ownerId, role:'owner' } : local.membership, childrenLoaded:true };
    upsertPlatformPath(record);
    flash('Path synced');
    return record;
  }catch(e){
    console.warn('save platform path:', syncErrorMessage(e, 'Could not sync this path. Your local draft is still safe.'));
    return null;
  }
}

async function findPathByClientSaveId(clientSaveId){
  if(!cloudActive() || !clientSaveId) return null;
  const pathsCol = fb.collection(fb.db, 'paths');
  const q = fb.query(pathsCol, fb.where('ownerId', '==', store.currentUser.uid), fb.where('clientSaveId', '==', clientSaveId));
  const snap = await withTimeout(fb.getDocs(q), READ_TIMEOUT_MS, 'find saved path');
  return snap.docs[0] || null;
}

export async function dbCreatePlatformPath(localPath, sourceId){
  if(!cloudActive()) return null;
  const clientSaveId = localPath.clientSaveId || null;
  if(clientSaveId){
    try{
      const existingSnap = await findPathByClientSaveId(clientSaveId);
      if(existingSnap){
        const existingRecord = await loadPlatformRecordFromDoc(existingSnap, true);
        upsertPlatformPath(existingRecord);
        return existingSnap.id;
      }
    }catch(e){ console.warn('find saved path:', syncErrorMessage(e, 'This is taking too long. Check your connection and try again.')); }
  }
  const ref = fb.doc(fb.collection(fb.db, 'paths'));
  const id = ref.id;
  const previous = store.state.userPaths[id];
  store.state.userPaths[id] = {
    ...localPath,
    visibility: localPath.visibility || 'private',
    discoverable: !!localPath.discoverable,
    migratedFromLocal: !!sourceId,
    platform: true,
    ownerId: store.currentUser.uid,
    clientSaveId,
  };
  const saved = await dbSavePlatformPath(id);
  if(!saved){
    if(previous) store.state.userPaths[id] = previous;
    else delete store.state.userPaths[id];
    delete store.platformPaths[id];
    await dbSaveState();
    return null;
  }
  return id;
}

export async function dbRequestAccess(pathId){
  if(!cloudActive()) return false;
  try{
    await fb.setDoc(accessRequestRef(pathId, store.currentUser.uid), {
      requesterId: store.currentUser.uid,
      requesterName: store.currentUser.displayName || '',
      requesterEmail: store.currentUser.email || '',
      status: 'pending',
      requestedAt: new Date(),
      resolvedAt: null,
    }, { merge:true });
    store.accessRequests[pathId] = { status:'pending' };
    flash('Access requested');
    return true;
  }catch(e){
    console.warn('request access:', e);
    return false;
  }
}

export async function dbLoadMyAccessRequest(pathId){
  if(!cloudActive()) return null;
  try{
    const snap = await fb.getDoc(accessRequestRef(pathId, store.currentUser.uid));
    const req = snap.exists() ? snap.data() : null;
    if(req) store.accessRequests[pathId] = req;
    return req;
  }catch(e){ return null; }
}
