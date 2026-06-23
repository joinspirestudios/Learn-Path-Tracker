import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraStatusPill } from './AuroraStatusPill.js';

// Shows a single task. Daily Focus renders ONE of these at a time.
export function AuroraTaskCard({ title, description, requiresProof, done, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.title}>{title}</Text>
        {done
          ? <AuroraStatusPill label="Done" tone="proof" />
          : (requiresProof ? <AuroraStatusPill label="Proof required" tone="proof" /> : null)}
      </View>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  card: {
    backgroundColor: c.surface.panel,
    borderColor: c.border.subtle,
    borderWidth: 1,
    borderRadius: auroraTheme.radius.card,
    padding: auroraTheme.layout.cardPadding,
    gap: auroraTheme.spacing.sm,
  },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: auroraTheme.spacing.sm,
  },
  title: { color: c.text.primary, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  description: { color: c.text.secondary, fontSize: 13, lineHeight: 19 },
});

export default AuroraTaskCard;
