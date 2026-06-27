// ── server/api-handlers/adapt-path.js ───────────────────────────────────────
// Mounted inside the consolidated AI router (api/ai.js?route=adapt-path) — NO new
// top-level Vercel function. Builds a deterministic adaptation DRAFT for the
// authenticated user (optionally AI-assisted when configured). It NEVER applies a
// draft, never mutates day logs, and never returns private proof.

import { createRouteLogger } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { boundedText, requireJsonBody } from '../../api/_lib/http.js';
import { getAdminFirestore } from '../../api/_lib/firebase-admin.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';
import { buildAdaptationDraftForUser } from '../adaptive-planning-service.js';

const PATH_ID_RE = /^[a-zA-Z0-9_-]{1,120}$/;

export function createAdaptPathHandler({
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
    const log = createRouteLogger('adapt-path', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw apiError('method_not_allowed', 'POST only.', 405); }
      const auth = await authenticate(req);
      const body = requireJsonBody(req, 64 * 1024);
      const pathId = boundedText(body.pathId, 'pathId', 120, { required: true });
      if (!PATH_ID_RE.test(pathId)) throw apiError('invalid_request', 'Invalid pathId.', 400);
      await rateLimit(auth.uid, 'adaptPath');

      const firestore = db || getAdminFirestore();
      // `context` is client-provided STRUCTURED metadata only (scores/counts/task
      // titles). The service re-derives everything through the pure model and
      // sanitizes before any AI use; private fields are never trusted/sent.
      const clientContext = body.context && typeof body.context === 'object' ? body.context : {};
      clientContext.pathId = pathId;

      const result = await buildAdaptationDraftForUser({
        adminDb: firestore, uid: auth.uid, pathId, clientContext, env, callModel, now: now(),
      });

      log.event('adapt_path_ok', { source: result.source, aiUsed: result.aiUsed, recs: result.draft.recommendations.length });
      return sendPrivateJson(res, 200, {
        ok: true,
        draft: result.draft,            // a DRAFT only — not applied
        source: result.source,
        aiAvailable: result.aiAvailable,
        aiUsed: result.aiUsed,
        applied: false,
      }, requestId);
    } catch (error) {
      log.event('adapt_path_error', { status: Number(error?.status) || 500, code: error?.code || 'internal_error' },
        error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createAdaptPathHandler();
