// ── server/api-handlers/analyze-evidence.js ─────────────────────────────────
// Mounted inside the consolidated AI router (api/ai.js?route=analyze-evidence) —
// NO new top-level Vercel function. Builds a deterministic evidence insight DRAFT
// for the authenticated user (optionally AI-assisted when configured). It NEVER
// mutates proof, never publishes, never changes visibility, never claims
// "verified", and never reads image content.

import { createRouteLogger } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { boundedText, requireJsonBody } from '../../api/_lib/http.js';
import { getAdminFirestore } from '../../api/_lib/firebase-admin.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';
import { buildEvidenceInsightDraftForUser } from '../evidence-intelligence-service.js';

const PATH_ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;

export function createAnalyzeEvidenceHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  env = process.env,
  callModel = null,
  now = () => Date.now(),
  logger = console,
} = {}) {
  return async function handler(req, res) {
    const requestId = createRequestId();
    const log = createRouteLogger('analyze-evidence', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw apiError('method_not_allowed', 'POST only.', 405); }
      const auth = await authenticate(req);
      const body = requireJsonBody(req, 64 * 1024);
      const pathId = boundedText(body.pathId, 'pathId', 120, { required: true });
      if (!PATH_ID_RE.test(pathId)) throw apiError('invalid_request', 'Invalid pathId.', 400);
      await rateLimit(auth.uid, 'analyzeEvidence');

      const firestore = db || getAdminFirestore();
      const clientContext = body.context && typeof body.context === 'object' ? body.context : {};
      clientContext.pathId = pathId;

      const result = await buildEvidenceInsightDraftForUser({
        adminDb: firestore, uid: auth.uid, pathId, clientContext, env, callModel, now: now(),
      });

      log.event('analyze_evidence_ok', { source: result.source, aiUsed: result.aiUsed, insights: result.draft.insights.length });
      return sendPrivateJson(res, 200, {
        ok: true,
        draft: result.draft,        // a DRAFT only — never published/applied
        source: result.source,
        aiAvailable: result.aiAvailable,
        aiUsed: result.aiUsed,
        published: false,
      }, requestId);
    } catch (error) {
      log.event('analyze_evidence_error', { status: Number(error?.status) || 500, code: error?.code || 'internal_error' },
        error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createAnalyzeEvidenceHandler();
