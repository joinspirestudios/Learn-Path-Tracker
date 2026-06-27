// ── server/evidence-vision-sanitizer.js ─────────────────────────────────────
// Controls what context may be sent to Gemini and what output may be returned.
// ONLY safe, structured fields about the SELECTED proof image leave the server;
// the model output is scrubbed of identity/sensitive-trait/verification claims
// and any leaked URLs/storage paths/tokens. Never throws.

const FORBIDDEN_CONTEXT_KEYS = new Set([
  'idToken', 'token', 'accessToken', 'authToken', 'password', 'email', 'apiKey',
  'secret', 'reflection', 'reflectionText', 'taskReflections', 'privateNote',
  'pushSubscription', 'endpoint', 'p256dh', 'state', 'userState', 'profile',
  'localUri', 'fileUri', 'downloadURL', 'downloadUrl', 'storagePath', 'evidenceUrl',
  'enrollments', 'evidenceSubmissions', 'otherProof', 'photoURL', 'avatarURL',
]);

const LEAK_PATTERNS = [
  /\bgs:\/\/\S+/gi, /\bfile:\/\/\/\S+/gi, /\bhttps?:\/\/\S+/gi,
  /\busers\/[^\s]*\/proofMedia\/\S+/gi, /\bevidence\/[^\s]+/gi,
  /\beyJ[a-zA-Z0-9_-]{8,}\b/g, /[\w.+-]+@[\w-]+\.[\w.-]+/g,
];
// Output claims that must be neutralized/removed.
const OUTPUT_FORBIDDEN_RE = /\bverified\b|\bcertified\b|\bproves?\b|definitely happened|truth score|\bfraud\b|fake detector|credibility|face (match|recognition)|identity (match|verification)|biometric|this user (completed|lied|did)|\b(he|she|they|man|woman|person named)\b is|named [A-Z][a-z]+/gi;

function scrubText(value, max = 600) {
  let t = String(value == null ? '' : value);
  for (const p of LEAK_PATTERNS) t = t.replace(p, '');
  return t.replace(/\s+/g, ' ').trim().slice(0, max);
}
function num(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }

// Build the safe context object sent to Gemini (alongside the image bytes).
export function sanitizeEvidenceVisionContextForGemini(input = {}) {
  const c = input && typeof input === 'object' ? input : {};
  return {
    taskTitle: scrubText(c.taskTitle, 120),
    taskType: scrubText(c.taskType || c.proofType, 40),
    dayNumber: num(c.dayNumber),
    pathCategory: scrubText(c.pathCategory, 60),
    proofType: ['image', 'file', 'url', 'note', 'unknown'].includes(c.proofType) ? c.proofType : 'image',
    publicVisible: c.publicVisible === true,
    // Only a user-provided public-safe caption is allowed as text context.
    publicCaption: c.publicVisible === true ? scrubText(c.publicCaption, 120) : '',
    advisoryNote: 'Proof is advisory documentation only.',
  };
}

// The strict prompt sent to Gemini. Structured JSON only, with explicit guards.
export function buildGeminiVisionPrompt(context = {}) {
  const safe = sanitizeEvidenceVisionContextForGemini(context);
  return [
    'You help a learner document their progress. Describe ONLY what the attached',
    'image appears to show, as supportive documentation context.',
    '',
    'Rules:',
    '- Describe only what the image appears to show.',
    '- Do not identify people or infer names.',
    '- Do not infer sensitive traits (race, gender, age, health, religion, etc.).',
    '- Do not verify whether the task happened. Do not claim completion.',
    '- Do not accuse fraud or assess credibility/truth.',
    '- Return structured JSON only, no prose outside JSON.',
    '',
    'Task context (advisory): ' + JSON.stringify(safe),
    '',
    'Return JSON with keys: imageObservation (string, "appears to show ..."),',
    'evidenceSignals (string[]), needsMoreContext (boolean),',
    'suggestedCaption (string), taskAlignment (one of clear_context|needs_caption|',
    'needs_better_evidence|unrelated_or_unclear|unknown), uncertainty (low|medium|high).',
  ].join('\n');
}

// Sanitize Gemini OUTPUT into a safe observation shape. Removes identity /
// sensitive-trait / verification / fraud claims and any leaked URLs/tokens.
export function sanitizeGeminiVisionOutput(output = {}) {
  const o = output && typeof output === 'object' ? output : {};
  const clean = (v, max) => scrubText(String(v == null ? '' : v).replace(OUTPUT_FORBIDDEN_RE, 'appears to show'), max);
  const alignments = ['clear_context', 'needs_caption', 'needs_better_evidence', 'unrelated_or_unclear', 'unknown'];
  const uncertainties = ['low', 'medium', 'high', 'unknown'];
  return {
    imageObservation: clean(o.imageObservation, 600),
    evidenceSignals: (Array.isArray(o.evidenceSignals) ? o.evidenceSignals : []).map(s => clean(s, 60)).filter(Boolean).slice(0, 12),
    needsMoreContext: o.needsMoreContext === true,
    suggestedCaption: clean(o.suggestedCaption, 160),
    taskAlignment: alignments.includes(o.taskAlignment) ? o.taskAlignment : 'unknown',
    uncertainty: uncertainties.includes(o.uncertainty) ? o.uncertainty : 'unknown',
  };
}

// True if a context/output object still carries forbidden keys or leaked data.
export function containsForbiddenVisionContent(input) {
  let json;
  try { json = JSON.stringify(input == null ? '' : input); } catch { return true; }
  if (!json) return false;
  for (const key of FORBIDDEN_CONTEXT_KEYS) {
    if (new RegExp('"' + key + '"\\s*:').test(json)) return true;
  }
  return LEAK_PATTERNS.some(p => p.test(json));
}

export default {
  sanitizeEvidenceVisionContextForGemini,
  buildGeminiVisionPrompt,
  sanitizeGeminiVisionOutput,
  containsForbiddenVisionContent,
};
