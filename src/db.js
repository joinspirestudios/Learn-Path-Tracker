// ── db.js ─────────────────────────────────────────────────────────────────
// Persistence layer. All Firestore + localStorage access funnels through here
// so the rest of the app can stay storage-agnostic. Cloud writes are debounced;
// local mirror is instant.

import { fb } from './firebase.js';
import { store, STATE_KEY, CAT_PREFIX, LEGACY_KEY, migrateState } from './store.js';
import { Store, flash } from './helpers.js';

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
