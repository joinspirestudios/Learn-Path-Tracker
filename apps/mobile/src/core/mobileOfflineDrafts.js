// Pure offline-draft queue model for mobile media proof. No persistence here
// (that is the repository's job) — these are immutable helpers over a drafts
// array. A draft holds a picked media descriptor + target task/day until it can
// be uploaded.

import { UPLOAD_STATUS } from './mobileProofUploadState.js';

function str(v) { return v == null ? '' : String(v); }

export function createProofDraft({ pathId, dayNumber, taskId, asset = {}, uid, now = Date.now() } = {}) {
  return {
    id: 'draft_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    pathId: str(pathId),
    dayNumber: Number(dayNumber) || 1,
    taskId: str(taskId),
    uid: str(uid),
    asset: {
      uri: str(asset.uri),
      fileName: str(asset.fileName || asset.name),
      contentType: str(asset.mimeType || asset.type || asset.contentType),
      size: Number(asset.size || asset.fileSize) || 0,
      kind: str(asset.kind) || (str(asset.mimeType || asset.type).toLowerCase().startsWith('image/') ? 'image' : 'file'),
    },
    status: UPLOAD_STATUS.QUEUED,
    error: '',
    createdAt: now,
  };
}

export function addDraft(drafts = [], draft) {
  if (!draft || !draft.id) return Array.isArray(drafts) ? drafts.slice() : [];
  return [...(Array.isArray(drafts) ? drafts : []), draft];
}

export function removeDraft(drafts = [], draftId) {
  return (Array.isArray(drafts) ? drafts : []).filter(d => d.id !== draftId);
}

export function updateDraft(drafts = [], draftId, patch = {}) {
  return (Array.isArray(drafts) ? drafts : []).map(d => (d.id === draftId ? { ...d, ...patch } : d));
}

export function markDraftStatus(drafts = [], draftId, status, error = '') {
  return updateDraft(drafts, draftId, { status, error: error || '' });
}

export function listDrafts(drafts = []) {
  return Array.isArray(drafts) ? drafts.slice() : [];
}

export function pendingDrafts(drafts = []) {
  return listDrafts(drafts).filter(d =>
    d.status === UPLOAD_STATUS.QUEUED || d.status === UPLOAD_STATUS.OFFLINE_QUEUED || d.status === UPLOAD_STATUS.FAILED);
}

export function nextPendingDraft(drafts = []) {
  return pendingDrafts(drafts)[0] || null;
}

export function isQueueEmpty(drafts = []) {
  return pendingDrafts(drafts).length === 0;
}

export default {
  createProofDraft, addDraft, removeDraft, updateDraft, markDraftStatus,
  listDrafts, pendingDrafts, nextPendingDraft, isQueueEmpty,
};
