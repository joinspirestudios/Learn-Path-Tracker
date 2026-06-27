// Mobile Evidence review (pure). Derives a compact, safe review state from a
// server/normalized evidence insight draft for display. Mobile is review/dismiss
// only — it never publishes, never changes proof visibility, and never asserts an
// activity happened. No web/DOM imports.

export const MOBILE_EVIDENCE_REVIEW_STATUSES = ['new', 'needs_review', 'reviewed', 'dismissed', 'archived'];

export function mobileEvidenceReviewStatus(draft = {}) {
  const d = draft && typeof draft === 'object' ? draft : {};
  if (d.status === 'dismissed') return 'dismissed';
  if (d.status === 'archived') return 'archived';
  if (d.status === 'reviewed' || d.reviewedAt) return 'reviewed';
  const hasContent = (Array.isArray(d.insights) && d.insights.length)
    || (Array.isArray(d.recommendations) && d.recommendations.length);
  return hasContent ? 'needs_review' : 'new';
}

export function mobileEvidenceReviewStatusLabel(status) {
  switch (status) {
    case 'reviewed': return 'Reviewed';
    case 'dismissed': return 'Dismissed';
    case 'archived': return 'Archived';
    case 'needs_review': return 'Needs review';
    default: return 'New';
  }
}

// A public-safe summary is shown only when the draft has one and it is non-empty.
export function mobilePublicSafeSummary(draft = {}) {
  const s = draft && typeof draft === 'object' ? draft.publicSafeSummary : '';
  return typeof s === 'string' ? s.trim() : '';
}

// Compact review-state view for the mobile review card.
export function mobileEvidenceReviewState(draft = {}) {
  const status = mobileEvidenceReviewStatus(draft);
  const publicSafe = mobilePublicSafeSummary(draft);
  return {
    status,
    statusLabel: mobileEvidenceReviewStatusLabel(status),
    needsReview: status === 'needs_review' || status === 'new',
    hasPublicSafeSummary: !!publicSafe,
    publicSafeSummary: publicSafe,
    // Visibility label is always explicit: private insight unless a public-safe
    // summary has been prepared.
    visibilityLabel: publicSafe ? 'Public-safe summary available' : 'Private insight',
  };
}

export default {
  MOBILE_EVIDENCE_REVIEW_STATUSES,
  mobileEvidenceReviewStatus,
  mobileEvidenceReviewStatusLabel,
  mobilePublicSafeSummary,
  mobileEvidenceReviewState,
};
