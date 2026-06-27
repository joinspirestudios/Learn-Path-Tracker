// ── server/evidence-intelligence-sanitizer.js ───────────────────────────────
// Sanitizes Evidence Intelligence context before it is sent to a model. ONLY
// safe, aggregate, structured metadata leaves the server. Private proof bodies
// (unless explicitly allowed), private reflections, raw evidence URLs, download
// URLs, storage paths, localUri, transcripts, tokens, emails and passwords are
// stripped. Safe link DOMAINS may remain (never full URLs). Never throws.

const FORBIDDEN_KEYS = new Set([
  'reflection', 'reflectionText', 'taskReflections', 'privateNote',
  'evidenceUrl', 'evidenceUrls', 'rawEvidenceUrl', 'url', 'publicAssetURL',
  'storagePath', 'downloadURL', 'downloadUrl', 'localUri', 'fileUri', 'transcript',
  'token', 'idToken', 'accessToken', 'authToken', 'password', 'email', 'apiKey',
  'secret', 'base64', 'dataUrl', 'comments', 'comment', 'photoURL', 'avatarURL',
  'pushSubscription', 'endpoint', 'p256dh', 'completedTaskIds', 'verifiedTaskIds',
]);

const LEAK_PATTERNS = [
  /\bgs:\/\/\S+/gi,
  /\bfile:\/\/\/\S+/gi,
  /\bhttps?:\/\/\S+/gi,
  /\busers\/[^\s]*\/proofMedia\/\S+/gi,
  /\bevidence\/[^\s]+/gi,
  /\bdata:[^\s)]+/gi,
  /\beyJ[a-zA-Z0-9_-]{8,}\b/g,
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
];

function scrubText(value, max = 200) {
  let t = String(value == null ? '' : value);
  for (const p of LEAK_PATTERNS) t = t.replace(p, '');
  return t.replace(/\s+/g, ' ').trim().slice(0, max);
}
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

function sanitizeTask(task = {}) {
  const t = task && typeof task === 'object' ? task : {};
  return {
    title: scrubText(t.title || t.text || 'Task', 120),
    required: !(t.required === false || t.optional === true),
    anchor: !!(t.anchor || t.core || t.critical || t.completionCritical),
    evidenceRequired: !!t.evidenceRequired,
  };
}

// A safe evidence descriptor: type/status/counts + a safe link DOMAIN (not URL)
// + the user's own proof caption text (explicitly written as proof) only when
// `allowCaptions` is true (default false → captions omitted from model context).
function sanitizeEvidence(record = {}, { allowCaptions = false } = {}) {
  const r = record && typeof record === 'object' ? record : {};
  const out = {
    dayNumber: num(r.dayNumber),
    kind: ['image', 'file', 'url', 'note', 'unknown'].includes(r.kind) ? r.kind : 'unknown',
    uploadState: ['uploaded', 'pending', 'failed'].includes(r.uploadState) ? r.uploadState : 'pending',
    hasNote: !!r.hasNote,
    hasCaption: !!r.hasCaption,
    publicVisible: !!r.publicVisible,
    // Safe link domain only — never the full URL.
    domain: typeof r.domain === 'string' ? r.domain.replace(/[^a-z0-9.-]/gi, '').slice(0, 80) : '',
  };
  if (allowCaptions && typeof r.caption === 'string') out.caption = scrubText(r.caption, 120);
  return out;
}

// Build the full, safe AI context from an evidence planning context + path tasks.
export function sanitizeEvidenceContextForModel({ context = {}, tasks = [], insights = [], allowCaptions = false } = {}) {
  const c = context && typeof context === 'object' ? context : {};
  return {
    path: {
      title: scrubText(c.pathTitle, 120),
      category: scrubText(c.pathCategory, 60),
      visibility: ['public', 'unlisted', 'private'].includes(c.pathVisibility) ? c.pathVisibility : '',
      publicVisible: !!c.isPublicPath,
    },
    currentDayNumber: num(c.currentDayNumber),
    activeDayCount: num(c.activeDayCount),
    uploadedCount: Array.isArray(c.uploadedEvidence) ? c.uploadedEvidence.length : 0,
    pendingCount: Array.isArray(c.pendingEvidence) ? c.pendingEvidence.length : 0,
    failedCount: Array.isArray(c.failedEvidence) ? c.failedEvidence.length : 0,
    anchorTaskCount: c.anchorTaskIds && c.anchorTaskIds.size ? c.anchorTaskIds.size : 0,
    evidence: (Array.isArray(c.evidence) ? c.evidence : []).slice(0, 80).map(r => sanitizeEvidence(r, { allowCaptions })),
    tasks: (Array.isArray(tasks) ? tasks : []).slice(0, 60).map(sanitizeTask),
    insightTypes: (Array.isArray(insights) ? insights : []).map(i => String(i && i.type || '')).filter(Boolean),
  };
}

// Returns true if a serialized payload still contains a forbidden key or leak.
export function containsForbiddenContent(payload) {
  let json;
  try { json = JSON.stringify(payload); } catch { return true; }
  if (!json) return false;
  for (const key of FORBIDDEN_KEYS) {
    if (new RegExp('"' + key + '"\\s*:').test(json)) return true;
  }
  return LEAK_PATTERNS.some(p => p.test(json));
}

export default {
  sanitizeEvidenceContextForModel,
  containsForbiddenContent,
};
