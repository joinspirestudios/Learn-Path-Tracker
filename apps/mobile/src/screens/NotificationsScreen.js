import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { MobileNotificationCenter } from '../components/MobileNotificationCenter.js';
import { MobileNotificationPreferences } from '../components/MobileNotificationPreferences.js';

// Notifications screen: in-app notification center + preferences. Reachable from
// the Profile/account area. Remote mobile push is deferred; only local reminders
// and in-app notifications are offered here.
export function NotificationsScreen({
  notifications, unreadCount, preferences, prefsBusy, prefsStatus,
  onMarkRead, onMarkAllRead, onClear, onSavePreferences, onEnableLocal, onBack,
}) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Notifications</Text>
      {onBack ? <AuroraButton label="Back to profile" variant="secondary" onPress={onBack} /> : null}

      <MobileNotificationCenter
        notifications={notifications}
        unreadCount={unreadCount}
        onMarkRead={onMarkRead}
        onMarkAllRead={onMarkAllRead}
        onClear={onClear}
      />

      <AuroraCard>
        <MobileNotificationPreferences
          preferences={preferences}
          busy={prefsBusy}
          status={prefsStatus}
          onSave={onSavePreferences}
          onEnableLocal={onEnableLocal}
        />
      </AuroraCard>

      <View style={styles.note}>
        <Text style={styles.noteText}>
          Reminders run on this device. Remote push is not enabled yet. Notifications never include
          your private proof, reflections, evidence links or tokens.
        </Text>
      </View>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  note: { paddingTop: auroraTheme.spacing.xs },
  noteText: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default NotificationsScreen;
