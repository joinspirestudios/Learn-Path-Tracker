import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

// Small unread-count badge for the notifications entry. Renders nothing when
// there is nothing unread. Never shows private content — just a count.
export function MobileNotificationBadge({ count = 0 }) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n <= 0) return null;
  return (
    <View style={styles.badge} accessibilityLabel={n + ' unread notifications'}>
      <Text style={styles.text}>{n > 99 ? '99+' : String(n)}</Text>
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  badge: {
    minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9,
    backgroundColor: c.accent.progress, alignItems: 'center', justifyContent: 'center',
  },
  text: { color: '#1a1410', fontSize: 11, fontWeight: '800' },
});

export default MobileNotificationBadge;
