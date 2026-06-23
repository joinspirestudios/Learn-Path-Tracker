import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

// Display-only proof summary (count + type labels). No capture/upload.
export function MobileProofSummaryCard({ proofSubmittedCount = 0, typeLabels = [] }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Proof submitted</Text>
      <Text style={styles.count}>{proofSubmittedCount}</Text>
      {typeLabels && typeLabels.length ? (
        <Text style={styles.types}>{typeLabels.join(' · ')}</Text>
      ) : null}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  card: {
    backgroundColor: c.surface.panel, borderColor: c.border.subtle, borderWidth: 1,
    borderRadius: auroraTheme.radius.card, padding: auroraTheme.layout.cardPadding, gap: 2,
  },
  title: { color: c.text.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  count: { color: c.accent.proof, fontSize: 24, fontWeight: '800' },
  types: { color: c.text.secondary, fontSize: 12 },
});

export default MobileProofSummaryCard;
