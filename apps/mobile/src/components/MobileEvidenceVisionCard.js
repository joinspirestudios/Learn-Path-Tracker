import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from './AuroraCard.js';
import { AuroraButton } from './AuroraButton.js';
import { AuroraStatusPill } from './AuroraStatusPill.js';
import {
  normalizeMobileVisionDraft, mobileVisionSummary, mobileVisionDisabledCopy,
  MOBILE_VISION_CONSENT_COPY, MOBILE_VISION_DISCLAIMER,
} from '../core/mobileEvidenceVision.js';

// Compact Gemini Vision card. Shows availability, a consent step before analysis,
// and a private vision insight draft (appears-to-show / needs-context / suggested
// caption). Never publishes, never changes visibility, never renders raw image
// URLs/storage paths/localUri/tokens, never claims verification.
export function MobileEvidenceVisionCard({ available = false, draft = null, loading = false, disabledReason = '', onAnalyze, onDismiss }) {
  const [consenting, setConsenting] = useState(false);
  const o = draft ? normalizeMobileVisionDraft(draft) : null;

  return (
    <AuroraCard>
      <View style={styles.head}>
        <Text style={styles.kicker}>Vision insight</Text>
        <AuroraStatusPill label={available ? 'Available' : 'Not enabled'} tone={available ? 'progress' : 'muted'} />
      </View>

      {loading ? (
        <Text style={styles.body}>Looking at your proof image…</Text>
      ) : o ? (
        <View style={styles.draft}>
          <AuroraStatusPill label="Private insight" tone="muted" />
          <Text style={styles.appears}>Appears to show: {mobileVisionSummary(o)}</Text>
          {o.needsMoreContext ? <Text style={styles.needs}>Needs more context.</Text> : null}
          {o.suggestedCaption ? <Text style={styles.caption}>Suggested caption: {o.suggestedCaption}</Text> : null}
          <Text style={styles.review}>Review before sharing. Nothing is published.</Text>
        </View>
      ) : disabledReason ? (
        <Text style={styles.body}>{mobileVisionDisabledCopy(disabledReason)}</Text>
      ) : consenting ? (
        <View style={styles.consent}>
          <Text style={styles.consentCopy}>{MOBILE_VISION_CONSENT_COPY}</Text>
          <View style={styles.actions}>
            <AuroraButton label="Analyze image" variant="secondary" onPress={() => { setConsenting(false); if (onAnalyze) onAnalyze(); }} />
            <AuroraButton label="Not now" variant="secondary" onPress={() => setConsenting(false)} />
          </View>
        </View>
      ) : available ? (
        <AuroraButton label="Analyze image with AI" variant="secondary" onPress={() => setConsenting(true)} />
      ) : (
        <Text style={styles.body}>Vision analysis is not enabled yet.</Text>
      )}

      <Text style={styles.disclaimer}>{MOBILE_VISION_DISCLAIMER}</Text>

      {o ? <AuroraButton label="Dismiss" variant="secondary" onPress={onDismiss} /> : null}
    </AuroraCard>
  );
}

const c = auroraTheme.colors;
const s = auroraTheme.spacing;
const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  body: { color: c.text.secondary, fontSize: 13, marginTop: s.sm },
  draft: { gap: 4, marginTop: s.sm },
  appears: { color: c.text.primary, fontSize: 14, fontWeight: '600' },
  needs: { color: c.accent.progress, fontSize: 13 },
  caption: { color: c.text.secondary, fontSize: 13 },
  review: { color: c.text.muted, fontSize: 12, marginTop: 2 },
  consent: { gap: s.sm, marginTop: s.sm },
  consentCopy: { color: c.text.secondary, fontSize: 13, lineHeight: 19 },
  actions: { gap: s.sm },
  disclaimer: { color: c.text.muted, fontSize: 12, marginTop: s.sm, lineHeight: 18 },
});

export default MobileEvidenceVisionCard;
