// Pure upload-status states + transitions for mobile media proof.

export const UPLOAD_STATUS = {
  IDLE: 'idle',
  QUEUED: 'queued',
  OFFLINE_QUEUED: 'offline_queued',
  UPLOADING: 'uploading',
  UPLOADED: 'uploaded',
  FAILED: 'failed',
};

export function createUploadState() {
  return { status: UPLOAD_STATUS.IDLE, error: '', progress: 0 };
}

export function isUploading(status) {
  return status === UPLOAD_STATUS.UPLOADING;
}

export function isPendingUpload(status) {
  return status === UPLOAD_STATUS.QUEUED || status === UPLOAD_STATUS.OFFLINE_QUEUED || status === UPLOAD_STATUS.FAILED;
}

export function deriveUploadStatus({ online = true, queued = false, uploading = false, uploaded = false, failed = false } = {}) {
  if (uploaded) return UPLOAD_STATUS.UPLOADED;
  if (uploading) return UPLOAD_STATUS.UPLOADING;
  if (failed) return UPLOAD_STATUS.FAILED;
  if (queued) return online ? UPLOAD_STATUS.QUEUED : UPLOAD_STATUS.OFFLINE_QUEUED;
  return UPLOAD_STATUS.IDLE;
}

export function uploadStatusLabel(status) {
  return ({
    [UPLOAD_STATUS.IDLE]: '',
    [UPLOAD_STATUS.QUEUED]: 'Queued to upload',
    [UPLOAD_STATUS.OFFLINE_QUEUED]: 'Saved offline — will upload when online',
    [UPLOAD_STATUS.UPLOADING]: 'Uploading…',
    [UPLOAD_STATUS.UPLOADED]: 'Proof submitted',
    [UPLOAD_STATUS.FAILED]: 'Upload failed — tap to retry',
  })[status] || '';
}

export default {
  UPLOAD_STATUS, createUploadState, isUploading, isPendingUpload, deriveUploadStatus, uploadStatusLabel,
};
