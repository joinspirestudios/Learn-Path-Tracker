import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraStatusPill } from '../components/AuroraStatusPill.js';
import { getTodaySummary } from '../core/mobileCoreLoop.js';

export function PathsScreen({ loopState, onOpenRoadmap, onOpenToday }) {
  const summary = getTodaySummary(loopState);

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Paths</Text>
      <Text style={styles.title}>Your paths</Text>

      <AuroraCard>
        <View style={styles.row}>
          <Text style={styles.pathTitle}>{summary.pathTitle}</Text>
          <AuroraStatusPill label="Local only" tone="muted" />
        </View>
        <Text style={styles.meta}>Day {summary.dayNumber} · {summary.completedTasks} / {summary.totalTasks} tasks done</Text>
        <AuroraButton label="Open today" variant="primary" onPress={onOpenToday} />
        <AuroraButton label="View roadmap" variant="secondary" onPress={onOpenRoadmap} />
      </AuroraCard>

      <Text style={styles.note}>
        This is a local starter path. More paths arrive when mobile sync is connected.
      </Text>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: c.text.primary, fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pathTitle: { color: c.text.primary, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  meta: { color: c.text.secondary, fontSize: 13 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default PathsScreen;
