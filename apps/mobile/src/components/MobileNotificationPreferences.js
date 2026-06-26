import React, { useState } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from './AuroraButton.js';
import { AuroraTextInput } from './AuroraTextInput.js';
import { normalizeMobileNotificationPreferences } from '../core/mobileNotificationPreferences.js';

function Row({ label, description, value, onValueChange }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {description ? <Text style={styles.rowDesc}>{description}</Text> : null}
      </View>
      <Switch value={!!value} onValueChange={onValueChange} />
    </View>
  );
}

// Mobile notification preferences. Local notifications + daily reminders are OFF
// by default; enabling mobile reminders triggers the OS permission request in
// the parent (onEnableLocal). Never renders tokens or private data.
export function MobileNotificationPreferences({ preferences, busy, status, onSave, onEnableLocal }) {
  const [draft, setDraft] = useState(() => normalizeMobileNotificationPreferences(preferences || {}));

  function set(key, value) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  async function setMobileLocal(value) {
    if (value && typeof onEnableLocal === 'function') {
      const granted = await onEnableLocal();
      set('mobileLocalEnabled', !!granted);
      return;
    }
    set('mobileLocalEnabled', value);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Notifications</Text>
      <Text style={styles.sub}>Reminders are off until you turn them on. We never send spam.</Text>

      <Row label="In-app notifications" description="Show notifications in the app."
        value={draft.inAppEnabled} onValueChange={v => set('inAppEnabled', v)} />

      <Row label="Mobile reminders" description="Allow on-device reminders (asks permission)."
        value={draft.mobileLocalEnabled} onValueChange={setMobileLocal} />

      <Row label="Daily reminder" description="A gentle nudge to do today."
        value={draft.dailyReminderEnabled} onValueChange={v => set('dailyReminderEnabled', v)} />

      {draft.dailyReminderEnabled ? (
        <View>
          <Text style={styles.fieldLabel}>Reminder time (HH:MM)</Text>
          <AuroraTextInput
            value={draft.dailyReminderTime}
            onChangeText={v => set('dailyReminderTime', v)}
            placeholder="09:00"
            multiline={false}
          />
        </View>
      ) : null}

      <Row label="Streak-risk alerts" description="Warn me when my streak is at risk."
        value={draft.streakRiskEnabled} onValueChange={v => set('streakRiskEnabled', v)} />

      <Row label="Proof upload alerts" description="Pending or failed proof uploads."
        value={draft.proofUploadEnabled} onValueChange={v => set('proofUploadEnabled', v)} />

      <Row label="Public progress interactions" description="Respect or comments on your public progress."
        value={draft.publicProgressInteractionEnabled} onValueChange={v => set('publicProgressInteractionEnabled', v)} />

      <Row label="Quiet hours" description="Pause reminders during these hours."
        value={draft.quietHoursEnabled} onValueChange={v => set('quietHoursEnabled', v)} />

      {draft.quietHoursEnabled ? (
        <View style={styles.timeRow}>
          <View style={styles.timeCol}>
            <Text style={styles.fieldLabel}>From</Text>
            <AuroraTextInput value={draft.quietHoursStart} onChangeText={v => set('quietHoursStart', v)} placeholder="22:00" multiline={false} />
          </View>
          <View style={styles.timeCol}>
            <Text style={styles.fieldLabel}>To</Text>
            <AuroraTextInput value={draft.quietHoursEnd} onChangeText={v => set('quietHoursEnd', v)} placeholder="07:00" multiline={false} />
          </View>
        </View>
      ) : null}

      {status ? <Text style={styles.status}>{status}</Text> : null}
      <AuroraButton label={busy ? 'Saving…' : 'Save preferences'} onPress={() => onSave && onSave(draft)} disabled={busy} />
    </View>
  );
}

const c = auroraTheme.colors;
const s = auroraTheme.spacing;
const styles = StyleSheet.create({
  wrap: { gap: s.sm },
  heading: { color: c.text.primary, fontSize: 16, fontWeight: '800' },
  sub: { color: c.text.muted, fontSize: 12, marginBottom: s.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  rowText: { flex: 1, paddingRight: s.sm },
  rowLabel: { color: c.text.primary, fontSize: 14, fontWeight: '600' },
  rowDesc: { color: c.text.muted, fontSize: 12 },
  timeRow: { flexDirection: 'row', gap: s.sm },
  timeCol: { flex: 1 },
  fieldLabel: { color: c.text.muted, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  status: { color: c.text.secondary, fontSize: 12 },
});

export default MobileNotificationPreferences;
