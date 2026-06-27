// ── evidence-review-model.js ────────────────────────────────────────────────
// Pure review-workflow helpers for Evidence Intelligence drafts. A draft is
// private by default; a public-safe summary is a draft that still requires
// explicit user review before any sharing. Reviewing/dismissing/archiving never
// publishes anything, never deletes proof, and never changes proof visibility.

export const EVIDENCE_REVIEW_STATUSES = ['new', 'needs_review', 'reviewed', 'dismissed', 'archived'];

function ts(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const p = Date.parse(value);
  return Number.isFinite(p) ? p : fallback;
}

// Map a stored draft status (draft|reviewed|dismissed|archived) onto a review
// status. A brand-new draft with content needs review; an empty one is 'new'.
export function evidenceReviewStatus(input = {}) {
  const d = input && typeof input === 'object' ? input : {};
  if (d.status === 'dismissed') return 'dismissed';
  if (d.status === 'archived') return 'archived';
  if (d.status === 'reviewed' || d.reviewedAt) return 'reviewed';
  const hasContent = (Array.isArray(d.insights) && d.insights.length)
    || (Array.isArray(d.recommendations) && d.recommendations.length);
  return hasContent ? 'needs_review' : 'new';
}

// Normalize a review-state view of a draft (no private fields added).
export function normalizeEvidenceReviewState(input = {}) {
  const d = input && typeof input === 'object' ? input : {};
  const status = evidenceReviewStatus(d);
  return {
    id: String(d.id || ''),
    pathId: String(d.pathId || ''),
    status,
    needsReview: status === 'needs_review' || status === 'new',
    reviewedAt: d.reviewedAt == null ? null : ts(d.reviewedAt, null),
    dismissedAt: d.dismissedAt == null ? null : ts(d.dismissedAt, null),
    hasPublicSafeSummary: !!String(d.publicSafeSummary || '').trim(),
  };
}

export function evidenceDraftNeedsReview(draft = {}) {
  const status = evidenceReviewStatus(draft);
  return status === 'needs_review' || status === 'new';
}

// A draft can be publicly summarized only after review and only if it carries a
// non-empty public-safe summary. (Publishing itself is a future explicit flow.)
export function evidenceDraftCanBePubliclySummarized(draft = {}) {
  const d = draft && typeof draft === 'object' ? draft : {};
  return evidenceReviewStatus(d) === 'reviewed' && !!String(d.publicSafeSummary || '').trim();
}

// Mark a draft reviewed (does NOT publish). Returns a new draft object.
export function markEvidenceDraftReviewed(draft = {}, { now = Date.now() } = {}) {
  const d = draft && typeof draft === 'object' ? draft : {};
  return { ...d, status: 'reviewed', reviewedAt: now, updatedAt: now };
}

// Dismiss a draft (does NOT delete underlying proof). Returns a new draft object.
export function dismissEvidenceDraft(draft = {}, { now = Date.now() } = {}) {
  const d = draft && typeof draft === 'object' ? draft : {};
  return { ...d, status: 'dismissed', dismissedAt: now, updatedAt: now };
}

// Archive a draft (does NOT change proof visibility). Returns a new draft object.
export function archiveEvidenceDraft(draft = {}, { now = Date.now() } = {}) {
  const d = draft && typeof draft === 'object' ? draft : {};
  return { ...d, status: 'archived', updatedAt: now };
}

// Which review actions are available for a draft, by status.
export function evidenceReviewActionsForDraft(draft = {}) {
  const status = evidenceReviewStatus(draft);
  const actions = ['refresh'];
  if (status === 'new' || status === 'needs_review') actions.push('mark-reviewed', 'dismiss');
  else if (status === 'reviewed') actions.push('dismiss', 'archive');
  // dismissed/archived → only refresh (regenerate) is offered.
  if (evidenceDraftCanBePubliclySummarized(draft)) actions.push('copy-public-safe-summary');
  return actions;
}

export default {
  EVIDENCE_REVIEW_STATUSES,
  evidenceReviewStatus,
  normalizeEvidenceReviewState,
  evidenceDraftNeedsReview,
  evidenceDraftCanBePubliclySummarized,
  markEvidenceDraftReviewed,
  dismissEvidenceDraft,
  archiveEvidenceDraft,
  evidenceReviewActionsForDraft,
};
