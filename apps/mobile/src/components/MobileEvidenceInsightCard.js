import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from './AuroraCard.js';
import { AuroraButton } from './AuroraButton.js';
import { AuroraStatusPill } from './AuroraStatusPill.js';
import {
  normalizeMobileEvidenceDraft, topMobileEvidenceRecommendations, mobileEvidenceSummary,
  evidenceInsightLabel, evidenceRecommendationLabel, MOBILE_EVIDENCE_DISCLAIMER,
} from '../core/mobileEvidenceIntelligence.js';

// Compact evidence intelligence card: coverage summary + top recommendations +
// disclaimer. Review/dismiss only on mobile (no publish). Never renders private
// proof, evidence URLs or storage paths (server-sanitized) and never says
// that an activity happened.
export function MobileEvidenceInsightCard({ draft, onDismiss, onReviewOnWeb }) {
  const d = normalizeMobileEvidenceDraft(draft || {});
  if (!d.insights.length && !d.recommendations.length) return null;
  const recs = topMobileEvidenceRecommendations(d, 3);
  const topInsights = d.insights.slice(0, 2);

  return (
    <AuroraCard>
      <View style={styles.head}>
        <Text style={styles.kicker}>Evidence intelligence</Text>
        <AuroraStatusPill label={d.source === 'ai_assisted' ? 'AI-assisted' : 'From activity'} tone="progress" />
      </View>
      <Text style={styles.summary}>{mobileEvidenceSummary(d)}</Text>

      {topInsights.length ? (
        <View style={styles.list}>
          {topInsights.map((i, idx) => (
            <View key={i.type + idx} style={styles.item}>
              <Text style={styles.insightLabel}>{evidenceInsightLabel(i.type)}</Text>
              {i.reason ? <Text style={styles.why}>{i.reason}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      {recs.length ? (
        <View style={styles.list}>
          {recs.map((r, idx) => (
            <View key={r.type + idx} style={styles.item}>
              <Text style={styles.recLabel}>{evidenceRecommendationLabel(r.type)}</Text>
              {r.reason ? <Text style={styles.why}>{r.reason}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.disclaimer}>{MOBILE_EVIDENCE_DISCLAIMER}</Text>

      <View style={styles.actions}>
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
  summary: { color: c.text.primary, fontSize: 14, fontWeight: '600', marginTop: s.xs },
  list: { marginTop: s.sm, gap: s.sm },
  item: { gap: 2 },
  insightLabel: { color: c.text.primary, fontSize: 14, fontWeight: '700' },
  recLabel: { color: c.text.primary, fontSize: 14, fontWeight: '700' },
  why: { color: c.text.secondary, fontSize: 13 },
  disclaimer: { color: c.text.muted, fontSize: 12, marginTop: s.sm, lineHeight: 18 },
  actions: { marginTop: s.sm, gap: s.sm },
});

export default MobileEvidenceInsightCard;
