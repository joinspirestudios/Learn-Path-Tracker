import React from 'react';
import { View, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

// value: 0..100
export function AuroraProgressBar({ value = 0 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.fill, { width: pct + '%' }]} />
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: auroraTheme.radius.pill,
    backgroundColor: c.surface.raised,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: auroraTheme.radius.pill,
    backgroundColor: c.accent.progress,
  },
});

export default AuroraProgressBar;
