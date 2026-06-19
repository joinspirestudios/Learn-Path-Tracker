import { createRouteLogger } from './_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from './_lib/errors.js';
import { boundedText, requireJsonBody } from './_lib/http.js';
import { getAdminFirestore } from './_lib/firebase-admin.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { requireAuth } from './_lib/require-auth.js';
import { publicProgressEntryId } from '../src/public-progress.js';
import {
  applyActiveThisWeek,
  currentUtcWeekKey,
  makeParticipantStats,
  normalizeServerPathStats,
  numericStat,
  participantWrite,
  publicProofCount,
  statsWrite,
} from './_lib/path-trust-metrics.js';

function cleanPathId(value){
  const id = boundedText(value, 'pathId', 180, { required:true });
  if(!/^[a-zA-Z0-9_-]+$/.test(id)) throw apiError('invalid_request', 'pathId is invalid.', 400);
  return id;
}

function cleanDayNumber(value){
  const day = Number(value);
  if(!Number.isInteger(day) || day < 1 || day > 5000){
    throw apiError('invalid_request', 'dayNumber is invalid.', 400);
  }
  return day;
}

export function createUnpublishProgressHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  now = () => new Date(),
  logger = console,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('unpublish-progress', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try{
      log.event('unpublish_progress_started');
      if(req.method !== 'POST'){
        res.setHeader('Allow', 'POST');
        throw apiError('method_not_allowed', 'POST only.', 405);
      }
      const auth = await authenticate(req);
      log.event('unpublish_progress_auth_complete', { result:'ok' });
      const body = requireJsonBody(req, 12 * 1024);
      const pathId = cleanPathId(body.pathId);
      const dayNumber = cleanDayNumber(body.dayNumber);
      await rateLimit(auth.uid, 'unpublishProgress');
      log.event('unpublish_progress_rate_limit_complete', { result:'ok' });

      const firestore = db || getAdminFirestore();
      const pathRef = firestore.collection('paths').doc(pathId);
      const participantRef = pathRef.collection('participantStats').doc(auth.uid);
      const entryId = publicProgressEntryId(auth.uid, dayNumber);
      const entryRef = pathRef.collection('publicProgress').doc(entryId);
      const stamp = now();
      const weekKey = currentUtcWeekKey(stamp);

      const result = await firestore.runTransaction(async transaction => {
        const pathSnap = await transaction.get(pathRef);
        if(!pathSnap.exists) throw apiError('path_not_found', 'This path could not be found.', 404);
        const path = pathSnap.data() || {};
        let stats = normalizeServerPathStats(path);

        const entrySnap = await transaction.get(entryRef);
        if(!entrySnap.exists){
          return {
            pathId,
            entryId,
            dayNumber,
            unpublished:true,
            alreadyUnpublished:true,
            publicProgressCount:stats.publicProgressCount,
            proofSubmissionCount:stats.proofSubmissionCount,
            stats:statsWrite(stats, stamp),
          };
        }
        const entry = entrySnap.data() || {};
        if(entry.userId !== auth.uid){
          throw apiError('forbidden', 'You can only unpublish your own progress.', 403);
        }
        const participantSnap = await transaction.get(participantRef);
        let participant = makeParticipantStats(pathId, auth.uid, stamp, participantSnap.exists ? (participantSnap.data() || {}) : {});
        const proofCount = publicProofCount(entry);
        stats.publicProgressCount = Math.max(0, stats.publicProgressCount - 1);
        stats.proofSubmissionCount = Math.max(0, stats.proofSubmissionCount - proofCount);
        const active = applyActiveThisWeek(stats, participant, weekKey);
        stats = active.stats;
        participant = {
          ...active.participant,
          lastActiveAt:stamp,
          publicProgressCount:Math.max(0, numericStat(active.participant.publicProgressCount) - 1),
          proofSubmissionCount:Math.max(0, numericStat(active.participant.proofSubmissionCount) - proofCount),
        };
        transaction.delete(entryRef);
        transaction.set(pathRef, { stats:statsWrite(stats, stamp) }, { merge:true });
        transaction.set(participantRef, participantWrite(participant, stamp), { merge:true });
        return {
          pathId,
          entryId,
          dayNumber,
          unpublished:true,
          alreadyUnpublished:false,
          publicProgressCount:stats.publicProgressCount,
          proofSubmissionCount:stats.proofSubmissionCount,
          stats:statsWrite(stats, stamp),
        };
      });

      log.event('unpublish_progress_response_sent', { status:200, result:'ok' });
      return sendPrivateJson(res, 200, { ok:true, ...result }, requestId);
    }catch(error){
      log.event('unpublish_progress_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createUnpublishProgressHandler();
