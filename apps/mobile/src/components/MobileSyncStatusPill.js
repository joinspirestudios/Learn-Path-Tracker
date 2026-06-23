import React from 'react';

import { AuroraStatusPill } from './AuroraStatusPill.js';
import { SYNC_STATUS, syncStatusLabel } from '../core/mobileSyncStatus.js';

const TONE = {
  [SYNC_STATUS.SYNCED]: 'proof',
  [SYNC_STATUS.PUBLISH_AVAILABLE]: 'proof',
  [SYNC_STATUS.PUBLISHED]: 'peak',
  [SYNC_STATUS.SYNC_FAILED]: 'muted',
  [SYNC_STATUS.PUBLISH_FAILED]: 'muted',
};

export function MobileSyncStatusPill({ status }) {
  return <AuroraStatusPill label={syncStatusLabel(status)} tone={TONE[status] || 'progress'} />;
}

export default MobileSyncStatusPill;
