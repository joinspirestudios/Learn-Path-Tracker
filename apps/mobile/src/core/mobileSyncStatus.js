// Pure sync-status states and transitions for the mobile day sync + publish flow.

export const SYNC_STATUS = {
  LOCAL_ONLY: 'local_only',
  READY_TO_SYNC: 'ready_to_sync',
  SYNCING: 'syncing',
  SYNCED: 'synced',
  SYNC_FAILED: 'sync_failed',
  PUBLISH_AVAILABLE: 'publish_available',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  PUBLISH_FAILED: 'publish_failed',
};

export function createSyncState() {
  return { status: SYNC_STATUS.LOCAL_ONLY, error: '', lastSyncedAt: null, lastPublishedAt: null };
}

// Derive a baseline status from session + known cloud facts.
export function deriveSyncStatus({ finished, synced, published } = {}) {
  if (published) return SYNC_STATUS.PUBLISHED;
  if (synced) return SYNC_STATUS.PUBLISH_AVAILABLE;
  if (finished) return SYNC_STATUS.READY_TO_SYNC;
  return SYNC_STATUS.LOCAL_ONLY;
}

export function isSyncing(status) {
  return status === SYNC_STATUS.SYNCING || status === SYNC_STATUS.PUBLISHING;
}

export function canPublish(status) {
  return status === SYNC_STATUS.PUBLISH_AVAILABLE
    || status === SYNC_STATUS.PUBLISH_FAILED
    || status === SYNC_STATUS.PUBLISHED;
}

export function syncStatusLabel(status) {
  return ({
    [SYNC_STATUS.LOCAL_ONLY]: 'Local only',
    [SYNC_STATUS.READY_TO_SYNC]: 'Sync pending',
    [SYNC_STATUS.SYNCING]: 'Syncing…',
    [SYNC_STATUS.SYNCED]: 'Synced',
    [SYNC_STATUS.SYNC_FAILED]: 'Sync failed',
    [SYNC_STATUS.PUBLISH_AVAILABLE]: 'Synced',
    [SYNC_STATUS.PUBLISHING]: 'Publishing…',
    [SYNC_STATUS.PUBLISHED]: 'Published',
    [SYNC_STATUS.PUBLISH_FAILED]: 'Publish failed',
  })[status] || 'Local only';
}

export default {
  SYNC_STATUS,
  createSyncState,
  deriveSyncStatus,
  isSyncing,
  canPublish,
  syncStatusLabel,
};
