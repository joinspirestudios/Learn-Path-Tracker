import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraTextInput } from './AuroraTextInput.js';
import { AuroraButton } from './AuroraButton.js';
import { validateDisplayName } from '../core/mobileProfileMappers.js';

// Edits safe text profile fields. Username is shown read-only (changed on web,
// which holds the transactional reservation). Never displays tokens.
export function MobileProfileEditor({ profile = {}, busy = false, status = '', onSave }) {
  const [displayName, setDisplayName] = useState(profile.displayName || '');
  const [bio, setBio] = useState(profile.bio || '');
  const [website, setWebsite] = useState(profile.websiteURL || '');
  const [publicEnabled, setPublicEnabled] = useState(profile.publicProfileEnabled !== false);
  const [localError, setLocalError] = useState('');

  function handleSave() {
    const name = validateDisplayName(displayName);
    if (!name.ok) { setLocalError(name.error); return; }
    setLocalError('');
    onSave && onSave({ displayName: name.value, bio, websiteURL: website, publicProfileEnabled: publicEnabled });
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Edit profile</Text>

      <Text style={styles.label}>Display name</Text>
      <AuroraTextInput value={displayName} onChangeText={setDisplayName} placeholder="Your name" multiline={false} />

      {profile.username ? (
        <>
          <Text style={styles.label}>Username</Text>
          <Text style={styles.readonly}>@{profile.username} · change on web</Text>
        </>
      ) : null}

      <Text style={styles.label}>Bio</Text>
      <AuroraTextInput value={bio} onChangeText={setBio} placeholder="A short intro (private until you publish a profile)" />

      <Text style={styles.label}>Website</Text>
      <AuroraTextInput value={website} onChangeText={setWebsite} placeholder="https://..." multiline={false} autoCapitalize="none" />

      <AuroraButton
        label={publicEnabled ? 'Public profile: on' : 'Public profile: off'}
        variant="ghost"
        onPress={() => setPublicEnabled(v => !v)}
      />

      {(localError || status) ? <Text style={localError ? styles.error : styles.status}>{localError || status}</Text> : null}
      <AuroraButton label={busy ? 'Saving…' : 'Save profile'} variant="primary" disabled={busy} onPress={handleSave} />
      <Text style={styles.note}>Profile picture and cover are uploaded on web for now.</Text>
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { gap: auroraTheme.spacing.sm },
  title: { color: c.text.primary, fontSize: 16, fontWeight: '700' },
  label: { color: c.text.muted, fontSize: 12, fontWeight: '700' },
  readonly: { color: c.text.secondary, fontSize: 14 },
  error: { color: c.accent.danger, fontSize: 13 },
  status: { color: c.accent.proof, fontSize: 13 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default MobileProfileEditor;
