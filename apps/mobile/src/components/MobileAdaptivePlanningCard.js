import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from './AuroraCard.js';
import { AuroraButton } from './AuroraButton.js';
import { AuroraStatusPill } from './AuroraStatusPill.js';
import {
  normalizeMobileDraft, topMobileRecommendations, mobileAdaptiveSummary, recommendationLabel,
} from '../core/mobileAdaptivePlanning.js';

// Displays an adaptation draft summary + top recommendations with reasons.
// Mobile (Phase 7.0) is review/dismiss only — applying is done on web. Never
// renders private proof, evidence URLs or storage paths (server-sanitized).
export function MobileAdaptivePlanningCard({ draft, onDismiss, onReviewOnWeb }) {
  const d = normalizeMobileDraft(draft || {});
  if (!d.recommendations.length) return null;
  const top = topMobileRecommendations(d, 3);
  const onlyKeep = d.recommendations.length === 1 && d.recommendations[0].type === 'keep_plan_unchanged';

  return (
    <AuroraCard>
      <View style={styles.head}>
        <Text style={styles.kicker}>Adjust upcoming days</Text>
        <AuroraStatusPill label={d.source === 'ai_assisted' ? 'AI-assisted' : 'Suggested'} tone="progress" />
      </View>
      <Text style={styles.summary}>{mobileAdaptiveSummary(d)}</Text>

      <View style={styles.list}>
        {top.map((r, i) => (
          <View key={r.type + i} style={styles.item}>
            <Text style={styles.recLabel}>{recommendationLabel(r.type)}</Text>
            {r.reason ? <Text style={styles.recWhy}>{r.reason}</Text> : null}
          </View>
        ))}
      </View>

      {!onlyKeep ? (
        <Text style={styles.note}>Review and apply changes on the web app. Your completed and missed days never change.</Text>
      ) : null}

      <View style={styles.actions}>
        {!onlyKeep ? <AuroraButton label="Review on web" variant="secondary" onPress={onReviewOnWeb} /> : null}
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
  summary: { color: c.text.primary, fontSize: 14, fontWeight: '600', marginTop: s.xs },
  list: { marginTop: s.sm, gap: s.sm },
  item: { gap: 2 },
  recLabel: { color: c.text.primary, fontSize: 14, fontWeight: '700' },
  recWhy: { color: c.text.secondary, fontSize: 13 },
  note: { color: c.text.muted, fontSize: 12, marginTop: s.sm, lineHeight: 18 },
  actions: { marginTop: s.sm, gap: s.sm },
});

export default MobileAdaptivePlanningCard;
