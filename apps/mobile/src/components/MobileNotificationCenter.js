import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from './AuroraCard.js';

function relativeTime(createdAt, now = Date.now()) {
  const diff = Math.max(0, now - Number(createdAt || 0));
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours + 'h ago';
  return Math.floor(hours / 24) + 'd ago';
}

// In-app notification list for mobile. Shows title/body/time + mark-read / clear.
// Renders only public-safe fields — never tokens, evidence URLs or proof bodies.
export function MobileNotificationCenter({
  notifications = [], unreadCount = 0, onMarkRead, onMarkAllRead, onClear,
}) {
  const items = Array.isArray(notifications) ? notifications : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <Text style={styles.title}>Notifications</Text>
        {unreadCount > 0 ? (
          <Pressable onPress={onMarkAllRead} accessibilityRole="button">
            <Text style={styles.markAll}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      {items.length === 0 ? (
        <AuroraCard>
          <Text style={styles.emptyTitle}>You’re all caught up</Text>
          <Text style={styles.emptyBody}>Reminders and progress updates will appear here.</Text>
        </AuroraCard>
      ) : (
        items.map(n => (
          <AuroraCard key={n.id}>
            <View style={styles.row}>
              <View style={styles.main}>
                <Text style={[styles.rowTitle, !n.read ? styles.unread : null]}>{n.title}</Text>
                {n.body ? <Text style={styles.body}>{n.body}</Text> : null}
                <Text style={styles.meta}>{relativeTime(n.createdAt)}</Text>
              </View>
              <View style={styles.controls}>
                {!n.read ? (
                  <Pressable onPress={() => onMarkRead && onMarkRead(n.id)} accessibilityRole="button">
                    <Text style={styles.control}>Mark read</Text>
                  </Pressable>
                ) : null}
                <Pressable onPress={() => onClear && onClear(n.id)} accessibilityRole="button">
                  <Text style={styles.control}>Clear</Text>
                </Pressable>
              </View>
            </View>
          </AuroraCard>
        ))
      )}
    </View>
  );
}

const c = auroraTheme.colors;
const s = auroraTheme.spacing;
const styles = StyleSheet.create({
  wrap: { gap: s.sm },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: c.text.primary, fontSize: 16, fontWeight: '800' },
  markAll: { color: c.accent.progress, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: s.sm },
  main: { flex: 1 },
  rowTitle: { color: c.text.primary, fontSize: 14, fontWeight: '700' },
  unread: { color: c.text.primary },
  body: { color: c.text.secondary, fontSize: 13, marginTop: 2 },
  meta: { color: c.text.muted, fontSize: 11, marginTop: 4 },
  controls: { alignItems: 'flex-end', gap: 6 },
  control: { color: c.text.secondary, fontSize: 12, fontWeight: '600' },
  emptyTitle: { color: c.text.primary, fontWeight: '800', marginBottom: 4 },
  emptyBody: { color: c.text.muted, fontSize: 13 },
});

export default MobileNotificationCenter;
