// Mobile public-progress repository.
//
// Publishes a sanitized public progress entry through the EXISTING web-safe
// API route (/api/publish-progress) using the shared API contract — no new
// Vercel route, no direct Firestore write (rules deny client writes to
// publicProgress). The Firebase ID token is attached via the injected apiClient
// (which uses authService.getIdToken). Tokens are never logged.

import { API_ENDPOINTS } from '../shared/api-contracts.generated.js';
import { buildPublishRequest } from '../core/mobilePublicProgressMappers.js';

export function createMobilePublicProgressRepository({ apiClient } = {}) {
  if (!apiClient) throw new Error('createMobilePublicProgressRepository requires an apiClient');

  return {
    // Publish (or update) the public summary for a synced day. Idempotent: the
    // server keys the entry by uid + dayNumber, so re-publishing updates it.
    async publish({ dayLog, publicCaption = '' } = {}) {
      const body = buildPublishRequest(dayLog, { publicCaption });
      if (!body || !body.pathId) {
        return { ok: false, message: 'Nothing to publish yet.' };
      }
      try {
        const result = await apiClient.post(API_ENDPOINTS.PUBLISH_PROGRESS, body);
        return { ok: true, result };
      } catch (error) {
        if (error && error.status === 401) {
          return { ok: false, message: 'Please sign in again.' };
        }
        return { ok: false, message: 'We could not publish your progress yet.' };
      }
    },
  };
}

export default createMobilePublicProgressRepository;
