import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

export function AuroraEmptyState({ title = 'Nothing here yet', message = '' }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.xs },
  title: { color: c.text.primary, fontSize: 16, fontWeight: '700' },
  message: { color: c.text.muted, fontSize: 13, lineHeight: 19 },
});

export default AuroraEmptyState;
