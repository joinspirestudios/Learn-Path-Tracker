// ── adaptive-planning-db.js ─────────────────────────────────────────────────
// Web client persistence for adaptation drafts + the active overlay. Owner-only
// private space:
//   users/{uid}/adaptivePlans/{pathId}/drafts/{draftId}
//   users/{uid}/adaptivePlans/{pathId}/activeOverlay/main
//
// Dependency-injected `fb` keeps this unit-testable with no live Firebase.
// Nothing here is public; drafts never carry private proof.

import { fb as defaultFb } from './firebase.js';
import {
  normalizeAdaptationDraft, transitionDraftStatus, buildOverlayFromDraft,
} from './adaptive-planning-drafts.js';

function draftsCol(fb, uid, pathId) {
  return fb.collection(fb.db, 'users', uid, 'adaptivePlans', pathId, 'drafts');
}
function draftRef(fb, uid, pathId, draftId) {
  return fb.doc(fb.db, 'users', uid, 'adaptivePlans', pathId, 'drafts', draftId);
}
function overlayRef(fb, uid, pathId) {
  return fb.doc(fb.db, 'users', uid, 'adaptivePlans', pathId, 'activeOverlay', 'main');
}

export async function saveAdaptationDraft(uid, pathId, draft, { fb = defaultFb } = {}) {
  if (!uid || !pathId || !draft || !draft.id) throw Object.assign(new Error('Invalid draft'), { code: 'invalid_request' });
  const normalized = normalizeAdaptationDraft({ ...draft, uid, pathId });
  await fb.setDoc(draftRef(fb, uid, pathId, normalized.id), normalized, { merge: false });
  return normalized;
}

export async function listAdaptationDrafts(uid, pathId, { fb = defaultFb, includeResolved = false } = {}) {
  if (!uid || !pathId || !fb.firestoreReady) return [];
  const snap = await fb.getDocs(draftsCol(fb, uid, pathId));
  const docs = snap && Array.isArray(snap.docs) ? snap.docs : [];
  let items = docs.map(d => normalizeAdaptationDraft({ id: d.id, ...(typeof d.data === 'function' ? d.data() : {}) }));
  if (!includeResolved) items = items.filter(d => d.status === 'draft' || d.status === 'reviewed');
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getLatestAdaptationDraft(uid, pathId, { fb = defaultFb } = {}) {
  const items = await listAdaptationDrafts(uid, pathId, { fb, includeResolved: false });
  return items[0] || null;
}

export async function dismissAdaptationDraft(uid, pathId, draftId, { fb = defaultFb, now = Date.now() } = {}) {
  if (!uid || !pathId || !draftId) return false;
  const snap = await fb.getDoc(draftRef(fb, uid, pathId, draftId));
  const data = snap && snap.exists && snap.exists() ? snap.data() : null;
  const next = transitionDraftStatus({ ...(data || {}), id: draftId, uid, pathId }, 'dismissed', now);
  await fb.setDoc(draftRef(fb, uid, pathId, draftId), next, { merge: true });
  return true;
}

// Applying a draft is an EXPLICIT user action: it writes a user-specific overlay
// (future-day only) and marks the draft applied. It never edits day logs or the
// canonical path.
export async function applyAdaptationDraft(uid, pathId, draftId, { fb = defaultFb, path = {}, userRole = 'participant', now = Date.now() } = {}) {
  if (!uid || !pathId || !draftId) throw Object.assign(new Error('Invalid request'), { code: 'invalid_request' });
  const snap = await fb.getDoc(draftRef(fb, uid, pathId, draftId));
  const data = snap && snap.exists && snap.exists() ? snap.data() : null;
  if (!data) throw Object.assign(new Error('Draft not found'), { code: 'not_found' });
  const draft = normalizeAdaptationDraft({ ...data, id: draftId, uid, pathId });
  const overlay = buildOverlayFromDraft({ draft, path, userRole, now });
  await fb.setDoc(overlayRef(fb, uid, pathId), overlay, { merge: false });
  const applied = transitionDraftStatus(draft, 'applied', now);
  await fb.setDoc(draftRef(fb, uid, pathId, draftId), applied, { merge: true });
  return { overlay, draft: applied };
}

export async function getActiveOverlay(uid, pathId, { fb = defaultFb } = {}) {
  if (!uid || !pathId || !fb.firestoreReady) return null;
  const snap = await fb.getDoc(overlayRef(fb, uid, pathId));
  return snap && snap.exists && snap.exists() ? { uid, pathId, ...snap.data() } : null;
}

export async function clearActiveOverlay(uid, pathId, { fb = defaultFb } = {}) {
  if (!uid || !pathId) return false;
  await fb.deleteDoc(overlayRef(fb, uid, pathId));
  return true;
}

export default {
  saveAdaptationDraft,
  listAdaptationDrafts,
  getLatestAdaptationDraft,
  dismissAdaptationDraft,
  applyAdaptationDraft,
  getActiveOverlay,
  clearActiveOverlay,
};
