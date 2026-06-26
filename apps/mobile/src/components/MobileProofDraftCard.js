import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from './AuroraButton.js';
import { MobileProofThumbnail } from './MobileProofThumbnail.js';
import { UPLOAD_STATUS, uploadStatusLabel } from '../core/mobileProofUploadState.js';

// A queued/offline media-proof draft, with retry/remove actions. Display only —
// never logs file contents.
export function MobileProofDraftCard({ draft, onRetry, onRemove }) {
  const d = draft || {};
  const asset = d.asset || {};
  const status = d.status || UPLOAD_STATUS.QUEUED;
  const canRetry = status === UPLOAD_STATUS.FAILED || status === UPLOAD_STATUS.OFFLINE_QUEUED || status === UPLOAD_STATUS.QUEUED;
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <MobileProofThumbnail uri={asset.uri} kind={asset.kind} label={asset.fileName} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>{asset.fileName || 'Proof'}</Text>
          <Text style={styles.status}>{uploadStatusLabel(status)}</Text>
          {d.error ? <Text style={styles.error} numberOfLines={2}>{d.error}</Text> : null}
        </View>
      </View>
      <View style={styles.actions}>
        {canRetry ? <AuroraButton label="Retry" variant="secondary" onPress={() => onRetry && onRetry(d)} /> : null}
        <AuroraButton label="Remove" variant="ghost" onPress={() => onRemove && onRemove(d)} />
      </View>
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  card: {
    backgroundColor: c.surface.panel, borderColor: c.border.subtle, borderWidth: 1,
    borderRadius: auroraTheme.radius.card, padding: auroraTheme.layout.cardPadding, gap: auroraTheme.spacing.sm,
  },
  row: { flexDirection: 'row', gap: auroraTheme.spacing.md, alignItems: 'center' },
  body: { flexShrink: 1, gap: 2 },
  title: { color: c.text.primary, fontSize: 14, fontWeight: '700' },
  status: { color: c.text.secondary, fontSize: 12 },
  error: { color: c.accent.danger, fontSize: 12 },
  actions: { flexDirection: 'row', gap: auroraTheme.spacing.sm, justifyContent: 'flex-end' },
});

export default MobileProofDraftCard;
