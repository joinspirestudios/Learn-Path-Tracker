import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from './AuroraCard.js';
import { AuroraStatusPill } from './AuroraStatusPill.js';

const TONE_BY_STATUS = {
  configured: 'progress',
  available: 'progress',
  enabled: 'progress',
  'signed in': 'progress',
  missing: 'muted',
  disabled: 'muted',
  'signed out': 'muted',
  unsupported: 'muted',
  unknown: 'muted',
};

// Renders a safe diagnostics report (status labels only). It is given an
// already-sanitized snapshot from mobileRuntimeDiagnostics — it never receives
// or displays API keys, tokens, buckets, storage paths or private proof.
export function MobileDiagnosticsCard({ snapshot = {} }) {
  const rows = [
    ['App version', snapshot.appVersion],
    ['Platform', snapshot.platform],
    ['API base', snapshot.apiBase],
    ['Firebase', snapshot.firebase],
    ['Storage', snapshot.storage],
    ['Auth', snapshot.auth],
    ['Image proof', snapshot.imageProof],
    ['Offline drafts', snapshot.offlineDrafts],
    ['File system', snapshot.fileSystem],
    ['Notifications', snapshot.notifications],
  ];
  return (
    <AuroraCard>
      <Text style={styles.title}>App diagnostics</Text>
      <Text style={styles.sub}>Status only — no keys, tokens or private data are shown.</Text>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.row}>
          <Text style={styles.label}>{label}</Text>
          <AuroraStatusPill label={String(value == null ? 'unknown' : value)} tone={TONE_BY_STATUS[value] || 'muted'} />
        </View>
      ))}
    </AuroraCard>
  );
}

const c = auroraTheme.colors;
const s = auroraTheme.spacing;
const styles = StyleSheet.create({
  title: { color: c.text.primary, fontSize: 16, fontWeight: '800' },
  sub: { color: c.text.muted, fontSize: 12, marginBottom: s.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  label: { color: c.text.secondary, fontSize: 14 },
});

export default MobileDiagnosticsCard;
