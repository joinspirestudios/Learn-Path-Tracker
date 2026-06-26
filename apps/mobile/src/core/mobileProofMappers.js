// Pure proof mappers — text/link proof only (no media, no files, no Storage).
//
// Proof is PRIVATE by default and "submitted", never "verified". These helpers
// never log proof bodies and never accept file/blob/storage fields.

function str(v) {
  if (typeof v === 'string') return v.trim();
  if (v == null) return '';
  return String(v).trim();
}

// Accept only well-formed http/https URLs. We never fetch or preview the URL.
export function isValidProofUrl(url) {
  const s = str(url);
  if (!s) return false;
  if (!/^https?:\/\//i.test(s)) return false;
  try {
    const parsed = new URL(s);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeProofUrl(url) {
  const s = str(url);
  return isValidProofUrl(s) ? s : '';
}

export function mapTextProof({ taskId, body, createdAt = null } = {}) {
  return {
    taskId: str(taskId),
    type: 'text',
    body: str(body),
    url: '',
    createdAt,
    privacy: 'private',
    submitted: true,
    verified: false, // never "verified" without real verification
  };
}

export function mapLinkProof({ taskId, url, createdAt = null } = {}) {
  const safe = normalizeProofUrl(url);
  return {
    taskId: str(taskId),
    type: 'link',
    body: '',
    url: safe,
    createdAt,
    privacy: 'private',
    submitted: !!safe,
    verified: false,
    invalid: !safe,
  };
}

// Normalize an arbitrary proof descriptor; strips any media/storage fields.
export function normalizeProof(raw = {}) {
  if (raw && raw.type === 'link') return mapLinkProof({ taskId: raw.taskId, url: raw.url, createdAt: raw.createdAt });
  return mapTextProof({ taskId: raw.taskId, body: raw.body, createdAt: raw.createdAt });
}

// Map an UPLOADED media proof (from taskState.mediaProof) to a private proof
// record. Includes storagePath + downloadURL (owner-private), never a local URI.
export function mapUploadedMediaProof({ taskId, mediaProof = {} } = {}) {
  return {
    taskId: str(taskId),
    type: 'image',
    body: '',
    url: '', // not a user-entered link
    storagePath: str(mediaProof.storagePath),
    downloadURL: str(mediaProof.downloadURL),
    fileName: str(mediaProof.fileName),
    fileType: str(mediaProof.fileType),
    fileSize: Number(mediaProof.fileSize) || 0,
    privacy: 'private',
    submitted: true,
    verified: false,
  };
}

// Collect submitted private proof from a finished session's task state. Includes
// uploaded image proof; never includes draft-only/local-URI media.
export function collectSubmittedProof(session = {}) {
  const taskState = (session && session.taskState) || {};
  const out = [];
  for (const [taskId, st] of Object.entries(taskState)) {
    if (!st || !st.done) continue;
    if (st.mediaProof && st.mediaProof.storagePath) {
      out.push(mapUploadedMediaProof({ taskId, mediaProof: st.mediaProof }));
    }
    if (st.proofUrl && isValidProofUrl(st.proofUrl)) {
      out.push(mapLinkProof({ taskId, url: st.proofUrl }));
    } else if (st.proofText && str(st.proofText)) {
      out.push(mapTextProof({ taskId, body: st.proofText }));
    }
  }
  return out;
}

export default {
  isValidProofUrl,
  normalizeProofUrl,
  mapTextProof,
  mapLinkProof,
  mapUploadedMediaProof,
  normalizeProof,
  collectSubmittedProof,
};
