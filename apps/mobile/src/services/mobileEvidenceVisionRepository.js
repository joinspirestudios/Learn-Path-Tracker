// Mobile Gemini Vision repository (DI). Calls the SERVER route
// (/api/ai?route=analyze-evidence-image) with the user's ID token (via apiClient)
// — it NEVER calls Gemini directly and never holds the API key. It sends only
// pathId + evidenceId + explicit consent; never any raw device file reference or
// image bytes (the server loads the owner's image).

import { normalizeMobileVisionDraft } from '../core/mobileEvidenceVision.js';

export function createMobileEvidenceVisionRepository({ apiClient } = {}) {
  if (!apiClient) throw new Error('createMobileEvidenceVisionRepository requires an apiClient');

  return {
    // Requires explicit consent (consentToVisionAnalysis must be true). Returns
    // { ok, draft } on success or { ok:false, disabledReason } when unavailable.
    async analyzeImage({ pathId, evidenceId, dayNumber, taskId, consent = false } = {}) {
      if (!pathId || !evidenceId) return { ok: false, disabledReason: 'missing_image' };
      if (consent !== true) return { ok: false, disabledReason: 'consent_required' };
      try {
        const res = await apiClient.post('/api/ai?route=analyze-evidence-image', {
          pathId, evidenceId, dayNumber, taskId, consentToVisionAnalysis: true,
        });
        if (res && res.ok && res.draft) return { ok: true, draft: normalizeMobileVisionDraft(res.draft) };
        return { ok: false, disabledReason: (res && res.disabledReason) || 'provider_error' };
      } catch {
        return { ok: false, disabledReason: 'provider_error' };
      }
    },
  };
}

export default createMobileEvidenceVisionRepository;
