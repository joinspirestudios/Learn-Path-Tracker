import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { UPLOAD_STATUS, uploadStatusLabel } from '../core/mobileProofUploadState.js';

// Shows overall media-proof upload / offline-queue status. Honest copy only.
export function MobileUploadStatusBanner({ status = UPLOAD_STATUS.IDLE, pendingCount = 0, online = true }) {
  const offline = !online && pendingCount > 0;
  const label = offline
    ? pendingCount + ' proof item' + (pendingCount === 1 ? '' : 's') + ' saved offline — will upload when online'
    : uploadStatusLabel(status);
  if (!label) return null;
  const tone = (status === UPLOAD_STATUS.UPLOADED) ? styles.ok
    : (status === UPLOAD_STATUS.FAILED ? styles.bad : styles.info);
  return (
    <View style={[styles.banner, tone]}>
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  banner: {
    borderWidth: 1, borderColor: c.border.subtle, borderRadius: auroraTheme.radius.md,
    paddingVertical: auroraTheme.spacing.sm, paddingHorizontal: auroraTheme.layout.cardPadding,
    backgroundColor: c.surface.panel,
  },
  info: { borderColor: c.accent.progress },
  ok: { borderColor: c.accent.proof },
  bad: { borderColor: c.accent.danger },
  text: { color: c.text.secondary, fontSize: 13 },
});

export default MobileUploadStatusBanner;
