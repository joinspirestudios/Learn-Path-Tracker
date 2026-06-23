// Server-side loader for a MOBILE private day log
// (users/{uid}/mobileDayLogs/{mobileDayLogId}).
//
// Reads the trusted day log itself (the client never sends day-log contents).
// Validates ownership/path/day/completion and returns safe errors that never
// leak private proof or reflection content.

import { apiError } from '../api/_lib/errors.js';
import { mobileDayLogId, MOBILE_DAY_LOG_SUBCOLLECTION } from '../src/mobile-day-log-ids.js';

const COMPLETED_STATUSES = new Set(['completed', 'finished']);

export function mobileDayLogRef(firestore, uid, id) {
  return firestore.collection('users').doc(uid).collection(MOBILE_DAY_LOG_SUBCOLLECTION).doc(id);
}

export async function loadMobileDayLog({ transaction, firestore, uid, pathId, dayNumber }) {
  const id = mobileDayLogId({ pathId, uid, dayNumber });
  const ref = mobileDayLogRef(firestore, uid, id);
  const snap = await transaction.get(ref);
  if (!snap.exists) {
    throw apiError('day_log_not_found', 'This completed day could not be found.', 404);
  }
  const dayLog = snap.data() || {};
  if (String(dayLog.uid) !== String(uid)) {
    throw apiError('forbidden', 'You can only publish your own progress.', 403);
  }
  if (String(dayLog.pathId) !== String(pathId)) {
    throw apiError('invalid_day_log', 'This day could not be published.', 409);
  }
  if (Number(dayLog.dayNumber) !== Number(dayNumber)) {
    throw apiError('invalid_day_log', 'This day could not be published.', 409);
  }
  if (!COMPLETED_STATUSES.has(String(dayLog.status))) {
    throw apiError('day_not_completed', 'Only completed days can be published.', 409);
  }
  if (!Number.isFinite(Number(dayLog.completionScore))) {
    throw apiError('invalid_day_log', 'This day could not be published.', 409);
  }
  if (!dayLog.completionTier) {
    throw apiError('invalid_day_log', 'This day could not be published.', 409);
  }
  return { id, ref, dayLog };
}

export default { loadMobileDayLog, mobileDayLogRef };
