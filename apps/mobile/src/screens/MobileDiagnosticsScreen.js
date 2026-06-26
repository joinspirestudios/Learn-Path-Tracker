import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { MobileDiagnosticsCard } from '../components/MobileDiagnosticsCard.js';
import { betaBlockers, canStartInternalBeta } from '../core/mobileStoreReadinessGates.js';

// Developer/beta diagnostics screen, reached from Profile → App diagnostics.
// Shows safe status labels only — never API keys, tokens, private proof or
// Storage paths. Also surfaces the internal-beta readiness gate (informational).
export function MobileDiagnosticsScreen({ snapshot = {}, readinessItems = {}, onBack }) {
  const blockers = betaBlockers(readinessItems);
  const betaReady = canStartInternalBeta(readinessItems);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Diagnostics</Text>
      {onBack ? <AuroraButton label="Back to profile" variant="secondary" onPress={onBack} /> : null}

      <MobileDiagnosticsCard snapshot={snapshot} />

      <AuroraCard>
        <Text style={styles.title}>Internal beta readiness</Text>
        <Text style={styles.sub}>
          {betaReady ? 'All internal-beta gates are marked complete.' : 'Some internal-beta gates are still pending.'}
        </Text>
        {blockers.length ? (
          <View style={styles.list}>
            {blockers.map(item => (
              <Text key={item} style={styles.blocker}>• {item}</Text>
            ))}
          </View>
        ) : null}
        <Text style={styles.note}>
          This is a checklist status only — the app never auto-submits to any store.
          Run the manual QA checklist before any beta or submission.
        </Text>
      </AuroraCard>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const s = auroraTheme.spacing;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: c.text.primary, fontSize: 16, fontWeight: '800' },
  sub: { color: c.text.secondary, fontSize: 13, marginTop: 2 },
  list: { marginTop: s.xs, gap: 2 },
  blocker: { color: c.text.muted, fontSize: 12 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18, marginTop: s.sm },
});

export default MobileDiagnosticsScreen;
