// Shared, pure helper for the deterministic mobile day-log document id.
//
// One brain, two skins: both the mobile client (apps/mobile) and the server
// publish bridge use THIS module so the id format never diverges. No DOM, no
// Firebase, no environment, no side effects.

export const MOBILE_DAY_LOG_SUBCOLLECTION = 'mobileDayLogs';

function sanitizeId(value, fallback) {
  const s = String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return s || fallback;
}

// Deterministic identity: pathId + uid + dayNumber  ->  pathId__uid__day_N
export function mobileDayLogId({ pathId, uid, dayNumber } = {}) {
  return sanitizeId(pathId, 'path') + '__' + sanitizeId(uid, 'user') + '__day_' + Math.max(1, Number(dayNumber) || 1);
}

export default { MOBILE_DAY_LOG_SUBCOLLECTION, mobileDayLogId };
