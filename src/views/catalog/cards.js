import { esc } from '../../helpers.js';
import { discoveryCategory, proofSignals } from '../../discovery.js';
import {
  displayableActiveThisWeek, isOwner, normalizePathStats, resolveCreatorName,
} from '../../platform.js';
import { catalogCtaForPath } from './access.js';

function tagListHTML(values, className){
  return '<div class="' + className + '">' + values.map(value => '<span>' + esc(value) + '</span>').join('') + '</div>';
}

export function pathCardBlurb(def, total, { pathTasksReady } = {}){
  const bits = [];
  if(def.category) bits.push(esc(def.category));
  if(def.durationLabel) bits.push(esc(def.durationLabel));
  if(def.visibility) bits.push(esc(def.visibility));
  const stats = normalizePathStats(def.stats, def);
  const active = displayableActiveThisWeek(stats);
  if(stats.joinedCount) bits.push(stats.joinedCount + ' joined');
  if(active) bits.push(active + ' active this week');
  if(stats.publicProgressCount) bits.push(stats.publicProgressCount + ' public updates');
  if(stats.completedCount) bits.push(stats.completedCount + ' completed');
  const meta = bits.length ? bits.join(' &middot; ') + '. ' : '';
  const taskCount = total || Number(def.taskCount || 0);
  const sectionCount = (def.weeks || []).length || Number(def.sectionCount || 0);
  const tasksReady = typeof pathTasksReady === 'function' ? pathTasksReady(def) : true;
  if(def.platform && !tasksReady && !taskCount && !sectionCount) return meta + 'Open to load sections and tasks.';
  if(def.platform && !tasksReady && !taskCount && sectionCount) return meta + sectionCount + ' sections. Open to load task details.';
  return meta + (taskCount ? (taskCount + ' tasks across ' + sectionCount + ' sections') : 'Empty path. Open it to add sections, tasks, and resources.');
}

export function publicPathCardHTML(path, { store, canOpenFullPath } = {}){
  const id = path.id;
  const stats = normalizePathStats(path.stats, path);
  const active = displayableActiveThisWeek(stats);
  const signals = proofSignals(path);
  const creator = resolveCreatorName(path, store?.currentUser);
  const category = discoveryCategory(path);
  const full = !!canOpenFullPath?.(id, store?.state?.userPaths?.[id]);
  const owner = isOwner(path.platformData || path, store?.currentUser);
  const cta = catalogCtaForPath({ owner, fullAccess:full });
  const chips = [];
  if(category) chips.push(category);
  if(path.durationDays) chips.push(path.durationDays + ' days');
  else if(path.durationLabel) chips.push(path.durationLabel);
  if(path.intensity) chips.push(String(path.intensity).charAt(0).toUpperCase() + String(path.intensity).slice(1));
  if(stats.joinedCount) chips.push(stats.joinedCount + ' joined');
  if(stats.publicProgressCount) chips.push(stats.publicProgressCount + ' public updates');
  if(stats.proofSubmissionCount) chips.push(stats.proofSubmissionCount + ' proof submitted');
  if(stats.completedCount) chips.push(stats.completedCount + ' completed');
  if(active) chips.push(active + ' active this week');
  const badges = [];
  if(signals.proofBacked) badges.push('Proof-backed');
  if(signals.activeThisWeek) badges.push('Active this week');
  const summary = path.previewDescription || path.description || path.goal || 'A public learning path with preview-first access.';
  return '<button class="skill-card aurora-path-card discovery-card" data-id="' + esc(id) + '">'
    + '<div class="aurora-path-card-meta"><span class="aurora-path-card-creator">By ' + esc(creator) + '</span><span class="aurora-path-card-status">Public preview</span></div>'
    + '<h3 class="aurora-path-card-title">' + esc(path.title || 'Untitled path') + '</h3>'
    + '<p class="aurora-path-card-subtitle">' + esc(category || 'Learning path') + '</p>'
    + '<p class="aurora-path-card-description">' + esc(summary.length > 150 ? summary.slice(0, 147) + '...' : summary) + '</p>'
    + tagListHTML(badges.length ? badges : ['Proof status pending'], 'aurora-path-card-tags')
    + tagListHTML(chips.length ? chips : ['No public metrics yet'], 'aurora-path-card-metrics')
    + '<div class="aurora-path-card-action">' + cta + '</div></button>';
}

export function builtInPathCardHTML(skill, { pathTitle, pathGoal, totalsFor, store } = {}){
  const t = totalsFor(skill.id);
  const pct = t.total ? Math.round(t.done / t.total * 100) : 0;
  const started = !!(store.state.skills[skill.id] && Object.keys(store.state.skills[skill.id].progress || {}).length);
  return '<button class="skill-card aurora-path-card" data-id="' + esc(skill.id) + '">'
    + '<div class="aurora-path-card-meta"><span class="aurora-path-card-creator">Built-in path</span><span class="aurora-path-card-status">' + (started ? 'Started' : 'Ready') + '</span></div>'
    + '<h3 class="aurora-path-card-title">' + esc(pathTitle(skill.id)) + '</h3>'
    + '<p class="aurora-path-card-subtitle">' + esc(pathGoal(skill.id)) + '</p>'
    + '<p class="aurora-path-card-description">' + esc(skill.blurb) + '</p>'
    + '<div class="aurora-path-card-metrics"><span>' + pct + '% complete</span></div>'
    + '<div class="aurora-path-card-progress"><div class="progress-bar"><div style="width:' + pct + '%"></div></div></div>'
    + '<div class="aurora-path-card-action">' + (started ? 'Continue' : 'Start') + ' &rarr;</div></button>';
}

export function personalPathCardHTML(id, {
  store, pathTitle, pathGoal, totalsFor, canOpenFullPath, pathTasksReady, cloudActive,
} = {}){
  const def = store.state.userPaths[id];
  const t = totalsFor(id);
  const pct = t.total ? Math.round(t.done / t.total * 100) : 0;
  const goal = pathGoal(id);
  const cta = def.platform && !canOpenFullPath(id, def) ? 'View &rarr;' : 'Open &rarr;';
  const badge = def.platform
    ? ('By ' + resolveCreatorName(def, store.currentUser))
    : (cloudActive() ? 'Local draft' : 'Your path');
  let html = '<button class="skill-card aurora-path-card" data-id="' + esc(id) + '">'
    + '<div class="aurora-path-card-meta"><span class="aurora-path-card-creator">' + esc(badge) + '</span><span class="aurora-path-card-status">' + (def.platform ? 'Platform path' : 'Private workspace') + '</span></div>'
    + '<h3 class="aurora-path-card-title">' + esc(pathTitle(id)) + '</h3>'
    + (goal ? ('<p class="aurora-path-card-subtitle">' + esc(goal) + '</p>') : '')
    + '<p class="aurora-path-card-description">' + pathCardBlurb(def, t.total, { pathTasksReady }) + '</p>'
    + '<div class="aurora-path-card-metrics"><span>' + pct + '% complete</span><span>' + esc(t.done) + ' of ' + esc(t.total || 0) + ' done</span></div>'
    + '<div class="aurora-path-card-progress"><div class="progress-bar"><div style="width:' + pct + '%"></div></div></div>'
    + '<div class="aurora-path-card-action">' + cta + '</div></button>';
  if(!def.platform && cloudActive()){
    html += '<button class="mini-import standalone" data-import="' + esc(id) + '">Publish/import "' + esc(pathTitle(id)) + '" to platform</button>';
  }
  return html;
}

export function createPathCardsHTML({ store, configPresent } = {}){
  if(store.currentUser || !configPresent()){
    return '<button class="skill-card create aurora-path-card" id="createCard"><div class="aurora-path-card-meta"><span class="aurora-path-card-status">Private tool</span></div>'
      + '<h3 class="aurora-path-card-title">Create new path</h3>'
      + '<p class="aurora-path-card-description">Build a path you own, keep it private, publish it publicly, or share it by direct link.</p>'
      + '<div class="aurora-path-card-action">New path &rarr;</div></button>'
      + '<button class="skill-card create ai-create aurora-path-card" id="aiCreateCard"><div class="aurora-path-card-meta"><span class="aurora-path-card-status">AI draft</span></div>'
      + '<h3 class="aurora-path-card-title">Build path with AI</h3>'
      + '<p class="aurora-path-card-description">Describe a goal, review the generated draft, edit it, then save it as a private path.</p>'
      + '<div class="aurora-path-card-action">Generate a path</div></button>';
  }
  if(configPresent()){
    return '<button class="skill-card create aurora-path-card" id="signinCard"><div class="aurora-path-card-meta"><span class="aurora-path-card-status">Account required</span></div>'
      + '<h3 class="aurora-path-card-title">Build your own path</h3>'
      + '<p class="aurora-path-card-description">Sign in to create and track your own learning paths, synced across your devices.</p>'
      + '<div class="aurora-path-card-action">Sign in to start &rarr;</div></button>';
  }
  return '';
}
