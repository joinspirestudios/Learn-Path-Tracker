import { esc } from '../../helpers.js';
import { discoveryCategory, proofSignals } from '../../discovery.js';
import {
  displayableActiveThisWeek, isOwner, normalizePathStats, resolveCreatorName,
} from '../../platform.js';
import { catalogCtaForPath } from './access.js';

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
  return '<button class="skill-card discovery-card" data-id="' + esc(id) + '">'
    + '<div class="sc-badge">By ' + esc(creator) + '</div>'
    + '<div class="sc-top">' + esc(path.title || 'Untitled path') + '</div>'
    + '<div class="sc-tag">' + esc(category || 'Learning path') + '</div>'
    + (badges.length ? '<div class="discovery-badges">' + badges.map(badge => '<span>' + esc(badge) + '</span>').join('') + '</div>' : '')
    + '<div class="sc-blurb">' + esc(summary.length > 150 ? summary.slice(0, 147) + '...' : summary) + '</div>'
    + '<div class="discovery-metrics">' + (chips.length ? chips.map(chip => '<span>' + esc(chip) + '</span>').join('') : '<span>No public metrics yet</span>') + '</div>'
    + '<div class="sc-cta">' + cta + '</div></button>';
}

export function builtInPathCardHTML(skill, { pathTitle, pathGoal, totalsFor, store } = {}){
  const t = totalsFor(skill.id);
  const pct = t.total ? Math.round(t.done / t.total * 100) : 0;
  const started = !!(store.state.skills[skill.id] && Object.keys(store.state.skills[skill.id].progress || {}).length);
  return '<button class="skill-card" data-id="' + esc(skill.id) + '">'
    + '<div class="sc-top">' + esc(pathTitle(skill.id)) + '</div>'
    + '<div class="sc-tag">' + esc(pathGoal(skill.id)) + '</div>'
    + '<div class="sc-blurb">' + esc(skill.blurb) + '</div>'
    + '<div class="sc-foot"><div class="progress-bar" style="flex:1"><div style="width:' + pct + '%"></div></div><span class="sc-pct">' + pct + '%</span></div>'
    + '<div class="sc-cta">' + (started ? 'Continue' : 'Start') + ' &rarr;</div></button>';
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
  let html = '<button class="skill-card" data-id="' + esc(id) + '">'
    + '<div class="sc-badge">' + esc(badge) + '</div>'
    + '<div class="sc-top">' + esc(pathTitle(id)) + '</div>'
    + (goal ? ('<div class="sc-tag">' + esc(goal) + '</div>') : '')
    + '<div class="sc-blurb">' + pathCardBlurb(def, t.total, { pathTasksReady }) + '</div>'
    + '<div class="sc-foot"><div class="progress-bar" style="flex:1"><div style="width:' + pct + '%"></div></div><span class="sc-pct">' + pct + '%</span></div>'
    + '<div class="sc-cta">' + cta + '</div></button>';
  if(!def.platform && cloudActive()){
    html += '<button class="mini-import standalone" data-import="' + esc(id) + '">Publish/import "' + esc(pathTitle(id)) + '" to platform</button>';
  }
  return html;
}

export function createPathCardsHTML({ store, configPresent } = {}){
  if(store.currentUser || !configPresent()){
    return '<button class="skill-card create" id="createCard"><div class="sc-plus">&#65291;</div>'
      + '<div class="sc-top">Create new path</div>'
      + '<div class="sc-blurb">Build a path you own, keep it private, publish it publicly, or share it by direct link.</div>'
      + '<div class="sc-cta">New path &rarr;</div></button>'
      + '<button class="skill-card create ai-create" id="aiCreateCard"><div class="sc-plus">AI</div>'
      + '<div class="sc-top">Build path with AI</div>'
      + '<div class="sc-blurb">Describe a goal, review the generated draft, edit it, then save it as a private path.</div>'
      + '<div class="sc-cta">Generate a path</div></button>';
  }
  if(configPresent()){
    return '<button class="skill-card create" id="signinCard"><div class="sc-plus">&#65291;</div>'
      + '<div class="sc-top">Build your own path</div>'
      + '<div class="sc-blurb">Sign in to create and track your own learning paths, synced across your devices.</div>'
      + '<div class="sc-cta">Sign in to start &rarr;</div></button>';
  }
  return '';
}
