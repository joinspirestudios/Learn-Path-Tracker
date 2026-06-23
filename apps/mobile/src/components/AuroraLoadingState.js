import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

export function AuroraLoadingState({ message = 'Loading…' }) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel={message}>
      <ActivityIndicator color={auroraTheme.colors.accent.progress} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.sm, alignItems: 'center' },
  text: { color: c.text.secondary, fontSize: 14 },
});

export default AuroraLoadingState;
