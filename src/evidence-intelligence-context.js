// ── evidence-intelligence-context.js ────────────────────────────────────────
// Assembles an Evidence Intelligence context from the web app's local/cloud
// state into the pure model's expected input. No DOM/Firebase. Reads only
// structured proof + day metadata.

import {
  buildEvidenceContext, buildEvidenceInsights, buildEvidenceRecommendations,
} from './evidence-intelligence-model.js';
import { dayLogsFromEnrollment } from './adaptive-planning-context.js';

function num(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

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
  buildEvidenceContextForPath,
  buildDeterministicEvidencePlan,
};
