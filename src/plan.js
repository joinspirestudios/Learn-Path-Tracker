// ── plan.js ───────────────────────────────────────────────────────────────
// Domain logic for skills, weeks, ladders, progress, and streaks.
// Reads from store.state and computes derived views; no DOM, no I/O.

import { SKILLS } from './data.js';
import { store } from './store.js';
import { dstr, addDays } from './helpers.js';

/* ---- skill accessors ---- */
export function skillDef(id){ return SKILLS.find(s => s.id === id); }
export function ensureSkill(id){
  if(!store.state.skills[id])
    store.state.skills[id] = { progress:{}, notes:{}, meta:{ startDate:null, lastWeek:1 } };
  return store.state.skills[id];
}
export function curState(){ return store.state.current ? ensureSkill(store.state.current) : null; }
export function curDef(){   return store.state.current ? skillDef(store.state.current) : null; }
export function P(){        return curState().progress; }
export function quarters(){ return curDef().quarters; }
export function days(){     return curDef().days; }
export function ladders(){  return curDef().ladders; }

/* ---- built-in path overlay (editable focus/resources + add/remove weeks) ---- */
export function weekEdits(id){
  const sk = ensureSkill(id || store.state.current);
  sk.edits = sk.edits || { focus:{}, res:{}, added:[], removed:[], seq:0 };
  sk.edits.focus   = sk.edits.focus   || {};
  sk.edits.res     = sk.edits.res     || {};
  sk.edits.added   = sk.edits.added   || [];
  sk.edits.removed = sk.edits.removed || [];
  return sk.edits;
}
export function effPlanFor(id){
  const def = skillDef(id); if(!def) return [];
  const e = (store.state.skills[id] && store.state.skills[id].edits) || {};
  const removed = new Set(e.removed || []);
  const fo = e.focus || {}, ro = e.res || {};
  const weeks = def.plan
    .filter(wk => !removed.has(wk.w))
    .map(wk => {
      const o = { ...wk };
      if(fo[wk.w] != null) o.focus = fo[wk.w];
      if(ro[wk.w] != null) o.res   = ro[wk.w];
      return o;
    });
  (e.added || []).forEach(a => { if(!removed.has(a.w)) weeks.push({ ...a, _added:true }); });
  return weeks;
}
export function effPlan(){ return effPlanFor(store.state.current); }
export function isAddedWeek(w){ const e = weekEdits(); return (e.added || []).some(a => a.w === w); }
export function setWeekFocus(w, val){
  const e = weekEdits();
  if(isAddedWeek(w)){ const a = e.added.find(x => x.w === w); a.focus = val; }
  else { e.focus[w] = val; }
}
export function weekResArr(w){
  const e = weekEdits();
  if(isAddedWeek(w)){
    const a = e.added.find(x => x.w === w);
    a.res = a.res || []; return a.res;
  }
  if(e.res[w] == null){
    const wk = skillDef(store.state.current).plan.find(x => x.w === w);
    e.res[w] = (wk && wk.res) ? wk.res.map(r => ({ l:r.l, u:r.u })) : [];
  }
  return e.res[w];
}
export function addCineWeek(q){
  const e = weekEdits();
  e.seq = (e.seq || 0) + 1;
  const w = 1000 + e.seq;
  e.added.push({ w, q: q || 1, focus:'New week - set your focus', res:[] });
  return w;
}
export function removeCineWeek(w){
  const e = weekEdits();
  if(!e.removed.includes(w)) e.removed.push(w);
}

/* ---- user-created paths ---- */
export function isUserPath(id){ return !!(store.state.userPaths && store.state.userPaths[id]); }
export function userDef(id){    return store.state.userPaths[id]; }
export function curUser(){
  return store.state.current && isUserPath(store.state.current)
    ? store.state.userPaths[store.state.current] : null;
}

/* ---- title / goal (handles built-in with owner override + user paths) ---- */
export function pathTitle(id){
  if(isUserPath(id)) return store.state.userPaths[id].title || 'Untitled path';
  const sk = store.state.skills[id];
  return (sk && sk.meta && sk.meta.title) || skillDef(id).title;
}
export function pathGoal(id){
  if(isUserPath(id)) return store.state.userPaths[id].goal || '';
  const sk = store.state.skills[id];
  const g = sk && sk.meta && sk.meta.goal;
  return (g != null && g !== '') ? g : skillDef(id).tagline;
}
export function allPathIds(){
  return SKILLS.map(s => s.id).concat(Object.keys(store.state.userPaths || {}));
}

/* ---- week / day helpers ---- */
export function weekObj(w){ return effPlan().find(x => x.w === w); }
export function wedLabel(wk){ const q = quarters()[wk.q]; return wk.wed || (q && q.wed) || 'Reference study / catch-up'; }
export function dayLabel(wk, d){ return d.k === 'wed' ? wedLabel(wk) : d.l; }
export function weekTaskIds(wk){
  const ids = [];
  days().forEach(d => { ids.push('w'+wk.w+'.'+d.k); ids.push('w'+wk.w+'.'+d.k+'.t'); });
  (wk.res || []).forEach((_, i) => ids.push('w'+wk.w+'.r'+i));
  return ids;
}
export function weekProg(wk){
  const p = P(); const ids = weekTaskIds(wk);
  return { done: ids.filter(id => p[id]).length, total: ids.length };
}
export function ladderCount(key, rungs){
  const p = P(); let d = 0;
  rungs.forEach((_, i) => { if(p['L'+key+i]) d++; });
  return d;
}
export function nextRungIdx(key, rungs){
  const p = P();
  for(let i=0; i<rungs.length; i++){ if(!p['L'+key+i]) return i; }
  return -1;
}

/* ---- totals (whole-path progress for any skill, built-in or user) ---- */
export function totalsFor(id){
  const p = (store.state.skills[id] && store.state.skills[id].progress) || {};
  let done = 0, total = 0;
  if(isUserPath(id)){
    (store.state.userPaths[id].weeks || []).forEach((wk, wi) => {
      (wk.tasks     || []).forEach((_, ti) => { total++; if(p[id+':w'+wi+':t'+ti]) done++; });
      (wk.resources || []).forEach((_, ri) => { total++; if(p[id+':w'+wi+':r'+ri]) done++; });
    });
    return { done, total };
  }
  const def = skillDef(id);
  effPlanFor(id).forEach(wk => {
    const ids = [];
    def.days.forEach(d => { ids.push('w'+wk.w+'.'+d.k); ids.push('w'+wk.w+'.'+d.k+'.t'); });
    (wk.res || []).forEach((_, i) => ids.push('w'+wk.w+'.r'+i));
    ids.forEach(i => { total++; if(p[i]) done++; });
  });
  def.ladders.forEach(l => {
    l.rungs.forEach((_, i) => { total++; if(p['L'+l.key+i]) done++; });
  });
  return { done, total };
}
export function allTotals(){ return totalsFor(store.state.current); }

/* ---- date / streak ---- */
export function computeStreak(){
  const a = (curState().meta.activity) || {};
  let n = 0; let d = new Date();
  if(!a[dstr(d)]){ d = addDays(d, -1); if(!a[dstr(d)]) return 0; }
  while(a[dstr(d)]){ n++; d = addDays(d, -1); }
  return n;
}

/* ---- current week (from a saved start-date) ---- */
export function currentWeekFromStart(){
  const m = curState().meta;
  if(!m.startDate) return null;
  const ep = effPlan();
  if(!ep.length) return null;
  const daysSince = Math.floor((new Date() - new Date(m.startDate)) / 86400000);
  const pos = Math.max(1, Math.min(ep.length, Math.floor(daysSince / 7) + 1));
  return ep[pos-1] ? ep[pos-1].w : null;
}
