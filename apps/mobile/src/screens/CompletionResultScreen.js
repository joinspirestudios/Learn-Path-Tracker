import React from 'react';
import { ScrollView, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { MobileCompletionSummary } from '../components/MobileCompletionSummary.js';
import { getCompletionSummary } from '../core/mobileCoreLoop.js';

export function CompletionResultScreen({ loopState, onBackToToday, onReviewPath }) {
  const summary = getCompletionSummary(loopState);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Day complete</Text>
      <Text style={styles.title}>{summary.pathTitle} · Day {summary.dayNumber}</Text>

      <AuroraCard>
        <MobileCompletionSummary summary={summary} />
      </AuroraCard>

      <AuroraButton label="Back to Today" variant="primary" onPress={onBackToToday} />
      <AuroraButton label="Review path" variant="secondary" onPress={onReviewPath} />

      <Text style={styles.note}>
        Saved locally on this device. Mobile sync is not connected yet, so nothing is published.
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
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18, marginTop: auroraTheme.spacing.sm },
});

export default CompletionResultScreen;
