// ── server/evidence-intelligence-service.js ─────────────────────────────────
// Builds an evidence insight DRAFT for the authenticated user. Deterministic
// -first: it never depends on AI. If an injected `callModel` is provided AND an
// Anthropic key is configured, it may augment with AI-assisted recommendations
// over SANITIZED context only. It never mutates proof, never publishes, never
// changes visibility, and never reads image content.

import {
  buildEvidenceContext, buildEvidenceInsights, buildEvidenceRecommendations,
} from '../src/evidence-intelligence-model.js';
import { buildEvidenceInsightDraft } from '../src/evidence-intelligence-drafts.js';
import { sanitizeEvidenceContextForModel, containsForbiddenContent } from './evidence-intelligence-sanitizer.js';

function num(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

// Load the user's OWN proof submissions for a path (owner-only space). Reads
// structured fields only; returns [] on any failure.
async function loadUserProof(adminDb, uid, pathId) {
  if (!adminDb || !uid || !pathId) return [];
  try {
    const snap = await adminDb.collection('users').doc(uid).collection('mobileDayLogs').get();
    const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
    const out = [];
    for (const d of docs) {
      const log = typeof d.data === 'function' ? d.data() : {};
      if (String(log.pathId || '') !== String(pathId)) continue;
      for (const proof of Array.isArray(log.proof) ? log.proof : []) {
        out.push({
          id: String(proof.id || proof.taskId || ''),
          pathId,
          dayNumber: num(log.dayNumber, null),
          taskId: String(proof.taskId || ''),
          evidenceType: proof.type === 'image' ? 'file' : proof.type,
          storagePath: proof.storagePath || '',
          status: proof.submitted ? 'submitted' : (proof.status || 'submitted'),
          note: proof.note || '',
          publicVisible: proof.publicVisible === true,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

function contextFromInput({ clientContext = {}, proofSubmissions = [] }) {
  const c = clientContext && typeof clientContext === 'object' ? clientContext : {};
  return buildEvidenceContext({
    path: {
      id: String(c.pathId || ''),
      title: typeof c.pathTitle === 'string' ? c.pathTitle : '',
      category: typeof c.pathCategory === 'string' ? c.pathCategory : '',
      visibility: typeof c.pathVisibility === 'string' ? c.pathVisibility : '',
      tasks: Array.isArray(c.tasks) ? c.tasks : [],
    },
    proofSubmissions: proofSubmissions.length ? proofSubmissions : (Array.isArray(c.proofSubmissions) ? c.proofSubmissions : []),
    dayLogs: c.dayLogs || {},
    currentDayNumber: num(c.currentDayNumber, null),
    pendingProofUploadCount: num(c.pendingProofUploadCount, 0) || 0,
    isOwner: c.isOwner === true,
  });
}

export async function buildEvidenceInsightDraftForUser({
  adminDb = null, uid, pathId, clientContext = {}, env = process.env, callModel = null, now = Date.now(),
} = {}) {
  const proof = await loadUserProof(adminDb, uid, pathId);
  const context = contextFromInput({ clientContext, proofSubmissions: proof });
  const insights = buildEvidenceInsights(context);
  let recommendations = buildEvidenceRecommendations(context, { insights });
  let source = 'deterministic';
  let aiUsed = false;

  const aiAvailable = !!(env && env.ANTHROPIC_API_KEY) && typeof callModel === 'function';
  if (aiAvailable) {
    const modelContext = sanitizeEvidenceContextForModel({
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
      } catch { /* deterministic recommendations stand */ }
    }
  }

  const draft = buildEvidenceInsightDraft({
    uid, pathId, currentDayNumber: context.currentDayNumber, insights, recommendations, source, now,
  });

  if (adminDb) {
    try {
      await adminDb.collection('users').doc(uid).collection('evidenceInsights').doc(pathId)
        .collection('drafts').doc(draft.id).set(draft, { merge: false });
    } catch { /* persistence is best-effort */ }
  }

  return { draft, aiAvailable: !!(env && env.ANTHROPIC_API_KEY), aiUsed, source };
}

export default { buildEvidenceInsightDraftForUser };
