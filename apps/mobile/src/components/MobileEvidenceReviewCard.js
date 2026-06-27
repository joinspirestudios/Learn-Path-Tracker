import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from './AuroraCard.js';
import { AuroraButton } from './AuroraButton.js';
import { AuroraStatusPill } from './AuroraStatusPill.js';
import { mobileEvidenceReviewState } from '../core/mobileEvidenceReview.js';
import { MOBILE_EVIDENCE_DISCLAIMER } from '../core/mobileEvidenceIntelligence.js';

// Compact review card: review status + private/public-safe label + pending-proof
// warning + dismiss/refresh. Review/dismiss only — never publishes, never changes
// visibility, never renders private fields, never asserts an activity happened.
export function MobileEvidenceReviewCard({ draft, pendingProofCount = 0, onDismiss, onRefresh, onReviewOnWeb }) {
  const state = mobileEvidenceReviewState(draft || {});
  return (
    <AuroraCard>
      <View style={styles.head}>
        <Text style={styles.kicker}>Evidence review</Text>
        <AuroraStatusPill label={state.statusLabel} tone={state.status === 'reviewed' ? 'progress' : 'muted'} />
      </View>

      <View style={styles.tags}>
        <AuroraStatusPill label={state.visibilityLabel} tone={state.hasPublicSafeSummary ? 'progress' : 'muted'} />
        {state.needsReview ? <AuroraStatusPill label="Review before sharing" tone="muted" /> : null}
      </View>

      {pendingProofCount > 0 ? (
        <Text style={styles.warn}>{pendingProofCount} proof item{pendingProofCount > 1 ? 's' : ''} still pending upload.</Text>
      ) : null}

      {state.hasPublicSafeSummary ? (
        <View style={styles.publicBlock}>
          <Text style={styles.publicLabel}>Public-safe summary</Text>
          <Text style={styles.publicText}>{state.publicSafeSummary}</Text>
          <Text style={styles.publicNote}>This summary does not include private proof.</Text>
        </View>
      ) : (
        <Text style={styles.privateNote}>This insight is private to you. Review on web before sharing anything.</Text>
      )}

      <Text style={styles.disclaimer}>{MOBILE_EVIDENCE_DISCLAIMER}</Text>

      <View style={styles.actions}>
        {onRefresh ? <AuroraButton label="Refresh" variant="secondary" onPress={onRefresh} /> : null}
        <AuroraButton label="Review on web" variant="secondary" onPress={onReviewOnWeb} />
        <AuroraButton label="Dismiss" variant="secondary" onPress={onDismiss} />
      </View>
    </AuroraCard>
  );
}

const c = auroraTheme.colors;
const s = auroraTheme.spacing;
const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  tags: { flexDirection: 'row', gap: s.xs, flexWrap: 'wrap', marginTop: s.xs },
  warn: { color: c.accent.progress, fontSize: 13, marginTop: s.sm },
  publicBlock: { marginTop: s.sm, gap: 2 },
  publicLabel: { color: c.text.muted, fontSize: 12, fontWeight: '800' },
  publicText: { color: c.text.primary, fontSize: 14 },
  publicNote: { color: c.text.muted, fontSize: 12 },
  privateNote: { color: c.text.secondary, fontSize: 13, marginTop: s.sm },
  disclaimer: { color: c.text.muted, fontSize: 12, marginTop: s.sm, lineHeight: 18 },
  actions: { marginTop: s.sm, gap: s.sm },
});

export default MobileEvidenceReviewCard;
