import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraTextInput } from './AuroraTextInput.js';
import { isValidProofUrl } from '../core/mobileProofMappers.js';

// Text/link proof + optional reflection. Private by default. Never logs content.
// No file/camera/audio capture — text and link only.
export function MobileProofInput({
  proofType = 'text', onProofTypeChange,
  proofText = '', onProofTextChange,
  proofUrl = '', onProofUrlChange,
  reflection = '', onReflectionChange,
}) {
  const urlInvalid = proofType === 'link' && proofUrl.trim() !== '' && !isValidProofUrl(proofUrl);

  return (
    <View style={styles.wrap}>
      <View style={styles.typeRow}>
        <TypeTab label="Text proof" active={proofType === 'text'} onPress={() => onProofTypeChange && onProofTypeChange('text')} />
        <TypeTab label="Link proof" active={proofType === 'link'} onPress={() => onProofTypeChange && onProofTypeChange('link')} />
      </View>

      {proofType === 'link' ? (
        <>
          <AuroraTextInput
            value={proofUrl}
            onChangeText={onProofUrlChange}
            placeholder="https://link-to-your-proof"
            multiline={false}
            autoCapitalize="none"
          />
          {urlInvalid ? <Text style={styles.error}>Enter a valid http(s) link.</Text> : null}
        </>
      ) : (
        <AuroraTextInput
          value={proofText}
          onChangeText={onProofTextChange}
          placeholder="Describe what you actually did (saved privately)"
        />
      )}

      <Text style={styles.label}>Reflection (optional, private)</Text>
      <AuroraTextInput
        value={reflection}
        onChangeText={onReflectionChange}
        placeholder="A short private reflection"
      />

      <Text style={styles.note}>Saved privately on sync. Proof is submitted, not verified.</Text>
    </View>
  );
}

function TypeTab({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} style={[styles.tab, active ? styles.tabActive : null]}>
      <Text style={[styles.tabLabel, active ? styles.tabLabelActive : null]}>{label}</Text>
    </Pressable>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { gap: auroraTheme.spacing.sm, marginTop: auroraTheme.spacing.sm },
  typeRow: { flexDirection: 'row', gap: auroraTheme.spacing.sm },
  tab: {
    paddingVertical: auroraTheme.spacing.xs,
    paddingHorizontal: auroraTheme.spacing.md,
    borderRadius: auroraTheme.radius.pill,
    borderWidth: 1,
    borderColor: c.border.subtle,
  },
  tabActive: { borderColor: c.accent.progress },
  tabLabel: { color: c.text.secondary, fontSize: 12, fontWeight: '700' },
  tabLabelActive: { color: c.accent.progress },
  label: { color: c.text.muted, fontSize: 12, fontWeight: '700' },
  error: { color: c.accent.danger, fontSize: 12 },
  note: { color: c.text.muted, fontSize: 11, lineHeight: 16 },
});

export default MobileProofInput;
