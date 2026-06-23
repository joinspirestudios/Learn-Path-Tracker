// Daily documentation feed rendering — activity/feed-style "documented day"
// cards (HTML strings). One day = one meaningful entry, with a media/proof
// preview and a secondary "view gallery" detail. Aurora styling; no external
// fonts/libs, no link-preview fetching.

import { esc } from '../helpers.js';
import {
  privateDocumentationEntryViewModel, publicDocumentationEntryViewModel,
  dailyDocumentationMediaPreview, dailyDocumentationTaskSummary,
} from '../daily-documentation-model.js';
import { proofCardHTML, publicProofCardHTML } from './proof-archive.js';
import { groupProofByTask, normalizeProofSubmissions, proofIsImage } from '../proof-archive-model.js';

function metricsHTML(vm) {
  const parts = [];
  if (vm.totalTaskCount) parts.push(vm.completedTaskCount + ' / ' + vm.totalTaskCount + ' tasks');
  else if (vm.completedTaskCount) parts.push(vm.completedTaskCount + ' tasks done');
  parts.push(vm.proofSubmittedCount + ' proof submitted');
  if (vm.completionScore) parts.push(esc(vm.completionScore) + '% ' + esc((vm.completionTier || 'completed').replace(/_/g, ' ')));
  else if (vm.completionTier) parts.push(esc((vm.completionTier).replace(/_/g, ' ')));
  return '<div class="daily-doc-metrics">' + parts.map(p => '<span>' + esc(p) + '</span>').join('') + '</div>';
}

export function dailyDocumentationTaskSummaryHTML(entry, options = {}) {
  const summary = dailyDocumentationTaskSummary(entry, options);
  if (!summary.titles.length) return '';
  return '<div class="daily-doc-task-summary">'
    + summary.titles.map(t => '<span>' + esc(t) + '</span>').join('')
    + (summary.hasMore ? '<span class="daily-doc-task-more">View all tasks</span>' : '')
    + '</div>';
}

export function dailyDocumentationMediaGridHTML(entry, options = {}) {
  const media = dailyDocumentationMediaPreview(entry, { max: options.max || 4 });
  if (!media.total) return '';
  const publicView = !!options.public;
  let h = '<div class="daily-doc-media-grid">';
  if (media.primary) {
    const url = publicView
      ? (proofIsImage(media.primary) && media.primary.publicAssetURL ? media.primary.publicAssetURL : '')
      : (media.primary.evidenceUrl || media.primary.publicAssetURL || '');
    h += url
      ? '<img class="daily-doc-media-primary" src="' + esc(url) + '" alt=""/>'
      : '<div class="daily-doc-media-primary is-placeholder">Proof submitted</div>';
  }
  const tileItems = [...media.thumbs, ...media.tiles].slice(0, options.max || 4);
  if (tileItems.length) {
    h += '<div class="daily-doc-thumbs">' + tileItems.map(s => {
      const card = publicView ? publicProofCardHTML(s) : proofCardHTML(s);
      return '<div class="daily-doc-artifact-tile">' + card + '</div>';
    }).join('') + '</div>';
  }
  h += '</div>';
  return h;
}

// All proof for a day, grouped by task (secondary "gallery" view).
export function dayProofGalleryHTML(entry, options = {}) {
  const items = normalizeProofSubmissions(entry.proofItems || []);
  if (!items.length) return '<div class="hint">No proof submitted for this day yet.</div>';
  const publicView = !!options.public;
  const groups = groupProofByTask(items);
  let h = '<section class="day-proof-gallery" data-day-gallery="' + esc(entry.id) + '">';
  h += '<div class="day-proof-gallery-head"><h4>Day ' + esc(entry.dayNumber) + ' proof gallery</h4>'
    + '<span>' + items.length + ' proof submitted</span></div>';
  for (const group of groups) {
    h += '<div class="day-proof-task-group"><h5>' + esc(group.taskTitle || 'Task') + '</h5>'
      + '<div class="day-proof-gallery-grid">'
      + group.items.map(s => (publicView ? publicProofCardHTML(s) : proofCardHTML(s))).join('')
      + '</div></div>';
  }
  h += '</section>';
  return h;
}

// Compact preview (Today / right rail): up to 3 thumbnails + count + View gallery.
export function compactDayProofPreviewHTML(entry, options = {}) {
  const media = dailyDocumentationMediaPreview(entry, { max: 3 });
  if (!media.total) return options.emptyState ? '<div class="muted" style="font-size:11px">No proof submitted yet.</div>' : '';
  const previewItems = [media.primary, ...media.thumbs, ...media.tiles].filter(Boolean).slice(0, 3);
  const more = media.total - previewItems.length;
  const title = options.title || 'Day proof';
  let h = '<div class="day-proof-compact-preview">';
  h += '<div class="proof-archive-head"><h4>' + esc(title) + '</h4><span>' + media.total + ' proof submitted</span></div>';
  h += '<div class="day-proof-preview-strip">' + previewItems.map(s => {
    const img = s.evidenceUrl && proofIsImage(s) ? s.evidenceUrl : (s.publicAssetURL && proofIsImage(s) ? s.publicAssetURL : '');
    return img
      ? '<span class="day-proof-preview-thumb" style="background-image:url(\'' + esc(String(img).replace(/'/g, '%27')) + '\')"></span>'
      : '<span class="day-proof-preview-thumb is-artifact">' + esc((s.evidenceType || 'proof').slice(0, 4).toUpperCase()) + '</span>';
  }).join('') + (more > 0 ? '<span class="day-proof-preview-more">+' + more + '</span>' : '') + '</div>';
  h += '<button type="button" class="btn lpt-button lpt-button-secondary day-proof-gallery-action" data-proof-gallery="' + esc(entry.id) + '">View gallery</button>';
  h += '</div>';
  return h;
}

// One documented-day card.
export function dailyDocumentationEntryHTML(entry, options = {}) {
  const publicView = !!options.public;
  const vm = publicView ? publicDocumentationEntryViewModel(entry) : privateDocumentationEntryViewModel(entry);
  const showGallery = !!options.expandedGalleryId && options.expandedGalleryId === entry.id;
  let h = '<article class="daily-doc-entry" data-doc-entry="' + esc(entry.id) + '">';
  h += '<header class="daily-doc-head">';
  if (publicView && (vm.authorAvatarURL || vm.authorName)) {
    h += '<div class="daily-doc-author">'
      + (vm.authorAvatarURL ? '<img src="' + esc(vm.authorAvatarURL) + '" alt=""/>' : '<span></span>')
      + '<b>' + esc(vm.authorName || 'A learner') + '</b></div>';
  }
  h += '<div class="daily-doc-title"><b>' + esc(vm.pathTitle) + '</b>'
    + '<span>Day ' + esc(vm.dayNumber) + (vm.dateLabel ? ' · ' + esc(vm.dateLabel) : '') + '</span></div>';
  if (vm.milestone) h += '<span class="daily-doc-milestone">' + esc(vm.milestone) + '</span>';
  h += '</header>';
  h += metricsHTML(vm);
  h += dailyDocumentationTaskSummaryHTML(entry, options);
  h += dailyDocumentationMediaGridHTML(entry, options);
  h += '<footer class="daily-doc-foot">'
    + '<span class="proof-card-label">' + esc(vm.label) + '</span>'
    + '<button type="button" class="btn lpt-button lpt-button-secondary day-proof-gallery-action" data-proof-gallery="' + esc(entry.id) + '">' + (showGallery ? 'Hide gallery' : 'View gallery') + '</button>'
    + '</footer>';
  if (showGallery) h += dayProofGalleryHTML(entry, options);
  h += '</article>';
  return h;
}

export function dailyDocumentationFeedHTML(entries = [], options = {}) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) {
    return options.emptyState
      ? '<section class="daily-doc-feed is-empty"><div class="proof-archive-head"><h3>' + esc(options.title || 'Daily documentation') + '</h3></div>'
        + '<p class="muted">Complete a day with proof to build your proof archive.</p></section>'
      : '';
  }
  const title = options.title || 'Daily documentation';
  return '<section class="daily-doc-feed" aria-label="' + esc(title) + '">'
    + '<div class="proof-archive-head"><h3>' + esc(title) + '</h3><span>' + list.length + ' documented day' + (list.length === 1 ? '' : 's') + '</span></div>'
    + list.map(e => dailyDocumentationEntryHTML(e, options)).join('')
    + '</section>';
}

export function publicDailyDocumentationFeedHTML(entries = [], options = {}) {
  return dailyDocumentationFeedHTML(entries, { ...options, public: true, title: options.title || 'Public proof timeline' });
}

export default {
  dailyDocumentationFeedHTML, dailyDocumentationEntryHTML, dailyDocumentationMediaGridHTML,
  dailyDocumentationTaskSummaryHTML, dayProofGalleryHTML, compactDayProofPreviewHTML,
  publicDailyDocumentationFeedHTML,
};
