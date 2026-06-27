// ── views/evidence-vision-panel.js ──────────────────────────────────────────
// Pure HTML render for the Gemini Vision insight surface: the "Analyze image with
// AI" trigger (image proof only), loading/disabled/error states, and the private
// vision insight draft (what the image "appears to show", needs-more-context,
// suggested caption) with the required disclaimer + review actions. Never shows
// raw image URLs/storage paths/localUri/tokens, never claims verification.

import { esc } from '../helpers.js';
import { evidenceVisionDisclaimer } from '../evidence-vision-policy.js';
import {
  normalizeEvidenceVisionObservation, evidenceVisionObservationSummary,
} from '../evidence-vision-model.js';

const TASK_ALIGNMENT_LABEL = {
  clear_context: 'Clear context',
  needs_caption: 'Needs a caption',
  needs_better_evidence: 'Needs stronger evidence',
  unrelated_or_unclear: 'Unclear context',
  unknown: 'Unknown',
};

const DISABLED_COPY = {
  vision_disabled: 'Vision analysis is not enabled yet.',
  missing_api_key: 'Gemini API key is missing.',
  image_too_large: 'This proof image is too large.',
  unsupported_media_type: 'This proof type is not supported yet.',
  missing_image: 'This proof image could not be loaded.',
  provider_error: 'Vision analysis could not be completed.',
  rate_limited: 'Vision analysis is busy. Try again shortly.',
};

// The "Analyze image with AI" trigger — rendered only for image proof entries.
export function renderEvidenceVisionTrigger({ evidenceId = '', isImageProof = false } = {}) {
  if (!isImageProof) return '';
  return '<button type="button" class="aurora-vision-trigger" data-action="open-vision-consent" data-evidence-id="' + esc(evidenceId) + '">Analyze image with AI</button>';
}

function disclaimerHTML() {
  return '<p class="aurora-evidence-disclaimer">' + esc(evidenceVisionDisclaimer()) + '</p>';
}

// Render whatever vision state we have: loading | disabled | a private draft.
export function renderEvidenceVisionPanel({ status = 'idle', draft = null, disabledReason = '' } = {}) {
  if (status === 'loading') {
    return '<section class="aurora-vision-panel" aria-label="Vision insight">'
      + '<p class="aurora-vision-loading">Looking at your proof image…</p>' + disclaimerHTML() + '</section>';
  }
  if (status === 'disabled' || disabledReason) {
    return '<section class="aurora-vision-panel" aria-label="Vision insight" data-disabled-reason="' + esc(disabledReason) + '">'
      + '<p class="aurora-vision-disabled">' + esc(DISABLED_COPY[disabledReason] || 'Vision analysis is unavailable.') + '</p>'
      + disclaimerHTML() + '</section>';
  }
  if (!draft) return '';
  const o = normalizeEvidenceVisionObservation(draft);
  return '<section class="aurora-vision-panel" aria-label="Vision insight" data-vision-id="' + esc(o.id) + '">'
    + '<header class="aurora-vision-head"><span class="aurora-vision-kicker">Vision insight</span>'
    + '<span class="aurora-evidence-tag">Private insight</span></header>'
    + '<p class="aurora-vision-appears"><strong>Appears to show:</strong> ' + esc(evidenceVisionObservationSummary(o)) + '</p>'
    + (o.needsMoreContext ? '<p class="aurora-vision-needs">Needs more context.</p>' : '')
    + (o.suggestedCaption ? '<p class="aurora-vision-caption"><strong>Suggested caption:</strong> ' + esc(o.suggestedCaption) + '</p>' : '')
    + '<p class="aurora-vision-meta">' + esc(TASK_ALIGNMENT_LABEL[o.taskAlignment] || 'Unknown') + ' · confidence: ' + esc(o.uncertainty) + '</p>'
    + '<p class="aurora-vision-review">Review before sharing.</p>'
    + '<div class="aurora-vision-actions">'
    + '<button type="button" class="aurora-vision-reviewed" data-action="mark-vision-reviewed" data-vision-id="' + esc(o.id) + '">Mark reviewed</button>'
    + '<button type="button" class="aurora-vision-dismiss" data-action="dismiss-vision-insight" data-vision-id="' + esc(o.id) + '">Dismiss</button>'
    + '</div>'
    + disclaimerHTML()
    + '</section>';
}

export default { renderEvidenceVisionTrigger, renderEvidenceVisionPanel };
