import { createRouteLogger } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { boundedText, requireJsonBody } from '../../api/_lib/http.js';
import { getAdminFirestore } from '../../api/_lib/firebase-admin.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';
import { enrollmentIdFor } from './join-path.js';
import {
  applyActiveThisWeek,
  currentUtcWeekKey,
  makeParticipantStats,
  normalizeServerPathStats,
  participantWrite,
  publicProofCount,
  statsWrite,
} from '../../api/_lib/path-trust-metrics.js';
import {
  cleanPublicCaption,
  createSanitizedPublicProgressEntry,
  createSanitizedPublicProgressEntryFromMobileDayLog,
  isPublishablePath,
  publicProgressEntryId,
} from '../../src/public-progress.js';
import { resolvePublishProgressSource } from '../public-progress-source-resolver.js';

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

async function readCollectionDocs(collectionRef){
  if(!collectionRef?.get) return [];
  const snap = await collectionRef.get();
  const docs = snap.docs || [];
  return docs.map(doc => ({ id:doc.id, ...(doc.data ? doc.data() : {}) }));
}

function publicUser(auth){
  const token = auth.token || {};
  return {
    uid:auth.uid,
    name:auth.name || token.name || token.displayName || null,
    photoURL:token.picture || token.photoURL || null,
  };
}

export function createPublishProgressHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  now = () => new Date(),
  logger = console,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('publish-progress', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try{
      log.event('publish_progress_started');
      if(req.method !== 'POST'){
        res.setHeader('Allow', 'POST');
        throw apiError('method_not_allowed', 'POST only.', 405);
      }
      const auth = await authenticate(req);
      log.event('publish_progress_auth_complete', { result:'ok' });
      const body = requireJsonBody(req, 12 * 1024);
      const pathId = cleanPathId(body.pathId);
      const dayNumber = cleanDayNumber(body.dayNumber);
      const caption = cleanPublicCaption(body.publicCaption || body.caption || '');
      await rateLimit(auth.uid, 'publishProgress');
      log.event('publish_progress_rate_limit_complete', { result:'ok' });

      const firestore = db || getAdminFirestore();
      const pathRef = firestore.collection('paths').doc(pathId);
      const participantRef = pathRef.collection('participantStats').doc(auth.uid);
      const enrollmentId = enrollmentIdFor(pathId, auth.uid);
      const enrollmentRef = firestore.collection('enrollments').doc(enrollmentId);
      const dayLogRef = enrollmentRef.collection('dayLogs').doc(String(dayNumber));
      const entryId = publicProgressEntryId(auth.uid, dayNumber);
      const entryRef = pathRef.collection('publicProgress').doc(entryId);
      const stamp = now();
      const weekKey = currentUtcWeekKey(stamp);

      const tasks = await readCollectionDocs(pathRef.collection('tasks'));
      const submissions = (await readCollectionDocs(enrollmentRef.collection('submissions')))
        .filter(item => Number(item.dayNumber) === dayNumber);

      const result = await firestore.runTransaction(async transaction => {
        const pathSnap = await transaction.get(pathRef);
        if(!pathSnap.exists) throw apiError('path_not_found', 'This path could not be found.', 404);
        const path = pathSnap.data() || {};
        if(!isPublishablePath(path)){
          throw apiError('path_not_publishable', 'Public progress can only be published on public or unlisted paths.', 403);
        }

        // Resolve the source day log: existing web enrollment first, then the
        // mobile private day log when no web enrollment exists.
        const resolved = await resolvePublishProgressSource({
          firestore, transaction, path, pathId, auth, dayNumber, enrollmentIdFor,
        });
        const dayLog = resolved.dayLog;

        const entrySnap = await transaction.get(entryRef);
        const previousEntry = entrySnap.exists ? (entrySnap.data() || {}) : {};
        const alreadyPublished = entrySnap.exists && previousEntry.visibility === 'public';
        const entry = resolved.source === 'mobile_private_day_log'
          ? createSanitizedPublicProgressEntryFromMobileDayLog({
              pathId,
              user:publicUser(auth),
              dayNumber,
              mobileDayLog:dayLog,
              caption,
              now:stamp,
            })
          : createSanitizedPublicProgressEntry({
              pathId,
              user:publicUser(auth),
              dayNumber,
              dayLog,
              tasks,
              evidenceSubmissions:submissions,
              caption,
              now:stamp,
            });
        const previousProofCount = alreadyPublished ? publicProofCount(previousEntry) : 0;
        const nextProofCount = publicProofCount(entry);
        const proofDelta = nextProofCount - previousProofCount;
        const participantSnap = await transaction.get(participantRef);
        let participant = makeParticipantStats(pathId, auth.uid, stamp, participantSnap.exists ? (participantSnap.data() || {}) : {});
        let stats = normalizeServerPathStats(path);
        if(!alreadyPublished) stats.publicProgressCount += 1;
        stats.proofSubmissionCount = Math.max(0, stats.proofSubmissionCount + proofDelta);
        const active = applyActiveThisWeek(stats, participant, weekKey);
        stats = active.stats;
        participant = {
          ...active.participant,
          lastActiveAt:stamp,
          publicProgressCount:Math.max(0, Number(active.participant.publicProgressCount || 0) + (alreadyPublished ? 0 : 1)),
          proofSubmissionCount:Math.max(0, Number(active.participant.proofSubmissionCount || 0) + proofDelta),
        };
        transaction.set(entryRef, entry, { merge:false });
        transaction.set(pathRef, { stats:statsWrite(stats, stamp) }, { merge:true });
        transaction.set(participantRef, participantWrite(participant, stamp), { merge:true });
        return {
          pathId,
          entryId,
          dayNumber,
          published:true,
          alreadyPublished,
          publicProgressCount:stats.publicProgressCount,
          proofSubmissionCount:stats.proofSubmissionCount,
          stats:statsWrite(stats, stamp),
          entry,
        };
      });

      log.event('publish_progress_response_sent', { status:200, result:'ok' });
      return sendPrivateJson(res, 200, { ok:true, ...result }, requestId);
    }catch(error){
      log.event('publish_progress_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createPublishProgressHandler();
