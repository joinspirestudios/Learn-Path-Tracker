// Resolves the source day log for a publish-progress request.
//
// Resolution order (existing web behavior is preserved exactly):
//   1. If a web enrollment exists for (pathId, uid), use the web enrollment
//      day log — same checks and errors as before. Mobile is never consulted in
//      this case.
//   2. If no web enrollment exists, fall back to the mobile private day log
//      (users/{uid}/mobileDayLogs/...), but only for a path the user owns.
//
// Returns { source, dayLog, ... }. Source is 'web_enrollment_day_log' or
// 'mobile_private_day_log'. Throws safe apiError values otherwise.

import { apiError } from '../api/_lib/errors.js';
import { loadMobileDayLog } from './mobile-day-log-source.js';

// Mobile join/enrollment is deferred, so owned public/unlisted paths are the
// safe mobile publish source. Support common owner fields.
export function canPublishMobilePath(path, uid) {
  return !!path && (
    path.ownerId === uid
    || path.creatorId === uid
    || path.creatorUid === uid
  );
}

export async function resolvePublishProgressSource({
  firestore,
  transaction,
  path,
  pathId,
  auth,
  dayNumber,
  enrollmentIdFor,
}) {
  const uid = auth.uid;
  const enrollmentId = enrollmentIdFor(pathId, uid);
  const enrollmentRef = firestore.collection('enrollments').doc(enrollmentId);
  const enrollmentSnap = await transaction.get(enrollmentRef);

  // 1. Existing web enrollment source — unchanged behavior.
  if (enrollmentSnap.exists) {
    const enrollment = enrollmentSnap.data() || {};
    if (enrollment.id !== enrollmentId || enrollment.userId !== uid || enrollment.pathId !== pathId) {
      throw apiError('forbidden', 'You can only publish your own progress.', 403);
    }
    const dayLogRef = enrollmentRef.collection('dayLogs').doc(String(dayNumber));
    const dayLogSnap = await transaction.get(dayLogRef);
    if (!dayLogSnap.exists) {
      throw apiError('day_log_not_found', 'This completed day could not be found.', 404);
    }
    const dayLog = dayLogSnap.data() || {};
    if (dayLog.status !== 'completed') {
      throw apiError('day_not_completed', 'Only completed days can be published.', 409);
    }
    return { source: 'web_enrollment_day_log', dayLog, enrollmentId, enrollmentRef };
  }

  // 2. Mobile private day-log fallback (no web enrollment).
  if (!canPublishMobilePath(path, uid)) {
    throw apiError('forbidden', 'You can only publish progress for your own path.', 403);
  }
  const mobile = await loadMobileDayLog({ transaction, firestore, uid, pathId, dayNumber });
  return { source: 'mobile_private_day_log', dayLog: mobile.dayLog, mobileId: mobile.id };
}

export default { resolvePublishProgressSource, canPublishMobilePath };
