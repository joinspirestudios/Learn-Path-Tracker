import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

function kindLabel(item) {
  const t = String((item && item.type) || (item && item.evidenceType) || '').toLowerCase();
  if (t === 'link' || t === 'url') return 'Link';
  if (t === 'image') return 'Image';
  if (t === 'file') return 'File';
  return 'Proof';
}

// Display-only strip of already-saved proof items. No capture/upload/links.
export function MobileProofArchiveStrip({ items = [], title = 'Proof archive' }) {
  const list = Array.isArray(items) ? items.slice(0, 5) : [];
  if (!list.length) return null;
  return (
    <View style={styles.wrap}>
      <Text style={styles.head}>{title}</Text>
      {list.map((item, i) => (
        <View key={item.id || i} style={styles.row}>
          <Text style={styles.badge}>{kindLabel(item)}</Text>
          <Text style={styles.label} numberOfLines={1}>
            {String(item.taskTitle || item.title || 'Proof submitted')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: {
    backgroundColor: c.surface.panel, borderColor: c.border.subtle, borderWidth: 1,
    borderRadius: auroraTheme.radius.card, padding: auroraTheme.layout.cardPadding, gap: auroraTheme.spacing.xs,
  },
  head: { color: c.text.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'center', gap: auroraTheme.spacing.sm },
  badge: { color: c.accent.progress, fontSize: 10, fontWeight: '900' },
  label: { color: c.text.secondary, fontSize: 13, flexShrink: 1 },
});

export default MobileProofArchiveStrip;
