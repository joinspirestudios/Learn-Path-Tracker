// ── evidence-intelligence-db.js ─────────────────────────────────────────────
// Web client persistence for evidence insight drafts. Owner-only private space:
//   users/{uid}/evidenceInsights/{pathId}/drafts/{insightId}
//
// Dependency-injected `fb` keeps this unit-testable with no live Firebase.
// Drafts are private; publicSafeSummary never carries private proof. Never stores
// raw localUri/tokens/model prompts.

import { fb as defaultFb } from './firebase.js';
import {
  normalizeEvidenceInsightDraft, transitionEvidenceInsightStatus,
} from './evidence-intelligence-drafts.js';

function draftsCol(fb, uid, pathId) {
  return fb.collection(fb.db, 'users', uid, 'evidenceInsights', pathId, 'drafts');
}
function draftRef(fb, uid, pathId, insightId) {
  return fb.doc(fb.db, 'users', uid, 'evidenceInsights', pathId, 'drafts', insightId);
}

export async function saveEvidenceInsightDraft(uid, pathId, draft, { fb = defaultFb } = {}) {
  if (!uid || !pathId || !draft || !draft.id) throw Object.assign(new Error('Invalid evidence insight'), { code: 'invalid_request' });
  const normalized = normalizeEvidenceInsightDraft({ ...draft, uid, pathId });
  await fb.setDoc(draftRef(fb, uid, pathId, normalized.id), normalized, { merge: false });
  return normalized;
}

export async function listEvidenceInsights(uid, pathId, { fb = defaultFb, includeResolved = false } = {}) {
  if (!uid || !pathId || !fb.firestoreReady) return [];
  const snap = await fb.getDocs(draftsCol(fb, uid, pathId));
  const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
  let items = docs.map(d => normalizeEvidenceInsightDraft({ id: d.id, ...(typeof d.data === 'function' ? d.data() : {}) }));
  if (!includeResolved) items = items.filter(d => d.status === 'draft' || d.status === 'reviewed');
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getLatestEvidenceInsight(uid, pathId, { fb = defaultFb } = {}) {
  const items = await listEvidenceInsights(uid, pathId, { fb, includeResolved: false });
  return items[0] || null;
}

export async function dismissEvidenceInsight(uid, pathId, insightId, { fb = defaultFb, now = Date.now() } = {}) {
  if (!uid || !pathId || !insightId) return false;
  const snap = await fb.getDoc(draftRef(fb, uid, pathId, insightId));
  const data = snap && snap.exists && snap.exists() ? snap.data() : null;
  const next = transitionEvidenceInsightStatus({ ...(data || {}), id: insightId, uid, pathId }, 'dismissed', now);
  await fb.setDoc(draftRef(fb, uid, pathId, insightId), next, { merge: true });
  return true;
}

export async function markEvidenceInsightReviewed(uid, pathId, insightId, { fb = defaultFb, now = Date.now() } = {}) {
  if (!uid || !pathId || !insightId) return false;
  const snap = await fb.getDoc(draftRef(fb, uid, pathId, insightId));
  const data = snap && snap.exists && snap.exists() ? snap.data() : null;
  const next = transitionEvidenceInsightStatus({ ...(data || {}), id: insightId, uid, pathId }, 'reviewed', now);
  await fb.setDoc(draftRef(fb, uid, pathId, insightId), next, { merge: true });
  return true;
}

export default {
  saveEvidenceInsightDraft,
  listEvidenceInsights,
  getLatestEvidenceInsight,
  dismissEvidenceInsight,
  markEvidenceInsightReviewed,
};
