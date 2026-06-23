// Pure public-progress mappers — build a SANITIZED public summary from a synced
// day log. Never includes private proof bodies, private reflections, raw
// evidence URLs, file paths, tokens, or credentials.

function str(v, max = 200) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

const PUBLIC_SUMMARY_SCHEMA_VERSION = 1;

// A safe, public-facing summary object (for on-device preview before publish).
export function buildPublicSummary(dayLog, { uid, pathTitle = '', dayTitle = '', publicCaption = '' } = {}) {
  if (!dayLog) return null;
  return {
    pathId: str(dayLog.pathId, 180),
    uid: str(uid || dayLog.uid, 160),
    dayNumber: num(dayLog.dayNumber) || 1,
    pathTitle: str(pathTitle, 120),
    dayTitle: str(dayTitle || ('Day ' + (num(dayLog.dayNumber) || 1) + ' completed'), 120),
    tier: str(dayLog.completionTier, 40),
    score: num(dayLog.completionScore),
    tasksCompleted: num(dayLog.completedTaskCount),
    proofSubmittedCount: num(dayLog.proofSubmittedCount), // submitted, not verified
    publicSummary: str(publicCaption, 500),
    schemaVersion: PUBLIC_SUMMARY_SCHEMA_VERSION,
  };
}

// The minimal request body sent to the existing /api/publish-progress route.
// The server builds and sanitizes the stored public entry; we send only safe,
// minimal fields (matching the web contract: pathId, dayNumber, publicCaption).
export function buildPublishRequest(dayLog, { publicCaption = '' } = {}) {
  if (!dayLog) return null;
  return {
    pathId: str(dayLog.pathId, 180),
    dayNumber: num(dayLog.dayNumber) || 1,
    publicCaption: str(publicCaption, 500),
  };
}

export { PUBLIC_SUMMARY_SCHEMA_VERSION };
export default { buildPublicSummary, buildPublishRequest, PUBLIC_SUMMARY_SCHEMA_VERSION };
