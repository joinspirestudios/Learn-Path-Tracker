import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraTaskCard } from '../components/AuroraTaskCard.js';
import { AuroraProgressBar } from '../components/AuroraProgressBar.js';
import { MobileProofInput } from '../components/MobileProofInput.js';
import {
  getCurrentTask, getCompletionSummary, canFinishMobileDay,
} from '../core/mobileCoreLoop.js';
import { isValidProofUrl } from '../core/mobileProofMappers.js';

// Daily Focus shows exactly ONE task at a time — never the whole task list.
// Proof is text or link only (no files/camera/audio), saved privately.
export function DailyFocusScreen({
  loopState, onProofChange, onProofUrlChange, onReflectionChange,
  onMarkDone, onNext, onPrevious, onFinishDay, onExit,
}) {
  const current = getCurrentTask(loopState);
  const summary = getCompletionSummary(loopState);
  const canFinish = canFinishMobileDay(loopState);
  const [proofType, setProofType] = useState('text');

  if (!current) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>No tasks for today.</Text>
      </ScrollView>
    );
  }

  const st = current.state;
  const proofText = st.proofText || '';
  const proofUrl = st.proofUrl || '';
  const reflection = st.reflection || '';
  const proofRequired = !!current.requiresProof;
  const hasValidProof = proofText.trim() !== '' || isValidProofUrl(proofUrl);
  const proofMissing = proofRequired && !hasValidProof;
  const doneLabel = proofRequired ? 'Save proof and mark done' : 'Mark as done';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.contextRow}>
        <Text style={styles.context}>{loopState.path.title}</Text>
        <Text style={styles.context}>Day {loopState.path.dayNumber}</Text>
      </View>
      <Text style={styles.position}>Task {current.position} of {current.total}</Text>
      <AuroraProgressBar value={summary.score} />

      <AuroraTaskCard
        title={current.title}
        description={current.description}
        requiresProof={proofRequired}
        done={st.done}
      >
        {(proofRequired || proofText || proofUrl) ? (
          <MobileProofInput
            proofType={proofType}
            onProofTypeChange={setProofType}
            proofText={proofText}
            onProofTextChange={text => onProofChange(current.id, text)}
            proofUrl={proofUrl}
            onProofUrlChange={url => onProofUrlChange(current.id, url)}
            reflection={reflection}
            onReflectionChange={text => onReflectionChange(current.id, text)}
          />
        ) : null}
      </AuroraTaskCard>

      <View style={styles.actions}>
        <AuroraButton label="Previous" variant="ghost" onPress={onPrevious} />
        <AuroraButton
          label={st.done ? 'Done' : doneLabel}
          variant="primary"
          disabled={st.done || proofMissing}
          onPress={() => onMarkDone(current.id)}
        />
        <AuroraButton label="Next task" variant="secondary" onPress={onNext} />
      </View>

      <AuroraButton label="Finish day" variant="secondary" disabled={!canFinish} onPress={onFinishDay} />
      <AuroraButton label="Back to Today" variant="ghost" onPress={onExit} />

      <Text style={styles.note}>Proof and reflections stay private on this device until you sync.</Text>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  contextRow: { flexDirection: 'row', justifyContent: 'space-between' },
  context: { color: c.text.secondary, fontSize: 13, fontWeight: '700' },
  position: { color: c.text.muted, fontSize: 12, fontWeight: '700' },
  title: { color: c.text.primary, fontSize: 18, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: auroraTheme.spacing.sm, justifyContent: 'space-between' },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default DailyFocusScreen;
