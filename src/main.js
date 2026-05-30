// ── Learn Path Tracker — app logic (multi-skill) ──────────────────────────
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
  if(!fb.ready){ alert("Cloud sync isn't configured — add your Firebase env vars (see README)."); return; }
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
async function doSignOut(){ try{ await fb.signOut(fb.auth); }catch(e){ console.warn(e); } }
async function onAuth(user){ currentUser = user || null; if(user){ await onSignIn(); } else { await loadAndRender(); } }

/* ---------- STATE ---------- */
let state = { current:null, skills:{} };   // skills[id] = { progress, notes, meta:{startDate,lastWeek} }
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
  if(cloudActive()){ try{ const ref=fb.doc(fb.db,'users',currentUser.uid,'state','main'); await fb.setDoc(ref,{bundle:state},{merge:true}); flash(); }catch(e){ console.warn(e); } return; }
  await Store.set(STATE_KEY, JSON.stringify(state)); flash();
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
  const def=skillDef(id); const p=(state.skills[id]&&state.skills[id].progress)||{}; let done=0,total=0;
  def.plan.forEach(wk=>{ const ids=[]; def.days.forEach(d=>{ ids.push('w'+wk.w+'.'+d.k); ids.push('w'+wk.w+'.'+d.k+'.t'); }); (wk.res||[]).forEach((_,i)=>ids.push('w'+wk.w+'.r'+i)); ids.forEach(i=>{ total++; if(p[i])done++; }); });
  def.ladders.forEach(l=>{ l.rungs.forEach((_,i)=>{ total++; if(p['L'+l.key+i])done++; }); });
  return { done, total };
}
function allTotals(){ return totalsFor(state.current); }
function flash(){ const s=$('saved'); if(!s)return; s.textContent = cloudActive() ? 'Synced ✓' : 'Saved ✓'; s.classList.add('show'); clearTimeout(flash._t); flash._t=setTimeout(()=>s.classList.remove('show'),1100); }
async function toggle(id,val){ const p=P(); if(val)p[id]=true; else delete p[id]; updateOverall(); await dbSaveState(); }

function updateOverall(){
  if(!state.current) return;
  const{done,total}=allTotals(); const pct=total?Math.round(done/total*100):0; const C=144.5;
  $('ringPct').textContent=pct+'%';
  $('ringFg').style.strokeDashoffset=String(C-(C*pct/100));
  $('doneCount').textContent=done;
  $('weekCount').textContent='of '+total;
  const wb=$('weekBar');
  if(wb){ const p=weekProg(weekObj(currentWeek)); wb.style.width=(p.total?p.done/p.total*100:0)+'%'; const wt=$('weekBarTxt'); if(wt)wt.textContent=p.done+'/'+p.total; }
}

/* ---------- HEADER / PERSONALIZATION ---------- */
function firstName(){
  if(!currentUser) return '';
  const n = currentUser.displayName || (currentUser.email||'').split('@')[0] || '';
  return String(n).split(' ')[0];
}
function applyHeader(){
  const k=$('kicker'), sub=$('brandSub'), inSkill=!!state.current;
  k.textContent = currentUser ? ('WELCOME, ' + firstName().toUpperCase()) : 'LEARN · PRACTICE · TRACK';
  sub.textContent = inSkill ? curDef().tagline : 'Pick a skill. Practice deliberately. Track your climb.';
  $('startWrap').style.display = inSkill ? '' : 'none';
  $('overallWrap').style.display = inSkill ? '' : 'none';
  $('tabs').style.display = inSkill ? '' : 'none';
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
  } else {
    el.innerHTML='<button class="gbtn" id="siBtn"><span class="gg">G</span> Sign in with Google</button>';
    const b=$('siBtn'); if(b)b.onclick=signIn;
  }
}

/* ---------- CATALOG ---------- */
function renderCatalog(){
  let h='<div class="cat-intro"><div class="section-title">Choose a <em>skill path</em></div>'
    +'<div class="muted" style="max-width:640px">Each path is a full deliberate-practice program — a weekly plan, craft ladders, a drill library, curated resources, and a render log. Pick one to start learning and tracking your progress.</div></div>';
  h+='<div class="cat-grid">';
  SKILLS.forEach(s=>{
    const t=totalsFor(s.id); const pct=t.total?Math.round(t.done/t.total*100):0;
    const started=!!(state.skills[s.id] && Object.keys(state.skills[s.id].progress||{}).length);
    h+='<button class="skill-card" data-id="'+esc(s.id)+'">'
      +'<div class="sc-top">'+esc(s.title)+'</div>'
      +'<div class="sc-tag">'+esc(s.tagline)+'</div>'
      +'<div class="sc-blurb">'+esc(s.blurb)+'</div>'
      +'<div class="sc-foot"><div class="progress-bar" style="flex:1"><div style="width:'+pct+'%"></div></div><span class="sc-pct">'+pct+'%</span></div>'
      +'<div class="sc-cta">'+(started?'Continue':'Start')+' →</div></button>';
  });
  h+='<div class="skill-card soon"><div class="sc-top">More paths soon</div><div class="sc-blurb">New skill paths can be published here as updates — anyone who opens the site can pick one and start tracking.</div></div>';
  h+='</div>';
  $('content').innerHTML=h;
  $('content').querySelectorAll('.skill-card[data-id]').forEach(c=>c.onclick=()=>openSkill(c.dataset.id));
}
function openSkill(id){
  state.current=id; ensureSkill(id); currentWeek=curState().meta.lastWeek||1; activeTab='week';
  dbSaveState(); applyHeader(); refreshSuggest(); updateOverall(); switchTab('week');
  window.scrollTo({top:0,behavior:'smooth'});
}
function goCatalog(){ state.current=null; dbSaveState(); applyHeader(); renderCatalog(); window.scrollTo({top:0,behavior:'smooth'}); }

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
  let h='<div class="section-title" style="margin-bottom:6px">Render <em>Log</em> & progress catalogue</div>'
    +'<div class="muted" style="margin-bottom:18px;max-width:660px">Document what you ship. Upload an image or video and a thumbnail snapshot is saved + '+(cloudActive()?'synced to your account':'kept in this browser')+'. For the full-res file, paste a link (Drive / Vercel / YouTube).</div>'
    +'<div class="panel card"><div class="log-form">'
    +'<div class="field"><label>Week</label><input type="number" id="lWeek" min="1" max="'+curDef().plan.length+'" value="'+def+'"/></div>'
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
function switchTab(t){ activeTab=t; document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  if(t==='week')renderWeek();else if(t==='map')renderMap();else if(t==='ladders')renderLadders();else if(t==='drills')renderDrills();else if(t==='res')renderRes();else if(t==='log')renderLog();
  window.scrollTo({top:0,behavior:'smooth'}); }
function finishLoad(){
  applyHeader(); updateLogDot();
  if(state.current && skillDef(state.current)){ ensureSkill(state.current); currentWeek=curState().meta.lastWeek||1; refreshSuggest(); updateOverall(); switchTab(activeTab||'week'); }
  else { state.current=null; renderCatalog(); }
}
async function loadAndRender(){
  const b=await dbLoadState();
  state={ current:b.current||null, skills:b.skills||{} };
  catalogue=await dbLoadRenders();
  finishLoad();
}
async function onSignIn(){
  const cloudState=await dbLoadState();
  const cloudRenders=await dbLoadRenders();
  const cloudEmpty=!cloudState || !cloudState.skills || Object.keys(cloudState.skills||{}).length===0;
  if(cloudEmpty){
    let lraw=await Store.get(STATE_KEY),local=null; if(lraw){try{local=JSON.parse(lraw);}catch(e){}}
    if(local && local.skills && Object.keys(local.skills).length){ state=local; await dbSaveState(); }
    else { state={ current:cloudState.current||null, skills:cloudState.skills||{} }; }
  } else { state={ current:cloudState.current||null, skills:cloudState.skills||{} }; }
  if(cloudRenders.length===0){
    const lkeys=await Store.list(CAT_PREFIX);
    if(lkeys.length){ const arr=[]; for(const k of lkeys){ try{ const v=await Store.get(k); if(v){ const e=JSON.parse(v); arr.push(e); await dbSaveRender(e); } }catch(e){} } catalogue=arr; } else catalogue=[];
  } else catalogue=cloudRenders;
  finishLoad();
}
async function init(){
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  const bt=$('brandTitle'); if(bt)bt.onclick=goCatalog;
  const ac=$('allSkills'); if(ac)ac.onclick=goCatalog;
  $('startDate').addEventListener('change',e=>{ if(!state.current)return; curState().meta.startDate=e.target.value||null; dbSaveState(); refreshSuggest(); if(activeTab==='week')renderWeek(); });
  applyHeader();
  await loadAndRender();
  initFirebase();
}
init();
