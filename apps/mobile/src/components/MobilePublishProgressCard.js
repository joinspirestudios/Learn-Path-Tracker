import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from './AuroraButton.js';
import { AuroraTextInput } from './AuroraTextInput.js';
import { MobileSyncStatusPill } from './MobileSyncStatusPill.js';
import { SYNC_STATUS, isSyncing } from '../core/mobileSyncStatus.js';

// Explicit, opt-in public progress publishing. Shown only after a successful
// day sync. Shares the day RESULT (score/tier/counts), never private proof text.
export function MobilePublishProgressCard({
  status, error, summary, caption = '', onCaptionChange, onPublish,
}) {
  const publishing = isSyncing(status);
  const published = status === SYNC_STATUS.PUBLISHED;

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={styles.title}>Publish progress</Text>
        {published ? <MobileSyncStatusPill status={status} /> : null}
      </View>

      <Text style={styles.note}>
        This shares your day result (score, tier, task and proof counts), not your private proof text.
      </Text>

      {summary ? (
        <Text style={styles.preview}>
          Public summary: Day {summary.dayNumber} · {summary.tier || 'completed'} · {summary.score}% · {summary.tasksCompleted} tasks · {summary.proofSubmittedCount} proof submitted
        </Text>
      ) : null}

      <AuroraTextInput
        value={caption}
        onChangeText={onCaptionChange}
        placeholder="Optional public caption"
        multiline={false}
      />

      <AuroraButton
        label={publishing ? 'Publishing…' : (published ? 'Update public summary' : 'Publish progress')}
        variant="secondary"
        disabled={publishing}
        onPress={onPublish}
      />
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
  preview: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
  error: { color: c.accent.danger, fontSize: 13 },
});

export default MobilePublishProgressCard;
