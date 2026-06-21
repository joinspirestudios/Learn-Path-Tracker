import { createRouteLogger } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { boundedText, requireJsonBody } from '../../api/_lib/http.js';
import { getAdminFirestore } from '../../api/_lib/firebase-admin.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';
import { withSchemaVersion } from '../../src/schema-versioning.js';
import {
  applyActiveThisWeek,
  currentUtcWeekKey,
  makeParticipantStats,
  normalizeServerPathStats,
  participantWrite,
  statsWrite,
} from '../../api/_lib/path-trust-metrics.js';

const VALID_VISIBILITIES = new Set(['private', 'unlisted', 'public']);
const VALID_MEMBER_ROLES = new Set(['owner', 'editor', 'commenter', 'viewer']);

function cleanPathId(value){
  const id = boundedText(value, 'pathId', 180, { required:true });
  if(!/^[a-zA-Z0-9_-]+$/.test(id)){
    throw apiError('invalid_request', 'pathId is invalid.', 400);
  }
  return id;
}

export function enrollmentIdFor(pathId, uid){
  return String(uid || 'local') + '_' + String(pathId || '').replace(/[\/\\]/g, '_');
}

function cleanRole(role){
  return VALID_MEMBER_ROLES.has(role) ? role : 'viewer';
}

function makeMembership(uid, now, existing = null){
  const role = existing?.role ? cleanRole(existing.role) : 'viewer';
  return withSchemaVersion('member', {
    uid,
    role,
    joinedAt:existing?.joinedAt || now,
    joinStatus:existing?.joinStatus || 'active',
    source:existing?.source || 'join',
    updatedAt:now,
    schemaVersion:existing?.schemaVersion,
  });
}

function makeEnrollment(pathId, uid, now, existing = null){
  const id = enrollmentIdFor(pathId, uid);
  return withSchemaVersion('enrollment', {
    id,
    pathId,
    userId:uid,
    startDate:existing?.startDate || null,
    currentDay:Number(existing?.currentDay || 1),
    streak:Number(existing?.streak || 0),
    freezeCount:existing?.freezeCount == null ? 1 : Number(existing.freezeCount || 0),
    status:['active', 'paused', 'completed'].includes(existing?.status) ? existing.status : 'active',
    lastCompletedDay:existing?.lastCompletedDay == null ? null : Number(existing.lastCompletedDay),
    lastActivityDate:existing?.lastActivityDate || null,
    missedDate:existing?.missedDate || null,
    joinedAt:existing?.joinedAt || now,
    createdAt:existing?.createdAt || now,
    updatedAt:now,
    schemaVersion:existing?.schemaVersion,
  });
}

function isOwner(path, uid){
  return !!(path && uid && path.ownerId === uid);
}

function memberExistsForJoin(memberSnap){
  return !!(memberSnap?.exists);
}

function canJoinVisibility(path, uid, memberSnap){
  if(isOwner(path, uid)) return true;
  if(memberExistsForJoin(memberSnap)) return true;
  const visibility = VALID_VISIBILITIES.has(path.visibility) ? path.visibility : 'private';
  return visibility === 'public' || visibility === 'unlisted';
}

export function createJoinPathHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  now = () => new Date(),
  logger = console,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('join-path', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try{
      log.event('join_request_started');
      if(req.method !== 'POST'){
        res.setHeader('Allow', 'POST');
        throw apiError('method_not_allowed', 'POST only.', 405);
      }
      const auth = await authenticate(req);
      log.event('join_auth_complete', { result:'ok' });
      const body = requireJsonBody(req, 8 * 1024);
      const pathId = cleanPathId(body.pathId);
      log.event('join_request_validated', { result:'ok' });
      await rateLimit(auth.uid, 'joinPath');
      log.event('join_rate_limit_complete', { result:'ok' });

      const firestore = db || getAdminFirestore();
      const pathRef = firestore.collection('paths').doc(pathId);
      const memberRef = pathRef.collection('members').doc(auth.uid);
      const participantRef = pathRef.collection('participantStats').doc(auth.uid);
      const enrollmentId = enrollmentIdFor(pathId, auth.uid);
      const enrollmentRef = firestore.collection('enrollments').doc(enrollmentId);
      const stamp = now();
      const weekKey = currentUtcWeekKey(stamp);

      const result = await firestore.runTransaction(async transaction => {
        const pathSnap = await transaction.get(pathRef);
        if(!pathSnap.exists) throw apiError('path_not_found', 'This path could not be found.', 404);
        const path = pathSnap.data() || {};
        const memberSnap = await transaction.get(memberRef);
        const participantSnap = await transaction.get(participantRef);
        const enrollmentSnap = await transaction.get(enrollmentRef);
        const owner = isOwner(path, auth.uid);
        if(!canJoinVisibility(path, auth.uid, memberSnap)){
          throw apiError('path_private', 'This path is private.', 403);
        }

        const existingMembership = memberSnap.exists ? (memberSnap.data() || {}) : null;
        const existingParticipant = participantSnap.exists ? (participantSnap.data() || {}) : null;
        const existingEnrollment = enrollmentSnap.exists ? (enrollmentSnap.data() || {}) : null;
        const alreadyJoined = owner || !!existingMembership;
        const firstParticipantJoin = !owner && !existingMembership;
        let stats = normalizeServerPathStats(path);
        let participant = makeParticipantStats(pathId, auth.uid, stamp, existingParticipant || {});
        if(firstParticipantJoin) stats.joinedCount += 1;
        const active = owner ? { stats, participant, incremented:false } : applyActiveThisWeek(stats, participant, weekKey);
        stats = active.stats;
        participant = { ...active.participant, lastActiveAt:stamp };
        const joinCount = stats.joinedCount;

        if(!owner){
          transaction.set(memberRef, makeMembership(auth.uid, stamp, existingMembership), { merge:true });
          transaction.set(pathRef, { stats:statsWrite(stats, stamp) }, { merge:true });
          transaction.set(participantRef, participantWrite(participant, stamp), { merge:true });
          if(!existingEnrollment){
            transaction.set(enrollmentRef, makeEnrollment(pathId, auth.uid, stamp), { merge:true });
          }
        }

        return {
          pathId,
          enrollmentId,
          joined:true,
          alreadyJoined,
          owner,
          joinCount,
          stats:statsWrite(stats, stamp),
          participantStats:owner ? null : participantWrite(participant, stamp),
          membership:owner ? { uid:auth.uid, role:'owner' } : makeMembership(auth.uid, stamp, existingMembership),
          enrollment:existingEnrollment ? makeEnrollment(pathId, auth.uid, stamp, existingEnrollment) : makeEnrollment(pathId, auth.uid, stamp),
        };
      });

      log.event('join_response_sent', { status:200, result:'ok' });
      return sendPrivateJson(res, 200, { ok:true, ...result }, requestId);
    }catch(error){
      log.event('join_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createJoinPathHandler();
