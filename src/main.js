// ── Mastery Tracker — app logic (module build) ────────────────────────────
import './styles.css';
import { QDEF, WEEKS, DAY_TPL, COMP_LADDER, SOUND_LADDER, DRILLS, RES_GROUPS } from './data.js';
import { fb } from './firebase.js';

/* ---------- LOCAL STORE (fallback when not signed in / no config) ---------- */
const STATE_KEY = 'dp_state', CAT_PREFIX = 'dp_cat:';
const Store = {
  async get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  async set(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } },
  async del(k){ try{ localStorage.removeItem(k); }catch(e){} },
  async list(p){ try{ const a=[]; for(let i=0;i<localStorage.length;i++){ const k=localStorage.key(i); if(k&&k.indexOf(p)===0)a.push(k);} return a; }catch(e){ return []; } }
};

/* ---------- CLOUD / AUTH ---------- */
let currentUser = null;
const cloud = { get user(){ return currentUser; } };
function configPresent(){ return fb.present; }
function cloudActive(){ return fb.ready && !!currentUser; }
function initFirebase(){
  if(fb.ready){
    fb.onAuthStateChanged(fb.auth, onAuth);
    // Completes the flow when we return from a full-page redirect; surfaces errors.
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
    // Popup blocked/closed, or browser is blocking third-party storage → use a full-page redirect instead.
    if(['auth/popup-blocked','auth/popup-closed-by-user','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment','auth/web-storage-unsupported','auth/internal-error'].includes(code)){
      try{ await fb.signInWithRedirect(fb.auth, provider); }
      catch(e2){ alert('Redirect sign-in also failed: ' + ((e2 && e2.code) || e2) + '\n\nIf this is a cookie/storage block, see README → "Same-origin auth proxy".'); }
      return;
    }
    alert('Sign-in failed: ' + code);
  }
}
async function doSignOut(){ try{ await fb.signOut(fb.auth); }catch(e){ console.warn(e); } }
async function onAuth(user){ currentUser = user || null; setAuthUI(); if(user){ await onSignIn(); } else { await loadAndRender(); } }

/* ---------- DB LAYER (cloud when signed in, else local) ---------- */
async function dbLoadState(){
  if(cloudActive()){
    try{ const ref=fb.doc(fb.db,'users',currentUser.uid,'state','main'); const snap=await fb.getDoc(ref); if(snap.exists()) return snap.data().bundle||{}; }catch(e){ console.warn(e); }
    return {};
  }
  const raw=await Store.get(STATE_KEY);
  if(raw){ try{ return JSON.parse(raw); }catch(e){} }
  return {};
}
async function dbSaveState(){
  const bundle={progress,notes,meta};
  if(cloudActive()){ try{ const ref=fb.doc(fb.db,'users',currentUser.uid,'state','main'); await fb.setDoc(ref,{bundle},{merge:true}); flash(); }catch(e){ console.warn(e); } return; }
  await Store.set(STATE_KEY, JSON.stringify(bundle)); flash();
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

/* ---------- STATE ---------- */
let progress={}, notes={}, meta={startDate:null,lastWeek:1}, catalogue=[];
let currentWeek=1, activeTab="week", noteTimer=null;

/* ---------- HELPERS ---------- */
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function weekObj(w){return WEEKS.find(x=>x.w===w);}
function wedLabel(wk){return wk.wed||QDEF[wk.q].wed;}
function dayLabel(wk,d){return d.k==="wed"?wedLabel(wk):d.l;}
function weekTaskIds(wk){const ids=[];DAY_TPL.forEach(d=>{ids.push("w"+wk.w+"."+d.k);ids.push("w"+wk.w+"."+d.k+".t");});(wk.res||[]).forEach((_,i)=>ids.push("w"+wk.w+".r"+i));return ids;}
function weekProg(wk){const ids=weekTaskIds(wk);return{done:ids.filter(id=>progress[id]).length,total:ids.length};}
function ladderCount(prefix,arr){let d=0;arr.forEach((_,i)=>{if(progress[prefix+i])d++;});return d;}
function allTotals(){let done=0,total=0;WEEKS.forEach(wk=>{const p=weekProg(wk);done+=p.done;total+=p.total;});done+=ladderCount("Lcomp",COMP_LADDER)+ladderCount("Lsound",SOUND_LADDER);total+=COMP_LADDER.length+SOUND_LADDER.length;return{done,total};}
function flash(){const s=document.getElementById("saved");if(!s)return;s.textContent=cloudActive()?"Synced ✓":"Saved ✓";s.classList.add("show");clearTimeout(flash._t);flash._t=setTimeout(()=>s.classList.remove("show"),1100);}
async function toggle(id,val){ if(val)progress[id]=true; else delete progress[id]; updateOverall(); await dbSaveState(); }
function updateOverall(){
  const{done,total}=allTotals();const pct=total?Math.round(done/total*100):0;const C=144.5;
  document.getElementById("ringPct").textContent=pct+"%";
  document.getElementById("ringFg").style.strokeDashoffset=String(C-(C*pct/100));
  document.getElementById("doneCount").textContent=done;
  document.getElementById("weekCount").textContent="of "+total;
  const wb=document.getElementById("weekBar");
  if(wb){const p=weekProg(weekObj(currentWeek));wb.style.width=(p.total?p.done/p.total*100:0)+"%";const wt=document.getElementById("weekBarTxt");if(wt)wt.textContent=p.done+"/"+p.total;}
}
function setAuthUI(){
  const el=document.getElementById("auth");if(!el)return;
  if(!configPresent()){
    el.innerHTML='<span class="auth-pill" title="Add your Firebase config to enable Google login + sync"><span class="d"></span> Local mode</span><button class="linklike" id="setupLink">enable sync</button>';
    const s=document.getElementById("setupLink");if(s)s.onclick=()=>switchTab("res");return;
  }
  if(cloud.user){
    const em=cloud.user.email||"signed in";
    el.innerHTML='<span class="auth-pill on" title="'+esc(em)+'"><span class="d"></span> '+esc(em.length>22?em.slice(0,20)+"…":em)+'</span><button class="linklike" id="soBtn">sign out</button>';
    const b=document.getElementById("soBtn");if(b)b.onclick=doSignOut;
  } else {
    el.innerHTML='<button class="gbtn" id="siBtn"><span class="gg">G</span> Sign in with Google</button>';
    const b=document.getElementById("siBtn");if(b)b.onclick=signIn;
  }
}
/* ---------- RENDER: WEEK ---------- */
function nextRungIdx(prefix,arr){for(let i=0;i<arr.length;i++){if(!progress[prefix+i])return i;}return -1;}
function ladderRowHTML(key,title,arr){
  const prefix="L"+key, done=ladderCount(prefix,arr), ni=nextRungIdx(prefix,arr);
  const next = ni>=0
    ? '<label class="lad-next"><input type="checkbox" class="ck sm" data-id="'+prefix+ni+'"> <span>'+esc((ni+1)+". "+arr[ni][0])+(arr[ni][1]?(" · "+esc(arr[ni][1])):"")+'</span></label>'
    : '<span class="lad-done">All '+arr.length+' rungs mastered ★</span>';
  return '<div class="lad-row"><div class="lad-head"><b>'+esc(title)+'</b><span class="lad-count">'+done+'/'+arr.length+'</span></div>'+next+'</div>';
}
function renderWeek(){
  const wk=weekObj(currentWeek),p=weekProg(wk),q=QDEF[wk.q],cw=meta.startDate?currentWeekFromStart():null;
  let h="";
  h+='<div class="week-head"><div><div class="chip" style="margin-bottom:10px">'+esc(q.name)+'</div>'
    +'<div class="week-num">'+String(wk.w).padStart(2,"0")+'<span> / 48</span></div>'
    +'<div class="week-focus">'+esc(wk.focus)+'</div></div>'
    +'<div style="text-align:right"><div class="nav-btns">'
    +'<button class="btn" id="prevW" '+(wk.w===1?"disabled":"")+'>← Prev</button>'
    +((cw&&cw!==wk.w)?('<button class="btn gold" id="jumpCur">Jump to Week '+cw+'</button>'):'')
    +'<button class="btn" id="nextW" '+(wk.w===48?"disabled":"")+'>Next →</button></div>'
    +'<div style="margin-top:14px"><div class="muted" style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;display:flex;justify-content:space-between"><span>Week progress</span><span id="weekBarTxt">'+p.done+'/'+p.total+'</span></div>'
    +'<div class="progress-bar" style="width:240px;max-width:60vw"><div id="weekBar" style="width:'+(p.total?p.done/p.total*100:0)+'%"></div></div></div></div></div>';
  if(wk.ms) h+='<div class="milestone"><div class="star">★</div><div><b>Milestone</b>'+esc(wk.ms)+'</div></div>';
  h+='<div class="days">';
  DAY_TPL.forEach(d=>{const bid="w"+wk.w+"."+d.k, tid=bid+".t", bDone=!!progress[bid];
    h+='<div class="day '+(d.ship?"ship":"")+' '+(bDone?"done":"")+'"><div class="dname">'+d.n+'</div>'
      +'<input type="checkbox" class="ck" data-id="'+bid+'" '+(bDone?"checked":"")+' title="Deep block done"/>'
      +'<div class="dlabel">'+esc(dayLabel(wk,d))+'<small>'+esc(d.s)+'</small></div>'
      +'<label class="taste"><input type="checkbox" class="ck sm ox" data-id="'+tid+'" '+(progress[tid]?"checked":"")+'/> Taste 15m</label></div>';
  });
  h+='</div>';
  h+='<div class="panel card ladder-strip"><h3>🪜 Craft ladders - always-on, every week</h3>'
    +ladderRowHTML("comp","Composition (AE + Blender)",COMP_LADDER)
    +ladderRowHTML("sound","Sound Design",SOUND_LADDER)
    +'<div class="lad-link"><button class="linklike" id="ladLink">view full ladders →</button></div></div>';
  h+='<details class="proto"><summary>The 90-minute deep-block protocol</summary><div class="body"><ol>'
    +'<li><b>5 min · Set the target.</b> One sentence, edge-of-ability.</li>'
    +'<li><b>10 min · Study the reference.</b> Note <i>why</i> it works.</li>'
    +'<li><b>55 min · Reps.</b> Recreate to critique to adjust to recreate. One improving adjustment every rep. Then one original rep.</li>'
    +'<li><b>10 min · Feedback.</b> Side-by-side with reference. Record a brutal 60-sec self-critique.</li>'
    +'<li><b>10 min · Log + queue.</b> One line in your log. Write tomorrows target.</li>'
    +'</ol><p style="margin-top:10px;color:var(--sand-dim)">Protect this block like an invoice - schedule it <b>before</b> client work.</p></div></details>';
  h+='<div class="twocol"><div class="panel card"><h3>📚 This weeks courses & resources</h3>';
  if((wk.res||[]).length){ wk.res.forEach((r,i)=>{const rid="w"+wk.w+".r"+i;
    h+='<div class="res-item"><input type="checkbox" class="ck sm" data-id="'+rid+'" '+(progress[rid]?"checked":"")+'/>'
      +'<div class="rl"><a href="'+esc(r.u)+'" target="_blank" rel="noopener">'+esc(r.l)+'</a></div>'
      +'<a class="ext" href="'+esc(r.u)+'" target="_blank" rel="noopener">open ↗</a></div>';}); }
  else h+='<div class="muted" style="font-size:13px">Reference study week - pull from the Drill Library and the masters channels.</div>';
  h+='<div class="hint" style="margin-top:14px">Tick a resource once youve worked through it. Full library in the <b>Resources</b> tab.</div></div>'
    +'<div class="panel card note-wrap"><label>What I learned this week</label>'
    +'<textarea class="note" id="weekNote" placeholder="One honest paragraph: what clicked, what broke, what to fix next week...">'+esc(notes["w"+wk.w]||"")+'</textarea>'
    +'<button class="btn ox" id="goLog" style="margin-top:12px">＋ Log this weeks render →</button></div></div>';
  document.getElementById("content").innerHTML=h;
  wireChecks();
  const pv=document.getElementById("prevW");if(pv)pv.onclick=()=>goWeek(currentWeek-1);
  const nx=document.getElementById("nextW");if(nx)nx.onclick=()=>goWeek(currentWeek+1);
  const jc=document.getElementById("jumpCur");if(jc)jc.onclick=()=>goWeek(currentWeekFromStart());
  const ll=document.getElementById("ladLink");if(ll)ll.onclick=()=>switchTab("ladders");
  const note=document.getElementById("weekNote");
  note.addEventListener("input",e=>{notes["w"+wk.w]=e.target.value;clearTimeout(noteTimer);noteTimer=setTimeout(dbSaveState,650);});
  document.getElementById("goLog").onclick=()=>{logPrefillWeek=wk.w;switchTab("log");};
}
function wireChecks(){
  document.getElementById("content").querySelectorAll("input.ck").forEach(cb=>{
    cb.addEventListener("change",async e=>{
      const id=e.target.dataset.id;
      await toggle(id,e.target.checked);
      if(id&&id[0]==="L"){ if(activeTab==="week")renderWeek(); else if(activeTab==="ladders")renderLadders(); }
      else{ const dayEl=e.target.closest(".day"); if(dayEl&&!e.target.classList.contains("sm"))dayEl.classList.toggle("done",e.target.checked); }
    });
  });
}
function goWeek(w){w=Math.max(1,Math.min(48,w));currentWeek=w;meta.lastWeek=w;dbSaveState();renderWeek();window.scrollTo({top:0,behavior:"smooth"});}

/* ---------- RENDER: MAP ---------- */
function renderMap(){
  let h='<div class="section-title" style="margin-bottom:16px">The <em>12-month</em> arc - click any week to jump in.</div>';
  [1,2,3,4].forEach(q=>{const def=QDEF[q],wks=WEEKS.filter(x=>x.q===q);let qd=0,qt=0;wks.forEach(wk=>{const p=weekProg(wk);qd+=p.done;qt+=p.total;});const qpct=qt?Math.round(qd/qt*100):0;
    h+='<div class="quarter"><div class="qhead"><div><div class="qname">'+esc(def.name)+'</div><div class="muted" style="font-size:13px">'+esc(def.sub)+'</div></div><div class="chip">'+qpct+'% complete</div></div><div class="wgrid">';
    wks.forEach(wk=>{const p=weekProg(wk),pct=p.total?p.done/p.total*100:0,full=pct>=100;
      h+='<button class="wcell '+(wk.ms?"ms":"")+' '+(wk.w===currentWeek?"cur":"")+' '+(full?"full":"")+'" data-w="'+wk.w+'">'
        +'<div class="wn">Week '+String(wk.w).padStart(2,"0")+'</div>'
        +'<div class="wf">'+esc(wk.focus.length>72?wk.focus.slice(0,70)+"…":wk.focus)+'</div>'
        +'<div class="wbar"><div style="width:'+pct+'%"></div></div></button>';});
    h+='</div></div>';});
  document.getElementById("content").innerHTML=h;
  document.getElementById("content").querySelectorAll(".wcell").forEach(c=>c.onclick=()=>{currentWeek=+c.dataset.w;meta.lastWeek=currentWeek;dbSaveState();switchTab("week");});
}

/* ---------- RENDER: LADDERS ---------- */
function ladderFullHTML(key,title,cap,arr){
  const prefix="L"+key,done=ladderCount(prefix,arr);
  let h='<div class="panel card ladfull"><h3>'+esc(title)+'</h3><div class="cap">'+esc(cap)+' · <b style="color:var(--gold)">'+done+'/'+arr.length+'</b></div>';
  arr.forEach((r,i)=>{const id=prefix+i,dn=!!progress[id];
    h+='<div class="rung '+(dn?"done":"")+'"><div class="rn">'+(i+1)+'</div>'
      +'<input type="checkbox" class="ck sm" data-id="'+id+'" '+(dn?"checked":"")+'/>'
      +'<div class="rt">'+esc(r[0])+(r[1]?('<span class="tag">'+esc(r[1])+'</span>'):"")+'</div></div>';});
  h+='</div>';return h;
}
function renderLadders(){
  let h='<div class="section-title" style="margin-bottom:6px">Craft <em>Ladders</em></div>'
    +'<div class="muted" style="margin-bottom:20px;max-width:640px">Two skills you climb continuously alongside the weekly plan. Master one rung at a time, at the edge of your ability. Tick a rung only when you can do it reliably - these count toward your year progress.</div>'
    +'<div class="grid2">'
    +ladderFullHTML("comp","Composition - AE + Blender","Frame everything with intent, in both tools",COMP_LADDER)
    +ladderFullHTML("sound","Sound Design","From layered beds to a broadcast-ready emotional mix",SOUND_LADDER)
    +'</div>';
  document.getElementById("content").innerHTML=h;wireChecks();
}

/* ---------- RENDER: DRILLS ---------- */
function renderDrills(){
  let h='<div class="section-title" style="margin-bottom:6px">The <em>Drill Library</em></div>'
    +'<div class="muted" style="margin-bottom:20px;max-width:640px">One sub-skill per session, at the edge of your ability. Copy a master, then originate. Pull from these to fill each days block.</div><div class="grid2">';
  DRILLS.forEach(grp=>{h+='<div class="panel card drill-grp"><h3>'+esc(grp.g)+'</h3>';grp.items.forEach(it=>{h+='<div class="drill"><b>'+esc(it[0])+'</b><p>'+esc(it[1])+'</p></div>';});h+='</div>';});
  h+='</div>';document.getElementById("content").innerHTML=h;
}

/* ---------- RENDER: RESOURCES ---------- */
function renderRes(){
  let h='<div class="section-title" style="margin-bottom:6px">All <em>resources</em>, links & guides</div>'
    +'<div class="muted" style="margin-bottom:20px;max-width:640px">Courses are mapped to specific weeks in <b style="color:var(--cream)">This Week</b>. Everything else lives here.</div><div class="grid2">';
  RES_GROUPS.forEach(grp=>{h+='<div class="panel card"><h3>'+esc(grp.g)+'</h3>';grp.items.forEach(r=>{h+='<div class="res-item"><div class="rl"><a href="'+esc(r.u)+'" target="_blank" rel="noopener">'+esc(r.l)+'</a></div><a class="ext" href="'+esc(r.u)+'" target="_blank" rel="noopener">open ↗</a></div>';});h+='</div>';});
  h+='</div>';
  h+='<div class="panel card setup"><h3>🔐 Enable Google login & cross-device sync</h3>'
    +'<div class="muted" style="font-size:13.5px">Right now this runs in <b style="color:var(--cream)">local mode</b> - progress saves to this browser only. To sign in with Google and sync across devices, set up a free Firebase project (~5 min), then paste 4 values into the <code>FIREBASE_CONFIG</code> block near the top of <code>mastery-tracker.html</code>.</div>'
    +'<ol>'
    +'<li>Go to <b>console.firebase.google.com</b> -> <b>Add project</b> (the free Spark plan is enough).</li>'
    +'<li><b>Build -> Authentication -> Get started -> Sign-in method -></b> enable <b>Google</b>.</li>'
    +'<li><b>Build -> Firestore Database -> Create database -></b> production mode -> pick a region.</li>'
    +'<li>In Firestore <b>Rules</b>, paste the rules below and <b>Publish</b>.</li>'
    +'<li><b>Project settings (gear) -> Your apps -> Web (&lt;/&gt;)</b> -> register an app -> copy the <code>firebaseConfig</code>.</li>'
    +'<li>Paste <code>apiKey</code>, <code>authDomain</code>, <code>projectId</code>, <code>appId</code> into <code>FIREBASE_CONFIG</code>.</li>'
    +'<li><b>Authentication -> Settings -> Authorized domains -></b> add your Vercel domain (e.g. <code>yourapp.vercel.app</code>).</li>'
    +'<li>Deploy to Vercel, then click <b>Sign in with Google</b>. Your progress now follows you everywhere.</li>'
    +'</ol>'
    +'<pre>rules_version = \'2\';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{uid}/{document=**} {\n      allow read, write: if request.auth != null\n                         &amp;&amp; request.auth.uid == uid;\n    }\n  }\n}</pre>'
    +'<div class="hint">Note: the Google sign-in popup wont fire inside the Claude preview (sandboxed). It works on your deployed Vercel site.</div></div>';
  document.getElementById("content").innerHTML=h;
}
/* ---------- RENDER: LOG ---------- */
let logPrefillWeek=null, pendingThumb=null, pendingKind=null, pendingName=null;
function thumbFromImage(file,max=480,q=.62){return new Promise((res,rej)=>{const img=new Image();const url=URL.createObjectURL(file);
  img.onload=()=>{let w=img.width,h=img.height;const s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(img,0,0,w,h);URL.revokeObjectURL(url);res(c.toDataURL("image/jpeg",q));};
  img.onerror=()=>{URL.revokeObjectURL(url);rej();};img.src=url;});}
function thumbFromVideo(file,max=480,q=.62){return new Promise((res,rej)=>{const v=document.createElement("video");const url=URL.createObjectURL(file);v.muted=true;v.preload="metadata";v.src=url;let done=false;
  const grab=()=>{if(done)return;done=true;try{let w=v.videoWidth,h=v.videoHeight;const s=Math.min(1,max/Math.max(w,h));w=Math.round(w*s);h=Math.round(h*s);const c=document.createElement("canvas");c.width=w;c.height=h;c.getContext("2d").drawImage(v,0,0,w,h);URL.revokeObjectURL(url);res(c.toDataURL("image/jpeg",q));}catch(e){URL.revokeObjectURL(url);rej();}};
  v.onloadeddata=()=>{try{v.currentTime=Math.min(1,(v.duration||2)/2);}catch(e){grab();}};v.onseeked=grab;v.onerror=()=>{URL.revokeObjectURL(url);rej();};setTimeout(grab,2500);});}
async function handleFile(file){pendingThumb=null;pendingKind=null;pendingName=file.name;const fn=document.getElementById("fname");if(fn)fn.textContent="processing...";
  try{ if(file.type.startsWith("image/")){pendingThumb=await thumbFromImage(file);pendingKind="image";}
    else if(file.type.startsWith("video/")){pendingThumb=await thumbFromVideo(file);pendingKind="video";} else pendingKind="file"; }
  catch(e){ pendingKind=file.type.startsWith("video/")?"video":"file"; }
  if(fn)fn.textContent=file.name+(pendingThumb?" · thumbnail ready ✓":" · saved as note");}
function renderLog(){
  const def=logPrefillWeek||currentWeek;logPrefillWeek=null;
  let h='<div class="section-title" style="margin-bottom:6px">Render <em>Log</em> & progress catalogue</div>'
    +'<div class="muted" style="margin-bottom:18px;max-width:660px">Document what you ship. Upload an image or video and a thumbnail snapshot is saved + '+(cloudActive()?"synced to your account":"kept in this browser")+'. For the full-res file, paste a link (Drive / Vercel / YouTube).</div>'
    +'<div class="panel card"><div class="log-form">'
    +'<div class="field"><label>Week</label><input type="number" id="lWeek" min="1" max="48" value="'+def+'"/></div>'
    +'<div class="field"><label>Title of the piece</label><input type="text" id="lTitle" placeholder="e.g. Week 06 - One-frame lighting study"/></div>'
    +'<div class="field" style="grid-column:1 / -1"><label>What I learned / notes</label><textarea id="lNote" placeholder="The technique, what broke, the breakthrough..."></textarea></div>'
    +'<div class="field" style="grid-column:1 / -1"><label>Upload render (image / video) - optional</label><div class="filebox"><span class="btn filebtn">Choose file<input type="file" id="lFile" accept="image/*,video/*"/></span><span class="fname" id="fname">no file chosen</span></div></div>'
    +'<div class="field" style="grid-column:1 / -1"><label>...or link to the full render - optional</label><input type="text" id="lLink" placeholder="https://...  (Drive, Vercel, YouTube)"/></div>'
    +'<div class="field" style="grid-column:1 / -1"><button class="btn gold" id="lAdd">＋ Add to catalogue</button></div>'
    +'</div></div><div id="gallery"></div>';
  document.getElementById("content").innerHTML=h;
  document.getElementById("lFile").addEventListener("change",e=>{if(e.target.files[0])handleFile(e.target.files[0]);});
  document.getElementById("lAdd").onclick=addEntry;renderGallery();
}
function renderGallery(){
  const g=document.getElementById("gallery");if(!g)return;
  if(!catalogue.length){g.innerHTML='<div class="empty"><div class="big">🎞️</div>No renders logged yet. Ship something this week and add it here.</div>';return;}
  const sorted=[...catalogue].sort((a,b)=>(b.date||0)-(a.date||0));let h='<div class="gallery">';
  sorted.forEach(en=>{const thumb=en.thumb?('style="background-image:url(\''+en.thumb+'\')"'):"";const icon=en.kind==="video"?"🎬":en.kind==="link"?"🔗":en.kind==="file"?"📄":"🖼️";const d=en.date?new Date(en.date):null;const ds=d?d.toLocaleDateString(undefined,{month:"short",day:"numeric"}):"";
    h+='<div class="logcard"><div class="thumb" '+thumb+'>'+(en.thumb?"":icon)+'<span class="kind">'+esc(en.kind||"note")+'</span></div>'
      +'<div class="lc-body"><div class="lc-top"><span class="lc-wk">Week '+esc(en.week||"-")+'</span><span class="lc-date">'+esc(ds)+'</span></div>'
      +'<h4>'+esc(en.title||"Untitled")+'</h4><p>'+esc(en.learned||"")+'</p>'
      +'<div class="lc-foot">'+(en.url?('<a href="'+esc(en.url)+'" target="_blank" rel="noopener" class="ext">open render ↗</a>'):'<span></span>')+'<button class="del" data-id="'+esc(en.id)+'">delete</button></div></div></div>';});
  h+='</div>';g.innerHTML=h;g.querySelectorAll(".del").forEach(b=>b.onclick=()=>delEntry(b.dataset.id));
}
async function addEntry(){
  const week=document.getElementById("lWeek").value,title=document.getElementById("lTitle").value.trim(),learned=document.getElementById("lNote").value.trim(),url=document.getElementById("lLink").value.trim();
  if(!title&&!url&&!pendingThumb&&!learned)return;
  const id="e"+Date.now()+Math.floor(Math.random()*999);let kind=pendingKind;if(!kind&&url)kind="link";
  const entry={id:id,week:week,title:title,learned:learned,url:url||null,kind:kind||"note",thumb:pendingThumb||null,name:pendingName||null,date:Date.now()};
  catalogue.push(entry);await dbSaveRender(entry);flash();updateLogDot();
  pendingThumb=null;pendingKind=null;pendingName=null;
  document.getElementById("lTitle").value="";document.getElementById("lNote").value="";document.getElementById("lLink").value="";
  const fn=document.getElementById("fname");if(fn)fn.textContent="no file chosen";const lf=document.getElementById("lFile");if(lf)lf.value="";renderGallery();
}
async function delEntry(id){catalogue=catalogue.filter(e=>e.id!==id);await dbDelRender(id);flash();updateLogDot();renderGallery();}
function updateLogDot(){const d=document.getElementById("logDot");if(d)d.textContent=catalogue.length?("("+catalogue.length+")"):"";}

/* ---------- START DATE ---------- */
function currentWeekFromStart(){if(!meta.startDate)return null;const days=Math.floor((new Date()-new Date(meta.startDate))/86400000);return Math.max(1,Math.min(48,Math.floor(days/7)+1));}
function refreshSuggest(){const el=document.getElementById("suggest"),di=document.getElementById("startDate");if(!el||!di)return;
  if(meta.startDate){di.value=meta.startDate;const cw=currentWeekFromStart();el.innerHTML='→ you are on <b style="color:var(--gold)">Week '+cw+'</b>';}else el.textContent="";}

/* ---------- TABS / LOAD / INIT ---------- */
function switchTab(t){activeTab=t;document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===t));
  if(t==="week")renderWeek();else if(t==="map")renderMap();else if(t==="ladders")renderLadders();else if(t==="drills")renderDrills();else if(t==="res")renderRes();else if(t==="log")renderLog();
  window.scrollTo({top:0,behavior:"smooth"});}
function finishLoad(){refreshSuggest();updateOverall();updateLogDot();switchTab(activeTab||"week");}
async function loadAndRender(){
  const b=await dbLoadState();
  progress=b.progress||{};notes=b.notes||{};meta=Object.assign({startDate:null,lastWeek:1},b.meta||{});
  catalogue=await dbLoadRenders();currentWeek=meta.lastWeek||1;finishLoad();
}
async function onSignIn(){
  const cBundle=await dbLoadState();
  const cRenders=await dbLoadRenders();
  const cloudEmpty=!cBundle||!cBundle.progress||Object.keys(cBundle.progress||{}).length===0;
  if(cloudEmpty){
    let lraw=await Store.get(STATE_KEY),lBundle=null;if(lraw){try{lBundle=JSON.parse(lraw);}catch(e){}}
    if(lBundle&&lBundle.progress&&Object.keys(lBundle.progress).length){
      progress=lBundle.progress||{};notes=lBundle.notes||{};meta=Object.assign({startDate:null,lastWeek:1},lBundle.meta||{});await dbSaveState();
    } else { progress=cBundle.progress||{};notes=cBundle.notes||{};meta=Object.assign({startDate:null,lastWeek:1},cBundle.meta||{}); }
  } else { progress=cBundle.progress||{};notes=cBundle.notes||{};meta=Object.assign({startDate:null,lastWeek:1},cBundle.meta||{}); }
  if(cRenders.length===0){
    const lkeys=await Store.list(CAT_PREFIX);
    if(lkeys.length){const arr=[];for(const k of lkeys){try{const v=await Store.get(k);if(v){const e=JSON.parse(v);arr.push(e);await dbSaveRender(e);}}catch(e){}}catalogue=arr;}else catalogue=[];
  } else catalogue=cRenders;
  currentWeek=meta.lastWeek||1;finishLoad();
}
async function init(){
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
  document.getElementById("startDate").addEventListener("change",e=>{meta.startDate=e.target.value||null;dbSaveState();refreshSuggest();if(activeTab==="week")renderWeek();});
  setAuthUI();
  await loadAndRender();
  initFirebase();
}
init();