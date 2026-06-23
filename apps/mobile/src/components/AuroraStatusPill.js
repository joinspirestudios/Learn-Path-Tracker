import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

// tone: 'neutral' | 'proof' | 'progress' | 'peak' | 'muted'
export function AuroraStatusPill({ label, tone = 'neutral' }) {
  return (
    <View style={[styles.pill, toneStyles[tone] || toneStyles.neutral]}>
      <Text style={[styles.label, toneLabel[tone] || toneLabel.neutral]}>{label}</Text>
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: auroraTheme.radius.pill,
    paddingHorizontal: auroraTheme.spacing.md,
    paddingVertical: auroraTheme.spacing.xs,
  },
  label: { fontSize: 11, fontWeight: '800' },
});

const toneStyles = StyleSheet.create({
  neutral: { borderColor: c.border.subtle, backgroundColor: c.surface.raised },
  proof: { borderColor: c.accent.proof, backgroundColor: 'transparent' },
  progress: { borderColor: c.accent.progress, backgroundColor: 'transparent' },
  peak: { borderColor: c.accent.peak, backgroundColor: 'transparent' },
  muted: { borderColor: c.border.subtle, backgroundColor: 'transparent' },
});

const toneLabel = StyleSheet.create({
  neutral: { color: c.text.secondary },
  proof: { color: c.accent.proof },
  progress: { color: c.accent.progress },
  peak: { color: c.accent.peak },
  muted: { color: c.text.muted },
});

export default AuroraStatusPill;
