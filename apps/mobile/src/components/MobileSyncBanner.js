import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from './AuroraButton.js';
import { MobileSyncStatusPill } from './MobileSyncStatusPill.js';
import { SYNC_STATUS, isSyncing } from '../core/mobileSyncStatus.js';

// Shows day sync status + a Sync day action. Never claims synced before success;
// never auto-syncs. Errors are safe strings (no raw Firebase errors).
export function MobileSyncBanner({ status, error, onSync }) {
  const syncing = isSyncing(status);
  const synced = status === SYNC_STATUS.SYNCED
    || status === SYNC_STATUS.PUBLISH_AVAILABLE
    || status === SYNC_STATUS.PUBLISHED;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title}>Day sync</Text>
        <MobileSyncStatusPill status={status} />
      </View>
      {!synced ? (
        <AuroraButton
          label={syncing ? 'Syncing…' : (status === SYNC_STATUS.SYNC_FAILED ? 'Retry sync' : 'Sync day')}
          variant="primary"
          disabled={syncing}
          onPress={onSync}
        />
      ) : (
        <Text style={styles.note}>Your completed day is synced to your private cloud record.</Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: {
    backgroundColor: c.surface.panel,
    borderColor: c.border.subtle,
    borderWidth: 1,
    borderRadius: auroraTheme.radius.card,
    padding: auroraTheme.layout.cardPadding,
    gap: auroraTheme.spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: c.text.primary, fontSize: 15, fontWeight: '700' },
  note: { color: c.text.secondary, fontSize: 13, lineHeight: 19 },
  error: { color: c.accent.danger, fontSize: 13 },
});

export default MobileSyncBanner;
