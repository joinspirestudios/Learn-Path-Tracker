// ── server/adaptive-planning-sanitizer.js ───────────────────────────────────
// Sanitizes adaptive-planning context before it is sent to a model (Anthropic).
// ONLY safe, aggregate, structured metadata may leave the server. Private proof
// bodies, reflections, raw evidence URLs, Storage/download paths, tokens, emails
// and passwords are stripped. Never throws.

// Field names that must never reach the model.
const FORBIDDEN_KEYS = new Set([
  'proofBody', 'proofText', 'proof', 'reflection', 'reflectionText', 'taskReflections',
  'privateNote', 'note', 'notes', 'evidenceUrl', 'evidenceUrls', 'rawEvidenceUrl',
  'storagePath', 'downloadURL', 'downloadUrl', 'localUri', 'fileUri', 'transcript',
  'token', 'idToken', 'accessToken', 'authToken', 'password', 'email', 'apiKey',
  'secret', 'base64', 'dataUrl', 'comments', 'comment', 'caption', 'publicCaption',
  'completedTaskIds', 'verifiedTaskIds', 'submissions', 'photoURL', 'avatarURL',
]);

// Leak patterns scrubbed from any free-text string that survives.
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
  let text = String(value == null ? '' : value);
  for (const p of LEAK_PATTERNS) text = text.replace(p, '');
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Sanitize a single task descriptor for the model: title/type/labels only.
function sanitizeTask(task = {}) {
  const t = task && typeof task === 'object' ? task : {};
  return {
    id: String(t.id || '').replace(/[^a-zA-Z0-9_:-]/g, '').slice(0, 80),
    title: scrubText(t.title || t.text || 'Task', 120),
    required: !(t.required === false || t.optional === true),
    optional: t.required === false || t.optional === true,
    anchor: !!(t.anchor || t.core || t.critical || t.completionCritical),
    evidenceRequired: !!t.evidenceRequired,
  };
}

// Sanitize a day record: structured statuses/scores/counts only.
function sanitizeDay(record = {}) {
  const r = record && typeof record === 'object' ? record : {};
  return {
    dayNumber: num(r.dayNumber),
    completionScore: num(r.completionScore),
    completionTier: typeof r.completionTier === 'string' ? r.completionTier.slice(0, 24) : null,
    requiredCompleted: num(r.requiredCompleted),
    requiredTotal: num(r.requiredTotal),
    optionalCompleted: num(r.optionalCompleted),
    optionalTotal: num(r.optionalTotal),
    anchorSatisfied: r.anchorSatisfied == null ? null : !!r.anchorSatisfied,
    proofSubmittedCount: num(r.proofSubmittedCount),
    proofRequiredCount: num(r.proofRequiredCount),
    missed: !!r.missed,
    frozen: !!r.frozen,
  };
}

// Build the full, safe AI context from a planning context + path tasks.
export function sanitizeAdaptiveContextForModel({ context = {}, tasks = [], insights = [] } = {}) {
  const c = context && typeof context === 'object' ? context : {};
  return {
    path: {
      title: scrubText(c.pathTitle, 120),
      category: scrubText(c.pathCategory, 60),
      visibility: ['public', 'unlisted', 'private'].includes(c.pathVisibility) ? c.pathVisibility : '',
    },
    intensity: ['soft', 'balanced', 'intensive'].includes(c.intensity) ? c.intensity : null,
    currentDayNumber: num(c.currentDayNumber),
    requiredTaskCount: num(c.requiredTaskCount),
    anchorTaskCount: num(c.anchorTaskCount),
    pendingProofCount: num(c.pendingProofCount) || 0,
    currentStreak: num(c.currentStreak) || 0,
    streakFreezeAvailable: !!c.streakFreezeAvailable,
    recentDays: (Array.isArray(c.recentRecords) ? c.recentRecords : []).map(sanitizeDay),
    tasks: (Array.isArray(tasks) ? tasks : []).slice(0, 60).map(sanitizeTask),
    // Insights are already structured; keep type + scrubbed reason only.
    insightTypes: (Array.isArray(insights) ? insights : []).map(i => String(i && i.type || '')).filter(Boolean),
  };
}

// Defensive deep check used by tests + before any send: returns true if the
// serialized payload still contains any forbidden key or leak pattern.
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
  sanitizeAdaptiveContextForModel,
  containsForbiddenContent,
};
