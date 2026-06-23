// Proof archive model — pure helpers that turn evidence submissions into
// private (owner) and public-safe proof card view models.
//
// No DOM, no Firebase, no side effects. Private view models may include
// owner-only URLs; public view models never expose private notes/reflections,
// raw private storage paths, or private evidence URLs (only explicitly
// public-safe artifacts and user-attached URL proof on public paths).

import { safeExternalUrl } from './urls.js';

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|avif|bmp|svg)(\?|#|$)/i;

function str(v, fallback = '') {
  if (typeof v === 'string') return v;
  if (v == null) return fallback;
  return String(v);
}
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

export function normalizeProofSubmission(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: str(raw.id),
    pathId: str(raw.pathId),
    userId: str(raw.userId),
    dayNumber: num(raw.dayNumber, 1),
    taskId: str(raw.taskId),
    taskTitle: str(raw.taskTitle),
    evidenceType: raw.evidenceType === 'file' ? 'file' : (raw.evidenceType === 'url' ? 'url' : str(raw.evidenceType)),
    evidenceUrl: safeExternalUrl(raw.evidenceUrl || raw.url) || '',
    storagePath: str(raw.storagePath),
    fileName: str(raw.fileName || raw.filename),
    fileType: str(raw.fileType || raw.mimeType),
    note: str(raw.note),
    // Optional explicit public projection fields (Phase 6.15.3).
    visibility: raw.visibility === 'private' ? 'private' : (raw.visibility === 'public' ? 'public' : ''),
    publicVisible: raw.publicVisible === false ? false : (raw.publicVisible === true ? true : null),
    publicCaption: str(raw.publicCaption),
    publicAssetURL: safeExternalUrl(raw.publicAssetURL) || '',
    publicAssetType: str(raw.publicAssetType),
    publicFileName: str(raw.publicFileName),
    status: str(raw.status, 'submitted') || 'submitted',
    createdAt: raw.createdAt || null,
  };
}

export function normalizeProofSubmissions(raw = []) {
  return (Array.isArray(raw) ? raw : []).map(normalizeProofSubmission).filter(Boolean);
}

export function proofIsImage(submission = {}) {
  const s = submission || {};
  if (str(s.fileType).toLowerCase().startsWith('image/')) return true;
  if (str(s.publicAssetType).toLowerCase().startsWith('image/')) return true;
  if (IMAGE_EXT_RE.test(str(s.evidenceUrl))) return true;
  if (IMAGE_EXT_RE.test(str(s.publicAssetURL))) return true;
  if (IMAGE_EXT_RE.test(str(s.fileName))) return true;
  return false;
}
export function proofIsFile(submission = {}) {
  const s = submission || {};
  if (proofIsImage(s)) return false;
  return s.evidenceType === 'file' || !!str(s.storagePath) || !!str(s.fileName);
}
export function proofIsUrl(submission = {}) {
  const s = submission || {};
  if (proofIsImage(s) || proofIsFile(s)) return false;
  return s.evidenceType === 'url' && !!str(s.evidenceUrl);
}
export function proofIsNote(submission = {}) {
  const s = submission || {};
  return !proofIsImage(s) && !proofIsFile(s) && !proofIsUrl(s) && !!str(s.note);
}

// One of: image | file | url | note | unknown
export function proofKind(submission = {}) {
  if (proofIsImage(submission)) return 'image';
  if (proofIsFile(submission)) return 'file';
  if (proofIsUrl(submission)) return 'url';
  if (proofIsNote(submission)) return 'note';
  return 'unknown';
}

export function proofDomain(submission = {}) {
  const url = safeExternalUrl(submission.evidenceUrl) || safeExternalUrl(submission.publicAssetURL);
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

export function proofCardTitle(submission = {}) {
  return str(submission.taskTitle) || (str(submission.fileName) ? str(submission.fileName) : 'Proof submitted');
}

export function proofCardSubtitle(submission = {}) {
  const kind = proofKind(submission);
  if (kind === 'url') return proofDomain(submission) || 'Link proof';
  if (kind === 'image') return submission.fileName ? str(submission.fileName) : 'Image proof';
  if (kind === 'file') return str(submission.fileName) || 'File proof';
  if (kind === 'note') return 'Note';
  return 'Proof';
}

export function proofSubmittedCount(submissions = []) {
  return normalizeProofSubmissions(submissions).length;
}

export function groupProofByDay(submissions = []) {
  const map = new Map();
  for (const s of normalizeProofSubmissions(submissions)) {
    const key = s.dayNumber || 1;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([dayNumber, items]) => ({ dayNumber, items }));
}

export function groupProofByTask(submissions = []) {
  const map = new Map();
  for (const s of normalizeProofSubmissions(submissions)) {
    const key = s.taskId || s.id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.entries()].map(([taskId, items]) => ({ taskId, taskTitle: items[0].taskTitle, items }));
}

// Owner-only view model — may include owner-viewable URLs and the private note.
export function privateProofCardViewModel(submission = {}, options = {}) {
  const s = normalizeProofSubmission(submission) || {};
  const kind = proofKind(s);
  return {
    scope: 'private',
    kind,
    title: proofCardTitle(s),
    subtitle: proofCardSubtitle(s),
    dayNumber: s.dayNumber,
    domain: proofDomain(s),
    url: s.evidenceUrl || '', // owner may view their own evidence URL
    thumbURL: kind === 'image' ? (s.evidenceUrl || s.publicAssetURL || '') : '',
    fileName: s.fileName,
    note: s.note, // private, owner-only
    submittedAt: s.createdAt,
    label: 'Private proof',
  };
}

// Public-safe view model — never private note/reflection, never raw private
// storage path. Only user-attached URL proof and explicitly public assets are
// shown; otherwise a safe "Proof submitted" placeholder.
export function publicProofCardViewModel(submission = {}, options = {}) {
  const s = normalizeProofSubmission(submission) || {};
  const kind = proofKind(s);
  const publicAsset = s.publicAssetURL || '';
  const urlForPublic = kind === 'url' ? s.evidenceUrl : publicAsset; // file/image only if explicit public asset
  const thumb = (kind === 'image') ? publicAsset : '';
  return {
    scope: 'public',
    kind: kind + '_public',
    title: proofCardTitle(s),
    subtitle: kind === 'url' ? (proofDomain(s) || 'Link proof') : (kind + ' proof'),
    dayNumber: s.dayNumber,
    domain: kind === 'url' ? proofDomain(s) : '',
    url: urlForPublic || '',
    thumbURL: thumb,
    caption: s.publicCaption, // public-safe caption only (never private note)
    submittedAt: s.createdAt,
    placeholder: !urlForPublic && !thumb, // nothing safe to show → "Proof submitted"
    label: 'Public proof',
  };
}

export function publicProofSummary(submissions = []) {
  const items = normalizeProofSubmissions(submissions);
  const types = new Set(items.map(proofKind));
  return {
    count: items.length,
    hasImage: types.has('image'),
    hasUrl: types.has('url'),
    hasFile: types.has('file'),
    typeLabels: [...types].filter(t => t !== 'unknown'),
  };
}

// Policy: public path proof is public-visible by default unless the item is
// explicitly marked private/unsafe. Private/unlisted path proof is owner-only.
export function isProofPublicVisible(submission = {}, { pathVisibility, ownerView = false } = {}) {
  if (ownerView) return true;
  const s = submission || {};
  if (s.visibility === 'private' || s.publicVisible === false) return false;
  return pathVisibility === 'public';
}

export default {
  normalizeProofSubmission, normalizeProofSubmissions, proofKind, proofCardTitle,
  proofCardSubtitle, proofDomain, proofIsImage, proofIsFile, proofIsUrl, proofIsNote,
  proofSubmittedCount, groupProofByDay, groupProofByTask,
  privateProofCardViewModel, publicProofCardViewModel, publicProofSummary, isProofPublicVisible,
};
