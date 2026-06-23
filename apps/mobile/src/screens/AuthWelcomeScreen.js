import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { MobileAuthForm } from '../components/MobileAuthForm.js';

// Real auth gate entry. When cloud config is missing, shows an honest
// not-configured state and (optionally) a local-demo entry. When configured and
// signed out, shows the email/password sign-in / create-account form.
export function AuthWelcomeScreen({
  configured = false, busy = false, error = '', onSignIn, onCreateAccount, onContinueLocal,
}) {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.brand}>Learn Path Tracker</Text>

      {!configured ? (
        <View style={styles.card}>
          <Text style={styles.title}>Mobile cloud connection is not configured</Text>
          <Text style={styles.body}>
            Cloud sign-in, your paths, and discovery need the mobile Firebase
            configuration. You can still explore the local demo.
          </Text>
          {onContinueLocal ? (
            <AuroraButton label="Continue with local demo" variant="primary" onPress={onContinueLocal} />
          ) : null}
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.title}>Sign in to sync your paths</Text>
          <Text style={styles.body}>
            Sign in to load your cloud paths and discover public paths. Daily
            sessions stay local for now.
          </Text>
          <MobileAuthForm
            onSignIn={onSignIn}
            onCreateAccount={onCreateAccount}
            busy={busy}
            error={error}
          />
        </View>
      )}

      <Text style={styles.note}>
        We never store your password in the app. Cloud path data is read-only in this version.
      </Text>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  brand: { color: c.text.primary, fontSize: 24, fontWeight: '800' },
  card: {
    backgroundColor: c.surface.panel,
    borderColor: c.border.subtle,
    borderWidth: 1,
    borderRadius: auroraTheme.radius.panel,
    padding: auroraTheme.layout.cardPadding,
    gap: auroraTheme.spacing.sm,
  },
  title: { color: c.text.primary, fontSize: 17, fontWeight: '700' },
  body: { color: c.text.secondary, fontSize: 14, lineHeight: 20 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default AuthWelcomeScreen;
