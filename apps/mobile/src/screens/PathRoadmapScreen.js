import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraStatusPill } from '../components/AuroraStatusPill.js';
import { getTodaySummary, getCompletionSummary } from '../core/mobileCoreLoop.js';

const TIER_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  attempted: 'Attempted',
  passed: 'Passed',
  strong: 'Strong',
  perfect: 'Perfect',
};

export function PathRoadmapScreen({ loopState, onBack, onOpenToday }) {
  const summary = getTodaySummary(loopState);
  const completion = getCompletionSummary(loopState);
  const finished = summary.status === 'finished';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Roadmap</Text>
      <Text style={styles.title}>{summary.pathTitle}</Text>

      <AuroraCard>
        <View style={styles.row}>
          <Text style={styles.dayTitle}>Day {summary.dayNumber}</Text>
          <AuroraStatusPill
            label={finished ? (TIER_LABEL[completion.tier] || completion.tier) : statusLabel(summary.status)}
            tone={finished ? 'proof' : 'progress'}
          />
        </View>
        <Text style={styles.meta}>{summary.totalTasks} tasks · {summary.completedTasks} done</Text>
        <Text style={styles.meta}>{summary.proofSubmitted} proof submitted</Text>
        <AuroraButton label="Open today" variant="primary" onPress={onOpenToday} />
      </AuroraCard>

      <AuroraButton label="Back to paths" variant="ghost" onPress={onBack} />
      <Text style={styles.note}>Local-only roadmap. No community data here.</Text>
    </ScrollView>
  );
}

function statusLabel(status) {
  if (status === 'in_progress') return 'In progress';
  if (status === 'finished') return 'Finished';
  return 'Not started';
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  title: { color: c.text.primary, fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayTitle: { color: c.text.primary, fontSize: 16, fontWeight: '700' },
  meta: { color: c.text.secondary, fontSize: 13 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default PathRoadmapScreen;
