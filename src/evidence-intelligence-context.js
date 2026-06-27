// ── evidence-intelligence-context.js ────────────────────────────────────────
// Assembles an Evidence Intelligence context from the web app's local/cloud
// state into the pure model's expected input. No DOM/Firebase. Reads only
// structured proof + day metadata.

import {
  buildEvidenceContext, buildEvidenceInsights, buildEvidenceRecommendations,
} from './evidence-intelligence-model.js';
import { dayLogsFromEnrollment } from './adaptive-planning-context.js';

function num(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

// A value looks like a proof submission (not an enrollment bucket) when it has a
// submission-shaped field. Buckets are objects whose VALUES are submissions.
function looksLikeSubmission(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof value.id === 'string'
    || 'taskId' in value || 'evidenceType' in value || 'storagePath' in value
    || 'evidenceUrl' in value || 'note' in value || 'dayNumber' in value;
}

// Flatten the web evidence cache, which may be:
//   nested  { [enrollmentId]: { [submissionId]: submission } }
//   flat    { [submissionId]: submission }
//   array   [ submission ]
// Returns a de-duplicated (by id) array of submissions. Never mutates input.
export function flattenEvidenceSubmissionBuckets(evidenceSubmissions = {}) {
  const out = [];
  const seen = new Set();
  const push = (sub) => {
    if (!sub || typeof sub !== 'object') return;
    const id = sub.id != null ? String(sub.id) : '';
    const key = id || JSON.stringify([sub.pathId, sub.taskId, sub.dayNumber, sub.createdAt]);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(sub);
  };
  const source = evidenceSubmissions;
  if (Array.isArray(source)) {
    for (const sub of source) push(sub);
    return out;
  }
  if (!source || typeof source !== 'object') return out;
  for (const value of Object.values(source)) {
    if (looksLikeSubmission(value)) {
      push(value);
    } else if (value && typeof value === 'object') {
      // Treat as an enrollment bucket: its values are submissions.
      for (const sub of Object.values(value)) push(sub);
    }
  }
  return out;
}

// Collect proof submissions for a single enrollment bucket.
export function collectEvidenceSubmissionsForEnrollment({ evidenceSubmissions = {}, enrollmentId } = {}) {
  if (!enrollmentId) return [];
  const bucket = evidenceSubmissions && typeof evidenceSubmissions === 'object'
    ? evidenceSubmissions[enrollmentId] : null;
  if (!bucket) return [];
  return flattenEvidenceSubmissionBuckets({ [enrollmentId]: bucket });
}

// Collect proof submissions connected to the active path. Matches by the
// enrollment(s) that target the path AND by any flattened submission carrying
// the pathId (covers flat/array shapes). De-duplicated by id.
export function collectEvidenceSubmissionsForPath({ evidenceSubmissions = {}, enrollments = {}, pathId } = {}) {
  if (!pathId) return [];
  const enrollmentIds = new Set(
    Object.entries(enrollments && typeof enrollments === 'object' ? enrollments : {})
      .filter(([, e]) => e && e.pathId === pathId)
      .map(([id]) => id),
  );
  const all = flattenEvidenceSubmissionBuckets(evidenceSubmissions);
  const seen = new Set();
  const out = [];
  // From matching enrollment buckets (nested shape).
  for (const enrollmentId of enrollmentIds) {
    for (const sub of collectEvidenceSubmissionsForEnrollment({ evidenceSubmissions, enrollmentId })) {
      const key = sub.id != null ? String(sub.id) : JSON.stringify([sub.taskId, sub.dayNumber]);
      if (!seen.has(key)) { seen.add(key); out.push(sub); }
    }
  }
  // Plus any flattened submission that explicitly carries the pathId.
  for (const sub of all) {
    if (sub && sub.pathId === pathId) {
      const key = sub.id != null ? String(sub.id) : JSON.stringify([sub.taskId, sub.dayNumber]);
      if (!seen.has(key)) { seen.add(key); out.push(sub); }
    }
  }
  return out;
}

// Build a context for a path the user is documenting. `proofSubmissions` are the
// user's own proof records (raw or normalized); the model normalizes them.
export function buildEvidenceContextForPath({
  path = {}, enrollment = {}, proofSubmissions = [], currentDayNumber = null,
  pendingProofUploadCount = 0, isOwner = false,
} = {}) {
  const en = enrollment && typeof enrollment === 'object' ? enrollment : {};
  return buildEvidenceContext({
    path,
    pathId: path && path.id,
    proofSubmissions,
    dayLogs: dayLogsFromEnrollment(en),
    currentDayNumber: num(currentDayNumber, null) ?? num(en.currentDay, null),
    pendingProofUploadCount,
    isOwner,
  });
}

// One-shot: context → insights → recommendations (deterministic).
export function buildDeterministicEvidencePlan(input = {}) {
  const context = input.context || buildEvidenceContextForPath(input);
  const insights = buildEvidenceInsights(context);
  const recommendations = buildEvidenceRecommendations(context, { insights });
  return { context, insights, recommendations };
}

export default {
  flattenEvidenceSubmissionBuckets,
  collectEvidenceSubmissionsForEnrollment,
  collectEvidenceSubmissionsForPath,
  buildEvidenceContextForPath,
  buildDeterministicEvidencePlan,
};
