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

export function configPresent(){ return fb.present; }
export function cloudActive(){ return fb.ready && !!store.currentUser; }

let _cloudSaveTimer = null;

export async function dbLoadState(){
  if(cloudActive()){
    try{
      const ref = fb.doc(fb.db, 'users', store.currentUser.uid, 'state', 'main');
      const snap = await fb.getDoc(ref);
      if(snap.exists()) return migrateState(snap.data().bundle || {});
    }catch(e){ console.warn(e); }
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
        await fb.setDoc(ref, { bundle: store.state }, { merge: true });
        flash('Synced ✓');
      }catch(e){ console.warn('cloud sync:', e); }
    }, 500);
  }
}

export async function dbLoadRenders(){
  if(cloudActive()){
    try{
      const col = fb.collection(fb.db, 'users', store.currentUser.uid, 'renders');
      const snap = await fb.getDocs(col);
      const arr = []; snap.forEach(d => arr.push(d.data()));
      return arr;
    }catch(e){ console.warn(e); return []; }
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
      await fb.setDoc(ref, en);
    }catch(e){ console.warn(e); }
    return;
  }
  await Store.set(CAT_PREFIX + en.id, JSON.stringify(en));
}

export async function dbDelRender(id){
  if(cloudActive()){
    try{
      const ref = fb.doc(fb.db, 'users', store.currentUser.uid, 'renders', id);
      await fb.deleteDoc(ref);
    }catch(e){ console.warn(e); }
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
    freezeCount: Number(data.freezeCount || 0),
    status: cleanEnrollmentStatus(data.status),
    lastCompletedDay: data.lastCompletedDay == null ? null : Number(data.lastCompletedDay),
    createdAt,
    updatedAt: data.updatedAt || createdAt,
  };
}

export function makeDayLog(dayNumber, data = {}){
  const n = Number(data.dayNumber || dayNumber);
  const createdAt = data.createdAt || stamp();
  return {
    dayNumber: n,
    status: cleanDayLogStatus(data.status),
    completedAt: data.completedAt || null,
    summary: data.summary || null,
    evidenceCount: Number(data.evidenceCount || 0),
    createdAt,
    updatedAt: data.updatedAt || createdAt,
  };
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
  const next = { ...enrollment, updatedAt: stamp() };
  delete next.dayLogs;
  if(cloudActive()){
    try{ await fb.setDoc(enrollmentRef(next.id), next, { merge:true }); }
    catch(e){ console.warn('save enrollment:', e); }
  }
  cacheEnrollment(next);
  if(!cloudActive()) await dbSaveState();
  return store.enrollments[next.id];
}

export async function dbSaveDayLog(enrollmentId, dayLog){
  if(!enrollmentId || !dayLog) return null;
  const next = makeDayLog(dayLog.dayNumber, { ...dayLog, updatedAt: stamp() });
  if(cloudActive()){
    try{ await fb.setDoc(dayLogRef(enrollmentId, next.dayNumber), next, { merge:true }); }
    catch(e){ console.warn('save day log:', e); }
  }
  const enrollment = store.enrollments[enrollmentId] || cacheEnrollment({ id: enrollmentId });
  enrollment.dayLogs = enrollment.dayLogs || {};
  enrollment.dayLogs[next.dayNumber] = next;
  cacheEnrollment(enrollment, enrollment.dayLogs);
  if(!cloudActive()) await dbSaveState();
  return next;
}

export async function dbEnsureEnrollment(pathId){
  const userId = (store.currentUser && store.currentUser.uid) || 'local';
  const enrollmentId = enrollmentIdFor(pathId, userId);
  if(cloudActive()){
    try{
      const ref = enrollmentRef(enrollmentId);
      const snap = await fb.getDoc(ref);
      let enrollment;
      if(snap.exists()){
        enrollment = makeEnrollment(pathId, userId, { id: enrollmentId, ...snap.data() });
        if(
          snap.data().pathId == null ||
          snap.data().userId == null ||
          snap.data().currentDay == null ||
          snap.data().status == null
        ){
          await fb.setDoc(ref, enrollment, { merge:true });
        }
      } else {
        enrollment = makeEnrollment(pathId, userId, {
          id: enrollmentId,
          status: 'active',
          currentDay: 1,
          streak: 0,
          freezeCount: 0,
          lastCompletedDay: null,
        });
        await fb.setDoc(ref, enrollment, { merge:true });
      }
      const dayLogs = await loadDayLogs(enrollmentId);
      return cacheEnrollment(enrollment, dayLogs);
    }catch(e){
      console.warn('ensure enrollment:', e);
    }
  }
  const local = store.state.enrollments && store.state.enrollments[enrollmentId];
  if(local) return cacheEnrollment(makeEnrollment(pathId, userId, local), local.dayLogs || {});
  const enrollment = makeEnrollment(pathId, userId, {
    id: enrollmentId,
    status: 'active',
    currentDay: 1,
    streak: 0,
    freezeCount: 0,
    lastCompletedDay: null,
  });
  cacheEnrollment(enrollment, {});
  await dbSaveState();
  return store.enrollments[enrollmentId];
}

function upsertPlatformPath(record){
  if(!record || !record.id) return null;
  const local = platformToLocalPath(record);
  store.platformPaths[record.id] = record;
  store.state.userPaths[record.id] = local;
  return local;
}

async function loadMembership(pathId){
  if(!cloudActive()) return null;
  try{
    const snap = await fb.getDoc(memberRef(pathId, store.currentUser.uid));
    return snap.exists() ? snap.data() : null;
  }catch(e){ return null; }
}

async function loadPathChildren(pathId){
  const sections = [], tasks = [];
  const secSnap = await fb.getDocs(fb.collection(fb.db, 'paths', pathId, 'sections'));
  secSnap.forEach(d => sections.push({ id:d.id, ...d.data() }));
  const taskSnap = await fb.getDocs(fb.collection(fb.db, 'paths', pathId, 'tasks'));
  taskSnap.forEach(d => tasks.push({ id:d.id, ...d.data() }));
  return { sections, tasks };
}

async function loadPlatformRecordFromDoc(docSnap){
  const path = normalizePathDoc(docSnap.id, docSnap.data());
  const membership = await loadMembership(docSnap.id);
  let children = { sections:[], tasks:[] };
  if(canViewPath(path, membership, store.currentUser)){
    children = await loadPathChildren(docSnap.id);
  }
  return { id:docSnap.id, path, membership, ...children };
}

export async function dbLoadPlatformPath(id){
  if(!fb.ready) return null;
  try{
    const snap = await fb.getDoc(pathRef(id));
    if(!snap.exists()) return null;
    const record = await loadPlatformRecordFromDoc(snap);
    if(canViewPath(record.path, record.membership, store.currentUser)) upsertPlatformPath(record);
    else store.platformPaths[id] = record;
    return record;
  }catch(e){
    console.warn('load platform path:', e);
    return null;
  }
}

export async function dbLoadPlatformPaths(){
  if(!fb.ready) return [];
  const seen = new Set();
  const records = [];
  async function collect(q){
    try{
      const snap = await fb.getDocs(q);
      for(const d of snap.docs){
        if(seen.has(d.id)) continue;
        seen.add(d.id);
        records.push(await loadPlatformRecordFromDoc(d));
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
    await fb.setDoc(pathRef(id), {
      ...path,
      ownerId,
      updatedAt: new Date(),
      createdAt: (previous && previous.path && previous.path.createdAt) || path.createdAt,
    }, { merge:true });
    if(ownerSaving){
      await fb.setDoc(memberRef(id, ownerId), {
        uid: ownerId,
        role: 'owner',
        addedAt: (previous && previous.path && previous.path.createdAt) || new Date(),
      }, { merge:true });
    }
    const wantedSections = new Set(sections.map(s => s.id));
    const wantedTasks = new Set(tasks.map(t => t.id));
    const oldSections = await fb.getDocs(fb.collection(fb.db, 'paths', id, 'sections'));
    await Promise.all(oldSections.docs.filter(d => !wantedSections.has(d.id)).map(d => fb.deleteDoc(d.ref)));
    const oldTasks = await fb.getDocs(fb.collection(fb.db, 'paths', id, 'tasks'));
    await Promise.all(oldTasks.docs.filter(d => !wantedTasks.has(d.id)).map(d => fb.deleteDoc(d.ref)));
    await Promise.all(sections.map(s => fb.setDoc(sectionRef(id, s.id), {
      title:s.title, description:s.description || '', order:s.order || 0,
    }, { merge:true })));
    await Promise.all(tasks.map(t => fb.setDoc(taskRef(id, t.id), {
      sectionId:t.sectionId,
      title:t.title,
      description:t.description || '',
      resourceUrl:t.resourceUrl || null,
      evidenceRequired:!!t.evidenceRequired,
      order:t.order || 0,
      unlockDay:t.unlockDay == null ? null : t.unlockDay,
      kind:t.kind || 'task',
    }, { merge:true })));
    const record = { id, path:{ ...path, ownerId }, sections, tasks, membership: ownerSaving ? { uid:ownerId, role:'owner' } : local.membership };
    upsertPlatformPath(record);
    flash('Path synced');
    return record;
  }catch(e){
    console.warn('save platform path:', e);
    return null;
  }
}

export async function dbCreatePlatformPath(localPath, sourceId){
  if(!cloudActive()) return null;
  const ref = fb.doc(fb.collection(fb.db, 'paths'));
  const id = ref.id;
  store.state.userPaths[id] = {
    ...localPath,
    visibility: localPath.visibility || 'private',
    discoverable: !!localPath.discoverable,
    migratedFromLocal: !!sourceId,
    platform: true,
    ownerId: store.currentUser.uid,
  };
  await dbSavePlatformPath(id);
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
