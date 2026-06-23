// Proof archive rendering — Aurora proof/evidence cards (HTML strings).
// No external fonts/libraries, no link-preview fetching, no URL scraping.

import { esc } from '../helpers.js';
import {
  normalizeProofSubmissions, privateProofCardViewModel, publicProofCardViewModel,
  groupProofByDay, publicProofSummary, proofKind,
} from '../proof-archive-model.js';

function dateText(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') { try { return value.toDate().toLocaleDateString(); } catch { return ''; } }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

// ── Private (owner) proof card ──
export function proofCardHTML(submission, options = {}) {
  const vm = privateProofCardViewModel(submission, options);
  const cls = 'proof-card is-' + esc(vm.kind);
  let media = '';
  if (vm.kind === 'image' && vm.thumbURL) {
    media = '<img class="proof-card-thumb" src="' + esc(vm.thumbURL) + '" alt=""/>';
  } else if (vm.kind === 'file') {
    media = '<div class="proof-card-file">' + esc(vm.fileName || 'Uploaded file') + '</div>';
  } else if (vm.kind === 'url' && vm.url) {
    media = '<a class="proof-card-domain" href="' + esc(vm.url) + '" target="_blank" rel="noopener noreferrer">' + esc(vm.domain || 'Open link') + '</a>';
  }
  return '<article class="' + cls + '">'
    + '<div class="proof-card-meta"><span class="proof-type-badge">' + esc(vm.subtitle) + '</span>'
    + '<span class="proof-card-day">Day ' + esc(vm.dayNumber) + '</span></div>'
    + '<div class="proof-card-title">' + esc(vm.title) + '</div>'
    + media
    + (vm.note ? '<p class="proof-card-note">' + esc(vm.note) + '</p>' : '')
    + '<div class="proof-card-foot"><span>' + esc(dateText(vm.submittedAt)) + '</span><span class="proof-card-label">' + esc(vm.label) + '</span></div>'
    + '</article>';
}

// ── Public-safe proof card ──
export function publicProofCardHTML(submission, options = {}) {
  const vm = publicProofCardViewModel(submission, options);
  const cls = 'public-proof-artifact is-' + esc(vm.kind);
  let media = '';
  if (vm.thumbURL) {
    media = '<img class="proof-card-thumb" src="' + esc(vm.thumbURL) + '" alt=""/>';
  } else if (vm.url && vm.domain) {
    media = '<a class="proof-card-domain" href="' + esc(vm.url) + '" target="_blank" rel="noopener noreferrer">' + esc(vm.domain) + '</a>';
  } else if (vm.placeholder) {
    media = '<div class="proof-card-placeholder">Proof submitted</div>';
  }
  return '<article class="' + cls + '">'
    + '<div class="proof-card-meta"><span class="proof-type-badge">' + esc(vm.subtitle) + '</span>'
    + '<span class="proof-card-day">Day ' + esc(vm.dayNumber) + '</span></div>'
    + '<div class="proof-card-title">' + esc(vm.title) + '</div>'
    + media
    + (vm.caption ? '<p class="proof-card-note">' + esc(vm.caption) + '</p>' : '')
    + '<div class="proof-card-foot"><span>' + esc(dateText(vm.submittedAt)) + '</span><span class="proof-card-label">' + esc(vm.label) + '</span></div>'
    + '</article>';
}

export function proofArchiveHTML(submissions = [], options = {}) {
  const items = normalizeProofSubmissions(submissions);
  if (!items.length) return options.emptyState ? '<div class="hint">No proof submitted yet.</div>' : '';
  const title = options.title || 'Proof archive';
  return '<section class="proof-archive" aria-label="' + esc(title) + '">'
    + '<div class="proof-archive-head"><h3>' + esc(title) + '</h3><span>' + items.length + ' proof submitted</span></div>'
    + '<div class="proof-card-grid">' + items.map(s => proofCardHTML(s, options)).join('') + '</div>'
    + '</section>';
}

export function dayProofArchiveHTML({ submissions = [], title = 'Day proof' } = {}) {
  return proofArchiveHTML(submissions, { title, emptyState: false });
}

// Compact strip (Today / rail) with a "+N more" affordance.
export function compactProofStripHTML(submissions = [], options = {}) {
  const items = normalizeProofSubmissions(submissions);
  if (!items.length) return '';
  const max = options.max || 3;
  const visible = items.slice(-max).reverse();
  const more = items.length - visible.length;
  const title = options.title || "Today's proof";
  const renderer = options.public ? publicProofCardHTML : proofCardHTML;
  return '<section class="proof-strip" aria-label="' + esc(title) + '">'
    + '<div class="proof-archive-head"><h4>' + esc(title) + '</h4><span>' + items.length + ' proof submitted</span></div>'
    + '<div class="proof-card-grid is-compact">' + visible.map(s => renderer(s, options)).join('') + '</div>'
    + (more > 0 ? '<div class="proof-strip-more">+' + more + ' more proof item' + (more === 1 ? '' : 's') + '</div>' : '')
    + '</section>';
}

export function publicProofSummaryHTML(summary = {}) {
  const s = summary || {};
  const labels = (s.typeLabels || []).join(', ');
  return '<div class="public-proof-summary">'
    + '<span>' + (s.count || 0) + ' proof submitted</span>'
    + (labels ? '<span class="proof-type-badge">' + esc(labels) + '</span>' : '')
    + '</div>';
}

// Public proof timeline grouped by day (public paths, signed-out safe).
export function publicProofTimelineHTML(submissions = [], options = {}) {
  const groups = groupProofByDay(submissions);
  if (!groups.length) return '';
  const title = options.title || 'Public proof timeline';
  let h = '<section class="public-proof-timeline" aria-label="' + esc(title) + '">';
  h += '<div class="proof-archive-head"><h3>' + esc(title) + '</h3>'
    + publicProofSummaryHTML(publicProofSummary(submissions)) + '</div>';
  for (const group of groups) {
    h += '<div class="public-proof-day-group"><h4>Day ' + esc(group.dayNumber) + '</h4>'
      + '<div class="proof-card-grid">' + group.items.map(s => publicProofCardHTML(s, options)).join('') + '</div>'
      + '</div>';
  }
  h += '</section>';
  return h;
}

export { proofKind };
export default {
  proofCardHTML, publicProofCardHTML, proofArchiveHTML, publicProofTimelineHTML,
  dayProofArchiveHTML, compactProofStripHTML, publicProofSummaryHTML,
};
