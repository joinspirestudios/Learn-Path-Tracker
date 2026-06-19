import { createRouteLogger } from './_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from './_lib/errors.js';
import { requireJsonBody } from './_lib/http.js';
import { getAdminFirestore } from './_lib/firebase-admin.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { requireAuth } from './_lib/require-auth.js';
import {
  cleanCommentBody,
  cleanEntryId,
  cleanPathId,
  commentResponse,
  ensureInteractable,
  entryCounters,
  makeComment,
} from './_lib/progress-interactions.js';

export function createCommentProgressHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  now = () => new Date(),
  logger = console,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('comment-progress', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try{
      log.event('comment_progress_started');
      if(req.method !== 'POST'){
        res.setHeader('Allow', 'POST');
        throw apiError('method_not_allowed', 'POST only.', 405);
      }
      const auth = await authenticate(req);
      const body = requireJsonBody(req, 12 * 1024);
      const pathId = cleanPathId(body.pathId);
      const entryId = cleanEntryId(body.entryId);
      const commentBody = cleanCommentBody(body.body);
      await rateLimit(auth.uid, 'commentProgress');

      const firestore = db || getAdminFirestore();
      const pathRef = firestore.collection('paths').doc(pathId);
      const entryRef = pathRef.collection('publicProgress').doc(entryId);
      const comment = makeComment({ pathId, entryId, auth, body:commentBody, now });
      const commentRef = entryRef.collection('comments').doc(comment.id);
      const result = await firestore.runTransaction(async transaction => {
        const [pathSnap, entrySnap] = await Promise.all([
          transaction.get(pathRef),
          transaction.get(entryRef),
        ]);
        const { entry } = ensureInteractable(pathSnap, entrySnap, pathId, entryId);
        const counters = entryCounters(entry);
        counters.visibleCommentCount += 1;
        transaction.set(commentRef, comment, { merge:false });
        transaction.set(entryRef, {
          visibleCommentCount:counters.visibleCommentCount,
          interactionUpdatedAt:now(),
        }, { merge:true });
        return {
          pathId,
          entryId,
          comment:commentResponse(comment),
          visibleCommentCount:counters.visibleCommentCount,
        };
      });

      log.event('comment_progress_response_sent', { status:200, result:'ok', commentLength:commentBody.length });
      return sendPrivateJson(res, 200, { ok:true, ...result }, requestId);
    }catch(error){
      log.event('comment_progress_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createCommentProgressHandler();
