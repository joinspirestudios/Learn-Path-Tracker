// ── evidence-vision-db.js ───────────────────────────────────────────────────
// Web client persistence for Gemini Vision evidence insight drafts. Owner-only
// private space:
//   users/{uid}/evidenceVisionInsights/{pathId}/drafts/{visionInsightId}
//
// Dependency-injected `fb` keeps this unit-testable with no live Firebase.
// Drafts are private; they never carry raw image URLs/storage paths/localUri.

import { fb as defaultFb } from './firebase.js';
import { normalizeEvidenceVisionObservation } from './evidence-vision-model.js';

function draftsCol(fb, uid, pathId) {
  return fb.collection(fb.db, 'users', uid, 'evidenceVisionInsights', pathId, 'drafts');
}
function draftRef(fb, uid, pathId, id) {
  return fb.doc(fb.db, 'users', uid, 'evidenceVisionInsights', pathId, 'drafts', id);
}

export async function saveEvidenceVisionDraft(uid, pathId, observation, { fb = defaultFb } = {}) {
  if (!uid || !pathId || !observation || !observation.id) throw Object.assign(new Error('Invalid vision insight'), { code: 'invalid_request' });
  const normalized = normalizeEvidenceVisionObservation({ ...observation, uid, pathId });
  await fb.setDoc(draftRef(fb, uid, pathId, normalized.id), normalized, { merge: false });
  return normalized;
}

export async function listEvidenceVisionDrafts(uid, pathId, { fb = defaultFb, includeResolved = false } = {}) {
  if (!uid || !pathId || !fb.firestoreReady) return [];
  const snap = await fb.getDocs(draftsCol(fb, uid, pathId));
  const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
  let items = docs.map(d => normalizeEvidenceVisionObservation({ id: d.id, ...(typeof d.data === 'function' ? d.data() : {}) }));
  if (!includeResolved) items = items.filter(d => d.status === 'draft' || d.status === 'reviewed');
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function dismissEvidenceVisionDraft(uid, pathId, id, { fb = defaultFb, now = Date.now() } = {}) {
  if (!uid || !pathId || !id) return false;
  await fb.setDoc(draftRef(fb, uid, pathId, id), { status: 'dismissed', updatedAt: now }, { merge: true });
  return true;
}

export async function markEvidenceVisionDraftReviewed(uid, pathId, id, { fb = defaultFb, now = Date.now() } = {}) {
  if (!uid || !pathId || !id) return false;
  await fb.setDoc(draftRef(fb, uid, pathId, id), { status: 'reviewed', updatedAt: now }, { merge: true });
  return true;
}

export default {
  saveEvidenceVisionDraft,
  listEvidenceVisionDrafts,
  dismissEvidenceVisionDraft,
  markEvidenceVisionDraftReviewed,
};
