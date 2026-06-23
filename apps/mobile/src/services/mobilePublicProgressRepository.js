// Mobile public-progress repository.
//
// Publishes a sanitized public progress entry through the EXISTING web-safe
// API route (/api/publish-progress) using the shared API contract — no new
// Vercel route, no direct Firestore write (rules deny client writes to
// publicProgress). The Firebase ID token is attached via the injected apiClient
// (which uses authService.getIdToken). Tokens are never logged.

import { API_ENDPOINTS } from '../shared/api-contracts.generated.js';
import { buildPublishRequest } from '../core/mobilePublicProgressMappers.js';

// Map server error codes to safe, user-facing copy. Raw server errors are
// never shown.
export function publishErrorMessage(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  const status = error && error.status;
  if (status === 401 || code === 'unauthorized') return 'Please sign in again.';
  if (code === 'enrollment_not_found' || code === 'day_log_not_found') return 'Sync this day before publishing.';
  if (code === 'day_not_completed') return 'This day is not complete yet.';
  if (code === 'path_not_publishable') return 'This path cannot be published publicly.';
  if (code === 'forbidden' || code === 'invalid_day_log') return 'This day could not be published.';
  return 'We could not publish this yet.';
}

export function createMobilePublicProgressRepository({ apiClient } = {}) {
  if (!apiClient) throw new Error('createMobilePublicProgressRepository requires an apiClient');

  return {
    // Publish (or update) the public summary for a synced day. Idempotent: the
    // server keys the entry by uid + dayNumber, so re-publishing updates it.
    // The server fetches the trusted private day log itself — we send only the
    // minimal contract body (pathId, dayNumber, publicCaption).
    async publish({ dayLog, publicCaption = '' } = {}) {
      const body = buildPublishRequest(dayLog, { publicCaption });
      if (!body || !body.pathId) {
        return { ok: false, message: 'Sync this day before publishing.' };
      }
      try {
        const result = await apiClient.post(API_ENDPOINTS.PUBLISH_PROGRESS, body);
        return { ok: true, result };
      } catch (error) {
        return { ok: false, message: publishErrorMessage(error) };
      }
    },
  };
}

export default createMobilePublicProgressRepository;
