import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraLoadingState } from '../components/AuroraLoadingState.js';
import { MobileAdaptivePlanningCard } from '../components/MobileAdaptivePlanningCard.js';

// Adaptive planning screen (reached from Profile). Shows the latest adaptation
// draft summary; review/dismiss only — applying is on web in Phase 7.0. Does not
// touch Daily Focus.
export function AdaptivePlanningScreen({
  draft, loading, onRefresh, onDismiss, onReviewOnWeb, onBack,
}) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Adaptive planning</Text>
      {onBack ? <AuroraButton label="Back to profile" variant="secondary" onPress={onBack} /> : null}

      {loading ? (
        <AuroraLoadingState message="Looking at your recent activity…" />
      ) : draft && draft.recommendations && draft.recommendations.length ? (
        <MobileAdaptivePlanningCard draft={draft} onDismiss={onDismiss} onReviewOnWeb={onReviewOnWeb} />
      ) : (
        <AuroraCard>
          <Text style={styles.emptyTitle}>No suggestions right now</Text>
          <Text style={styles.emptyBody}>
            Keep doing your days and submitting proof. We’ll suggest gentle adjustments when your recent
            activity shows a pattern worth acting on.
          </Text>
          {onRefresh ? <AuroraButton label="Check again" variant="secondary" onPress={onRefresh} /> : null}
        </AuroraCard>
      )}

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Suggestions are based on your real activity only. Nothing is applied automatically, and your
          completed or missed days are never rewritten.
        </Text>
      </View>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  emptyTitle: { color: c.text.primary, fontSize: 15, fontWeight: '800', marginBottom: 4 },
  emptyBody: { color: c.text.muted, fontSize: 13, lineHeight: 19 },
  note: { paddingTop: auroraTheme.spacing.xs },
  noteText: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default AdaptivePlanningScreen;
