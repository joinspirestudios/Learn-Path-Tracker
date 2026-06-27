// Mobile Evidence Intelligence repository (DI). Fetches an evidence insight DRAFT
// from the existing consolidated AI router (no new endpoint file) and lets the
// user dismiss locally. It never publishes and never mutates proof. Sends only
// structured, non-private context.

import { normalizeMobileEvidenceDraft } from '../core/mobileEvidenceIntelligence.js';

export function createMobileEvidenceIntelligenceRepository({ apiClient } = {}) {
  if (!apiClient) throw new Error('createMobileEvidenceIntelligenceRepository requires an apiClient');

  return {
    async fetchInsight({ pathId, context = {} } = {}) {
      if (!pathId) return null;
      try {
        const res = await apiClient.post('/api/ai?route=analyze-evidence', { pathId, context });
        return res && res.draft ? normalizeMobileEvidenceDraft(res.draft) : null;
      } catch {
        // Evidence intelligence is advisory; never break the app on failure.
        return null;
      }
    },
  };
}

export default createMobileEvidenceIntelligenceRepository;
