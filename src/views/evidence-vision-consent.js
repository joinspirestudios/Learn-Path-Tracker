// ── views/evidence-vision-consent.js ────────────────────────────────────────
// Pure HTML render for the Gemini Vision consent step. Shown ONLY after the user
// clicks "Analyze image with AI" on an image proof entry. No analysis happens
// without an explicit confirm here.

import { esc } from '../helpers.js';
import { evidenceVisionConsentCopy, evidenceVisionDisclaimer } from '../evidence-vision-policy.js';

// `evidenceId` identifies the selected image proof; confirm/cancel are wired in
// main.js via data-action.
export function renderEvidenceVisionConsent({ evidenceId = '', pathId = '' } = {}) {
  return '<div class="aurora-vision-consent" role="dialog" aria-label="Analyze image with AI" data-evidence-id="' + esc(evidenceId) + '" data-path-id="' + esc(pathId) + '">'
    + '<h4 class="aurora-vision-consent-title">Analyze image with AI</h4>'
    + '<p class="aurora-vision-consent-copy">' + esc(evidenceVisionConsentCopy()) + '</p>'
    + '<p class="aurora-vision-consent-note">Vision insights are private by default.</p>'
    + '<div class="aurora-vision-consent-actions">'
    + '<button type="button" class="aurora-vision-confirm" data-action="confirm-vision-analysis" data-evidence-id="' + esc(evidenceId) + '">Analyze image</button>'
    + '<button type="button" class="aurora-vision-cancel" data-action="cancel-vision-analysis">Not now</button>'
    + '</div>'
    + '<p class="aurora-evidence-disclaimer">' + esc(evidenceVisionDisclaimer()) + '</p>'
    + '</div>';
}

export default { renderEvidenceVisionConsent };
