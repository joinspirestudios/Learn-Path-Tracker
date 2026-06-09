// ── views.js ──────────────────────────────────────────────────────────────
// All view renderers (catalog, today, week, plan, map, ladders, drills,
// resources, log) and their event wiring. View-internal navigation
// (goCatalog, goWeek, openSkill) lives here too. Tab switching itself sits
// in main.js and is reached via store.nav.switchTab().

import { SKILLS } from './data.js';
import { TEMPLATES } from './templates.js';
import { store } from './store.js';
import { $, esc, flash, undoToast } from './helpers.js';
import {
  dbSaveState, dbSaveRender, dbDelRender, dbCreatePlatformPath, dbLoadPlatformPath,
  dbRequestAccess, dbLoadMyAccessRequest, dbSavePlatformPath,
  dbEnsureEnrollment, dbReconcileEnrollment, dbSaveEnrollment, dbSaveDayLog,
  dbStartEnrollment, enrollmentIdFor, makeDayLog,
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
import { applyHeader, updateOverall } from './header.js';
import { configPresent, cloudActive } from './db.js';
import { canManageMembers, canPreviewPath, canRequestAccess, canViewPath } from './platform.js';
import {
  canCompleteDay, canOpenDay, dateForJourneyDay, getDayStatus,
  getMaxRoadmapDay, getTasksForDay, journeyDayForDate,
  localDateString, normalizeDurationDays,
} from './journey.js';

/* ---- debounced save (formerly the file-level noteTimer pattern) ---- */
let _noteTimer = null;
let selectedJourneyDay = null;
let evidenceFormTaskId = null;
let evidenceProofType = 'url';
let evidenceBusy = false;
let evidenceError = '';
let aiBuilder = null;
function scheduleSave(ms = 650){
  clearTimeout(_noteTimer);
  _noteTimer = setTimeout(saveCurrentPath, ms);
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
      ? (def.ownerId === (store.currentUser && store.currentUser.uid) ? 'Your platform path' : 'Public path')
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
  $('content').querySelectorAll('.skill-card[data-id]').forEach(c => c.onclick = () => openSkill(c.dataset.id));
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
  return meta + (total ? (total + ' tasks across ' + (def.weeks || []).length + ' sections') : 'Empty path. Open it to add sections, tasks, and resources.');
}

async function importLocalPath(id){
  if(!cloudActive()){
    openAuthModal('signup');
    return;
  }
  const local = store.state.userPaths[id];
  if(!local || local.platform) return;
  const newId = await dbCreatePlatformPath({
    ...JSON.parse(JSON.stringify(local)),
    visibility: 'private',
    discoverable: false,
    migratedFromLocal: true,
  }, id);
  if(newId){
    flash('Imported as private path');
    await openSkill(newId);
    store.editMode = true;
    renderPlan();
  }
}

const AI_NON_NEGOTIABLES = [
  'Read 10 pages',
  'Run or walk 1km',
  'Gym or training',
  'Deep work',
  'Sleep 8 hours',
  'No soda',
  'Course or learning progress',
  'Post on social media',
];

function aiPromptDefaults(){
  return {
    goal:'',
    durationDays:75,
    currentLevel:'beginner',
    intensity:'moderate',
    pathType:'skill',
    resourceLinks:'',
    dailyTime:'',
    evidenceStyle:'',
    includeTasks:'',
    excludeTasks:'',
    visibility:'private',
    description:'',
    nonNegotiables:[],
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

function titleFromGoal(goal){
  const cleaned = String(goal || 'New path').replace(/^i want to\s+/i, '').trim() || 'New path';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function normalizeGeneratedDraft(raw, prompt){
  if(!raw || typeof raw !== 'object') throw new Error('The generator returned an invalid draft.');
  const durationDays = clampDay(raw.durationDays || prompt.durationDays, 1, 365);
  const sections = (Array.isArray(raw.sections) ? raw.sections : []).slice(0, 12).map((s, i) => ({
    title:String(s.title || ('Section ' + (i + 1))).slice(0, 100),
    description:String(s.description || '').slice(0, 500),
    order:Number.isFinite(Number(s.order)) ? Number(s.order) : i,
  })).filter(s => s.title);
  if(!sections.length) sections.push({ title:'Foundation', description:'Start here.', order:0 });
  const sectionNames = new Set(sections.map(s => s.title));
  const tasks = (Array.isArray(raw.tasks) ? raw.tasks : []).slice(0, 90).map((t, i) => {
    const scheduleType = t.scheduleType === 'daily' ? 'daily' : 'once';
    const startDay = clampDay(t.startDay || t.unlockDay || 1, 1, durationDays);
    const endDay = scheduleType === 'daily' ? clampDay(t.endDay || durationDays, startDay, durationDays) : null;
    const unlockDay = scheduleType === 'once' ? clampDay(t.unlockDay || startDay, startDay, durationDays) : null;
    return {
      title:String(t.title || ('Task ' + (i + 1))).slice(0, 140),
      description:String(t.description || '').slice(0, 500),
      sectionTitle:sectionNames.has(t.sectionTitle) ? t.sectionTitle : sections[0].title,
      scheduleType,
      startDay,
      endDay,
      unlockDay,
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
      url:String(r.url || '').slice(0, 300),
      description:String(r.description || '').slice(0, 300),
    })).filter(r => r.url),
    notes:(Array.isArray(raw.notes) ? raw.notes : []).map(n => String(n || '').slice(0, 300)).filter(Boolean).slice(0, 8),
    source:raw.source || 'ai',
  };
}

function localGeneratedDraft(prompt){
  const durationDays = clampDay(prompt.durationDays, 75, 365);
  const title = titleFromGoal(prompt.goal);
  const sections = [
    { title:'Foundation', description:'Set up the routine and first repeatable actions.', order:0 },
    { title:'Build', description:'Practice consistently and make visible progress.', order:1 },
    { title:'Review', description:'Reflect, ship proof, and decide the next step.', order:2 },
  ];
  const daily = prompt.nonNegotiables.length ? prompt.nonNegotiables : ['Work on the goal'];
  const tasks = daily.slice(0, 8).map((name, i) => ({
    title:name,
    description:'Repeat this commitment during the path.',
    sectionTitle:'Foundation',
    scheduleType:'daily',
    startDay:1,
    endDay:durationDays,
    unlockDay:null,
    evidenceRequired:/(run|walk|gym|train|workout|course|post|publish|design|project|deep work|proof|upload)/i.test(name + ' ' + prompt.evidenceStyle),
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
      startDay:day,
      endDay:null,
      unlockDay:day,
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
    startDay:durationDays,
    endDay:null,
    unlockDay:durationDays,
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
      startDay:task.startDay == null ? null : Number(task.startDay),
      endDay:task.endDay == null ? null : Number(task.endDay),
      unlockDay:task.unlockDay == null ? null : Number(task.unlockDay),
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
    prompt: aiBuilder?.prompt || aiPromptDefaults(),
    draft: aiBuilder?.draft || null,
    loading:false,
    error:'',
    message:'',
    dirty:false,
  };
  overlay.addEventListener('click', e => { if(e.target === overlay) closeAIBuilder(); });
  renderAIBuilder();
}

function closeAIBuilder(){
  if(aiBuilder?.overlay) aiBuilder.overlay.remove();
  aiBuilder = null;
}

function collectAIPrompt(){
  const nonNegotiables = Array.from(aiBuilder.overlay.querySelectorAll('.ai-nn:checked')).map(x => x.value);
  aiBuilder.prompt = {
    goal:($('aiGoal')?.value || '').trim(),
    durationDays:clampDay($('aiDuration')?.value || 75, 75, 365),
    currentLevel:$('aiLevel')?.value || 'beginner',
    intensity:$('aiIntensity')?.value || 'moderate',
    pathType:$('aiType')?.value || 'skill',
    resourceLinks:($('aiResources')?.value || '').trim(),
    dailyTime:($('aiDailyTime')?.value || '').trim(),
    evidenceStyle:($('aiEvidenceStyle')?.value || '').trim(),
    includeTasks:($('aiInclude')?.value || '').trim(),
    excludeTasks:($('aiExclude')?.value || '').trim(),
    visibility:$('aiVisibility')?.value || 'private',
    description:($('aiDescription')?.value || '').trim(),
    nonNegotiables,
  };
  return aiBuilder.prompt;
}

function aiPromptHTML(){
  const p = aiBuilder.prompt;
  return '<div class="modal-box ai-modal"><div class="modal-head"><h3>Build path with AI</h3><button class="modal-x">x</button></div>'
    + '<div class="modal-body">'
    + '<div class="ai-note">Generate an editable starting point. Review and save only when it fits your plan.</div>'
    + (aiBuilder.error ? '<div class="form-error">' + esc(aiBuilder.error) + '</div>' : '')
    + '<div class="field"><label>Goal</label><textarea id="aiGoal" placeholder="I want to learn video editing in 90 days">' + esc(p.goal) + '</textarea></div>'
    + '<div class="ai-grid">'
    + '<div class="field"><label>Duration in days</label><input type="number" id="aiDuration" min="1" max="365" value="' + esc(p.durationDays) + '"/></div>'
    + '<div class="field"><label>Current level</label><select id="aiLevel">' + selectOptions(['beginner', 'intermediate', 'advanced'], p.currentLevel) + '</select></div>'
    + '<div class="field"><label>Intensity</label><select id="aiIntensity">' + selectOptions(['light', 'moderate', 'intense'], p.intensity) + '</select></div>'
    + '<div class="field"><label>Path type</label><select id="aiType">' + selectOptions(['skill', 'habit', 'challenge', 'fitness', 'content', 'business', 'spiritual/devotional', 'custom'], p.pathType) + '</select></div>'
    + '</div>'
    + '<div class="ai-nn-wrap"><label>Daily non-negotiables</label><div class="ai-checks">' + AI_NON_NEGOTIABLES.map(item => '<label><input type="checkbox" class="ai-nn" value="' + esc(item) + '" ' + (p.nonNegotiables.includes(item) ? 'checked' : '') + '/>' + esc(item) + '</label>').join('') + '</div></div>'
    + '<div class="ai-grid">'
    + '<div class="field"><label>Daily time available</label><input type="text" id="aiDailyTime" value="' + esc(p.dailyTime) + '" placeholder="30 minutes, 2 hours..."/></div>'
    + '<div class="field"><label>Default visibility</label><select id="aiVisibility">' + selectOptions(['private', 'unlisted', 'public'], p.visibility) + '</select></div>'
    + '</div>'
    + '<div class="field"><label>Preferred proof/evidence style</label><input type="text" id="aiEvidenceStyle" value="' + esc(p.evidenceStyle) + '" placeholder="URL posts, screenshots, photos, final files..."/></div>'
    + '<div class="field"><label>Existing resource links</label><textarea id="aiResources" placeholder="Paste links, one or many">' + esc(p.resourceLinks) + '</textarea></div>'
    + '<div class="field"><label>Tasks to include</label><textarea id="aiInclude" placeholder="Tasks you already know you want">' + esc(p.includeTasks) + '</textarea></div>'
    + '<div class="field"><label>Tasks to avoid</label><textarea id="aiExclude" placeholder="Anything you do not want included">' + esc(p.excludeTasks) + '</textarea></div>'
    + '<div class="field"><label>Path description</label><textarea id="aiDescription" placeholder="Optional public-facing description">' + esc(p.description) + '</textarea></div>'
    + '<div class="ai-actions"><button class="btn" id="aiCancel">Cancel</button><button class="btn" id="aiBasic">Basic starter</button><button class="btn gold" id="aiGenerate" ' + (aiBuilder.loading ? 'disabled' : '') + '>' + (aiBuilder.loading ? 'Generating...' : 'Generate draft') + '</button></div>'
    + '</div></div>';
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
    + '<div class="ai-actions"><button class="btn" id="aiEditPrompt">Edit prompt</button><button class="btn" id="aiRegenerate">Regenerate</button><button class="btn" id="aiCancel">Cancel</button><button class="btn gold" id="aiSave">Save path</button></div>'
    + '</div></div>';
}

function aiTaskRowHTML(t, i, sectionOptions){
  return '<div class="ai-task-row">'
    + '<input class="ai-task-field ai-title" data-i="' + i + '" data-key="title" value="' + esc(t.title) + '" placeholder="Task title"/>'
    + '<select class="ai-task-field" data-i="' + i + '" data-key="sectionTitle">' + selectOptions(sectionOptions, t.sectionTitle) + '</select>'
    + '<select class="ai-task-field" data-i="' + i + '" data-key="scheduleType">' + selectOptions(['daily', 'once'], t.scheduleType) + '</select>'
    + '<input type="number" class="ai-task-field" data-i="' + i + '" data-key="startDay" value="' + esc(t.startDay || 1) + '" min="1"/>'
    + '<input type="number" class="ai-task-field" data-i="' + i + '" data-key="endDay" value="' + esc(t.endDay || '') + '" min="1" placeholder="End"/>'
    + '<input type="number" class="ai-task-field" data-i="' + i + '" data-key="unlockDay" value="' + esc(t.unlockDay || '') + '" min="1" placeholder="Unlock"/>'
    + '<label><input type="checkbox" class="ai-task-field" data-i="' + i + '" data-key="evidenceRequired" ' + (t.evidenceRequired ? 'checked' : '') + '/> Proof</label>'
    + '<button class="icon-btn danger" data-ai-act="delTask" data-i="' + i + '">x</button>'
    + '<input class="ai-task-field" data-i="' + i + '" data-key="resourceUrl" value="' + esc(t.resourceUrl || '') + '" placeholder="Task resource URL"/>'
    + '<textarea class="ai-task-field" data-i="' + i + '" data-key="description" placeholder="Description">' + esc(t.description || '') + '</textarea>'
    + '</div>';
}

function renderAIBuilder(){
  if(!aiBuilder?.overlay) return;
  aiBuilder.overlay.innerHTML = aiBuilder.mode === 'review' && aiBuilder.draft ? aiReviewHTML() : aiPromptHTML();
  const close = aiBuilder.overlay.querySelector('.modal-x');
  if(close) close.onclick = closeAIBuilder;
  const cancel = $('aiCancel'); if(cancel) cancel.onclick = closeAIBuilder;
  const generate = $('aiGenerate'); if(generate) generate.onclick = () => generateAIPath(false);
  const basic = $('aiBasic'); if(basic) basic.onclick = () => generateAIPath(true);
  const editPrompt = $('aiEditPrompt'); if(editPrompt) editPrompt.onclick = () => { aiBuilder.mode = 'prompt'; renderAIBuilder(); };
  const regenerate = $('aiRegenerate'); if(regenerate) regenerate.onclick = () => {
    if(aiBuilder.dirty && !confirm('Regenerate this draft and replace your edits?')) return;
    generateAIPath(false);
  };
  const save = $('aiSave'); if(save) save.onclick = saveGeneratedPath;
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
      else if(['startDay', 'endDay', 'unlockDay'].includes(key)) task[key] = e.target.value ? clampDay(e.target.value, 1, aiBuilder.draft.durationDays) : null;
      else task[key] = e.target.value;
      if(key === 'scheduleType') renderAIBuilder();
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
  if(action === 'addTask') d.tasks.push({ title:'New task', description:'', sectionTitle:d.sections[0].title, scheduleType:'once', startDay:1, endDay:null, unlockDay:1, evidenceRequired:false, resourceUrl:null, order:d.tasks.length });
  if(action === 'delTask') d.tasks.splice(i, 1);
  if(action === 'addResource') d.resources.push({ title:'Resource', url:'', description:'' });
  if(action === 'delResource') d.resources.splice(i, 1);
  aiBuilder.dirty = true;
  renderAIBuilder();
}

async function generateAIPath(forceBasic){
  const prompt = collectAIPrompt();
  if(!prompt.goal){
    aiBuilder.error = 'Add a goal before generating a path.';
    renderAIBuilder();
    return;
  }
  aiBuilder.loading = true;
  aiBuilder.error = '';
  aiBuilder.message = '';
  renderAIBuilder();
  try{
    let payload = null;
    if(!forceBasic){
      try{
        const res = await fetch('/api/generate-path', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body:JSON.stringify(prompt),
        });
        payload = await res.json();
        if(!res.ok || !payload.ok){
          const err = new Error(payload.message || 'AI generation failed.');
          err.code = payload.code || '';
          throw err;
        }
      }catch(e){
        if(e.code === 'missing_anthropic_config'){
          payload = { ok:true, draft:localGeneratedDraft(prompt), source:'fallback', message:'Anthropic is not configured. A basic starter template was created instead.' };
        } else if(e.code === 'missing_tool_use'){
          throw new Error('Claude did not return the required structured path draft. Please regenerate.');
        } else if(e.code === 'invalid_ai_output'){
          throw new Error('Claude returned a path draft that could not be validated. Please regenerate.');
        } else {
          throw e;
        }
      }
    } else {
      payload = { ok:true, draft:localGeneratedDraft(prompt), source:'fallback', message:'Basic starter template created without AI.' };
    }
    aiBuilder.draft = normalizeGeneratedDraft(payload.draft, prompt);
    aiBuilder.draft.source = payload.source || aiBuilder.draft.source;
    aiBuilder.message = payload.message || (payload.source === 'ai' ? 'AI draft generated. Review before saving.' : 'Basic starter template created. Review before saving.');
    aiBuilder.mode = 'review';
    aiBuilder.dirty = false;
  }catch(e){
    aiBuilder.error = e.message || 'Could not generate a draft.';
  }finally{
    aiBuilder.loading = false;
    renderAIBuilder();
  }
}

async function saveGeneratedPath(){
  if(!aiBuilder?.draft) return;
  const localPath = aiDraftToLocalPath(normalizeGeneratedDraft(aiBuilder.draft, aiBuilder.prompt));
  let id = 'up_' + Date.now().toString(36) + Math.floor(Math.random()*999).toString(36);
  if(cloudActive()){
    const cloudId = await dbCreatePlatformPath(localPath);
    if(!cloudId){
      aiBuilder.error = 'Could not save this generated path.';
      renderAIBuilder();
      return;
    }
    id = cloudId;
  } else if(configPresent()){
    aiBuilder.error = 'Sign in to save this generated path to the platform. Your draft will stay open.';
    renderAIBuilder();
    openAuthModal('signup');
    return;
  } else {
    store.state.userPaths[id] = localPath;
    await dbSaveState();
  }
  ensureSkill(id);
  closeAIBuilder();
  await openSkill(id);
  store.editMode = true;
  renderPlan();
  flash('Generated path saved as private');
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
    + '<div class="muted" style="font-size:12px;margin-bottom:10px">Start from a template or blank. Everything stays fully editable after you create it.</div>'
    + '<div class="tpl-list">' + list + '</div>'
    + '<div class="field" style="margin-top:14px"><label>Path name</label><input type="text" id="npTitle" placeholder="Name your path" maxlength="80"/></div>'
    + '<div class="field" style="margin-top:10px"><label>Your goal (optional)</label><textarea id="npGoal" placeholder="What does finishing this path look like?"></textarea></div>'
    + '<div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:16px;flex-wrap:wrap"><button class="btn" id="npAi">Build with AI</button><div style="display:flex;gap:10px"><button class="btn" id="npCancel">Cancel</button><button class="btn gold" id="npCreate">Create path</button></div></div>'
    + '</div></div>';
  document.body.appendChild(o);
  const close = () => o.remove();
  o.addEventListener('click', e => { if(e.target === o) close(); });
  o.querySelector('.modal-x').onclick = close;
  o.querySelector('#npCancel').onclick = close;
  o.querySelector('#npAi').onclick = () => { close(); openAIPathBuilder(); };
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
          unlockDay: tk.unlockDay == null ? null : tk.unlockDay,
          startDay: tk.startDay == null ? null : tk.startDay,
          endDay: tk.endDay == null ? null : tk.endDay,
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
      visibility: 'private', discoverable: false, previewEnabled: true,
      previewTitle: title, previewDescription: goal, previewIncludesScheme: false,
      coverImage: null, profileImage: null, created: Date.now(), weeks,
    };
    if(cloudActive()){
      const cloudId = await dbCreatePlatformPath(localPath);
      if(!cloudId) return;
      id = cloudId;
    } else {
      store.state.userPaths[id] = localPath;
      await dbSaveState();
    }
    ensureSkill(id);
    close(); await openSkill(id);
    if(pick === 'blank'){ store.editMode = true; }
    store.nav.switchTab('plan');
  };
}

/* ---- enter / leave a skill ---- */
export async function openSkill(id){
  store.state.current = id; ensureSkill(id); store.editMode = false;
  if(isUserPath(id)){
    await dbEnsureEnrollment(id);
    const def = store.state.userPaths[id];
    const enrollment = currentEnrollmentForPath(id);
    const todayDay = enrollment?.startDate ? journeyDayForDate(enrollment.startDate) : 1;
    const taskCount = getTasksForDay(def, Math.max(1, Number(enrollment?.currentDay || todayDay))).length;
    await dbReconcileEnrollment(id, taskCount);
    const reconciled = currentEnrollmentForPath(id);
    if(reconciled?.id) await listEvidenceSubmissions(reconciled.id).catch(() => {});
  }
  const def = (store.state.skills[id] && store.state.skills[id].meta) || {};
  store.currentWeek = def.lastWeek || 1;
  const startTab = isUserPath(id) ? 'plan' : 'today';
  store.activeTab = startTab;
  await dbSaveState(); applyHeader();
  if(!isUserPath(id)) refreshSuggest();
  updateOverall(); store.nav.switchTab(startTab);
  if(location.hash !== '#/path/' + encodeURIComponent(id)){
    history.replaceState(null, '', '#/path/' + encodeURIComponent(id));
  }
  window.scrollTo({ top:0, behavior:'smooth' });
}
export function goCatalog(){
  store.state.current = null; store.editMode = false;
  dbSaveState(); applyHeader(); renderCatalog();
  if(location.hash !== '#/discover') history.replaceState(null, '', '#/discover');
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
  await openPathRoute(parts[1], parts[2] === 'preview');
  return true;
}

async function openPathRoute(id, forcePreview){
  if(isUserPath(id) || SKILLS.some(s => s.id === id)){
    if(forcePreview && isUserPath(id)){
      const def = store.state.userPaths[id];
      renderPathPreview({ id, path:def.platformData || def, membership:def.membership || null, sections:[], tasks:[] });
    } else await openSkill(id);
    return;
  }
  const record = await dbLoadPlatformPath(id);
  if(!record){
    renderMissingPath();
    return;
  }
  if(!forcePreview && canViewPath(record.path, record.membership, store.currentUser)){
    await openSkill(id);
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
  const logs = enrollment?.dayLogs || {};
  const today = localDateString();
  const totalDays = getMaxRoadmapDay(def, enrollment);
  const activeDay = enrollment?.startDate ? journeyDayForDate(enrollment.startDate, today) : 1;
  let h = '<div class="panel card roadmap-foundation">'
    + '<div class="road-head"><div><div class="chip">Roadmap</div><h3>Daily journey</h3></div>'
    + '<div class="road-stats"><span>Streak ' + esc(enrollment?.streak || 0) + '</span><span>Freezes ' + esc(enrollment?.freezeCount ?? 1) + '</span></div></div>';
  if(!enrollment?.startDate){
    h += '<div class="journey-start"><div><b>Start this path</b><p>Set today as Day 1 and begin tracking daily progress.</p></div><button class="btn gold" id="startJourney">Start this path</button></div>';
  }
  h += '<div class="road-days vertical">';
  for(let day = 1; day <= totalDays; day++){
    const status = getDayStatus(day, enrollment, logs, today);
    const open = canOpenDay(day, status);
    const date = enrollment?.startDate ? dateForJourneyDay(enrollment.startDate, day) : null;
    const taskCount = getTasksForDay(def, day).length;
    h += '<button type="button" class="road-day ' + status + (day === activeDay ? ' today' : '') + '" data-road-day="' + day + '" ' + (open ? '' : 'disabled') + '>'
      + '<span>Day ' + day + '</span><small>' + esc(statusLabel(status)) + (date ? ' · ' + esc(date.slice(5)) : '') + '</small>'
      + '<em>' + (open ? (taskCount + ' task' + (taskCount === 1 ? '' : 's')) : 'Unlocks later') + '</em></button>';
  }
  h += '</div></div>';
  return h;
}

function journeyDetailHTML(id, def){
  const enrollment = currentEnrollmentForPath(id);
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
        const isVerified = verified.has(task.id);
        const isCompleted = completed.has(task.id);
        const label = task.evidenceRequired
          ? (isVerified ? 'Proof submitted' : (isCompleted ? 'Completed before proof tracking' : 'Not completed'))
          : (isCompleted ? 'Completed' : 'Not completed');
        h += '<div class="history-task ' + (completed.has(task.id) ? 'done' : '') + '"><b>' + esc(task.title || task.text || 'Task') + '</b>'
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
        if(task.evidenceRequired){
          const isVerified = verified.has(task.id);
          h += '<div class="journey-task proof-required ' + (isVerified ? 'done' : '') + '">'
            + '<span><b>' + esc(task.title || task.text || 'Task') + '</b>'
            + (task.description ? '<small>' + esc(task.description) + '</small>' : '')
            + '<small class="evidence-note">' + (isVerified ? 'Proof submitted' : 'Require proof for this task') + '</small></span>'
            + (isVerified ? '<span class="proof-pill">Verified</span>' : '<button class="btn add-evidence" data-task="' + esc(task.id) + '">Add proof</button>')
            + evidenceFormHTML(task)
            + '</div>';
        } else {
          h += '<label class="journey-task ' + (completed.has(task.id) ? 'done' : '') + '"><input type="checkbox" class="ck journey-ck" data-task="' + esc(task.id) + '" ' + (completed.has(task.id) ? 'checked' : '') + '/>'
            + '<span><b>' + esc(task.title || task.text || 'Task') + '</b>'
            + (task.description ? '<small>' + esc(task.description) + '</small>' : '')
            + (completed.has(task.id) ? '<small class="evidence-note">Completed without proof</small>' : '')
            + '</span></label>';
        }
      });
      h += '</div>';
    } else {
      h += '<div class="muted">No tasks assigned to this day. You can still complete the day.</div>';
    }
    const ready = dayTasks.length === 0 || completeCount === dayTasks.length;
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
  const today = localDateString();
  const totalDays = getMaxRoadmapDay(def, enrollment);
  const day = enrollment?.startDate ? Math.min(journeyDayForDate(enrollment.startDate, today), totalDays) : 0;
  const status = enrollment?.startDate ? getDayStatus(day || 1, enrollment, enrollment.dayLogs || {}, today) : 'not started';
  const todayTasks = enrollment?.startDate ? getTasksForDay(def, day || 1) : [];
  const log = enrollment?.dayLogs && (enrollment.dayLogs[day] || enrollment.dayLogs[String(day)]);
  const done = todayTasks.filter(task => taskIsDone(task, log)).length;
  return '<div class="panel card journey-status">'
    + '<div><span>Day</span><b>' + (day || '-') + ' of ' + totalDays + '</b></div>'
    + '<div><span>Streak</span><b>' + esc(enrollment?.streak || 0) + '</b></div>'
    + '<div><span>Freezes</span><b>' + esc(enrollment?.freezeCount ?? 1) + '</b></div>'
    + '<div><span>Started</span><b>' + esc(enrollment?.startDate || 'Not yet') + '</b></div>'
    + '<div><span>Today</span><b>' + esc(statusLabel(status)) + '</b></div>'
    + '<div><span>Progress</span><b>' + done + '/' + todayTasks.length + '</b></div>'
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
  const dayTasks = getTasksForDay(def, day);
  const existing = dayLogFor(enrollment, day);
  const completedTaskIds = existing?.completedTaskIds || [];
  const verifiedTaskIds = existing?.verifiedTaskIds || [];
  if(dayTasks.some(task => task.evidenceRequired ? !verifiedTaskIds.includes(task.id) : !completedTaskIds.includes(task.id))) return;
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
    await dbStartEnrollment(id, getTasksForDay(def, 1).length);
    selectedJourneyDay = 1;
    evidenceFormTaskId = null;
    evidenceProofType = 'url';
    renderPlan();
  };
  $('content').querySelectorAll('[data-road-day]').forEach(btn => {
    btn.onclick = async () => {
      selectedJourneyDay = Number(btn.dataset.roadDay || 1);
      evidenceFormTaskId = null;
      evidenceProofType = 'url';
      evidenceError = '';
      const enrollment = currentEnrollmentForPath(id);
      if(enrollment?.id) await listEvidenceSubmissions(enrollment.id, selectedJourneyDay).catch(() => {});
      renderPlan();
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

  h += journeyStatusHTML(id, def);
  h += roadmapHTML(id, def);
  h += journeyDetailHTML(id, def);

  if(store.editMode){
    h += '<div class="panel card edit-meta"><div class="field"><label>Path name</label><input type="text" id="pmTitle" value="' + esc(def.title) + '" maxlength="80"/></div>'
      + '<div class="field" style="margin-top:10px"><label>Goal / description</label><textarea id="pmGoal" placeholder="What does finishing look like?">' + esc(def.goal || '') + '</textarea></div>'
      + '<div class="edit-grid">'
      + '<div class="field"><label>Category</label><input type="text" id="pmCategory" value="' + esc(def.category || '') + '" placeholder="Fitness, 3D, business..."/></div>'
      + '<div class="field"><label>Duration in days</label><input type="number" id="pmDurationDays" min="1" value="' + esc(def.durationDays || '') + '" placeholder="75"/></div>'
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
          + '<label>Schedule<select class="task-schedule" data-wi="' + wi + '" data-ti="' + ti + '"><option value="once">Once</option><option value="daily">Daily</option></select></label>'
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
    task.unlockDay = task.scheduleType === 'daily' ? (task.startDay || null) : task.startDay;
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
    if(act === 'addTask'){ (def.weeks[wi].tasks = def.weeks[wi].tasks || []).push({ text:'', scheduleType:'once', startDay:1, endDay:null }); }
    else if(act === 'delTask'){ def.weeks[wi].tasks.splice(ti, 1); }
    else if(act === 'addRes'){ (def.weeks[wi].resources = def.weeks[wi].resources || []).push({ label:'', url:'' }); }
    else if(act === 'delRes'){ def.weeks[wi].resources.splice(ri, 1); }
    else if(act === 'addWeek'){ def.weeks.push({ title:'Week ' + (def.weeks.length+1), tasks:[{text:''}], resources:[] }); }
    else if(act === 'delWeek'){
      // Snapshot the week so Undo can reinsert it at the same index.
      const snap = JSON.parse(JSON.stringify(def.weeks[wi]));
      def.weeks.splice(wi, 1);
      upSave(); renderPlan();
      undoToast('Week removed', () => { def.weeks.splice(wi, 0, snap); upSave(); renderPlan(); });
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
