import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraStatusPill } from '../components/AuroraStatusPill.js';
import { MobileProfileCard } from '../components/MobileProfileCard.js';
import { MobileProfileEditor } from '../components/MobileProfileEditor.js';
import { MobileNotificationBadge } from '../components/MobileNotificationBadge.js';

// Shows a safe signed-in account summary + profile preview/editor. Never exposes
// ID tokens.
export function ProfileScreen({
  user, configured, localMode, profile, profileBusy, profileStatus,
  notificationUnreadCount = 0, onOpenNotifications, onOpenDiagnostics, onSaveProfile, onSignOut,
}) {
  const merged = { ...(profile || {}), uid: user && user.uid, displayName: (profile && profile.displayName) || (user && user.displayName) || '' };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Profile</Text>

      <AuroraCard>
        <View style={styles.headRow}>
          <Text style={styles.title}>Account</Text>
          <AuroraStatusPill
            label={localMode ? 'Local mode' : (configured ? 'Cloud connected' : 'Cloud not configured')}
            tone={localMode ? 'muted' : 'progress'}
          />
        </View>
        {user ? (
          <>
            {user.email ? <Text style={styles.row}>Signed in as {user.email}</Text> : null}
            {user.shortUid ? <Text style={styles.rowMuted}>ID {user.shortUid}…</Text> : null}
          </>
        ) : (
          <Text style={styles.rowMuted}>
            {localMode ? 'Exploring the local demo. Sign in to load cloud paths.' : 'Not signed in.'}
          </Text>
        )}
      </AuroraCard>

      {user ? (
        <AuroraCard>
          <View style={styles.headRow}>
            <Text style={styles.title}>Notifications</Text>
            <MobileNotificationBadge count={notificationUnreadCount} />
          </View>
          <Text style={styles.rowMuted}>In-app notifications, reminders and quiet hours.</Text>
          <AuroraButton label="Open notifications" variant="secondary" onPress={onOpenNotifications} />
        </AuroraCard>
      ) : null}

      {user ? <MobileProfileCard profile={merged} /> : null}

      {user ? (
        <AuroraCard>
          <MobileProfileEditor
            profile={merged}
            busy={profileBusy}
            status={profileStatus}
            onSave={onSaveProfile}
          />
        </AuroraCard>
      ) : null}

      {user ? (
        <AuroraCard>
          <View style={styles.headRow}>
            <Text style={styles.title}>App diagnostics</Text>
          </View>
          <Text style={styles.rowMuted}>Check configuration and beta readiness. No keys or private data are shown.</Text>
          <AuroraButton label="App diagnostics" variant="secondary" onPress={onOpenDiagnostics} />
        </AuroraCard>
      ) : null}

      {user ? <AuroraButton label="Sign out" variant="secondary" onPress={onSignOut} /> : null}

      <Text style={styles.note}>
        We never display or store your ID token. Profile pictures and covers are uploaded on web for now.
        Bio and reflections stay private unless you publish a public profile or progress.
      </Text>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: c.text.primary, fontSize: 17, fontWeight: '700' },
  row: { color: c.text.secondary, fontSize: 14 },
  rowMuted: { color: c.text.muted, fontSize: 13 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default ProfileScreen;
