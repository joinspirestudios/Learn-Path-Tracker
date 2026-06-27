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
import { collectEvidenceSubmissionsForPath } from '../src/evidence-intelligence-context.js';
import { sanitizeEvidenceContextForModel, containsForbiddenContent } from './evidence-intelligence-sanitizer.js';

function num(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

// Map a mobile day-log proof entry into a structured proof submission.
function fromMobileProof(proof, dayNumber, pathId) {
  return {
    id: String(proof.id || proof.taskId || ''),
    pathId,
    dayNumber: num(dayNumber, null),
    taskId: String(proof.taskId || ''),
    evidenceType: proof.type === 'image' ? 'file' : proof.type,
    storagePath: proof.storagePath || '',
    status: proof.submitted ? 'submitted' : (proof.status || 'submitted'),
    note: proof.note || '',
    publicVisible: proof.publicVisible === true,
  };
}

// Source 1+2: the user's mobile day logs (owner-only). Structured fields only.
async function loadMobileDayLogProof(adminDb, uid, pathId) {
  if (!adminDb || !uid || !pathId) return [];
  try {
    const snap = await adminDb.collection('users').doc(uid).collection('mobileDayLogs').get();
    const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
    const out = [];
    for (const d of docs) {
      const log = typeof d.data === 'function' ? d.data() : {};
      if (String(log.pathId || '') !== String(pathId)) continue;
      for (const proof of Array.isArray(log.proof) ? log.proof : []) {
        out.push(fromMobileProof(proof, log.dayNumber, pathId));
      }
    }
    return out;
  } catch {
    return [];
  }
}

// Source 3: web proof cached in the user's own state doc (users/{uid}/state/main),
// where evidenceSubmissions are nested by enrollment. Reads ONLY this user's
// state and extracts ONLY the active path's submissions — never returns raw state.
async function loadStateDocProof(adminDb, uid, pathId) {
  if (!adminDb || !uid || !pathId) return [];
  try {
    const ref = adminDb.collection('users').doc(uid).collection('state').doc('main');
    const snap = await ref.get();
    const data = snap && snap.exists ? (typeof snap.data === 'function' ? snap.data() : {}) : null;
    if (!data) return [];
    return collectEvidenceSubmissionsForPath({
      evidenceSubmissions: data.evidenceSubmissions || {},
      enrollments: data.enrollments || {},
      pathId,
    });
  } catch {
    return [];
  }
}

// Unified server proof source: mobile day logs + state-doc web proof, de-duped by
// id. Returns [] on failure (caller then falls back to sanitized client context).
async function loadUserProof(adminDb, uid, pathId) {
  const [mobile, state] = await Promise.all([
    loadMobileDayLogProof(adminDb, uid, pathId),
    loadStateDocProof(adminDb, uid, pathId),
  ]);
  const seen = new Set();
  const out = [];
  for (const sub of [...mobile, ...state]) {
    if (!sub) continue;
    const key = sub.id ? String(sub.id) : JSON.stringify([sub.taskId, sub.dayNumber, sub.evidenceType]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sub);
  }
  return out;
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
