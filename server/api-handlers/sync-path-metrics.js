import { createRouteLogger } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { requireJsonBody } from '../../api/_lib/http.js';
import { getAdminFirestore } from '../../api/_lib/firebase-admin.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';
import { enrollmentIdFor } from './join-path.js';
import {
  applyActiveThisWeek,
  applyMilestones,
  cleanDayNumber,
  cleanMetricEvent,
  cleanPathId,
  currentUtcWeekKey,
  makeParticipantStats,
  normalizeServerPathStats,
  participantWrite,
  statsWrite,
  verifiedMilestones,
} from '../../api/_lib/path-trust-metrics.js';

function canRecordMetrics(path, memberSnap, uid){
  if(!path) return false;
  if(path.ownerId === uid) return true;
  if(path.visibility === 'public' || path.visibility === 'unlisted') return true;
  return !!memberSnap?.exists;
}

export function createSyncPathMetricsHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  now = () => new Date(),
  logger = console,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('sync-path-metrics', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try{
      log.event('path_metrics_started');
      if(req.method !== 'POST'){
        res.setHeader('Allow', 'POST');
        throw apiError('method_not_allowed', 'POST only.', 405);
      }
      const auth = await authenticate(req);
      log.event('path_metrics_auth_complete', { result:'ok' });
      const body = requireJsonBody(req, 8 * 1024);
      const pathId = cleanPathId(body.pathId);
      const event = cleanMetricEvent(body.event);
      const dayNumber = cleanDayNumber(body.dayNumber, { required:event !== 'path_completed' });
      await rateLimit(auth.uid, 'syncPathMetrics');
      log.event('path_metrics_rate_limit_complete', { result:'ok' });

      const firestore = db || getAdminFirestore();
      const pathRef = firestore.collection('paths').doc(pathId);
      const memberRef = pathRef.collection('members').doc(auth.uid);
      const participantRef = pathRef.collection('participantStats').doc(auth.uid);
      const enrollmentId = enrollmentIdFor(pathId, auth.uid);
      const enrollmentRef = firestore.collection('enrollments').doc(enrollmentId);
      const dayLogRef = dayNumber ? enrollmentRef.collection('dayLogs').doc(String(dayNumber)) : null;
      const stamp = now();
      const weekKey = currentUtcWeekKey(stamp);

      const result = await firestore.runTransaction(async transaction => {
        const pathSnap = await transaction.get(pathRef);
        if(!pathSnap.exists) throw apiError('path_not_found', 'This path could not be found.', 404);
        const path = pathSnap.data() || {};
        const memberSnap = await transaction.get(memberRef);
        if(!canRecordMetrics(path, memberSnap, auth.uid)){
          throw apiError('forbidden', 'You cannot update metrics for this path.', 403);
        }

        const enrollmentSnap = await transaction.get(enrollmentRef);
        if(!enrollmentSnap.exists) throw apiError('enrollment_not_found', 'Start or join this path before syncing metrics.', 404);
        const enrollment = enrollmentSnap.data() || {};
        if(enrollment.id !== enrollmentId || enrollment.userId !== auth.uid || enrollment.pathId !== pathId){
          throw apiError('forbidden', 'You can only sync your own path metrics.', 403);
        }

        let dayLog = null;
        if(dayLogRef){
          const dayLogSnap = await transaction.get(dayLogRef);
          if(!dayLogSnap.exists) throw apiError('day_log_not_found', 'This day log could not be found.', 404);
          dayLog = dayLogSnap.data() || {};
        }

        const participantSnap = await transaction.get(participantRef);
        const existingParticipant = participantSnap.exists ? (participantSnap.data() || {}) : {};
        let stats = normalizeServerPathStats(path);
        let participant = makeParticipantStats(pathId, auth.uid, stamp, existingParticipant);
        const active = applyActiveThisWeek(stats, participant, weekKey);
        stats = active.stats;
        participant = { ...active.participant, lastActiveAt:stamp };

        const milestones = verifiedMilestones({ event, dayNumber:dayNumber || enrollment.lastCompletedDay || enrollment.currentDay || 1, path, enrollment, dayLog });
        const applied = applyMilestones(stats, participant, milestones, stamp);
        stats = applied.stats;
        participant = applied.participant;

        transaction.set(pathRef, { stats:statsWrite(stats, stamp) }, { merge:true });
        transaction.set(participantRef, participantWrite(participant, stamp), { merge:true });

        return {
          pathId,
          event,
          dayNumber,
          activeWeekKey:weekKey,
          activeThisWeekIncremented:active.incremented,
          milestonesUpdated:applied.updated,
          stats:statsWrite(stats, stamp),
          participantStats:participantWrite(participant, stamp),
        };
      });

      log.event('path_metrics_response_sent', {
        status:200,
        result:'ok',
        event:result.event,
      });
      return sendPrivateJson(res, 200, { ok:true, ...result }, requestId);
    }catch(error){
      log.event('path_metrics_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createSyncPathMetricsHandler();
