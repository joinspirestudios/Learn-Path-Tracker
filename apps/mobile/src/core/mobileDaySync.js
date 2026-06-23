// Pure mobile day-sync core.
//
// Converts a FINISHED local mobile session into a safe, deterministic cloud
// day-log payload. No React, no Firebase, no network, no side effects. Input
// session state is never mutated.
//
// Storage note: mobile day logs are written to the user's own private space
// (users/{uid}/mobileDayLogs/{id}) — see dayLogRepository. This is distinct from
// the web's enrollment-based day logs (enrollments/{enrollmentId}/dayLogs),
// because mobile join/enrollment is deferred. The two do not conflict, and the
// private space keeps proof/reflection private by default. See
// docs/mobile-day-sync-proof-public-progress.md.

import { MOBILE_SESSION_STATUS } from './mobileSessionState.js';
import { computeMobileScore, mobileCompletionTier } from './mobileScoring.js';
import { collectSubmittedProof } from './mobileProofMappers.js';

const DAY_LOG_SCHEMA_VERSION = 1;

function sanitizeId(value, fallback) {
  const s = String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return s || fallback;
}

// Deterministic identity: pathId + uid + dayNumber.
export function mobileDayLogId({ pathId, uid, dayNumber } = {}) {
  return sanitizeId(pathId, 'path') + '__' + sanitizeId(uid, 'user') + '__day_' + Math.max(1, Number(dayNumber) || 1);
}

export function isSessionFinished(session) {
  return !!session && session.session && session.session.status === MOBILE_SESSION_STATUS.FINISHED;
}

// Build the cloud day-log payload from a finished session. Returns null if the
// session is not finished (in-progress days never sync as completed).
export function buildDayLogPayload(loopState, { pathId, uid, dayNumber } = {}) {
  if (!isSessionFinished(loopState)) return null;
  if (!pathId || !uid) return null;

  const day = Math.max(1, Number(dayNumber) || Number(loopState.path && loopState.path.dayNumber) || 1);
  const score = computeMobileScore(loopState.tasks, loopState.session.taskState);
  const tier = mobileCompletionTier(score);
  const completedTaskIds = loopState.tasks
    .filter(t => loopState.session.taskState[t.id] && loopState.session.taskState[t.id].done)
    .map(t => t.id);
  // Private proof records (kept private in the user's own space).
  const proof = collectSubmittedProof(loopState.session);
  const reflections = {};
  for (const [taskId, st] of Object.entries(loopState.session.taskState)) {
    if (st && st.reflection && String(st.reflection).trim()) reflections[taskId] = String(st.reflection);
  }

  return {
    id: mobileDayLogId({ pathId, uid, dayNumber: day }),
    pathId: String(pathId),
    uid: String(uid),
    dayNumber: day,
    status: 'completed',
    completionScore: score.score,
    completionTier: tier,
    totalTaskCount: score.total,
    completedTaskCount: score.completed,
    completedTaskIds,
    proofSubmittedCount: score.proofSubmitted, // submitted, not verified
    proof, // private
    reflections, // private
    source: 'mobile',
    schemaVersion: DAY_LOG_SCHEMA_VERSION,
  };
}

// Public-safe summary used by Today/Completion (no private bodies).
export function summarizeDayLog(payload) {
  if (!payload) return null;
  return {
    pathId: payload.pathId,
    dayNumber: payload.dayNumber,
    status: payload.status,
    score: payload.completionScore,
    tier: payload.completionTier,
    completedTaskCount: payload.completedTaskCount,
    totalTaskCount: payload.totalTaskCount,
    proofSubmittedCount: payload.proofSubmittedCount,
  };
}

export { DAY_LOG_SCHEMA_VERSION };
export default { mobileDayLogId, isSessionFinished, buildDayLogPayload, summarizeDayLog, DAY_LOG_SCHEMA_VERSION };
