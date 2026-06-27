// ── evidence-intelligence-model.js ──────────────────────────────────────────
// Pure Evidence Intelligence model. No DOM, no Firebase, no network, no AI, and
// no image-content analysis. It analyzes a user's submitted proof to surface
// coverage, gaps, pending uploads, weak/strong documentation patterns and
// public-story readiness — and suggests how to document better.
//
// It only organizes documentation; it makes no claim about whether an activity
// happened and no judgement of the user. It never reads image content, and never
// exposes private proof bodies, raw evidence URLs, storage paths, localUri or
// tokens in public-safe output. Detection is from real data only — it never
// invents missing proof.

import {
  normalizeProofSubmissions, proofKind, proofDomain, isProofPublicVisible,
} from './proof-archive-model.js';

export const EVIDENCE_INTELLIGENCE_SCHEMA_VERSION = 1;

export const EVIDENCE_INSIGHT_TYPES = [
  'proof_gap',
  'pending_upload',
  'failed_upload',
  'missing_anchor_proof',
  'weak_text_proof',
  'link_without_context',
  'image_without_caption',
  'strong_multimodal_proof',
  'duplicate_link_pattern',
  'duplicate_text_pattern',
  'stale_repeated_proof',
  'high_coverage_streak',
  'public_story_ready',
  'public_story_needs_context',
  'private_only_evidence',
];

export const EVIDENCE_RECOMMENDATION_TYPES = [
  'add_short_caption',
  'attach_image_proof',
  'resolve_pending_upload',
  'add_context_to_link',
  'document_anchor_task_first',
  'mark_sensitive_proof_private',
  'publish_public_safe_summary',
  'keep_proof_private',
  'improve_tomorrow_proof_prompt',
];

export const EVIDENCE_THRESHOLDS = Object.freeze({
  recentWindow: 7,
  weakTextMaxChars: 24,
  duplicateMinCount: 2,
  streakMinDays: 3,
  publicStoryMinArtifacts: 3,
  proofGapMinDays: 2,
});

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function arr(value) { return Array.isArray(value) ? value : []; }
function text(value) { return String(value == null ? '' : value).trim(); }

function taskIsOptional(task) { return task?.required === false || task?.optional === true; }
function taskIsAnchor(task) { return !!(task?.anchor || task?.core || task?.critical || task?.completionCritical); }

function pathTasks(path) {
  const out = [];
  for (const week of arr(path && path.weeks)) for (const t of arr(week && week.tasks)) out.push(t);
  for (const t of arr(path && path.tasks)) out.push(t);
  return out;
}

// Upload state of a proof submission. 'uploaded' requires a real artifact and a
// non-pending/non-failed status. Pending/failed never count as uploaded.
function proofUploadState(p) {
  const status = text(p.status).toLowerCase();
  if (status === 'failed' || status === 'upload_failed') return 'failed';
  if (status === 'pending' || status === 'uploading' || status === 'queued' || status === 'offline_queued') return 'pending';
  const hasArtifact = !!(text(p.storagePath) || text(p.evidenceUrl) || text(p.publicAssetURL) || text(p.fileName) || text(p.note));
  return hasArtifact ? 'uploaded' : 'pending';
}

// Normalize one proof submission into a safe, value-free-ish evidence record.
// (Keeps owner-only fields like storagePath ONLY for private analysis; public
// projections drop them — see evidenceIsPublicSafe / sanitizer.)
export function normalizeEvidenceRecord(raw = {}) {
  const [p] = normalizeProofSubmissions([raw]);
  if (!p) return null;
  const kind = proofKind(p);
  const note = text(p.note);
  const caption = text(p.publicCaption);
  return {
    id: p.id,
    pathId: p.pathId,
    dayNumber: num(p.dayNumber, null),
    taskId: p.taskId,
    taskTitle: p.taskTitle,
    kind,
    uploadState: proofUploadState(p),
    hasNote: !!note,
    noteLength: note.length,
    hasCaption: !!caption,
    domain: proofDomain(p),
    publicVisible: p.publicVisible === true || p.visibility === 'public',
    // Owner-only signals (never emitted publicly):
    hasStoragePath: !!text(p.storagePath),
    hasEvidenceUrl: !!text(p.evidenceUrl),
  };
}

export function buildEvidenceContext(input = {}) {
  const path = input.path && typeof input.path === 'object' ? input.path : {};
  const records = arr(input.proofSubmissions || input.proofArchive)
    .map(normalizeEvidenceRecord).filter(Boolean);
  const tasks = pathTasks(path);
  const anchorTaskIds = new Set(tasks.filter(taskIsAnchor).map((t, i) => String(t.id || `task:${i}`)));
  const requiredTaskIds = new Set(tasks.filter(t => !taskIsOptional(t)).map((t, i) => String(t.id || `task:${i}`)));
  const dayLogs = input.dayLogs || input.mobileDayLogs || {};
  const dayRecords = (Array.isArray(dayLogs)
    ? dayLogs.map((d, i) => ({ ...d, dayNumber: num(d.dayNumber, i + 1) }))
    : Object.entries(dayLogs).map(([k, v]) => ({ ...(v || {}), dayNumber: num((v && v.dayNumber) ?? k, null) })))
    .filter(d => d.dayNumber != null)
    .map(d => ({
      dayNumber: d.dayNumber,
      completionScore: num(d.completionScore, null),
      requiredCompleted: num(d.requiredCompleted, null),
      requiredTotal: num(d.requiredTotal, null),
      anchorSatisfied: d.anchorSatisfied == null ? null : !!d.anchorSatisfied,
      proofRequiredCount: num(d.evidenceRequired ?? d.proofRequiredCount, null),
      completedTaskIds: arr(d.completedTaskIds).map(String),
    }))
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const currentDayNumber = num(input.currentDayNumber, null)
    ?? (dayRecords.length ? Math.max(...dayRecords.map(d => d.dayNumber)) + 1 : 1);

  return {
    pathId: text(path.id) || text(input.pathId),
    pathTitle: text(path.title),
    pathCategory: text(path.category),
    pathVisibility: text(path.visibility),
    isPublicPath: ['public', 'unlisted'].includes(text(path.visibility)),
    isOwner: input.isOwner === true,
    currentDayNumber,
    evidence: records,
    uploadedEvidence: records.filter(r => r.uploadState === 'uploaded'),
    pendingEvidence: records.filter(r => r.uploadState === 'pending'),
    failedEvidence: records.filter(r => r.uploadState === 'failed'),
    dayRecords,
    anchorTaskIds,
    requiredTaskIds,
    activeDayCount: dayRecords.filter(d => d.completionScore != null || d.requiredCompleted > 0).length,
    pendingProofUploadCount: Math.max(0, num(input.pendingProofUploadCount, 0) || records.filter(r => r.uploadState === 'pending').length),
  };
}

function insight(type, detail) { return { type, ...detail }; }

// ── Analyzers (real data only; each returns insight or null) ──

export function analyzeEvidenceCoverage(context = {}) {
  const days = arr(context.dayRecords);
  if (!days.length) return null;
  const daysWithProof = new Set(arr(context.uploadedEvidence).map(r => r.dayNumber).filter(d => d != null));
  const active = days.filter(d => d.completionScore != null || (d.requiredCompleted || 0) > 0);
  if (!active.length) return null;
  const covered = active.filter(d => daysWithProof.has(d.dayNumber)).length;
  return insight('high_coverage_streak', {
    coveredDays: covered,
    activeDays: active.length,
    coverageRate: Math.round((covered / active.length) * 100),
    reason: `You have proof on ${covered} of your last ${active.length} active days.`,
    _coverageOnly: covered < Math.max(EVIDENCE_THRESHOLDS.streakMinDays, Math.ceil(active.length * 0.6)),
  });
}

export function analyzePendingEvidence(context = {}) {
  const pending = arr(context.pendingEvidence);
  const failed = arr(context.failedEvidence);
  const out = [];
  if (pending.length) {
    out.push(insight('pending_upload', {
      count: pending.length,
      days: [...new Set(pending.map(p => p.dayNumber).filter(Boolean))],
      reason: `${pending.length} proof ${pending.length > 1 ? 'items are' : 'item is'} still pending upload.`,
    }));
  }
  if (failed.length) {
    out.push(insight('failed_upload', {
      count: failed.length,
      reason: `${failed.length} proof upload${failed.length > 1 ? 's' : ''} failed and can be retried.`,
    }));
  }
  return out;
}

export function analyzeEvidenceGaps(context = {}) {
  const days = arr(context.dayRecords);
  // A proof gap: an active day that required proof but has no uploaded evidence.
  const daysWithProof = new Set(arr(context.uploadedEvidence).map(r => r.dayNumber));
  const gaps = days.filter(d =>
    (d.proofRequiredCount || 0) > 0
    && (d.completionScore != null || (d.requiredCompleted || 0) > 0)
    && !daysWithProof.has(d.dayNumber));
  if (gaps.length >= EVIDENCE_THRESHOLDS.proofGapMinDays) {
    return insight('proof_gap', {
      days: gaps.map(d => d.dayNumber),
      reason: `Proof was expected but not attached on ${gaps.length} active days.`,
    });
  }
  return null;
}

export function analyzeAnchorEvidence(context = {}) {
  if (!context.anchorTaskIds || !context.anchorTaskIds.size) return null;
  const anchorIds = context.anchorTaskIds;
  const uploaded = arr(context.uploadedEvidence);
  // Only highlight anchor coverage once the user is actually documenting; with no
  // uploaded evidence at all there is nothing to compare against.
  if (!uploaded.length) return null;
  const anchorProof = uploaded.filter(r => anchorIds.has(String(r.taskId))).length;
  const optionalProof = uploaded.filter(r => r.taskId && !context.requiredTaskIds.has(String(r.taskId))).length;
  // Highlight (not shame) when anchors have weaker coverage than optional tasks.
  if (anchorProof === 0 || (optionalProof > anchorProof && anchorProof < context.anchorTaskIds.size)) {
    return insight('missing_anchor_proof', {
      anchorProofCount: anchorProof,
      reason: 'Your anchor tasks have lower proof coverage than your other tasks.',
    });
  }
  return null;
}

export function analyzeEvidenceQuality(context = {}) {
  const uploaded = arr(context.uploadedEvidence);
  if (!uploaded.length) return [];
  const out = [];
  const weakText = uploaded.filter(r => r.kind === 'note' && r.noteLength > 0 && r.noteLength <= EVIDENCE_THRESHOLDS.weakTextMaxChars);
  if (weakText.length) {
    out.push(insight('weak_text_proof', { count: weakText.length, reason: 'Some text proof is very short and has no image or link for context.' }));
  }
  const linkNoContext = uploaded.filter(r => r.kind === 'url' && !r.hasNote);
  if (linkNoContext.length) {
    out.push(insight('link_without_context', { count: linkNoContext.length, reason: 'Some link proof has no short description of what it shows.' }));
  }
  const imageNoCaption = uploaded.filter(r => r.kind === 'image' && !r.hasCaption && !r.hasNote);
  if (imageNoCaption.length) {
    out.push(insight('image_without_caption', { count: imageNoCaption.length, reason: 'Some image proof has no caption to explain what changed.' }));
  }
  // Strong multimodal: a day with both image and text/link evidence.
  const byDay = new Map();
  for (const r of uploaded) {
    const set = byDay.get(r.dayNumber) || new Set();
    set.add(r.kind); byDay.set(r.dayNumber, set);
  }
  const multimodalDays = [...byDay.values()].filter(s => s.has('image') && (s.has('note') || s.has('url'))).length;
  if (multimodalDays >= 1) {
    out.push(insight('strong_multimodal_proof', { days: multimodalDays, reason: `${multimodalDays} day${multimodalDays > 1 ? 's' : ''} pair an image with a clear description — strong documentation.` }));
  }
  return out;
}

export function analyzeDuplicateEvidencePattern(context = {}) {
  const uploaded = arr(context.uploadedEvidence);
  const out = [];
  const domainCounts = new Map();
  for (const r of uploaded) if (r.domain) domainCounts.set(r.domain, (domainCounts.get(r.domain) || 0) + 1);
  const dupDomains = [...domainCounts.entries()].filter(([, c]) => c >= EVIDENCE_THRESHOLDS.duplicateMinCount + 1);
  if (dupDomains.length) {
    out.push(insight('duplicate_link_pattern', { domains: dupDomains.map(([d]) => d), reason: 'The same link source appears many times — consider varied or more specific proof.' }));
  }
  return out;
}

export function analyzePublicEvidenceReadiness(context = {}) {
  if (!context.isPublicPath) {
    return arr(context.uploadedEvidence).length
      ? insight('private_only_evidence', { reason: 'Your proof is private. You can publish a public-safe summary when you choose.' })
      : null;
  }
  // Count public-safe artifacts only (publicVisible + a caption/description).
  const publicSafe = arr(context.uploadedEvidence).filter(r => r.publicVisible && (r.hasCaption || r.hasNote));
  if (publicSafe.length >= EVIDENCE_THRESHOLDS.publicStoryMinArtifacts) {
    return insight('public_story_ready', { count: publicSafe.length, reason: 'Your public timeline has enough evidence to tell a clear progress story.' });
  }
  if (arr(context.uploadedEvidence).length) {
    return insight('public_story_needs_context', { reason: 'Your public proof needs short captions to tell a clear progress story.' });
  }
  return null;
}

export function buildEvidenceInsights(context = {}) {
  const coverage = analyzeEvidenceCoverage(context);
  const out = [];
  // Coverage: emit a streak insight only when coverage is genuinely strong.
  if (coverage) {
    if (!coverage._coverageOnly && coverage.coveredDays >= EVIDENCE_THRESHOLDS.streakMinDays) {
      const { _coverageOnly, ...clean } = coverage; out.push(clean);
    }
  }
  out.push(...analyzePendingEvidence(context));
  const gap = analyzeEvidenceGaps(context); if (gap) out.push(gap);
  const anchor = analyzeAnchorEvidence(context); if (anchor) out.push(anchor);
  out.push(...analyzeEvidenceQuality(context));
  out.push(...analyzeDuplicateEvidencePattern(context));
  const pub = analyzePublicEvidenceReadiness(context); if (pub) out.push(pub);
  return out;
}

function rec(type, detail) {
  return { type, source: 'deterministic', ...detail };
}

export function buildEvidenceRecommendations(context = {}, options = {}) {
  const insights = arr(options.insights).length ? options.insights : buildEvidenceInsights(context);
  const has = (t) => insights.some(i => i.type === t);
  const out = [];
  if (has('failed_upload') || has('pending_upload')) {
    out.push(rec('resolve_pending_upload', { reason: 'Finish your pending or failed proof uploads so they count as evidence.' }));
  }
  if (has('missing_anchor_proof')) {
    out.push(rec('document_anchor_task_first', { reason: 'Document your anchor task first — it carries the most weight in your record.' }));
  }
  if (has('proof_gap')) {
    out.push(rec('attach_image_proof', { reason: 'Attach a quick image or note on proof-required days to close the gaps.' }));
  }
  if (has('image_without_caption')) {
    out.push(rec('add_short_caption', { reason: 'Add a short caption to image proof so future you understands what changed.' }));
  }
  if (has('link_without_context')) {
    out.push(rec('add_context_to_link', { reason: 'Add a one-line description to link proof so it stands on its own.' }));
  }
  if (has('weak_text_proof')) {
    out.push(rec('improve_tomorrow_proof_prompt', { reason: 'Tomorrow, add a sentence or an image so your proof tells a clearer story.' }));
  }
  if (has('public_story_ready')) {
    out.push(rec('publish_public_safe_summary', { reason: 'You can publish a public-safe summary of your progress when you choose.' }));
  } else if (has('public_story_needs_context')) {
    out.push(rec('add_short_caption', { reason: 'Add captions to your public proof to tell a clearer story.' }));
  }
  if (has('private_only_evidence')) {
    out.push(rec('keep_proof_private', { reason: 'Your proof stays private unless you explicitly publish a public-safe summary.' }));
  }
  if (!out.length) {
    out.push(rec('improve_tomorrow_proof_prompt', { reason: 'Keep documenting — a short note or image each day builds a strong record.' }));
  }
  const seen = new Set();
  return out.filter(r => (seen.has(r.type) ? false : seen.add(r.type)));
}

export function evidenceInsightSummary(insights = []) {
  const list = arr(insights);
  if (!list.length) return 'No evidence insights yet.';
  const gaps = list.filter(i => ['proof_gap', 'pending_upload', 'failed_upload', 'missing_anchor_proof'].includes(i.type)).length;
  const strong = list.some(i => ['strong_multimodal_proof', 'high_coverage_streak', 'public_story_ready'].includes(i.type));
  if (gaps) return `${gaps} thing${gaps > 1 ? 's' : ''} could make your evidence stronger.`;
  if (strong) return 'Your documentation is looking strong.';
  return `${list.length} evidence insight${list.length > 1 ? 's' : ''} for your proof.`;
}

// strong | developing | thin — based on multimodality + captions + coverage.
export function evidenceQualityTier(input = {}) {
  const context = input.evidence ? input : buildEvidenceContext(input);
  const uploaded = arr(context.uploadedEvidence);
  if (!uploaded.length) return 'thin';
  const captioned = uploaded.filter(r => r.hasCaption || r.hasNote).length;
  const images = uploaded.filter(r => r.kind === 'image').length;
  const captionRate = captioned / uploaded.length;
  if (uploaded.length >= 3 && images > 0 && captionRate >= 0.6) return 'strong';
  if (captionRate >= 0.3 || images > 0) return 'developing';
  return 'thin';
}

// Whether a single evidence record is safe to surface in public-facing output.
export function evidenceIsPublicSafe(evidence = {}) {
  // Reuse the proof-archive public-visibility rule, then require a caption/desc.
  const safeByRule = isProofPublicVisible(evidence, { pathVisibility: evidence.pathVisibility, ownerView: false });
  const hasContext = !!text(evidence.publicCaption) || !!text(evidence.note);
  return !!safeByRule && hasContext;
}

// Aggregate, value-free signals safe to feed into adaptive planning.
export function evidenceSignalsForAdaptivePlanning(context = {}) {
  const c = context.evidence ? context : buildEvidenceContext(context);
  const insights = buildEvidenceInsights(c);
  const coverage = analyzeEvidenceCoverage(c);
  return {
    proofCoverageRate: coverage ? coverage.coverageRate : null,
    anchorProofCoverageRate: null,
    pendingProofUploadCount: arr(c.pendingEvidence).length,
    proofGapCount: insights.filter(i => i.type === 'proof_gap').reduce((s, i) => s + (arr(i.days).length || 1), 0),
    evidenceQualityTier: evidenceQualityTier(c),
  };
}

export default {
  EVIDENCE_INTELLIGENCE_SCHEMA_VERSION,
  EVIDENCE_INSIGHT_TYPES,
  EVIDENCE_RECOMMENDATION_TYPES,
  EVIDENCE_THRESHOLDS,
  normalizeEvidenceRecord,
  buildEvidenceContext,
  analyzeEvidenceCoverage,
  analyzeEvidenceQuality,
  analyzeEvidenceGaps,
  analyzeAnchorEvidence,
  analyzePendingEvidence,
  analyzeDuplicateEvidencePattern,
  analyzePublicEvidenceReadiness,
  buildEvidenceInsights,
  buildEvidenceRecommendations,
  evidenceInsightSummary,
  evidenceQualityTier,
  evidenceIsPublicSafe,
  evidenceSignalsForAdaptivePlanning,
};
