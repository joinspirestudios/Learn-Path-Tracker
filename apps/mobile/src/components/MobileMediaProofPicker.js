import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from './AuroraButton.js';
import { validateMediaAsset, normalizeMediaAsset } from '../core/mobileMediaProofMappers.js';

// Image proof picker. Library selection OR camera capture (image-only — no
// audio/video/PDF). Permissions are requested ONLY inside the relevant user
// action, never at app launch. Validates before handing the asset upward; never
// uploads here.
export function MobileMediaProofPicker({ onPicked, busy = false }) {
  const [error, setError] = useState('');

  function imageMediaTypes() {
    return ImagePicker.MediaTypeOptions ? ImagePicker.MediaTypeOptions.Images : undefined;
  }

  function handleResult(result, onError) {
    if (result.canceled) return;
    const picked = (result.assets && result.assets[0]) || null;
    if (!picked) return;
    const asset = normalizeMediaAsset({
      uri: picked.uri,
      fileName: picked.fileName,
      mimeType: picked.mimeType || picked.type,
      size: picked.fileSize || picked.size,
      width: picked.width,
      height: picked.height,
    });
    const check = validateMediaAsset(asset);
    if (!check.ok) { setError(check.error); return; }
    onPicked && onPicked(asset);
  }

  async function chooseFromLibrary() {
    setError('');
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { setError('Photo library permission is needed to choose proof images.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: imageMediaTypes(), quality: 0.85, allowsMultipleSelection: false,
      });
      handleResult(result);
    } catch {
      setError('Could not select image.');
    }
  }

  async function takePhoto() {
    setError('');
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) { setError('Camera permission is needed to take proof photos.'); return; }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: imageMediaTypes(), quality: 0.85,
      });
      handleResult(result);
    } catch {
      setError('Could not take photo.');
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Image proof</Text>
      <View style={styles.row}>
        <AuroraButton label={busy ? 'Please wait…' : 'Choose photo'} variant="secondary" disabled={busy} onPress={chooseFromLibrary} />
        <AuroraButton label="Take photo" variant="secondary" disabled={busy} onPress={takePhoto} />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Text style={styles.note}>Only JPEG, PNG or WebP images are supported, up to 10 MB. Proof stays private until you publish.</Text>
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { gap: auroraTheme.spacing.xs, marginTop: auroraTheme.spacing.sm },
  label: { color: c.text.muted, fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', gap: auroraTheme.spacing.sm },
  error: { color: c.accent.danger, fontSize: 13 },
  note: { color: c.text.muted, fontSize: 11, lineHeight: 16 },
});

export default MobileMediaProofPicker;
