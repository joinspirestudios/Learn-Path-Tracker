// ── server/adaptive-planning-service.js ─────────────────────────────────────
// Builds an adaptation DRAFT for the authenticated user. Deterministic-first:
// it never depends on AI. If an injected `callModel` is provided AND an Anthropic
// key is configured, it may augment the draft with AI-assisted recommendations
// over SANITIZED context only. It never applies anything and never mutates day
// logs or the canonical path.

import {
  buildAdaptivePlanningContext, buildAdaptiveInsights, buildAdaptiveRecommendations,
} from '../src/adaptive-planning-model.js';
import { buildAdaptationDraft } from '../src/adaptive-planning-drafts.js';
import { sanitizeAdaptiveContextForModel, containsForbiddenContent } from './adaptive-planning-sanitizer.js';

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Load the user's OWN mobile day logs for a path (owner-only space). Reads only
// structured progress fields; returns [] on any failure.
async function loadUserDayLogs(adminDb, uid, pathId) {
  if (!adminDb || !uid || !pathId) return [];
  try {
    const snap = await adminDb.collection('users').doc(uid).collection('mobileDayLogs').get();
    const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
    return docs
      .map(d => (typeof d.data === 'function' ? d.data() : {}))
      .filter(l => String(l.pathId || '') === String(pathId))
      .map(l => ({
        dayNumber: num(l.dayNumber, null),
        completionScore: num(l.completionScore, null),
        completionTier: typeof l.completionTier === 'string' ? l.completionTier : null,
        requiredCompleted: num(l.requiredCompleted, null),
        requiredTotal: num(l.requiredTotal, null),
        optionalCompleted: num(l.optionalCompleted, null),
        optionalTotal: num(l.optionalTotal, null),
        anchorSatisfied: l.anchorSatisfied == null ? null : !!l.anchorSatisfied,
        evidenceRequired: num(l.proofRequiredCount ?? l.evidenceRequired, null),
        proofSubmittedCount: num(l.uploadedMediaProofCount ?? l.proofSubmittedCount, null),
        missed: l.missed === true,
        frozenAt: l.frozenAt || null,
      }))
      .filter(r => r.dayNumber != null);
  } catch {
    return [];
  }
}

// Accept a client-provided structured context (safe meta + counts) but never
// trust private fields — everything is re-derived through the pure model.
function contextFromInput({ clientContext = {}, dayLogs = [] }) {
  const c = clientContext && typeof clientContext === 'object' ? clientContext : {};
  return buildAdaptivePlanningContext({
    path: {
      id: String(c.pathId || ''),
      title: typeof c.pathTitle === 'string' ? c.pathTitle : '',
      category: typeof c.pathCategory === 'string' ? c.pathCategory : '',
      visibility: typeof c.pathVisibility === 'string' ? c.pathVisibility : '',
      // task counts are derived from provided structured task descriptors only
      tasks: Array.isArray(c.tasks) ? c.tasks : [],
    },
    dayLogs: dayLogs.length ? dayLogs : (Array.isArray(c.dayLogs) ? c.dayLogs : []),
    currentDayNumber: num(c.currentDayNumber, null),
    intensity: c.intensity,
    pendingProofCount: num(c.pendingProofCount, 0) || 0,
    currentStreak: num(c.currentStreak, 0) || 0,
    streakFreezeAvailable: c.streakFreezeAvailable === true,
    isOwner: c.isOwner === true,
  });
}

// Build the adaptation draft. Returns { draft, aiAvailable, aiUsed, source }.
export async function buildAdaptationDraftForUser({
  adminDb = null, uid, pathId, clientContext = {}, env = process.env, callModel = null, now = Date.now(),
} = {}) {
  const dayLogs = await loadUserDayLogs(adminDb, uid, pathId);
  const context = contextFromInput({ clientContext, dayLogs });
  const insights = buildAdaptiveInsights(context);
  let recommendations = buildAdaptiveRecommendations(context, { insights });
  let source = 'deterministic';
  let aiUsed = false;

  const aiAvailable = !!(env && env.ANTHROPIC_API_KEY) && typeof callModel === 'function';
  if (aiAvailable) {
    // Only sanitized, value-free context ever leaves the server.
    const modelContext = sanitizeAdaptiveContextForModel({
      context, tasks: Array.isArray(clientContext.tasks) ? clientContext.tasks : [], insights,
    });
    if (!containsForbiddenContent(modelContext)) {
      try {
        const aiRecs = await callModel({ context: modelContext });
        if (Array.isArray(aiRecs) && aiRecs.length) {
          recommendations = aiRecs.map(r => ({ ...r, source: 'ai_assisted' }));
          source = 'ai_assisted';
          aiUsed = true;
        }
      } catch {
        // AI augmentation is best-effort; deterministic recommendations stand.
      }
    }
  }

  const draft = buildAdaptationDraft({
    uid, pathId, currentDayNumber: context.currentDayNumber, insights, recommendations, source, now,
  });

  // Persist best-effort to the user's private space (creating a draft is NOT
  // applying it). Never throws on failure.
  if (adminDb) {
    try {
      await adminDb.collection('users').doc(uid).collection('adaptivePlans').doc(pathId)
        .collection('drafts').doc(draft.id).set(draft, { merge: false });
    } catch { /* persistence is best-effort */ }
  }

  return { draft, aiAvailable: !!(env && env.ANTHROPIC_API_KEY), aiUsed, source };
}

export default { buildAdaptationDraftForUser };
