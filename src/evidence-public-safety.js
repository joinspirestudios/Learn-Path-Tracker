// ── evidence-public-safety.js ───────────────────────────────────────────────
// Public-safety primitives for Evidence Intelligence. Pure. These guarantee that
// any public-facing evidence summary excludes private proof bodies, private
// reflections, raw evidence URLs, download URLs, Storage paths, localUri, base64,
// tokens, emails/passwords, push subscriptions and other private user data.
//
// Nothing here verifies an activity; it only strips/limits to safe fields.

// Object keys that must never appear in public-safe output.
export const UNSAFE_EVIDENCE_FIELDS = Object.freeze([
  'proofBody', 'proofText', 'reflection', 'reflectionText', 'taskReflections',
  'privateNote', 'note', 'notes', 'evidenceUrl', 'evidenceUrls', 'rawEvidenceUrl',
  'url', 'publicAssetURL', 'downloadURL', 'downloadUrl', 'storagePath', 'localUri',
  'fileUri', 'base64', 'dataUrl', 'transcript', 'token', 'idToken', 'accessToken',
  'authToken', 'password', 'email', 'apiKey', 'secret', 'pushSubscription',
  'endpoint', 'p256dh', 'photoURL', 'avatarURL', 'imageBytes', 'rawImage',
]);

// Substrings that indicate leaked private data inside free text.
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

const VERIFICATION_RE = /\bverified\b|\bcertified\b/gi;

function scrubText(value, max = 240) {
  let t = String(value == null ? '' : value);
  for (const p of LEAK_PATTERNS) t = t.replace(p, '');
  t = t.replace(VERIFICATION_RE, 'submitted');
  return t.replace(/\s+/g, ' ').trim().slice(0, max);
}

function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

// Remove every unsafe key from an arbitrary object (shallow). Returns a new
// object with only the remaining keys; free-text values are NOT scrubbed here
// (use publicSafe* helpers for text). Records which unsafe keys were present.
export function stripUnsafeEvidenceFields(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  const removed = [];
  for (const [key, value] of Object.entries(source)) {
    if (UNSAFE_EVIDENCE_FIELDS.includes(key)) { removed.push(key); continue; }
    out[key] = value;
  }
  out.__unsafeRemoved = removed;
  return out;
}

// A public-safe evidence summary: safe aggregate fields only.
export function publicSafeEvidenceSummary(input = {}) {
  const s = input && typeof input === 'object' ? input : {};
  const out = {
    dayNumber: num(s.dayNumber),
    taskTitle: scrubText(s.taskTitle, 80) || undefined,
    proofType: ['image', 'file', 'url', 'note', 'unknown'].includes(s.proofType || s.kind) ? (s.proofType || s.kind) : undefined,
    proofStatus: ['uploaded', 'pending', 'failed', 'submitted'].includes(s.proofStatus || s.uploadState) ? (s.proofStatus || s.uploadState) : undefined,
    proofCount: num(s.proofCount),
    coverageRate: num(s.coverageRate),
    publicVisible: s.publicVisible === true ? true : undefined,
  };
  // A public-safe caption is allowed only when explicitly marked public-safe.
  if (s.publicVisible === true && typeof s.publicCaption === 'string') {
    out.caption = scrubText(s.publicCaption, 120) || undefined;
  }
  // Drop undefined keys for a clean object.
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined));
}

// A public-safe insight: type + scrubbed reason only.
export function publicSafeEvidenceInsight(insight = {}) {
  const i = insight && typeof insight === 'object' ? insight : {};
  return { type: String(i.type || ''), reason: scrubText(i.reason, 240) };
}

// A public-safe recommendation: type/title/body/action scrubbed; no day/task ids
// that aren't needed for a public summary (kept numeric dayNumber only).
export function publicSafeEvidenceRecommendation(recommendation = {}) {
  const r = recommendation && typeof recommendation === 'object' ? recommendation : {};
  return {
    type: String(r.type || ''),
    title: scrubText(r.title, 80),
    body: scrubText(r.body || r.reason, 240),
    severity: ['info', 'suggestion', 'warning', 'needs_attention'].includes(r.severity) ? r.severity : 'suggestion',
  };
}

// Returns true if the serialized value still contains any unsafe key or leak.
export function evidenceContainsUnsafePublicData(input) {
  let json;
  try { json = JSON.stringify(input == null ? '' : input); } catch { return true; }
  if (!json) return false;
  for (const key of UNSAFE_EVIDENCE_FIELDS) {
    if (new RegExp('"' + key + '"\\s*:').test(json)) return true;
  }
  return LEAK_PATTERNS.some(p => p.test(json)) || VERIFICATION_RE.test(json);
}

// Build a safety report describing what a draft/summary contains and whether a
// user review is required before any sharing.
export function evidenceSummarySafetyReport(input = {}) {
  const i = input && typeof input === 'object' ? input : {};
  const json = (() => { try { return JSON.stringify(i); } catch { return ''; } })();
  const stripped = stripUnsafeEvidenceFields(i);
  const unsafeFieldsRemoved = Array.isArray(stripped.__unsafeRemoved) ? stripped.__unsafeRemoved : [];
  const containsExternalUrl = /\bhttps?:\/\//i.test(json);
  const containsStorageReference = /\bgs:\/\/|users\/[^\s"]*\/proofMedia\/|storagePath|localUri|downloadURL/i.test(json);
  const containsPrivateEvidence = unsafeFieldsRemoved.length > 0 || containsExternalUrl || containsStorageReference;
  return {
    unsafeFieldsRemoved,
    publicSafe: !containsPrivateEvidence,
    reviewRequired: true, // public sharing always needs explicit review in 8.1
    containsPrivateEvidence,
    containsExternalUrl,
    containsStorageReference,
  };
}

export default {
  UNSAFE_EVIDENCE_FIELDS,
  stripUnsafeEvidenceFields,
  publicSafeEvidenceSummary,
  publicSafeEvidenceInsight,
  publicSafeEvidenceRecommendation,
  evidenceContainsUnsafePublicData,
  evidenceSummarySafetyReport,
};
