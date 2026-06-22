// Shared placeholder scaffold for foundation screens.
//
// Renders honest "not connected yet" copy on an Aurora surface. No real data,
// no API calls, no fake metrics. Later mobile phases replace the bodies of the
// individual screens with real proof-backed content.

import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

export function PlaceholderScreen({ title, intent, children }) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{title}</Text>
      {intent ? <Text style={styles.intent}>{intent}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.notice}>Not connected yet.</Text>
        <Text style={styles.body}>Mobile foundation placeholder.</Text>
        <Text style={styles.body}>
          Real proof-backed data will appear here after mobile data wiring.
        </Text>
      </View>
      {children}
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const s = auroraTheme.spacing;
const r = auroraTheme.radius;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: s.md },
  title: { color: c.text.primary, fontSize: 24, fontWeight: '700' },
  intent: { color: c.text.secondary, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: c.surface.panel,
    borderColor: c.border.subtle,
    borderWidth: 1,
    borderRadius: r.panel,
    padding: auroraTheme.layout.cardPadding,
    gap: s.xs,
  },
  notice: { color: c.text.primary, fontSize: 16, fontWeight: '600' },
  body: { color: c.text.muted, fontSize: 13, lineHeight: 19 },
});

export default PlaceholderScreen;
