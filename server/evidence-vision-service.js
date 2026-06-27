// ── server/evidence-vision-service.js ───────────────────────────────────────
// Orchestrates Gemini Vision evidence understanding for the authenticated user.
// It loads the user's OWN selected image-proof item, confirms it is image proof,
// builds safe Gemini context, calls the provider only when enabled/configured,
// sanitizes the output, and stores a PRIVATE vision insight draft. It never
// publishes, never mutates proof, never changes visibility, never returns raw
// image URLs/storage paths/localUri, and never identifies people.

import {
  normalizeEvidenceVisionObservation, newVisionInsightId,
} from '../src/evidence-vision-model.js';
import {
  geminiVisionConfig, geminiVisionConfigured, analyzeImageWithGemini, SUPPORTED_VISION_MIME_TYPES,
} from './gemini-vision-provider.js';
import {
  sanitizeGeminiVisionOutput, containsForbiddenVisionContent,
} from './evidence-vision-sanitizer.js';

function num(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

// Default: load the selected proof item from the user's own mobile day logs.
// Returns a structured evidence descriptor (no localUri/base64) or null.
async function defaultLoadEvidence(adminDb, uid, pathId, evidenceId) {
  if (!adminDb || !uid || !pathId) return null;
  try {
    const snap = await adminDb.collection('users').doc(uid).collection('mobileDayLogs').get();
    const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
    for (const d of docs) {
      const log = typeof d.data === 'function' ? d.data() : {};
      if (String(log.pathId || '') !== String(pathId)) continue;
      for (const proof of Array.isArray(log.proof) ? log.proof : []) {
        const id = String(proof.id || proof.taskId || '');
        if (evidenceId && id !== String(evidenceId)) continue;
        return {
          id, pathId, dayNumber: num(log.dayNumber, null), taskId: String(proof.taskId || ''),
          taskTitle: String(proof.taskTitle || ''), fileType: proof.fileType || (proof.type === 'image' ? 'image/png' : ''),
          proofType: proof.type === 'image' ? 'image' : (proof.type || 'unknown'),
          storagePath: proof.storagePath || '', publicVisible: proof.publicVisible === true,
          publicCaption: proof.publicCaption || '',
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Default image loader. Downloading bytes from owner-only Storage via the Admin
// SDK is a deployment follow-up; until wired it returns null so the feature
// degrades to a safe 'missing_image' reason. Tests inject a loader.
async function defaultLoadImage() {
  return null;
}

function isImageEvidence(e) {
  const t = String((e && (e.fileType || e.mimeType)) || '').toLowerCase();
  return SUPPORTED_VISION_MIME_TYPES.includes(t) || /^image\//.test(t) || (e && (e.proofType === 'image' || e.kind === 'image'));
}

export async function analyzeEvidenceImageForUser({
  adminDb = null, uid, request = {}, env = process.env,
  loadEvidence = null, loadImage = null, gemini = analyzeImageWithGemini, now = Date.now(),
} = {}) {
  const pathId = String(request.pathId || '');
  const evidenceId = String(request.evidenceId || '');
  if (!uid || !pathId) return { ok: false, disabledReason: 'missing_image' };

  // Feature gating first — never touch the model unless enabled + keyed.
  const cfg = geminiVisionConfig(env);
  if (!cfg.enabled) return { ok: false, disabledReason: 'vision_disabled' };
  if (!cfg.apiKey) return { ok: false, disabledReason: 'missing_api_key' };

  const evidence = await (loadEvidence || ((db, u, p, eid) => defaultLoadEvidence(db, u, p, eid)))(adminDb, uid, pathId, evidenceId);
  if (!evidence) return { ok: false, disabledReason: 'missing_image' };
  if (!isImageEvidence(evidence)) return { ok: false, disabledReason: 'unsupported_media_type' };

  const image = await (loadImage || defaultLoadImage)({ adminDb, uid, evidence, maxImageMb: cfg.maxImageMb });
  if (!image || !image.base64) return { ok: false, disabledReason: 'missing_image' };

  const context = {
    taskTitle: evidence.taskTitle || '',
    taskType: evidence.proofType || 'image',
    dayNumber: evidence.dayNumber,
    pathCategory: request.pathCategory || '',
    proofType: 'image',
    publicVisible: evidence.publicVisible === true,
    publicCaption: evidence.publicCaption || '',
  };

  const result = await gemini({ image, context, env });
  if (!result || !result.ok) {
    return { ok: false, disabledReason: (result && result.disabledReason) || 'provider_error' };
  }

  // Sanitize model output, then re-check defensively before storing.
  const safe = sanitizeGeminiVisionOutput(result.raw || {});
  const observation = normalizeEvidenceVisionObservation({
    id: newVisionInsightId(now),
    uid, pathId, evidenceId: evidence.id, dayNumber: evidence.dayNumber, taskId: evidence.taskId,
    taskTitle: evidence.taskTitle, source: 'gemini', status: 'draft',
    imageObservation: safe.imageObservation,
    evidenceSignals: safe.evidenceSignals,
    needsMoreContext: safe.needsMoreContext,
    suggestedCaption: safe.suggestedCaption,
    taskAlignment: safe.taskAlignment,
    uncertainty: safe.uncertainty,
    publicSafeSummary: safe.suggestedCaption || safe.imageObservation,
    createdAt: now, updatedAt: now,
  });

  if (containsForbiddenVisionContent(observation)) {
    return { ok: false, disabledReason: 'provider_error' };
  }

  if (adminDb) {
    try {
      await adminDb.collection('users').doc(uid).collection('evidenceVisionInsights').doc(pathId)
        .collection('drafts').doc(observation.id).set(observation, { merge: false });
    } catch { /* persistence is best-effort */ }
  }

  return { ok: true, observation, configured: geminiVisionConfigured(env) };
}

export default { analyzeEvidenceImageForUser };
