// Mobile adaptive planning repository (DI). Fetches an adaptation DRAFT from the
// existing consolidated AI router (no new endpoint file) and lets the user
// dismiss a draft locally. It never applies changes — applying is reviewed on
// web in Phase 7.0. Sends only structured, non-private context.

import { normalizeMobileDraft } from '../core/mobileAdaptivePlanning.js';

export function createMobileAdaptivePlanningRepository({ apiClient } = {}) {
  if (!apiClient) throw new Error('createMobileAdaptivePlanningRepository requires an apiClient');

  return {
    // Request a fresh adaptation draft. `context` is structured metadata only
    // (path meta, day scores/counts, task descriptors) — never proof bodies.
    async fetchDraft({ pathId, context = {} } = {}) {
      if (!pathId) return null;
      try {
        const res = await apiClient.post('/api/ai?route=adapt-path', { pathId, context });
        return res && res.draft ? normalizeMobileDraft(res.draft) : null;
      } catch {
        // Adaptive planning is advisory; never break the app on failure.
        return null;
      }
    },
  };
}

export default createMobileAdaptivePlanningRepository;
