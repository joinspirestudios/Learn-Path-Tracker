import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

// variant: 'primary' | 'secondary' | 'ghost'
export function AuroraButton({ label, onPress, variant = 'primary', disabled = false }) {
  const isDisabled = !!disabled;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      accessibilityLabel={label}
      style={[
        styles.base,
        variant === 'primary' ? styles.primary : null,
        variant === 'secondary' ? styles.secondary : null,
        variant === 'ghost' ? styles.ghost : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      <Text
        style={[
          styles.label,
          variant === 'primary' ? styles.labelPrimary : styles.labelOther,
          isDisabled ? styles.labelDisabled : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  base: {
    minHeight: auroraTheme.layout.controlHeight,
    borderRadius: auroraTheme.radius.md,
    paddingHorizontal: auroraTheme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  primary: { backgroundColor: c.accent.progress, borderColor: c.accent.progress },
  secondary: { backgroundColor: c.surface.raised, borderColor: c.border.subtle },
  ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  disabled: { opacity: 0.5 },
  label: { fontSize: 15, fontWeight: '700' },
  labelPrimary: { color: '#fff' },
  labelOther: { color: c.text.primary },
  labelDisabled: { color: c.text.muted },
});

export default AuroraButton;
