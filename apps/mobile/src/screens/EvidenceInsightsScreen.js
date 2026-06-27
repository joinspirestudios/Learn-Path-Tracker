import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraLoadingState } from '../components/AuroraLoadingState.js';
import { MobileEvidenceInsightCard } from '../components/MobileEvidenceInsightCard.js';

// Evidence insights screen (Profile → Evidence intelligence). Shows the latest
// evidence insight draft; review/dismiss only — publishing is on web. Does not
// touch Daily Focus and never claims "verified".
export function EvidenceInsightsScreen({
  draft, loading, onRefresh, onDismiss, onReviewOnWeb, onBack,
}) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Evidence intelligence</Text>
      {onBack ? <AuroraButton label="Back to profile" variant="secondary" onPress={onBack} /> : null}

      {loading ? (
        <AuroraLoadingState message="Looking at your proof…" />
      ) : draft && ((draft.insights && draft.insights.length) || (draft.recommendations && draft.recommendations.length)) ? (
        <MobileEvidenceInsightCard draft={draft} onDismiss={onDismiss} onReviewOnWeb={onReviewOnWeb} />
      ) : (
        <AuroraCard>
          <Text style={styles.emptyTitle}>No evidence insights yet</Text>
          <Text style={styles.emptyBody}>
            Keep submitting proof. We’ll point out coverage gaps and ways to make your documentation
            stronger — never a judgement of whether something happened.
          </Text>
          {onRefresh ? <AuroraButton label="Check again" variant="secondary" onPress={onRefresh} /> : null}
        </AuroraCard>
      )}

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Evidence Intelligence helps you understand your documentation patterns. It does not verify
          that an activity happened. Your private proof stays private.
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

export default EvidenceInsightsScreen;
