import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from './AuroraButton.js';
import { AuroraTextInput } from './AuroraTextInput.js';

// Email/password form. Never logs credentials. Shows only safe error messages
// passed in via `error`.
export function MobileAuthForm({ onSignIn, onCreateAccount, busy = false, error = '' }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Email</Text>
      <AuroraTextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        multiline={false}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Text style={styles.label}>Password</Text>
      <AuroraTextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Your password"
        multiline={false}
        autoCapitalize="none"
        secureTextEntry
      />

      {error ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}

      <AuroraButton
        label={busy ? 'Signing in…' : 'Sign in'}
        variant="primary"
        disabled={busy}
        onPress={() => onSignIn && onSignIn(email, password)}
      />
      <AuroraButton
        label="Create account"
        variant="secondary"
        disabled={busy}
        onPress={() => onCreateAccount && onCreateAccount(email, password)}
      />
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { gap: auroraTheme.spacing.sm },
  label: { color: c.text.muted, fontSize: 12, fontWeight: '700' },
  error: { color: c.accent.danger, fontSize: 13 },
});

export default MobileAuthForm;
