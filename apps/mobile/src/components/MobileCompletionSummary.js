import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraStatusPill } from './AuroraStatusPill.js';

const TIER_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  attempted: 'Attempted',
  passed: 'Passed',
  strong: 'Strong',
  perfect: 'Perfect',
};

const TIER_TONE = {
  perfect: 'peak',
  strong: 'proof',
  passed: 'progress',
};

export function MobileCompletionSummary({ summary }) {
  const tier = summary.tier || 'not_started';
  return (
    <View style={styles.wrap}>
      <View style={styles.scoreRow}>
        <Text style={styles.score}>{summary.score}%</Text>
        <AuroraStatusPill label={TIER_LABEL[tier] || tier} tone={TIER_TONE[tier] || 'neutral'} />
      </View>
      <View style={styles.statRow}>
        <Text style={styles.stat}>{summary.completedTasks} / {summary.totalTasks} tasks completed</Text>
      </View>
      <View style={styles.statRow}>
        <Text style={styles.stat}>{summary.proofSubmitted} proof submitted</Text>
      </View>
      {summary.reflectionCount ? (
        <View style={styles.statRow}>
          <Text style={styles.stat}>{summary.reflectionCount} reflection saved locally</Text>
        </View>
      ) : null}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { gap: auroraTheme.spacing.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: auroraTheme.spacing.md },
  score: { color: c.text.primary, fontSize: 32, fontWeight: '800' },
  statRow: { flexDirection: 'row' },
  stat: { color: c.text.secondary, fontSize: 14 },
});

export default MobileCompletionSummary;
