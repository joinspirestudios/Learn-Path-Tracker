// ── evidence-intelligence-drafts.js ─────────────────────────────────────────
// Pure helpers for evidence insight drafts. Drafts are private, user-owned, and
// never published automatically. The publicSafeSummary is always scrubbed of
// private fields and never claims "verified".

import {
  EVIDENCE_INTELLIGENCE_SCHEMA_VERSION, evidenceInsightSummary,
} from './evidence-intelligence-model.js';
import { sanitizeEvidenceInsight } from './evidence-intelligence-policy.js';

export const EVIDENCE_DRAFT_SOURCES = ['deterministic', 'ai_assisted', 'manual'];
export const EVIDENCE_DRAFT_STATUSES = ['draft', 'reviewed', 'dismissed', 'archived'];

function safeId(value, max = 200) {
  return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_:-]/g, '_').slice(0, max);
}
function num(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function ts(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const p = Date.parse(value); return Number.isFinite(p) ? p : fallback;
}

export function newEvidenceInsightId(now = Date.now()) {
  return 'evi_' + Number(now).toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// A public-safe summary never contains gap/pending counts as private data — it is
// an aggregate, scrubbed line. We derive it from the safe summary text only.
function publicSafeSummaryFrom(insights) {
  const safe = sanitizeEvidenceInsight({ insights, summary: evidenceInsightSummary(insights) });
  return safe.summary;
}

export function buildEvidenceInsightDraft({
  uid, pathId, currentDayNumber, insights = [], recommendations = [],
  source = 'deterministic', id = null, now = Date.now(),
} = {}) {
  // Scrub everything through the policy sanitizer (drops private fields, strips
  // "verified", bounds text).
  const cleaned = sanitizeEvidenceInsight({ insights, recommendations, summary: evidenceInsightSummary(insights) });
  return {
    id: safeId(id || newEvidenceInsightId(now)),
    uid: safeId(uid, 128),
    pathId: safeId(pathId),
    source: EVIDENCE_DRAFT_SOURCES.includes(source) ? source : 'deterministic',
    status: 'draft',
    currentDayNumber: num(currentDayNumber, 1),
    insights: cleaned.insights,
    recommendations: cleaned.recommendations,
    summary: cleaned.summary,
    publicSafeSummary: publicSafeSummaryFrom(insights),
    createdAt: ts(now, Date.now()),
    updatedAt: ts(now, Date.now()),
    reviewedAt: null,
    dismissedAt: null,
    schemaVersion: EVIDENCE_INTELLIGENCE_SCHEMA_VERSION,
  };
}

export function normalizeEvidenceInsightDraft(raw = {}) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const cleaned = sanitizeEvidenceInsight(d);
  return {
    id: safeId(d.id),
    uid: safeId(d.uid, 128),
    pathId: safeId(d.pathId),
    source: EVIDENCE_DRAFT_SOURCES.includes(d.source) ? d.source : 'deterministic',
    status: EVIDENCE_DRAFT_STATUSES.includes(d.status) ? d.status : 'draft',
    currentDayNumber: num(d.currentDayNumber, 1),
    insights: cleaned.insights,
    recommendations: cleaned.recommendations,
    summary: cleaned.summary,
    publicSafeSummary: cleaned.publicSafeSummary || cleaned.summary,
    createdAt: ts(d.createdAt, Date.now()),
    updatedAt: ts(d.updatedAt, Date.now()),
    reviewedAt: d.reviewedAt == null ? null : ts(d.reviewedAt, null),
    dismissedAt: d.dismissedAt == null ? null : ts(d.dismissedAt, null),
    schemaVersion: num(d.schemaVersion, EVIDENCE_INTELLIGENCE_SCHEMA_VERSION),
  };
}

export function transitionEvidenceInsightStatus(draft, nextStatus, now = Date.now()) {
  const d = normalizeEvidenceInsightDraft(draft);
  if (!EVIDENCE_DRAFT_STATUSES.includes(nextStatus)) return d;
  return {
    ...d,
    status: nextStatus,
    updatedAt: now,
    reviewedAt: nextStatus === 'reviewed' ? now : d.reviewedAt,
    dismissedAt: nextStatus === 'dismissed' ? now : d.dismissedAt,
  };
}

export function dismissEvidenceInsightDraft(draft, now = Date.now()) {
  return transitionEvidenceInsightStatus(draft, 'dismissed', now);
}
export function reviewEvidenceInsightDraft(draft, now = Date.now()) {
  return transitionEvidenceInsightStatus(draft, 'reviewed', now);
}

export default {
  EVIDENCE_DRAFT_SOURCES,
  EVIDENCE_DRAFT_STATUSES,
  newEvidenceInsightId,
  buildEvidenceInsightDraft,
  normalizeEvidenceInsightDraft,
  transitionEvidenceInsightStatus,
  dismissEvidenceInsightDraft,
  reviewEvidenceInsightDraft,
};
