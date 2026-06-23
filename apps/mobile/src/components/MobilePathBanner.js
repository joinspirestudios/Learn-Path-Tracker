import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

function safeUrl(v) {
  const s = v == null ? '' : String(v).trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

// Displays a path's public banner image + optional subtitle. Read-only display
// (no editing/upload in this phase). Returns null when there is no banner.
export function MobilePathBanner({ path }) {
  const personalization = (path && path.personalization) || path || {};
  const bannerURL = safeUrl(personalization.bannerURL);
  if (!bannerURL) return null;
  const subtitle = String(personalization.publicSubtitle || '').slice(0, 140);
  return (
    <View style={styles.wrap}>
      <Image source={{ uri: bannerURL }} style={styles.banner} />
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { gap: auroraTheme.spacing.xs },
  banner: { width: '100%', height: 96, borderRadius: auroraTheme.radius.card, backgroundColor: c.surface.raised },
  subtitle: { color: c.text.secondary, fontSize: 13 },
});

export default MobilePathBanner;
