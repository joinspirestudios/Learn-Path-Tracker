// ── header.js ─────────────────────────────────────────────────────────────
// Chrome rendering: the kicker / brand-sub, the auth pill, and the overall
// progress ring + week bar. Called from views after a state change.

import { store } from './store.js';
import { $, esc } from './helpers.js';
import { configPresent } from './db.js';
import { firstName, cachedAuthLabel, doSignOut, openAuthModal } from './auth.js';
import { isUserPath, pathTitle, allTotals, weekObj, weekProg } from './plan.js';

export function applyHeader(){
  const k = $('kicker'), sub = $('brandSub'), inSkill = !!store.state.current;
  const user = inSkill && isUserPath(store.state.current);
  const fn = firstName();
  k.textContent = fn ? ('WELCOME, ' + fn.toUpperCase()) : 'LEARN · PRACTICE · TRACK';
  sub.textContent = inSkill ? pathTitle(store.state.current) : 'Pick a skill. Practice deliberately. Track your climb.';
  $('startWrap').style.display    = (inSkill && !user) ? '' : 'none';
  $('overallWrap').style.display  = inSkill ? '' : 'none';
  $('tabs').style.display         = inSkill ? '' : 'none';
  document.querySelectorAll('.tab-cine').forEach(b => b.style.display = (inSkill && !user) ? '' : 'none');
  document.querySelectorAll('.tab-user').forEach(b => b.style.display = user ? '' : 'none');
  const signedInish = !!store.currentUser || (!store.authChecked && !!cachedAuthLabel());
  const ep = $('editPathBtn');
  if(ep){
    ep.style.display = (inSkill && !user && signedInish) ? '' : 'none';
    ep.textContent = store.editMode ? 'Done editing ✓' : '✎ Edit path';
    ep.classList.toggle('editing', store.editMode);
  }
  setAuthUI();
}

export function setAuthUI(){
  const el = $('auth'); if(!el) return;
  if(!configPresent()){
    el.innerHTML = '<span class="auth-pill"><span class="d"></span> Local mode</span>';
    return;
  }
  if(store.currentUser){
    const label = store.currentUser.displayName || store.currentUser.email || 'signed in';
    el.innerHTML = '<span class="auth-pill on"><span class="d"></span> '
      + esc(label.length > 22 ? label.slice(0,20) + '…' : label)
      + '</span><button class="linklike" id="soBtn">sign out</button>';
    const b = $('soBtn'); if(b) b.onclick = doSignOut;
  } else if(!store.authChecked && cachedAuthLabel()){
    // optimistic: a session likely exists; show a quiet pending pill rather than flashing the button
    const label = cachedAuthLabel();
    el.innerHTML = '<span class="auth-pill on pending"><span class="d"></span> '
      + esc(label.length > 22 ? label.slice(0,20) + '…' : label) + '</span>';
  } else {
    el.innerHTML = '<button class="gbtn" id="siBtn">Sign up</button>'
      + '<button class="linklike" id="liBtn">log in</button>';
    const b = $('siBtn'); if(b) b.onclick = () => openAuthModal('signup');
    const l = $('liBtn'); if(l) l.onclick = () => openAuthModal('login');
  }
}

export function updateOverall(){
  if(!store.state.current) return;
  const { done, total } = allTotals();
  const pct = total ? Math.round(done / total * 100) : 0;
  const C = 144.5;
  $('ringPct').textContent = pct + '%';
  $('ringFg').style.strokeDashoffset = String(C - (C * pct / 100));
  $('doneCount').textContent = done;
  $('weekCount').textContent = 'of ' + total;
  const wb = $('weekBar');
  if(wb && !isUserPath(store.state.current)){
    const p = weekProg(weekObj(store.currentWeek));
    wb.style.width = (p.total ? p.done / p.total * 100 : 0) + '%';
    const wt = $('weekBarTxt'); if(wt) wt.textContent = p.done + '/' + p.total;
  }
}
