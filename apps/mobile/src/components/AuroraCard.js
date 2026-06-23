import React from 'react';
import { View, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

export function AuroraCard({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  card: {
    backgroundColor: c.surface.panel,
    borderColor: c.border.subtle,
    borderWidth: 1,
    borderRadius: auroraTheme.radius.panel,
    padding: auroraTheme.layout.cardPadding,
    gap: auroraTheme.spacing.sm,
  },
});

export default AuroraCard;
