import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraStatusPill } from '../components/AuroraStatusPill.js';
import { getTodaySummary, todayCta } from '../core/mobileCoreLoop.js';

export function TodayScreen({ loopState, onStartToday, onContinueDay, onViewResult, onReviewPath }) {
  const summary = getTodaySummary(loopState);
  const cta = todayCta(loopState);

  function handlePrimary() {
    if (cta.action === 'result') return onViewResult && onViewResult();
    if (cta.action === 'continue') return onContinueDay && onContinueDay();
    return onStartToday && onStartToday();
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Today</Text>
      <Text style={styles.title}>{summary.pathTitle}</Text>

      <AuroraCard>
        <View style={styles.metaRow}>
          <Text style={styles.meta}>Day {summary.dayNumber}</Text>
          <AuroraStatusPill label={statusLabel(summary.status)} tone="progress" />
        </View>
        <Text style={styles.stat}>{summary.completedTasks} / {summary.totalTasks} tasks completed</Text>
        <Text style={styles.stat}>
          {summary.proofNeeded > 0
            ? summary.proofNeeded + ' task needs text proof'
            : 'No proof needed right now'}
        </Text>
        {summary.proofSubmitted > 0 ? (
          <Text style={styles.stat}>{summary.proofSubmitted} proof submitted</Text>
        ) : null}
      </AuroraCard>

      <AuroraButton label={cta.label} variant="primary" onPress={handlePrimary} />
      <AuroraButton label="View local roadmap" variant="ghost" onPress={onReviewPath} />

      <Text style={styles.note}>Mobile sync is not connected yet. This is a local mobile session.</Text>
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
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meta: { color: c.text.secondary, fontSize: 13, fontWeight: '700' },
  stat: { color: c.text.secondary, fontSize: 14 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18, marginTop: auroraTheme.spacing.sm },
});

export default TodayScreen;
