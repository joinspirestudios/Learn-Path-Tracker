// ── adaptive-planning-drafts.js ─────────────────────────────────────────────
// Pure helpers for adaptation drafts + the user-specific overlay that results
// from applying a draft. No DOM/Firebase. Drafts are private, user-owned, and
// never applied automatically.

import {
  ADAPTIVE_PLANNING_SCHEMA_VERSION, adaptivePlanSummary,
} from './adaptive-planning-model.js';
import {
  sanitizeAdaptiveRecommendation, adaptationMutationPlan,
} from './adaptive-planning-policy.js';

export const ADAPTIVE_DRAFT_SOURCES = ['deterministic', 'ai_assisted', 'manual'];
export const ADAPTIVE_DRAFT_STATUSES = ['draft', 'reviewed', 'applied', 'dismissed', 'expired'];

function safeId(value, max = 200) {
  return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, max);
}
function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function ts(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const p = Date.parse(value);
  return Number.isFinite(p) ? p : fallback;
}

export function newDraftId(now = Date.now()) {
  return 'adapt_' + Number(now).toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// Build a complete, private adaptation draft. Recommendations are sanitized;
// insights keep type + reason only (no private data).
export function buildAdaptationDraft({
  uid, pathId, currentDayNumber, insights = [], recommendations = [],
  source = 'deterministic', id = null, now = Date.now(),
} = {}) {
  const cleanRecs = (Array.isArray(recommendations) ? recommendations : []).map(sanitizeAdaptiveRecommendation);
  const cleanInsights = (Array.isArray(insights) ? insights : []).map(i => ({
    type: String(i && i.type || ''),
    reason: String(i && i.reason || '').slice(0, 300),
  })).filter(i => i.type);
  return {
    id: safeId(id || newDraftId(now)),
    uid: safeId(uid, 128),
    pathId: safeId(pathId),
    source: ADAPTIVE_DRAFT_SOURCES.includes(source) ? source : 'deterministic',
    status: 'draft',
    currentDayNumber: num(currentDayNumber, 1),
    insights: cleanInsights,
    recommendations: cleanRecs,
    summary: adaptivePlanSummary(cleanRecs),
    createdAt: ts(now, Date.now()),
    updatedAt: ts(now, Date.now()),
    appliedAt: null,
    schemaVersion: ADAPTIVE_PLANNING_SCHEMA_VERSION,
  };
}

export function normalizeAdaptationDraft(raw = {}) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const status = ADAPTIVE_DRAFT_STATUSES.includes(d.status) ? d.status : 'draft';
  return {
    id: safeId(d.id),
    uid: safeId(d.uid, 128),
    pathId: safeId(d.pathId),
    source: ADAPTIVE_DRAFT_SOURCES.includes(d.source) ? d.source : 'deterministic',
    status,
    currentDayNumber: num(d.currentDayNumber, 1),
    insights: Array.isArray(d.insights) ? d.insights.map(i => ({ type: String(i && i.type || ''), reason: String(i && i.reason || '').slice(0, 300) })).filter(i => i.type) : [],
    recommendations: Array.isArray(d.recommendations) ? d.recommendations.map(sanitizeAdaptiveRecommendation) : [],
    summary: String(d.summary || '').slice(0, 200),
    createdAt: ts(d.createdAt, Date.now()),
    updatedAt: ts(d.updatedAt, Date.now()),
    appliedAt: d.appliedAt == null ? null : ts(d.appliedAt, null),
    schemaVersion: num(d.schemaVersion, ADAPTIVE_PLANNING_SCHEMA_VERSION),
  };
}

// Status transitions are explicit and bounded. Returns a new draft object.
export function transitionDraftStatus(draft, nextStatus, now = Date.now()) {
  const d = normalizeAdaptationDraft(draft);
  if (!ADAPTIVE_DRAFT_STATUSES.includes(nextStatus)) return d;
  return {
    ...d,
    status: nextStatus,
    updatedAt: now,
    appliedAt: nextStatus === 'applied' ? now : d.appliedAt,
  };
}

export function dismissDraft(draft, now = Date.now()) {
  return transitionDraftStatus(draft, 'dismissed', now);
}

// Build the user-specific overlay from an approved draft. Future-day only;
// never mutates the canonical template or past days.
export function buildOverlayFromDraft({ draft, path = {}, userRole = 'participant', now = Date.now() } = {}) {
  const d = normalizeAdaptationDraft(draft);
  const plan = adaptationMutationPlan({
    path, recommendations: d.recommendations, userRole, currentDayNumber: d.currentDayNumber,
  });
  return {
    uid: d.uid,
    pathId: d.pathId,
    appliedDraftId: d.id,
    startsAtDayNumber: plan.overlay.startsAtDayNumber,
    taskAdjustments: plan.overlay.taskAdjustments,
    dayAdjustments: plan.overlay.dayAdjustments,
    intensityAdjustment: plan.overlay.intensityAdjustment,
    createdAt: now,
    updatedAt: now,
    schemaVersion: ADAPTIVE_PLANNING_SCHEMA_VERSION,
  };
}

export default {
  ADAPTIVE_DRAFT_SOURCES,
  ADAPTIVE_DRAFT_STATUSES,
  newDraftId,
  buildAdaptationDraft,
  normalizeAdaptationDraft,
  transitionDraftStatus,
  dismissDraft,
  buildOverlayFromDraft,
};
