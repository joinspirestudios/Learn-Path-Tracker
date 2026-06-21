import { createRouteLogger } from './_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from './_lib/errors.js';
import { requireJsonBody } from './_lib/http.js';
import { getAdminFirestore } from './_lib/firebase-admin.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { requireAuth } from './_lib/require-auth.js';
import { withSchemaVersion } from '../src/schema-versioning.js';
import {
  cleanCommentId,
  cleanEntryId,
  cleanPathId,
  ensureInteractable,
  entryCounters,
} from './_lib/progress-interactions.js';

export function createHideProgressCommentHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  now = () => new Date(),
  logger = console,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('hide-progress-comment', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try{
      log.event('hide_progress_comment_started');
      if(req.method !== 'POST'){
        res.setHeader('Allow', 'POST');
        throw apiError('method_not_allowed', 'POST only.', 405);
      }
      const auth = await authenticate(req);
      const body = requireJsonBody(req, 8 * 1024);
      const pathId = cleanPathId(body.pathId);
      const entryId = cleanEntryId(body.entryId);
      const commentId = cleanCommentId(body.commentId);
      await rateLimit(auth.uid, 'hideProgressComment');

      const firestore = db || getAdminFirestore();
      const pathRef = firestore.collection('paths').doc(pathId);
      const entryRef = pathRef.collection('publicProgress').doc(entryId);
      const commentRef = entryRef.collection('comments').doc(commentId);
      const result = await firestore.runTransaction(async transaction => {
        const [pathSnap, entrySnap, commentSnap] = await Promise.all([
          transaction.get(pathRef),
          transaction.get(entryRef),
          transaction.get(commentRef),
        ]);
        const { path, entry } = ensureInteractable(pathSnap, entrySnap, pathId, entryId);
        if(!commentSnap.exists) throw apiError('comment_not_found', 'This comment could not be found.', 404);
        const comment = commentSnap.data() || {};
        const isAuthor = comment.userId === auth.uid;
        const isPathOwner = path.ownerId === auth.uid;
        if(!isAuthor && !isPathOwner){
          throw apiError('forbidden', 'You cannot hide this comment.', 403);
        }
        const counters = entryCounters(entry);
        const alreadyHidden = comment.status === 'hidden' || comment.visibility === 'hidden';
        if(!alreadyHidden){
          counters.visibleCommentCount = Math.max(0, counters.visibleCommentCount - 1);
          transaction.set(commentRef, withSchemaVersion('publicProgressComment', {
            status:'hidden',
            visibility:'hidden',
            hiddenAt:now(),
            hiddenBy:auth.uid,
            hiddenReason:isAuthor ? 'author_removed' : 'owner_hidden',
            updatedAt:now(),
            schemaVersion:comment.schemaVersion,
          }), { merge:true });
          transaction.set(entryRef, {
            visibleCommentCount:counters.visibleCommentCount,
            interactionUpdatedAt:now(),
          }, { merge:true });
        }
        return {
          pathId,
          entryId,
          commentId,
          hidden:true,
          alreadyHidden,
          visibleCommentCount:counters.visibleCommentCount,
        };
      });

      log.event('hide_progress_comment_response_sent', { status:200, result:'ok' });
      return sendPrivateJson(res, 200, { ok:true, ...result }, requestId);
    }catch(error){
      log.event('hide_progress_comment_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createHideProgressCommentHandler();
