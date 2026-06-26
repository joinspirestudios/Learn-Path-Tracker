import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from './AuroraButton.js';
import { validateMediaAsset, normalizeMediaAsset } from '../core/mobileMediaProofMappers.js';

// Picks an image/file from the device LIBRARY (no camera, no audio) for proof.
// Validates type/size before handing the asset to onPicked. Never uploads here.
export function MobileMediaProofPicker({ onPicked, busy = false }) {
  const [error, setError] = useState('');

  async function pickFromLibrary() {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : undefined,
        quality: 0.85,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return;
      const picked = (result.assets && result.assets[0]) || null;
      if (!picked) return;
      const asset = normalizeMediaAsset({
        uri: picked.uri,
        fileName: picked.fileName,
        mimeType: picked.mimeType || picked.type,
        size: picked.fileSize || picked.size,
      });
      const check = validateMediaAsset(asset);
      if (!check.ok) { setError(check.error); return; }
      onPicked && onPicked(asset);
    } catch {
      setError('Could not open your photo library.');
    }
  }

  return (
    <View style={styles.wrap}>
      <AuroraButton label={busy ? 'Please wait…' : 'Add photo or file proof'} variant="secondary" disabled={busy} onPress={pickFromLibrary} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>From your library only. JPEG, PNG, WebP or PDF, up to 10 MB. Proof stays private until you publish.</Text>
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { gap: auroraTheme.spacing.xs },
  error: { color: c.accent.danger, fontSize: 13 },
  note: { color: c.text.muted, fontSize: 11, lineHeight: 16 },
});

export default MobileMediaProofPicker;
