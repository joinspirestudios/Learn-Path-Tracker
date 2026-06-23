import React from 'react';
import { TextInput, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

// Safe local text input. Contents are never logged. Placeholder copy must not
// imply remote sync — proof/reflection text is local-only in Phase 6.11.
export function AuroraTextInput({ value, onChangeText, placeholder, multiline = true }) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={auroraTheme.colors.text.muted}
      multiline={multiline}
      style={styles.input}
    />
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  input: {
    minHeight: auroraTheme.layout.controlHeight,
    backgroundColor: c.surface.input,
    color: c.text.primary,
    borderColor: c.border.subtle,
    borderWidth: 1,
    borderRadius: auroraTheme.radius.md,
    padding: auroraTheme.spacing.md,
    fontSize: 14,
    textAlignVertical: 'top',
  },
});

export default AuroraTextInput;
