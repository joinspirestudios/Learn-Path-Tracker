// ── views/evidence-public-review-panel.js ───────────────────────────────────
// Pure HTML render for the Evidence Intelligence review surface: grouped insights
// by severity, a clearly-labelled PRIVATE insight vs PUBLIC-SAFE summary, review
// status, and review actions (refresh / mark reviewed / dismiss / copy public-safe
// summary). Never publishes, never changes visibility, never shows unsafe fields,
// never asserts an activity happened.

import { esc } from '../helpers.js';
import { evidenceIntelligenceDisclaimer } from '../evidence-intelligence-policy.js';
import { evidenceReviewStatus, evidenceReviewActionsForDraft } from '../evidence-review-model.js';
import {
  groupEvidenceInsights, evidenceInsightSeverity, rankEvidenceRecommendations,
} from '../evidence-insight-quality.js';
import { evidenceContainsUnsafePublicData } from '../evidence-public-safety.js';
import { evidenceInsightLabel, evidenceRecommendationLabel } from './evidence-intelligence-panel.js';

const STATUS_LABEL = {
  new: 'New', needs_review: 'Needs review', reviewed: 'Reviewed',
  dismissed: 'Dismissed', archived: 'Archived',
};

function insightRow(i) {
  const severity = evidenceInsightSeverity(i);
  return '<li class="aurora-evidence-rev-insight" data-insight-type="' + esc(i.type) + '" data-severity="' + esc(severity) + '">'
    + '<span class="aurora-evidence-rev-label">' + esc(evidenceInsightLabel(i.type)) + '</span>'
    + (i.reason ? '<span class="aurora-evidence-rev-why">' + esc(i.reason) + '</span>' : '')
    + '</li>';
}

function groupBlock(group, items) {
  return '<div class="aurora-evidence-rev-group" data-group="' + esc(group) + '">'
    + '<h4 class="aurora-evidence-rev-group-title">' + esc(group) + '</h4>'
    + '<ul class="aurora-evidence-rev-list">' + items.map(insightRow).join('') + '</ul>'
    + '</div>';
}

function actionButton(action, draftId) {
  const map = {
    'refresh': ['refresh-evidence-insight', 'Refresh evidence insight'],
    'mark-reviewed': ['mark-evidence-insight-reviewed', 'Mark reviewed'],
    'dismiss': ['dismiss-evidence-insight', 'Dismiss insight'],
    'archive': ['archive-evidence-insight', 'Archive'],
    'copy-public-safe-summary': ['copy-public-safe-summary', 'Copy public-safe summary'],
  };
  const [dataAction, label] = map[action] || [];
  if (!dataAction) return '';
  return '<button type="button" class="aurora-evidence-rev-btn" data-action="' + esc(dataAction) + '" data-insight-id="' + esc(draftId) + '">' + esc(label) + '</button>';
}

// Full review panel. `draft` is a normalized evidence insight draft (or null).
export function renderEvidencePublicReviewPanel({ draft = null } = {}) {
  if (!draft) {
    return '<section class="aurora-evidence-review-panel" aria-label="Evidence review">'
      + '<p class="aurora-evidence-empty">No evidence insight to review yet.</p>'
      + '<p class="aurora-evidence-disclaimer">' + esc(evidenceIntelligenceDisclaimer()) + '</p></section>';
  }
  const insights = Array.isArray(draft.insights) ? draft.insights : [];
  const recs = rankEvidenceRecommendations(Array.isArray(draft.recommendations) ? draft.recommendations : []);
  const status = evidenceReviewStatus(draft);
  const groups = groupEvidenceInsights(insights);
  const actions = evidenceReviewActionsForDraft(draft);
  const publicSafeSummary = String(draft.publicSafeSummary || '');
  // Defensive: never render a summary that still carries unsafe data.
  const summarySafe = publicSafeSummary && !evidenceContainsUnsafePublicData(publicSafeSummary);

  return '<section class="aurora-evidence-review-panel" aria-label="Evidence review" data-insight-id="' + esc(draft.id) + '" data-review-status="' + esc(status) + '">'
    + '<header class="aurora-evidence-rev-header">'
    + '<h3>Evidence review</h3>'
    + '<span class="aurora-evidence-rev-status" data-status="' + esc(status) + '">' + esc(STATUS_LABEL[status] || 'New') + '</span>'
    + '</header>'
    + '<p class="aurora-evidence-rev-summary">' + esc(draft.summary || '') + '</p>'

    + (insights.length
      ? '<div class="aurora-evidence-rev-groups">'
        + Object.entries(groups).map(([g, items]) => groupBlock(g, items)).join('')
        + '</div>'
      : '')

    + (recs.length
      ? '<div class="aurora-evidence-rev-recs"><h4>Make your next proof stronger</h4><ul class="aurora-evidence-rev-list">'
        + recs.slice(0, 5).map(r => '<li class="aurora-evidence-rev-rec" data-rec-type="' + esc(r.type) + '">'
          + '<span class="aurora-evidence-rev-label">' + esc(r.title || evidenceRecommendationLabel(r.type)) + '</span>'
          + (r.body || r.reason ? '<span class="aurora-evidence-rev-why">' + esc(r.body || r.reason) + '</span>' : '')
          + '</li>').join('')
        + '</ul></div>'
      : '')

    // Private vs public-safe is always explicit.
    + '<div class="aurora-evidence-private-note" data-private="true">'
    + '<span class="aurora-evidence-tag">Private insight</span>'
    + '<p>This insight is private to you. Review before sharing.</p></div>'

    + '<div class="aurora-evidence-public-block">'
    + '<span class="aurora-evidence-tag aurora-evidence-tag-public">Public-safe summary draft</span>'
    + (summarySafe
      ? '<p class="aurora-evidence-public-summary">' + esc(publicSafeSummary) + '</p>'
        + '<p class="aurora-evidence-public-note">This summary does not include private proof.</p>'
      : '<p class="aurora-evidence-public-note">A public-safe summary will appear here after review.</p>')
    + '</div>'

    + '<div class="aurora-evidence-rev-actions">'
    + actions.map(a => actionButton(a, draft.id)).join('')
    + '</div>'
    + '<p class="aurora-evidence-disclaimer">' + esc(evidenceIntelligenceDisclaimer()) + ' This insight is advisory, not verification.</p>'
    + '</section>';
}

export default { renderEvidencePublicReviewPanel };
