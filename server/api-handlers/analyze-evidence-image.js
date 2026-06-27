// ── server/api-handlers/analyze-evidence-image.js ───────────────────────────
// Mounted inside the consolidated AI router (api/ai.js?route=analyze-evidence-
// image) — NO new top-level Vercel function. Creates a PRIVATE Gemini Vision
// evidence-understanding draft for the authenticated user's selected image proof.
// Requires explicit consent. Never publishes, never mutates proof, never changes
// visibility, never returns raw image URLs/storage paths/localUri, and degrades
// safely (disabled reason) when Gemini is not configured.

import { createRouteLogger } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { boundedText, requireJsonBody } from '../../api/_lib/http.js';
import { getAdminFirestore } from '../../api/_lib/firebase-admin.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';
import { normalizeEvidenceVisionRequest, evidenceVisionPublicSafeView } from '../../src/evidence-vision-model.js';
import { analyzeEvidenceImageForUser } from '../evidence-vision-service.js';

const PATH_ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;

const DISABLED_MESSAGE = {
  vision_disabled: 'Vision analysis is not enabled yet.',
  missing_api_key: 'Gemini API key is missing.',
  missing_image: 'This proof image could not be loaded.',
  image_too_large: 'This proof image is too large.',
  unsupported_media_type: 'This proof type is not supported yet.',
  provider_error: 'Vision analysis could not be completed.',
  rate_limited: 'Vision analysis is busy. Try again shortly.',
};

export function createAnalyzeEvidenceImageHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  env = process.env,
  loadEvidence = null,
  loadImage = null,
  gemini = undefined,
  now = () => Date.now(),
  logger = console,
} = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    const log = createRouteLogger('analyze-evidence-image', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw apiError('method_not_allowed', 'POST only.', 405); }
      const auth = await authenticate(req);
      const body = requireJsonBody(req, 8 * 1024);
      const pathId = boundedText(body.pathId, 'pathId', 120, { required: true });
      if (!PATH_ID_RE.test(pathId)) throw apiError('invalid_request', 'Invalid pathId.', 400);
      // Explicit consent is mandatory before any image is analyzed.
      if (body.consentToVisionAnalysis !== true) {
        throw apiError('consent_required', 'Explicit consent is required to analyze this image.', 400);
      }
      await rateLimit(auth.uid, 'analyzeEvidenceImage');

      const request = normalizeEvidenceVisionRequest({ ...body, pathId });
      const firestore = db || getAdminFirestore();
      const result = await analyzeEvidenceImageForUser({
        adminDb: firestore, uid: auth.uid, request,
        env, loadEvidence, loadImage,
        ...(gemini ? { gemini } : {}),
        now: now(),
      });

      if (!result.ok) {
        log.event('analyze_evidence_image_disabled', { reason: result.disabledReason });
        return sendPrivateJson(res, 200, {
          ok: false,
          available: false,
          disabledReason: result.disabledReason,
          message: DISABLED_MESSAGE[result.disabledReason] || 'Vision analysis is unavailable.',
          published: false,
        }, requestId);
      }

      log.event('analyze_evidence_image_ok', { taskAlignment: result.observation.taskAlignment });
      return sendPrivateJson(res, 200, {
        ok: true,
        available: true,
        // The full private draft (owner-only) plus a public-safe view for preview.
        draft: result.observation,
        publicSafeView: evidenceVisionPublicSafeView(result.observation),
        reviewRequired: true,
        published: false,
      }, requestId);
    } catch (error) {
      log.event('analyze_evidence_image_error', { status: Number(error?.status) || 500, code: error?.code || 'internal_error' },
        error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createAnalyzeEvidenceImageHandler();
