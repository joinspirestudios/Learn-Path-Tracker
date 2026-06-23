import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from './AuroraButton.js';

// Shows a safe, human error message — never raw Firebase error objects.
export function AuroraErrorState({ message = 'We could not load this yet.', onRetry }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry ? <AuroraButton label="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.sm },
  title: { color: c.text.primary, fontSize: 16, fontWeight: '700' },
  message: { color: c.text.secondary, fontSize: 14, lineHeight: 20 },
});

export default AuroraErrorState;
