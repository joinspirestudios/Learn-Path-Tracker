import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { MobileCompletionSummary } from '../components/MobileCompletionSummary.js';
import { MobileProofSummaryCard } from '../components/MobileProofSummaryCard.js';
import { MobileSyncBanner } from '../components/MobileSyncBanner.js';
import { MobilePublishProgressCard } from '../components/MobilePublishProgressCard.js';
import { getCompletionSummary } from '../core/mobileCoreLoop.js';
import { SYNC_STATUS, canPublish } from '../core/mobileSyncStatus.js';

export function CompletionResultScreen({
  loopState, signedIn, syncStatus, syncError, onSync,
  publishStatus, publishError, publicSummary, caption, onCaptionChange, onPublish,
  onBackToToday, onReviewPath,
}) {
  const summary = getCompletionSummary(loopState);
  const showSync = !!signedIn;
  const showPublish = showSync && canPublish(syncStatus);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Day complete</Text>
      <Text style={styles.title}>{summary.pathTitle} · Day {summary.dayNumber}</Text>

      <AuroraCard>
        <MobileCompletionSummary summary={summary} />
      </AuroraCard>

      {summary.proofSubmitted > 0 ? (
        <MobileProofSummaryCard proofSubmittedCount={summary.proofSubmitted} typeLabels={['text/link']} />
      ) : null}

      {showSync ? (
        <MobileSyncBanner status={syncStatus} error={syncError} onSync={onSync} />
      ) : (
        <Text style={styles.note}>Sign in to sync this day to your private cloud record.</Text>
      )}

      {showPublish ? (
        <MobilePublishProgressCard
          status={publishStatus}
          error={publishError}
          summary={publicSummary}
          caption={caption}
          onCaptionChange={onCaptionChange}
          onPublish={onPublish}
        />
      ) : null}

      <AuroraButton label="Back to Today" variant="primary" onPress={onBackToToday} />
      <AuroraButton label="Review path" variant="ghost" onPress={onReviewPath} />

      <Text style={styles.note}>
        Proof and reflections stay private. Publishing shares only your day result, and only when you tap publish.
      </Text>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: c.text.primary, fontSize: 20, fontWeight: '700' },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default CompletionResultScreen;
