import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

// Display-only proof thumbnail: image preview, or a file/url tile. Owner view may
// pass a local uri or download URL; public callers pass only public-safe URLs.
export function MobileProofThumbnail({ uri = '', kind = 'file', label = '' }) {
  const isImage = (kind === 'image') && !!uri;
  if (isImage) {
    return <Image source={{ uri }} style={styles.thumb} accessibilityLabel={label || 'Proof image'} />;
  }
  return (
    <View style={[styles.thumb, styles.tile]}>
      <Text style={styles.tileLabel}>{(label || (kind === 'url' ? 'LINK' : 'FILE')).slice(0, 6).toUpperCase()}</Text>
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  thumb: { width: 56, height: 56, borderRadius: auroraTheme.radius.md, backgroundColor: c.surface.raised },
  tile: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: c.border.subtle },
  tileLabel: { color: c.text.muted, fontSize: 10, fontWeight: '900' },
});

export default MobileProofThumbnail;
