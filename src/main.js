// ── Learn Path Tracker - app logic (multi-skill) ──────────────────────────
import './styles.css';
import { SKILLS } from './data.js';
import { fb } from './firebase.js';

const $ = (id) => document.getElementById(id);

/* ---------- LOCAL STORE (fallback when not signed in / no config) ---------- */
const STATE_KEY = 'lpt_state', CAT_PREFIX = 'lpt_cat:';
const Store = {
  async get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  async set(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } },
  async del(k){ try{ localStorage.removeItem(k); }catch(e){} },
  async list(p){ try{ const a=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.indexOf(p)===0)a.push(k);} return a; }catch(e){ return []; } }
};

/* ---------- CLOUD / AUTH ---------- */
let currentUser = null;
function configPresent(){ return fb.present; }
function cloudActive(){ return fb.ready && !!currentUser; }
function initFirebase(){
  if(fb.ready){
    fb.onAuthStateChanged(fb.auth, onAuth);
    fb.getRedirectResult(fb.auth).catch(e => console.warn('redirect result:', e && e.code, e));
  }
  return fb.ready;
}
async function signIn(){
  if(!fb.ready){ alert("Cloud sync isn't configured - add your Firebase env vars (see README)."); return; }
  const provider = new fb.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try{
    await fb.signInWithPopup(fb.auth, provider);
  }catch(e){
    const code = (e && e.code) ? e.code : String(e);
    console.warn('sign-in error:', code, e);
    if(code === 'auth/operation-not-allowed'){ alert("Google sign-in isn't enabled. Firebase → Authentication → Sign-in method → enable Google."); return; }
    if(code === 'auth/unauthorized-domain'){ alert("This domain isn't authorized. Firebase → Authentication → Settings → Authorized domains."); return; }
    if(['auth/popup-blocked','auth/popup-closed-by-user','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment','auth/web-storage-unsupported','auth/internal-error'].includes(code)){
      try{ await fb.signInWithRedirect(fb.auth, provider); }
      catch(e2){ alert('Redirect sign-in also failed: ' + ((e2 && e2.code) || e2)); }
      return;
    }
    alert('Sign-in failed: ' + code);
  }
}
function authMsg(code){
  return ({
    'auth/email-already-in-use':'That email already has an account. Try logging in instead.',
    'auth/invalid-email':'That email address looks invalid.',
    'auth/weak-password':'Password is too weak (use at least 6 characters).',
    'auth/wrong-password':'Wrong password. Try again or reset it.',
    'auth/user-not-found':'No account with that email. Create one instead.',
    'auth/invalid-credential':'Email or password is incorrect.',
    'auth/operation-not-allowed':'Email sign-in is not enabled yet. Firebase → Authentication → Sign-in method → enable Email/Password.',
    'auth/too-many-requests':'Too many attempts. Wait a moment and try again.'
  })[code] || ('Could not continue: ' + code);
}
async function emailSignup(name,email,pw){
  const cred = await fb.createUserWithEmailAndPassword(fb.auth, email, pw);
  if(name){ try{ await fb.updateProfile(cred.user, { displayName: name }); }catch(e){} }
}
async function emailLogin(email,pw){ await fb.signInWithEmailAndPassword(fb.auth, email, pw); }
async function doSignOut(){ try{ await fb.signOut(fb.auth); }catch(e){ console.warn(e); } }

/* cache the last signed-in label so refreshes don't flash the sign-in button */
function cacheAuthLabel(u){ try{ localStorage.setItem('lpt_auth', u.displayName || u.email || '1'); }catch(e){} }
function clearAuthLabel(){ try{ localStorage.removeItem('lpt_auth'); }catch(e){} }
function cachedAuthLabel(){ try{ return localStorage.getItem('lpt_auth'); }catch(e){ return null; } }

let authChecked = false;
async function onAuth(user){
  authChecked = true;
  currentUser = user || null;
  if(user){ cacheAuthLabel(user); await onSignIn(); }
  else { clearAuthLabel(); applyHeader(); } // local view already rendered; just fix the header
}

/* ---------- STATE ---------- */
let state = { current:null, skills:{}, userPaths:{} };   // skills[id]=progress/meta; userPaths[id]=owner-created path def
let catalogue = [];                        // every render entry, each carries .skill
let activeTab = 'week', currentWeek = 1, noteTimer = null;

/* ---------- DB LAYER ---------- */
async function dbLoadState(){
  if(cloudActive()){
    try{ const ref=fb.doc(fb.db,'users',currentUser.uid,'state','main'); const snap=await fb.getDoc(ref); if(snap.exists()) return snap.data().bundle||{}; }catch(e){ console.warn(e); }
    return {};
  }
  const raw=await Store.get(STATE_KEY);
  if(raw){ try{ return JSON.parse(raw); }catch(e){} }
  // legacy single-skill format → wrap as the cinematic skill
  const old=await Store.get('dp_state');
  if(old){ try{ const o=JSON.parse(old); return { current:null, skills:{ cinematic:{ progress:o.progress||{}, notes:o.notes||{}, meta:o.meta||{startDate:null,lastWeek:1} } } }; }catch(e){} }
  return {};
}
async function dbSaveState(){
  // Always mirror locally first so a refresh restores instantly (local-first).
  try{ localStorage.setItem(STATE_KEY, JSON.stringify(state)); }catch(e){}
  if(cloudActive()){ try{ const ref=fb.doc(fb.db,'users',currentUser.uid,'state','main'); await fb.setDoc(ref,{bundle:state},{merge:true}); }catch(e){ console.warn(e); } }
  flash();
}
async function dbLoadRenders(){
  if(cloudActive()){ try{ const col=fb.collection(fb.db,'users',currentUser.uid,'renders'); const snap=await fb.getDocs(col); const arr=[]; snap.forEach(d=>arr.push(d.data())); return arr; }catch(e){ console.warn(e); return []; } }
  const keys=await Store.list(CAT_PREFIX); const arr=[]; for(const k of keys){ try{ const v=await Store.get(k); if(v)arr.push(JSON.parse(v)); }catch(e){} } return arr;
}
async function dbSaveRender(en){
  if(cloudActive()){ try{ const ref=fb.doc(fb.db,'users',currentUser.uid,'renders',en.id); await fb.setDoc(ref,en); }catch(e){ console.warn(e); } return; }
  await Store.set(CAT_PREFIX+en.id, JSON.stringify(en));
}
async function dbDelRender(id){
  if(cloudActive()){ try{ const ref=fb.doc(fb.db,'users',currentUser.uid,'renders',id); await fb.deleteDoc(ref); }catch(e){ console.warn(e); } return; }
  await Store.del(CAT_PREFIX+id);
}

/* ---------- SKILL ACCESSORS ---------- */
function skillDef(id){ return SKILLS.find(s => s.id === id); }
function ensureSkill(id){ if(!state.skills[id]) state.skills[id] = { progress:{}, notes:{}, meta:{startDate:null,lastWeek:1} }; return state.skills[id]; }
function curState(){ return state.current ? ensureSkill(state.current) : null; }
function curDef(){ return state.current ? skillDef(state.current) : null; }
function P(){ return curState().progress; }
function quarters(){ return curDef().quarters; }
function days(){ return curDef().days; }
function ladders(){ return curDef().ladders; }

/* ---------- HELPERS ---------- */
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function weekObj(w){ return curDef().plan.find(x => x.w === w); }
function wedLabel(wk){ return wk.wed || quarters()[wk.q].wed; }
function dayLabel(wk,d){ return d.k === 'wed' ? wedLabel(wk) : d.l; }
function weekTaskIds(wk){ const ids=[]; days().forEach(d=>{ ids.push('w'+wk.w+'.'+d.k); ids.push('w'+wk.w+'.'+d.k+'.t'); }); (wk.res||[]).forEach((_,i)=>ids.push('w'+wk.w+'.r'+i)); return ids; }
function weekProg(wk){ const p=P(); const ids=weekTaskIds(wk); return { done: ids.filter(id=>p[id]).length, total: ids.length }; }
function ladderCount(key,rungs){ const p=P(); let d=0; rungs.forEach((_,i)=>{ if(p['L'+key+i]) d++; }); return d; }
function totalsFor(id){
  const p=(state.skills[id]&&state.skills[id].progress)||{}; let done=0,total=0;
  if(isUserPath(id)){
    (state.userPaths[id].weeks||[]).forEach((wk,wi)=>{
      (wk.tasks||[]).forEach((_,ti)=>{ total++; if(p[id+':w'+wi+':t'+ti])done++; });
      (wk.resources||[]).forEach((_,ri)=>{ total++; if(p[id+':w'+wi+':r'+ri])done++; });
    });
    return { done, total };
  }
  const def=skillDef(id);
  def.plan.forEach(wk=>{ const ids=[]; def.days.forEach(d=>{ ids.push('w'+wk.w+'.'+d.k); ids.push('w'+wk.w+'.'+d.k+'.t'); }); (wk.res||[]).forEach((_,i)=>ids.push('w'+wk.w+'.r'+i)); ids.forEach(i=>{ total++; if(p[i])done++; }); });
  def.ladders.forEach(l=>{ l.rungs.forEach((_,i)=>{ total++; if(p['L'+l.key+i])done++; }); });
  return { done, total };
}
function allTotals(){ return totalsFor(state.current); }
/* user-created paths */
function isUserPath(id){ return !!(state.userPaths && state.userPaths[id]); }
function userDef(id){ return state.userPaths[id]; }
function curUser(){ return state.current && isUserPath(state.current) ? state.userPaths[state.current] : null; }
/* title + goal work for built-in (with owner override) and user paths */
function pathTitle(id){ if(isUserPath(id)) return state.userPaths[id].title || 'Untitled path'; const sk=state.skills[id]; return (sk && sk.meta && sk.meta.title) || skillDef(id).title; }
function pathGoal(id){ if(isUserPath(id)){ return state.userPaths[id].goal || ''; } const sk=state.skills[id]; const g=sk && sk.meta && sk.meta.goal; return (g!=null && g!=='') ? g : skillDef(id).tagline; }
function allPathIds(){ return SKILLS.map(s=>s.id).concat(Object.keys(state.userPaths||{})); }
/* dates + streak */
function dstr(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function todayKey(){ const order=['mon','tue','wed','thu','fri','sat','sun']; return order[(new Date().getDay()+6)%7]; }
function computeStreak(){
  const a=(curState().meta.activity)||{}; let n=0; let d=new Date();
  if(!a[dstr(d)]){ d=addDays(d,-1); if(!a[dstr(d)]) return 0; } // today not yet done? count from yesterday
  while(a[dstr(d)]){ n++; d=addDays(d,-1); }
  return n;
}
function flash(){ const s=$('saved'); if(!s)return; s.textContent = cloudActive() ? 'Synced ✓' : 'Saved ✓'; s.classList.add('show'); clearTimeout(flash._t); flash._t=setTimeout(()=>s.classList.remove('show'),1100); }
async function toggle(id,val){ const p=P(); if(val){ p[id]=true; const m=curState().meta; (m.activity=m.activity||{})[dstr(new Date())]=true; } else delete p[id]; updateOverall(); await dbSaveState(); }

function updateOverall(){
  if(!state.current) return;
  const{done,total}=allTotals(); const pct=total?Math.round(done/total*100):0; const C=144.5;
  $('ringPct').textContent=pct+'%';
  $('ringFg').style.strokeDashoffset=String(C-(C*pct/100));
  $('doneCount').textContent=done;
  $('weekCount').textContent='of '+total;
  const wb=$('weekBar');
  if(wb && !isUserPath(state.current)){ const p=weekProg(weekObj(currentWeek)); wb.style.width=(p.total?p.done/p.total*100:0)+'%'; const wt=$('weekBarTxt'); if(wt)wt.textContent=p.done+'/'+p.total; }
}

/* ---------- HEADER / PERSONALIZATION ---------- */
function firstName(){
  const n = currentUser ? (currentUser.displayName || (currentUser.email||'').split('@')[0]) : (!authChecked ? cachedAuthLabel() : '');
  return n ? String(n).split(' ')[0] : '';
}
function applyHeader(){
  const k=$('kicker'), sub=$('brandSub'), inSkill=!!state.current;
  const user = inSkill && isUserPath(state.current);
  const fn=firstName();
  k.textContent = fn ? ('WELCOME, ' + fn.toUpperCase()) : 'LEARN · PRACTICE · TRACK';
  sub.textContent = inSkill ? pathTitle(state.current) : 'Pick a skill. Practice deliberately. Track your climb.';
  $('startWrap').style.display = (inSkill && !user) ? '' : 'none';
  $('overallWrap').style.display = inSkill ? '' : 'none';
  $('tabs').style.display = inSkill ? '' : 'none';
  document.querySelectorAll('.tab-cine').forEach(b=>b.style.display = (inSkill && !user) ? '' : 'none');
  document.querySelectorAll('.tab-user').forEach(b=>b.style.display = user ? '' : 'none');
  const signedInish = !!currentUser || (!authChecked && !!cachedAuthLabel());
  const ep=$('editPathBtn'); if(ep) ep.style.display = (inSkill && !user && signedInish) ? '' : 'none';
  setAuthUI();
}
function setAuthUI(){
  const el=$('auth'); if(!el) return;
  if(!configPresent()){
    el.innerHTML='<span class="auth-pill"><span class="d"></span> Local mode</span>';
    return;
  }
  if(currentUser){
    const label = currentUser.displayName || currentUser.email || 'signed in';
    el.innerHTML='<span class="auth-pill on"><span class="d"></span> '+esc(label.length>22?label.slice(0,20)+'…':label)+'</span><button class="linklike" id="soBtn">sign out</button>';
    const b=$('soBtn'); if(b)b.onclick=doSignOut;
  } else if(!authChecked && cachedAuthLabel()){
    // optimistic: we believe a session exists; show a quiet pill instead of flashing the button
    const label=cachedAuthLabel();
    el.innerHTML='<span class="auth-pill on pending"><span class="d"></span> '+esc(label.length>22?label.slice(0,20)+'…':label)+'</span>';
  } else {
    el.innerHTML='<button class="gbtn" id="siBtn">Sign up</button><button class="linklike" id="liBtn">log in</button>';
    const b=$('siBtn'); if(b)b.onclick=()=>openAuthModal('signup');
    const l=$('liBtn'); if(l)l.onclick=()=>openAuthModal('login');
  }
}

/* ---------- AUTH MODAL (email/password + Google) ---------- */
function openAuthModal(mode){
  if(!fb.ready){ alert("Cloud sync isn't configured - add your Firebase env vars (see README)."); return; }
  const o=document.createElement('div'); o.className='modal-overlay';
  o.innerHTML='<div class="modal-box auth-modal"><div class="modal-head"><h3 id="amTitle"></h3><button class="modal-x">×</button></div>'
    +'<div class="modal-body">'
    +'<div class="am-err" id="amErr"></div>'
    +'<div class="field" id="amNameField"><label>Name</label><input type="text" id="amName" placeholder="What should we call you?" autocomplete="name"/></div>'
    +'<div class="field" style="margin-top:10px"><label>Email</label><input type="email" id="amEmail" placeholder="you@email.com" autocomplete="email"/></div>'
    +'<div class="field" style="margin-top:10px"><label>Password</label><input type="password" id="amPass" placeholder="At least 6 characters" autocomplete="current-password"/></div>'
    +'<button class="linklike am-forgot" id="amForgot" style="margin-top:8px">Forgot password?</button>'
    +'<button class="btn gold am-primary" id="amPrimary" style="width:100%;margin-top:14px"></button>'
    +'<div class="am-or"><span>or</span></div>'
    +'<button class="gbtn am-google" id="amGoogle" style="width:100%;justify-content:center"><span class="gg">G</span> Continue with Google</button>'
    +'<div class="am-toggle" id="amToggle"></div>'
    +'</div></div>';
  document.body.appendChild(o);
  const close=()=>o.remove();
  o.addEventListener('click',e=>{ if(e.target===o)close(); });
  o.querySelector('.modal-x').onclick=close;
  const err=o.querySelector('#amErr');
  const showErr=m=>{ err.textContent=m; err.style.display=m?'block':'none'; };

  function paint(){
    const signup = mode==='signup';
    o.querySelector('#amTitle').textContent = signup ? 'Create your account' : 'Welcome back';
    o.querySelector('#amNameField').style.display = signup ? '' : 'none';
    o.querySelector('#amForgot').style.display = signup ? 'none' : '';
    o.querySelector('#amPrimary').textContent = signup ? 'Create account' : 'Log in';
    o.querySelector('#amPass').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    o.querySelector('#amToggle').innerHTML = signup
      ? 'Already have an account? <button class="linklike" id="amSwap">Log in</button>'
      : 'New here? <button class="linklike" id="amSwap">Create an account</button>';
    o.querySelector('#amSwap').onclick=()=>{ mode = signup ? 'login' : 'signup'; showErr(''); paint(); };
    showErr('');
  }
  paint();

  o.querySelector('#amGoogle').onclick=()=>{ close(); signIn(); };
  o.querySelector('#amForgot').onclick=async()=>{
    const email=o.querySelector('#amEmail').value.trim();
    if(!email){ showErr('Enter your email above first, then tap reset.'); return; }
    try{ await fb.sendPasswordResetEmail(fb.auth, email); showErr('Reset link sent. Check your inbox.'); }
    catch(e){ showErr(authMsg(e&&e.code)); }
  };
  o.querySelector('#amPrimary').onclick=async()=>{
    const name=o.querySelector('#amName').value.trim();
    const email=o.querySelector('#amEmail').value.trim();
    const pw=o.querySelector('#amPass').value;
    if(!email || !pw){ showErr('Enter your email and password.'); return; }
    const btn=o.querySelector('#amPrimary'); btn.disabled=true; btn.textContent='Working...';
    try{
      if(mode==='signup') await emailSignup(name,email,pw); else await emailLogin(email,pw);
      close(); // onAuthStateChanged restores the rest
    }catch(e){ showErr(authMsg(e&&e.code)); btn.disabled=false; paint(); }
  };
}

/* ---------- CATALOG ---------- */
function renderCatalog(){
  let h='<div class="cat-intro"><div class="section-title">Discover <em>learning paths</em></div>'
    +'<div class="muted" style="max-width:640px">Each path is a full deliberate-practice program: a weekly plan, craft ladders, a drill library, curated resources, and a render log. Open one to start learning and tracking your progress, or build your own.</div></div>';
  h+='<div class="cat-grid">';
  SKILLS.forEach(s=>{
    const t=totalsFor(s.id); const pct=t.total?Math.round(t.done/t.total*100):0;
    const started=!!(state.skills[s.id] && Object.keys(state.skills[s.id].progress||{}).length);
    h+='<button class="skill-card" data-id="'+esc(s.id)+'">'
      +'<div class="sc-top">'+esc(pathTitle(s.id))+'</div>'
      +'<div class="sc-tag">'+esc(pathGoal(s.id))+'</div>'
      +'<div class="sc-blurb">'+esc(s.blurb)+'</div>'
      +'<div class="sc-foot"><div class="progress-bar" style="flex:1"><div style="width:'+pct+'%"></div></div><span class="sc-pct">'+pct+'%</span></div>'
      +'<div class="sc-cta">'+(started?'Continue':'Start')+' →</div></button>';
  });
  Object.keys(state.userPaths||{}).forEach(id=>{
    const t=totalsFor(id); const pct=t.total?Math.round(t.done/t.total*100):0;
    const goal=pathGoal(id);
    h+='<button class="skill-card" data-id="'+esc(id)+'">'
      +'<div class="sc-badge">Your path</div>'
      +'<div class="sc-top">'+esc(pathTitle(id))+'</div>'
      +(goal?('<div class="sc-tag">'+esc(goal)+'</div>'):'')
      +'<div class="sc-blurb">'+ (t.total? (t.total+' tasks across '+(state.userPaths[id].weeks||[]).length+' weeks') : 'Empty path. Open it to add weeks and tasks.') +'</div>'
      +'<div class="sc-foot"><div class="progress-bar" style="flex:1"><div style="width:'+pct+'%"></div></div><span class="sc-pct">'+pct+'%</span></div>'
      +'<div class="sc-cta">Open →</div></button>';
  });
  if(currentUser){
    h+='<button class="skill-card create" id="createCard"><div class="sc-plus">＋</div>'
      +'<div class="sc-top">Create your own path</div>'
      +'<div class="sc-blurb">Build a learning path you own and control: your own weeks, tasks, and resources. Edit it anytime.</div>'
      +'<div class="sc-cta">New path →</div></button>';
  } else if(configPresent()){
    h+='<button class="skill-card create" id="signinCard"><div class="sc-plus">＋</div>'
      +'<div class="sc-top">Build your own path</div>'
      +'<div class="sc-blurb">Sign in to create and track your own learning paths, synced across your devices.</div>'
      +'<div class="sc-cta">Sign in to start →</div></button>';
  }
  h+='</div>';
  $('content').innerHTML=h;
  $('content').querySelectorAll('.skill-card[data-id]').forEach(c=>c.onclick=()=>openSkill(c.dataset.id));
  const cc=$('createCard'); if(cc)cc.onclick=createPath;
  const sc=$('signinCard'); if(sc)sc.onclick=()=>openAuthModal('signup');
}
function createPath(){
  const o=document.createElement('div'); o.className='modal-overlay';
  o.innerHTML='<div class="modal-box"><div class="modal-head"><h3>Create a new path</h3><button class="modal-x">×</button></div>'
    +'<div class="modal-body">'
    +'<div class="field"><label>Path name</label><input type="text" id="npTitle" placeholder="e.g. Learn 3D Motion Design" maxlength="80"/></div>'
    +'<div class="field" style="margin-top:12px"><label>Your goal (optional)</label><textarea id="npGoal" placeholder="What does finishing this path look like?"></textarea></div>'
    +'<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button class="btn" id="npCancel">Cancel</button><button class="btn gold" id="npCreate">Create path</button></div>'
    +'</div></div>';
  document.body.appendChild(o);
  const close=()=>o.remove();
  o.addEventListener('click',e=>{ if(e.target===o)close(); });
  o.querySelector('.modal-x').onclick=close;
  o.querySelector('#npCancel').onclick=close;
  o.querySelector('#npCreate').onclick=()=>{
    const title=o.querySelector('#npTitle').value.trim();
    if(!title){ o.querySelector('#npTitle').focus(); return; }
    const goal=o.querySelector('#npGoal').value.trim();
    const id='up_'+Date.now().toString(36)+Math.floor(Math.random()*999).toString(36);
    state.userPaths[id]={ title, goal, created:Date.now(), weeks:[
      { title:'Week 1 - Foundations', tasks:[{text:'Define what good looks like for this skill'},{text:'Find 3 references or examples to study'}], resources:[] }
    ]};
    ensureSkill(id);
    close(); dbSaveState(); openSkill(id); editMode=true; switchTab('plan');
  };
}
function showInfo(title, bodyHtml){
  const o=document.createElement('div'); o.className='modal-overlay';
  o.innerHTML='<div class="modal-box"><div class="modal-head"><h3>'+esc(title)+'</h3><button class="modal-x">×</button></div><div class="modal-body">'+bodyHtml+'</div></div>';
  document.body.appendChild(o);
  const close=()=>o.remove();
  o.addEventListener('click',e=>{ if(e.target===o)close(); });
  o.querySelector('.modal-x').onclick=close;
}
function openSkill(id){
  state.current=id; ensureSkill(id); editMode=false;
  const def=(state.skills[id]&&state.skills[id].meta)||{}; currentWeek=def.lastWeek||1;
  const startTab = isUserPath(id) ? 'plan' : 'today';
  activeTab=startTab;
  dbSaveState(); applyHeader(); if(!isUserPath(id)) refreshSuggest(); updateOverall(); switchTab(startTab);
  window.scrollTo({top:0,behavior:'smooth'});
}
function goCatalog(){ state.current=null; editMode=false; dbSaveState(); applyHeader(); renderCatalog(); window.scrollTo({top:0,behavior:'smooth'}); }

/* ---------- USER-CREATED PATH (Plan view + inline editor) ---------- */
let editMode=false;
function upSave(){ dbSaveState(); }
function upSaveSoft(){ clearTimeout(noteTimer); noteTimer=setTimeout(dbSaveState,650); }
function renderPlan(){
  const id=state.current, def=curUser(); if(!def){ renderCatalog(); return; }
  const p=P(); const t=totalsFor(id); const pct=t.total?Math.round(t.done/t.total*100):0;
  let h='<div class="plan-head"><div><div class="chip" style="margin-bottom:8px">Your path</div>'
    +'<div class="section-title" style="margin:0">'+esc(pathTitle(id))+'</div>'
    +(pathGoal(id)?('<div class="muted" style="margin-top:6px;max-width:640px">'+esc(pathGoal(id))+'</div>'):'')
    +'</div><div style="text-align:right"><button class="btn '+(editMode?'gold':'')+'" id="planEdit">'+(editMode?'Done editing':'✎ Edit')+'</button>'
    +'<div class="muted" style="font-size:12px;margin-top:10px">'+t.done+' / '+t.total+' done · '+pct+'%</div>'
    +'<div class="progress-bar" style="width:220px;max-width:60vw;margin-left:auto"><div style="width:'+pct+'%"></div></div></div></div>';

  if(editMode){
    h+='<div class="panel card edit-meta"><div class="field"><label>Path name</label><input type="text" id="pmTitle" value="'+esc(def.title)+'" maxlength="80"/></div>'
      +'<div class="field" style="margin-top:10px"><label>Goal</label><textarea id="pmGoal" placeholder="What does finishing look like?">'+esc(def.goal||'')+'</textarea></div></div>';
  }

  (def.weeks||[]).forEach((wk,wi)=>{
    h+='<div class="panel card week-block" data-wi="'+wi+'">';
    if(editMode){
      h+='<div class="wb-head"><input type="text" class="wb-title-input" data-wi="'+wi+'" value="'+esc(wk.title||('Week '+(wi+1)))+'" placeholder="Week title"/>'
        +'<button class="icon-btn danger" data-act="delWeek" data-wi="'+wi+'" title="Delete week">🗑</button></div>';
    } else {
      h+='<div class="wb-head"><h3 style="margin:0">'+esc(wk.title||('Week '+(wi+1)))+'</h3></div>';
    }
    (wk.tasks||[]).forEach((tk,ti)=>{
      const tid=id+':w'+wi+':t'+ti;
      if(editMode){
        h+='<div class="row-edit"><input type="text" class="task-input" data-wi="'+wi+'" data-ti="'+ti+'" value="'+esc(tk.text||'')+'" placeholder="Task"/>'
          +'<button class="icon-btn danger" data-act="delTask" data-wi="'+wi+'" data-ti="'+ti+'" title="Remove">×</button></div>';
      } else {
        h+='<label class="task-row '+(p[tid]?'done':'')+'"><input type="checkbox" class="ck" data-id="'+tid+'" '+(p[tid]?'checked':'')+'/><span>'+esc(tk.text||'')+'</span></label>';
      }
    });
    if(editMode) h+='<button class="add-link" data-act="addTask" data-wi="'+wi+'">+ Add task</button>';
    // resources
    (wk.resources||[]).forEach((r,ri)=>{
      const rid=id+':w'+wi+':r'+ri;
      if(editMode){
        h+='<div class="row-edit res"><input type="text" class="res-label" data-wi="'+wi+'" data-ri="'+ri+'" value="'+esc(r.label||'')+'" placeholder="Resource name"/>'
          +'<input type="text" class="res-url" data-wi="'+wi+'" data-ri="'+ri+'" value="'+esc(r.url||'')+'" placeholder="https://..."/>'
          +'<button class="icon-btn danger" data-act="delRes" data-wi="'+wi+'" data-ri="'+ri+'" title="Remove">×</button></div>';
      } else if(r.url || r.label){
        h+='<div class="res-item"><input type="checkbox" class="ck sm" data-id="'+rid+'" '+(p[rid]?'checked':'')+'/><div class="rl"><a href="'+esc(r.url||'#')+'" target="_blank" rel="noopener">'+esc(r.label||r.url)+'</a></div><a class="ext" href="'+esc(r.url||'#')+'" target="_blank" rel="noopener">open ↗</a></div>';
      }
    });
    if(editMode) h+='<button class="add-link" data-act="addRes" data-wi="'+wi+'">+ Add resource</button>';
    h+='</div>';
  });

  if(editMode){
    h+='<button class="btn add-week" data-act="addWeek">+ Add week</button>';
    h+='<div class="danger-zone"><button class="linklike danger" data-act="delPath">Delete this path</button></div>';
  }
  $('content').innerHTML=h;

  // view-mode checkboxes
  $('content').querySelectorAll('input.ck').forEach(cb=>cb.addEventListener('change',async e=>{ await toggle(e.target.dataset.id,e.target.checked); const r=e.target.closest('.task-row'); if(r)r.classList.toggle('done',e.target.checked); }));
  // edit button
  $('planEdit').onclick=()=>{ editMode=!editMode; renderPlan(); };
  if(!editMode) return;

  // edit-mode wiring
  const pm=$('pmTitle'); if(pm)pm.addEventListener('input',e=>{ def.title=e.target.value; applyHeader(); upSaveSoft(); });
  const pg=$('pmGoal'); if(pg)pg.addEventListener('input',e=>{ def.goal=e.target.value; upSaveSoft(); });
  $('content').querySelectorAll('.wb-title-input').forEach(inp=>inp.addEventListener('input',e=>{ def.weeks[+e.target.dataset.wi].title=e.target.value; upSaveSoft(); }));
  $('content').querySelectorAll('.task-input').forEach(inp=>inp.addEventListener('input',e=>{ def.weeks[+e.target.dataset.wi].tasks[+e.target.dataset.ti].text=e.target.value; upSaveSoft(); }));
  $('content').querySelectorAll('.res-label').forEach(inp=>inp.addEventListener('input',e=>{ def.weeks[+e.target.dataset.wi].resources[+e.target.dataset.ri].label=e.target.value; upSaveSoft(); }));
  $('content').querySelectorAll('.res-url').forEach(inp=>inp.addEventListener('input',e=>{ def.weeks[+e.target.dataset.wi].resources[+e.target.dataset.ri].url=e.target.value; upSaveSoft(); }));
  $('content').querySelectorAll('[data-act]').forEach(btn=>btn.onclick=()=>{
    const act=btn.dataset.act, wi=+btn.dataset.wi, ti=+btn.dataset.ti, ri=+btn.dataset.ri;
    if(act==='addTask'){ (def.weeks[wi].tasks=def.weeks[wi].tasks||[]).push({text:''}); }
    else if(act==='delTask'){ def.weeks[wi].tasks.splice(ti,1); }
    else if(act==='addRes'){ (def.weeks[wi].resources=def.weeks[wi].resources||[]).push({label:'',url:''}); }
    else if(act==='delRes'){ def.weeks[wi].resources.splice(ri,1); }
    else if(act==='addWeek'){ def.weeks.push({title:'Week '+(def.weeks.length+1),tasks:[{text:''}],resources:[]}); }
    else if(act==='delWeek'){ if(confirm('Delete this week and its tasks?')) def.weeks.splice(wi,1); else return; }
    else if(act==='delPath'){ if(confirm('Delete this entire path? This cannot be undone.')){ delete state.userPaths[id]; delete state.skills[id]; dbSaveState(); goCatalog(); return; } else return; }
    upSave(); renderPlan();
  });
}

/* ---------- RENDER: TODAY ---------- */
function renderToday(){
  const def=curDef(), cs=curState();
  const wkNum = cs.meta.startDate ? currentWeekFromStart() : currentWeek;
  const wk=weekObj(wkNum), q=quarters()[wk.q];
  const tk=todayKey(), dayDef=def.days.find(d=>d.k===tk)||def.days[0];
  const bid='w'+wk.w+'.'+dayDef.k, tid=bid+'.t';
  const streak=computeStreak(), wp=weekProg(wk), wpct=wp.total?Math.round(wp.done/wp.total*100):0;
  const dayNames={mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday',sun:'Sunday'};
  let h='<div class="today-grid">';
  // left: today's session
  h+='<div class="panel card today-main">';
  h+='<div class="goal-line">'+esc(pathGoal(state.current))+'</div>';
  h+='<div class="today-kicker">'+esc(dayNames[tk]||'Today')+' · Week '+wk.w+' of '+def.plan.length+'</div>';
  if(!cs.meta.startDate) h+='<div class="hint" style="margin:10px 0">Set a <b>start date</b> in the header to lock your weekly schedule. Showing Week 1 for now.</div>';
  h+='<div class="today-task '+(P()[bid]?'done':'')+'"><input type="checkbox" class="ck" data-id="'+bid+'" '+(P()[bid]?'checked':'')+'/>'
    +'<div><div class="tt-title">'+esc(dayLabel(wk,dayDef))+'</div><div class="tt-sub">'+esc(dayDef.s)+'</div></div></div>';
  h+='<label class="taste today-taste"><input type="checkbox" class="ck sm ox" data-id="'+tid+'" '+(P()[tid]?'checked':'')+'/> Taste 15m (a quick rep, even on a busy day)</label>';
  if(dayDef.ship) h+='<div class="ship-note">★ Shipping day. Finish and publish one piece. Shipping is the skill.</div>';
  h+='<div class="lad-strip-today"><div class="muted" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;margin-bottom:6px">Always-on ladders</div>';
  ladders().forEach(l=>{ h+=ladderRowHTML(l); });
  h+='</div>';
  h+='<div class="today-actions"><button class="btn" id="openWeek">Open full week →</button></div>';
  h+='</div>';
  // right: momentum
  h+='<div class="panel card today-side">';
  h+='<div class="stat-big"><div class="sb-num">'+streak+'</div><div class="sb-lab">day streak</div></div>';
  h+='<div class="stat-row"><span>This week</span><b>'+wpct+'%</b></div><div class="progress-bar"><div style="width:'+wpct+'%"></div></div>';
  const tot=allTotals(), tpct=tot.total?Math.round(tot.done/tot.total*100):0;
  h+='<div class="stat-row" style="margin-top:14px"><span>Whole path</span><b>'+tpct+'%</b></div><div class="progress-bar"><div style="width:'+tpct+'%"></div></div>';
  h+='<div class="muted" style="font-size:12px;margin-top:16px;line-height:1.5">Tick any task to extend your streak. Consistency is the engine: a short rep every day beats a long block once a week.</div>';
  h+='</div></div>';
  $('content').innerHTML=h;
  wireChecks();
  const ow=$('openWeek'); if(ow)ow.onclick=()=>{ currentWeek=wk.w; curState().meta.lastWeek=wk.w; switchTab('week'); };
  $('content').querySelectorAll('input.ck').forEach(cb=>cb.addEventListener('change',()=>setTimeout(renderToday,60)));
}

/* ---------- EDIT PATH (owner) ---------- */
function editPath(){
  if(!state.current) return;
  const id=state.current, cur=pathTitle(id), goal=(state.skills[id].meta.goal!=null?state.skills[id].meta.goal:'');
  const o=document.createElement('div'); o.className='modal-overlay';
  o.innerHTML='<div class="modal-box"><div class="modal-head"><h3>Edit path</h3><button class="modal-x">×</button></div>'
    +'<div class="modal-body">'
    +'<div class="field"><label>Path name</label><input type="text" id="epTitle" value="'+esc(cur)+'" maxlength="80"/></div>'
    +'<div class="field" style="margin-top:12px"><label>Your goal / description</label><textarea id="epGoal" placeholder="What does world-class look like for you? Why this path?">'+esc(goal)+'</textarea></div>'
    +'<div class="field" style="margin-top:8px"><div class="muted" style="font-size:12px">This is the curated built-in path, so only its name and goal are editable here. For fully editable weeks, tasks, and resources, use "Create your own path" on the home screen.</div></div>'
    +'<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px"><button class="btn" id="epCancel">Cancel</button><button class="btn gold" id="epSave">Save</button></div>'
    +'</div></div>';
  document.body.appendChild(o);
  const close=()=>o.remove();
  o.addEventListener('click',e=>{ if(e.target===o)close(); });
  o.querySelector('.modal-x').onclick=close;
  o.querySelector('#epCancel').onclick=close;
  o.querySelector('#epSave').onclick=()=>{
    const t=o.querySelector('#epTitle').value.trim(), g=o.querySelector('#epGoal').value.trim();
    const m=state.skills[id].meta; m.title=t||undefined; m.goal=g||undefined;
    dbSaveState(); applyHeader(); close();
    if(activeTab==='today')renderToday(); else if(activeTab==='week')renderWeek();
  };
}

/* ---------- RENDER: WEEK ---------- */
function nextRungIdx(key,rungs){ const p=P(); for(let i=0;i<rungs.length;i++){ if(!p['L'+key+i]) return i; } return -1; }
function ladderRowHTML(l){
  const done=ladderCount(l.key,l.rungs), ni=nextRungIdx(l.key,l.rungs);
  const next = ni>=0
    ? '<label class="lad-next"><input type="checkbox" class="ck sm" data-id="L'+l.key+ni+'"> <span>'+esc((ni+1)+'. '+l.rungs[ni][0])+(l.rungs[ni][1]?(' · '+esc(l.rungs[ni][1])):'')+'</span></label>'
    : '<span class="lad-done">All '+l.rungs.length+' rungs mastered ★</span>';
  return '<div class="lad-row"><div class="lad-head"><b>'+esc(l.title)+'</b><span class="lad-count">'+done+'/'+l.rungs.length+'</span></div>'+next+'</div>';
}
function renderWeek(){
  const wk=weekObj(currentWeek),p=weekProg(wk),q=quarters()[wk.q],cw=curState().meta.startDate?currentWeekFromStart():null;
  let h='';
  h+='<div class="week-head"><div><div class="chip" style="margin-bottom:10px">'+esc(q.name)+'</div>'
    +'<div class="week-num">'+String(wk.w).padStart(2,'0')+'<span> / '+curDef().plan.length+'</span></div>'
    +'<div class="week-focus">'+esc(wk.focus)+'</div></div>'
    +'<div style="text-align:right"><div class="nav-btns">'
    +'<button class="btn" id="prevW" '+(wk.w===1?'disabled':'')+'>← Prev</button>'
    +((cw&&cw!==wk.w)?('<button class="btn gold" id="jumpCur">Jump to Week '+cw+'</button>'):'')
    +'<button class="btn" id="nextW" '+(wk.w===curDef().plan.length?'disabled':'')+'>Next →</button></div>'
    +'<div style="margin-top:14px"><div class="muted" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;display:flex;justify-content:space-between"><span>Week progress</span><span id="weekBarTxt">'+p.done+'/'+p.total+'</span></div>'
    +'<div class="progress-bar" style="width:240px;max-width:60vw"><div id="weekBar" style="width:'+(p.total?p.done/p.total*100:0)+'%"></div></div></div></div></div>';
  if(wk.ms) h+='<div class="milestone"><div class="star">★</div><div><b>Milestone</b>'+esc(wk.ms)+'</div></div>';
  h+='<div class="days">';
  days().forEach(d=>{ const bid='w'+wk.w+'.'+d.k, tid=bid+'.t', bDone=!!P()[bid];
    h+='<div class="day '+(d.ship?'ship':'')+' '+(bDone?'done':'')+'"><div class="dname">'+d.n+'</div>'
      +'<input type="checkbox" class="ck" data-id="'+bid+'" '+(bDone?'checked':'')+' title="Deep block done"/>'
      +'<div class="dlabel">'+esc(dayLabel(wk,d))+'<small>'+esc(d.s)+'</small></div>'
      +'<label class="taste"><input type="checkbox" class="ck sm ox" data-id="'+tid+'" '+(P()[tid]?'checked':'')+'/> Taste 15m</label></div>';
  });
  h+='</div>';
  h+='<div class="panel card ladder-strip"><h3>🪜 Craft ladders - always-on, every week</h3>';
  ladders().forEach(l=>{ h+=ladderRowHTML(l); });
  h+='<div class="lad-link"><button class="linklike" id="ladLink">view full ladders →</button></div></div>';
  h+='<details class="proto"><summary>The 90-minute deep-block protocol</summary><div class="body"><ol>'
    +'<li><b>5 min · Set the target.</b> One sentence, edge-of-ability.</li>'
    +'<li><b>10 min · Study the reference.</b> Note <i>why</i> it works.</li>'
    +'<li><b>55 min · Reps.</b> Recreate to critique to adjust to recreate. One improving adjustment every rep. Then one original rep.</li>'
    +'<li><b>10 min · Feedback.</b> Side-by-side with reference. Record a brutal 60-sec self-critique.</li>'
    +'<li><b>10 min · Log + queue.</b> One line in your log. Write tomorrows target.</li>'
    +'</ol><p style="margin-top:10px;color:var(--sand-dim)">Protect this block like an invoice - schedule it <b>before</b> client work.</p></div></details>';
  h+='<div class="twocol"><div class="panel card"><h3>📚 This weeks courses & resources</h3>';
  if((wk.res||[]).length){ wk.res.forEach((r,i)=>{ const rid='w'+wk.w+'.r'+i;
    h+='<div class="res-item"><input type="checkbox" class="ck sm" data-id="'+rid+'" '+(P()[rid]?'checked':'')+'/>'
      +'<div class="rl"><a href="'+esc(r.u)+'" target="_blank" rel="noopener">'+esc(r.l)+'</a></div>'
      +'<a class="ext" href="'+esc(r.u)+'" target="_blank" rel="noopener">open ↗</a></div>'; }); }
  else h+='<div class="muted" style="font-size:13px">Reference study week - pull from the Drill Library and the masters channels.</div>';
  h+='<div class="hint" style="margin-top:14px">Tick a resource once youve worked through it. Full library in the <b>Resources</b> tab.</div></div>'
    +'<div class="panel card note-wrap"><label>What I learned this week</label>'
    +'<textarea class="note" id="weekNote" placeholder="One honest paragraph: what clicked, what broke, what to fix next week...">'+esc(curState().notes['w'+wk.w]||'')+'</textarea>'
    +'<button class="btn ox" id="goLog" style="margin-top:12px">＋ Log this weeks render →</button></div></div>';
  $('content').innerHTML=h;
  wireChecks();
  const pv=$('prevW'); if(pv)pv.onclick=()=>goWeek(currentWeek-1);
  const nx=$('nextW'); if(nx)nx.onclick=()=>goWeek(currentWeek+1);
  const jc=$('jumpCur'); if(jc)jc.onclick=()=>goWeek(currentWeekFromStart());
  const ll=$('ladLink'); if(ll)ll.onclick=()=>switchTab('ladders');
  const note=$('weekNote');
  note.addEventListener('input',e=>{ curState().notes['w'+wk.w]=e.target.value; clearTimeout(noteTimer); noteTimer=setTimeout(dbSaveState,650); });
  $('goLog').onclick=()=>{ logPrefillWeek=wk.w; switchTab('log'); };
}
function wireChecks(){
  $('content').querySelectorAll('input.ck').forEach(cb=>{
    cb.addEventListener('change', async e=>{
      const id=e.target.dataset.id;
      await toggle(id, e.target.checked);
      if(id && id[0]==='L'){ if(activeTab==='week')renderWeek(); else if(activeTab==='ladders')renderLadders(); }
      else { const dayEl=e.target.closest('.day'); if(dayEl && !e.target.classList.contains('sm')) dayEl.classList.toggle('done', e.target.checked); }
    });
  });
}
function goWeek(w){ const max=curDef().plan.length; w=Math.max(1,Math.min(max,w)); currentWeek=w; curState().meta.lastWeek=w; dbSaveState(); renderWeek(); window.scrollTo({top:0,behavior:'smooth'}); }

/* ---------- RENDER: MAP ---------- */
function renderMap(){
  const qmap={}; curDef().plan.forEach(wk=>{ (qmap[wk.q]=qmap[wk.q]||[]).push(wk); });
  let h='<div class="section-title" style="margin-bottom:16px">The full <em>arc</em> - click any week to jump in.</div>';
  Object.keys(qmap).forEach(q=>{ const def=quarters()[q],wks=qmap[q]; let qd=0,qt=0; wks.forEach(wk=>{const p=weekProg(wk);qd+=p.done;qt+=p.total;}); const qpct=qt?Math.round(qd/qt*100):0;
    h+='<div class="quarter"><div class="qhead"><div><div class="qname">'+esc(def.name)+'</div><div class="muted" style="font-size:13px">'+esc(def.sub)+'</div></div><div class="chip">'+qpct+'% complete</div></div><div class="wgrid">';
    wks.forEach(wk=>{ const p=weekProg(wk),pct=p.total?p.done/p.total*100:0,full=pct>=100;
      h+='<button class="wcell '+(wk.ms?'ms':'')+' '+(wk.w===currentWeek?'cur':'')+' '+(full?'full':'')+'" data-w="'+wk.w+'">'
        +'<div class="wn">Week '+String(wk.w).padStart(2,'0')+'</div>'
        +'<div class="wf">'+esc(wk.focus.length>72?wk.focus.slice(0,70)+'…':wk.focus)+'</div>'
        +'<div class="wbar"><div style="width:'+pct+'%"></div></div></button>'; });
    h+='</div></div>'; });
  $('content').innerHTML=h;
  $('content').querySelectorAll('.wcell').forEach(c=>c.onclick=()=>{ currentWeek=+c.dataset.w; curState().meta.lastWeek=currentWeek; dbSaveState(); switchTab('week'); });
}

/* ---------- RENDER: LADDERS ---------- */
function ladderFullHTML(l){
  const done=ladderCount(l.key,l.rungs);
  let h='<div class="panel card ladfull"><h3>'+esc(l.title)+'</h3><div class="cap">'+esc(l.cap)+' · <b style="color:var(--gold)">'+done+'/'+l.rungs.length+'</b></div>';
  l.rungs.forEach((r,i)=>{ const id='L'+l.key+i,dn=!!P()[id];
    h+='<div class="rung '+(dn?'done':'')+'"><div class="rn">'+(i+1)+'</div>'
      +'<input type="checkbox" class="ck sm" data-id="'+id+'" '+(dn?'checked':'')+'/>'
      +'<div class="rt">'+esc(r[0])+(r[1]?('<span class="tag">'+esc(r[1])+'</span>'):'')+'</div></div>'; });
  h+='</div>'; return h;
}
function renderLadders(){
  let h='<div class="section-title" style="margin-bottom:6px">Craft <em>Ladders</em></div>'
    +'<div class="muted" style="margin-bottom:20px;max-width:640px">Skills you climb continuously alongside the weekly plan. Master one rung at a time, at the edge of your ability. Tick a rung only when you can do it reliably - these count toward your progress.</div>'
    +'<div class="grid2">';
  ladders().forEach(l=>{ h+=ladderFullHTML(l); });
  h+='</div>';
  $('content').innerHTML=h; wireChecks();
}

/* ---------- RENDER: DRILLS ---------- */
function renderDrills(){
  let h='<div class="section-title" style="margin-bottom:6px">The <em>Drill Library</em></div>'
    +'<div class="muted" style="margin-bottom:20px;max-width:640px">One sub-skill per session, at the edge of your ability. Copy a master, then originate. Pull from these to fill each days block.</div><div class="grid2">';
  curDef().drills.forEach(grp=>{ h+='<div class="panel card drill-grp"><h3>'+esc(grp.g)+'</h3>'; grp.items.forEach(it=>{ h+='<div class="drill"><b>'+esc(it[0])+'</b><p>'+esc(it[1])+'</p></div>'; }); h+='</div>'; });
  h+='</div>'; $('content').innerHTML=h;
}

/* ---------- RENDER: RESOURCES ---------- */
function renderRes(){
  let h='<div class="section-title" style="margin-bottom:6px">All <em>resources</em>, links & guides</div>'
    +'<div class="muted" style="margin-bottom:20px;max-width:640px">Courses are mapped to specific weeks in <b style="color:var(--cream)">This Week</b>. Everything else lives here.</div><div class="grid2">';
  curDef().resources.forEach(grp=>{ h+='<div class="panel card"><h3>'+esc(grp.g)+'</h3>'; grp.items.forEach(r=>{ h+='<div class="res-item"><div class="rl"><a href="'+esc(r.u)+'" target="_blank" rel="noopener">'+esc(r.l)+'</a></div><a class="ext" href="'+esc(r.u)+'" target="_blank" rel="noopener">open ↗</a></div>'; }); h+='</div>'; });
  h+='</div>'; $('content').innerHTML=h;
}

/* ---------- RENDER: LOG ---------- */
let logPrefillWeek=null, pendingThumb=null, pendingKind=null, pendingName=null;
function thumbFromImage(file,max=480,q=.62){return new Promise((res,rej)=>{const img=new Image();const url=URL.createObjectURL(file);
  img.onload=()=>{let w=img.width,h=img.height;const s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',q));};
  img.onerror=()=>{URL.revokeObjectURL(url);rej();};img.src=url;});}
function thumbFromVideo(file,max=480,q=.62){return new Promise((res,rej)=>{const v=document.createElement('video');const url=URL.createObjectURL(file);v.muted=true;v.preload='metadata';v.src=url;let done=false;
  const grab=()=>{if(done)return;done=true;try{let w=v.videoWidth,h=v.videoHeight;const s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(v,0,0,w,h);URL.revokeObjectURL(url);res(c.toDataURL('image/jpeg',q));}catch(e){URL.revokeObjectURL(url);rej();}};
  v.onloadeddata=()=>{try{v.currentTime=Math.min(1,(v.duration||2)/2);}catch(e){grab();}};v.onseeked=grab;v.onerror=()=>{URL.revokeObjectURL(url);rej();};setTimeout(grab,2500);});}
async function handleFile(file){pendingThumb=null;pendingKind=null;pendingName=file.name;const fn=$('fname');if(fn)fn.textContent='processing...';
  try{ if(file.type.startsWith('image/')){pendingThumb=await thumbFromImage(file);pendingKind='image';}
    else if(file.type.startsWith('video/')){pendingThumb=await thumbFromVideo(file);pendingKind='video';} else pendingKind='file'; }
  catch(e){ pendingKind=file.type.startsWith('video/')?'video':'file'; }
  if(fn)fn.textContent=file.name+(pendingThumb?' · thumbnail ready ✓':' · saved as note');}
function renderLog(){
  const def=logPrefillWeek||currentWeek;logPrefillWeek=null;
  const maxWk = isUserPath(state.current) ? Math.max(1,(curUser().weeks||[]).length) : curDef().plan.length;
  let h='<div class="section-title" style="margin-bottom:6px">Render <em>Log</em> & progress catalogue</div>'
    +'<div class="muted" style="margin-bottom:18px;max-width:660px">Document what you ship. Upload an image or video and a thumbnail snapshot is saved + '+(cloudActive()?'synced to your account':'kept in this browser')+'. For the full-res file, paste a link (Drive / Vercel / YouTube).</div>'
    +'<div class="panel card"><div class="log-form">'
    +'<div class="field"><label>Week</label><input type="number" id="lWeek" min="1" max="'+maxWk+'" value="'+def+'"/></div>'
    +'<div class="field"><label>Title of the piece</label><input type="text" id="lTitle" placeholder="e.g. Week 06 - One-frame lighting study"/></div>'
    +'<div class="field" style="grid-column:1 / -1"><label>What I learned / notes</label><textarea id="lNote" placeholder="The technique, what broke, the breakthrough..."></textarea></div>'
    +'<div class="field" style="grid-column:1 / -1"><label>Upload render (image / video) - optional</label><div class="filebox"><span class="btn filebtn">Choose file<input type="file" id="lFile" accept="image/*,video/*"/></span><span class="fname" id="fname">no file chosen</span></div></div>'
    +'<div class="field" style="grid-column:1 / -1"><label>...or link to the full render - optional</label><input type="text" id="lLink" placeholder="https://...  (Drive, Vercel, YouTube)"/></div>'
    +'<div class="field" style="grid-column:1 / -1"><button class="btn gold" id="lAdd">＋ Add to catalogue</button></div>'
    +'</div></div><div id="gallery"></div>';
  $('content').innerHTML=h;
  $('lFile').addEventListener('change',e=>{if(e.target.files[0])handleFile(e.target.files[0]);});
  $('lAdd').onclick=addEntry; renderGallery();
}
function skillRenders(){ return catalogue.filter(e=> (e.skill||'cinematic')===state.current ); }
function renderGallery(){
  const g=$('gallery');if(!g)return;
  const items=skillRenders();
  if(!items.length){g.innerHTML='<div class="empty"><div class="big">🎞️</div>No renders logged yet for this path. Ship something this week and add it here.</div>';return;}
  const sorted=[...items].sort((a,b)=>(b.date||0)-(a.date||0));let h='<div class="gallery">';
  sorted.forEach(en=>{const thumb=en.thumb?('style="background-image:url(\''+en.thumb+'\')"'):'';const icon=en.kind==='video'?'🎬':en.kind==='link'?'🔗':en.kind==='file'?'📄':'🖼️';const d=en.date?new Date(en.date):null;const ds=d?d.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
    h+='<div class="logcard"><div class="thumb" '+thumb+'>'+(en.thumb?'':icon)+'<span class="kind">'+esc(en.kind||'note')+'</span></div>'
      +'<div class="lc-body"><div class="lc-top"><span class="lc-wk">Week '+esc(en.week||'-')+'</span><span class="lc-date">'+esc(ds)+'</span></div>'
      +'<h4>'+esc(en.title||'Untitled')+'</h4><p>'+esc(en.learned||'')+'</p>'
      +'<div class="lc-foot">'+(en.url?('<a href="'+esc(en.url)+'" target="_blank" rel="noopener" class="ext">open render ↗</a>'):'<span></span>')+'<button class="del" data-id="'+esc(en.id)+'">delete</button></div></div></div>';});
  h+='</div>';g.innerHTML=h;g.querySelectorAll('.del').forEach(b=>b.onclick=()=>delEntry(b.dataset.id));
}
async function addEntry(){
  const week=$('lWeek').value,title=$('lTitle').value.trim(),learned=$('lNote').value.trim(),url=$('lLink').value.trim();
  if(!title&&!url&&!pendingThumb&&!learned)return;
  const id='e'+Date.now()+Math.floor(Math.random()*999);let kind=pendingKind;if(!kind&&url)kind='link';
  const entry={id:id,skill:state.current,week:week,title:title,learned:learned,url:url||null,kind:kind||'note',thumb:pendingThumb||null,name:pendingName||null,date:Date.now()};
  catalogue.push(entry);await dbSaveRender(entry);flash();updateLogDot();
  pendingThumb=null;pendingKind=null;pendingName=null;
  $('lTitle').value='';$('lNote').value='';$('lLink').value='';
  const fn=$('fname');if(fn)fn.textContent='no file chosen';const lf=$('lFile');if(lf)lf.value='';renderGallery();
}
async function delEntry(id){catalogue=catalogue.filter(e=>e.id!==id);await dbDelRender(id);flash();updateLogDot();renderGallery();}
function updateLogDot(){const dd=$('logDot');if(dd)dd.textContent=(state.current && skillRenders().length)?('('+skillRenders().length+')'):'';}

/* ---------- START DATE ---------- */
function currentWeekFromStart(){ const m=curState().meta; if(!m.startDate)return null; const days_=Math.floor((new Date()-new Date(m.startDate))/86400000); return Math.max(1,Math.min(curDef().plan.length,Math.floor(days_/7)+1)); }
function refreshSuggest(){ const el=$('suggest'),di=$('startDate'); if(!el||!di)return; const m=curState()?curState().meta:null;
  if(m&&m.startDate){ di.value=m.startDate; const cw=currentWeekFromStart(); el.innerHTML='→ Week <b style="color:var(--gold)">'+cw+'</b>'; } else { di.value=''; el.textContent=''; } }

/* ---------- TABS / LOAD / INIT ---------- */
function switchTab(t){
  if(state.current && isUserPath(state.current) && t!=='plan' && t!=='log') t='plan';
  activeTab=t; if(state.current){ curState().meta.lastTab=t; dbSaveState(); } document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  if(t==='plan')renderPlan();else if(t==='today')renderToday();else if(t==='week')renderWeek();else if(t==='map')renderMap();else if(t==='ladders')renderLadders();else if(t==='drills')renderDrills();else if(t==='res')renderRes();else if(t==='log')renderLog();
  window.scrollTo({top:0,behavior:'smooth'}); }
function finishLoad(){
  applyHeader(); updateLogDot();
  if(state.current && (skillDef(state.current) || isUserPath(state.current))){
    ensureSkill(state.current);
    currentWeek=curState().meta.lastWeek||1;
    activeTab=curState().meta.lastTab || (isUserPath(state.current)?'plan':'today');
    if(!isUserPath(state.current)) refreshSuggest();
    updateOverall(); switchTab(activeTab);
  } else { state.current=null; renderCatalog(); }
}
function loadLocalState(){
  const raw=localStorage.getItem(STATE_KEY); let b={};
  if(raw){ try{ b=JSON.parse(raw); }catch(e){} }
  if(!b.skills){ // legacy single-skill format
    const old=localStorage.getItem('dp_state');
    if(old){ try{ const o=JSON.parse(old); b={ current:null, skills:{ cinematic:{ progress:o.progress||{}, notes:o.notes||{}, meta:o.meta||{startDate:null,lastWeek:1} } } }; }catch(e){} }
  }
  return { current:b.current||null, skills:b.skills||{}, userPaths:b.userPaths||{} };
}
async function loadLocalAndRender(){
  state=loadLocalState();
  catalogue=await dbLoadRenders();   // local renders (signed-out path)
  finishLoad();
}
async function loadAndRender(){
  const b=await dbLoadState();
  state={ current:b.current||null, skills:b.skills||{}, userPaths:b.userPaths||{} };
  catalogue=await dbLoadRenders();
  finishLoad();
}
async function onSignIn(){
  const cloudState=await dbLoadState();
  const cloudRenders=await dbLoadRenders();
  const cloudEmpty=!cloudState || !cloudState.skills || Object.keys(cloudState.skills||{}).length===0;
  if(cloudEmpty){
    const local=loadLocalState();
    if(local && local.skills && Object.keys(local.skills).length){ state=local; await dbSaveState(); }
    else { state={ current:cloudState.current||null, skills:cloudState.skills||{}, userPaths:cloudState.userPaths||{} }; }
  } else { state={ current:cloudState.current||null, skills:cloudState.skills||{}, userPaths:cloudState.userPaths||{} }; }
  if(cloudRenders.length===0){
    const lkeys=await Store.list(CAT_PREFIX);
    if(lkeys.length){ const arr=[]; for(const k of lkeys){ try{ const v=await Store.get(k); if(v){ const e=JSON.parse(v); arr.push(e); await dbSaveRender(e); } }catch(e){} } catalogue=arr; }
  } else catalogue=cloudRenders;
  finishLoad();
}
async function init(){
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  const bt=$('brandTitle'); if(bt)bt.onclick=goCatalog;
  const ac=$('allSkills'); if(ac)ac.onclick=goCatalog;
  const ep=$('editPathBtn'); if(ep)ep.onclick=editPath;
  $('startDate').addEventListener('change',e=>{ if(!state.current)return; curState().meta.startDate=e.target.value||null; dbSaveState(); refreshSuggest(); if(activeTab==='week')renderWeek(); });
  // Local-first: render instantly from the local mirror so a refresh never waits
  // or loses your place. If signed in, the cloud reconciles in the background.
  await loadLocalAndRender();
  if(fb.present) initFirebase();
}
init();
