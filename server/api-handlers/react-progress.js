import { createRouteLogger } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { requireJsonBody } from '../../api/_lib/http.js';
import { getAdminFirestore } from '../../api/_lib/firebase-admin.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';
import { withSchemaVersion } from '../../src/schema-versioning.js';
import { notifyProgressReaction } from '../notification-triggers.js';
import {
  cleanEntryId,
  cleanPathId,
  cleanRequestedReaction,
  cleanStoredReaction,
  ensureInteractable,
  entryCounters,
  reactionResponse,
} from '../../api/_lib/progress-interactions.js';

function adjust(counts, type, delta){
  if(!type) return;
  counts[type] = Math.max(0, Number(counts[type] || 0) + delta);
}

export function createReactProgressHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  now = () => new Date(),
  logger = console,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('react-progress', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try{
      log.event('react_progress_started');
      if(req.method !== 'POST'){
        res.setHeader('Allow', 'POST');
        throw apiError('method_not_allowed', 'POST only.', 405);
      }
      const auth = await authenticate(req);
      const body = requireJsonBody(req, 8 * 1024);
      const pathId = cleanPathId(body.pathId);
      const entryId = cleanEntryId(body.entryId);
      const requestedReaction = cleanRequestedReaction(body.reaction);
      await rateLimit(auth.uid, 'reactProgress');

      const firestore = db || getAdminFirestore();
      const pathRef = firestore.collection('paths').doc(pathId);
      const entryRef = pathRef.collection('publicProgress').doc(entryId);
      const reactionRef = entryRef.collection('reactions').doc(auth.uid);
      let ownerUid = '';
      const result = await firestore.runTransaction(async transaction => {
        const [pathSnap, entrySnap, reactionSnap] = await Promise.all([
          transaction.get(pathRef),
          transaction.get(entryRef),
          transaction.get(reactionRef),
        ]);
        const { entry } = ensureInteractable(pathSnap, entrySnap, pathId, entryId);
        ownerUid = String(entry.userId || '');
        const previous = reactionSnap.exists ? cleanStoredReaction((reactionSnap.data() || {}).type) : null;
        const counters = entryCounters(entry);

        if(previous !== requestedReaction){
          adjust(counters.reactionCounts, previous, -1);
          adjust(counters.reactionCounts, requestedReaction, 1);
        }
        counters.totalReactionCount = Object.values(counters.reactionCounts).reduce((sum, count) => sum + count, 0);

        if(requestedReaction){
          transaction.set(reactionRef, withSchemaVersion('publicProgressReaction', {
            userId:auth.uid,
            type:requestedReaction,
            createdAt:reactionSnap.exists ? (reactionSnap.data() || {}).createdAt || now() : now(),
            updatedAt:now(),
            schemaVersion:reactionSnap.exists ? (reactionSnap.data() || {}).schemaVersion : null,
          }), { merge:false });
        }else if(reactionSnap.exists){
          transaction.delete(reactionRef);
        }

        transaction.set(entryRef, {
          reactionCounts:counters.reactionCounts,
          totalReactionCount:counters.totalReactionCount,
          interactionUpdatedAt:now(),
        }, { merge:true });
        return reactionResponse(pathId, entryId, requestedReaction, counters);
      });

      // Best-effort: notify the progress owner of a new reaction (not the actor,
      // never self). Failures here never affect the reaction response.
      if(requestedReaction && ownerUid && ownerUid !== auth.uid){
        await notifyProgressReaction({
          adminDb:firestore, ownerUid, actorUid:auth.uid, actorDisplayName:auth.name || '',
          pathId, entryId, logger:log,
        });
      }
      log.event('react_progress_response_sent', { status:200, result:'ok', reactionType:requestedReaction || 'none' });
      return sendPrivateJson(res, 200, { ok:true, ...result }, requestId);
    }catch(error){
      log.event('react_progress_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createReactProgressHandler();
