import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraTaskCard } from '../components/AuroraTaskCard.js';
import { AuroraTextInput } from '../components/AuroraTextInput.js';
import { AuroraProgressBar } from '../components/AuroraProgressBar.js';
import {
  getCurrentTask,
  getCompletionSummary,
  canFinishMobileDay,
} from '../core/mobileCoreLoop.js';

// Daily Focus shows exactly ONE task at a time — never the whole task list.
export function DailyFocusScreen({
  loopState, onProofChange, onMarkDone, onNext, onPrevious, onFinishDay, onExit,
}) {
  const current = getCurrentTask(loopState);
  const summary = getCompletionSummary(loopState);
  const canFinish = canFinishMobileDay(loopState);

  if (!current) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.title}>No tasks for today.</Text>
      </ScrollView>
    );
  }

  const proofText = current.state.proofText || '';
  const proofRequired = !!current.requiresProof;
  const proofMissing = proofRequired && !proofText.trim();
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
        done={current.state.done}
      >
        {proofRequired ? (
          <View style={styles.proofBlock}>
            <Text style={styles.proofLabel}>Text proof or reflection (local only)</Text>
            <AuroraTextInput
              value={proofText}
              onChangeText={text => onProofChange(current.id, text)}
              placeholder="Describe what you actually did today"
            />
          </View>
        ) : null}
      </AuroraTaskCard>

      <View style={styles.actions}>
        <AuroraButton label="Previous" variant="ghost" onPress={onPrevious} />
        <AuroraButton
          label={current.state.done ? 'Done' : doneLabel}
          variant="primary"
          disabled={current.state.done || proofMissing}
          onPress={() => onMarkDone(current.id)}
        />
        <AuroraButton label="Next task" variant="secondary" onPress={onNext} />
      </View>

      <AuroraButton
        label="Finish day"
        variant="secondary"
        disabled={!canFinish}
        onPress={onFinishDay}
      />
      <AuroraButton label="Back to Today" variant="ghost" onPress={onExit} />

      <Text style={styles.note}>Proof and reflections stay on this device. Mobile sync is not connected yet.</Text>
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
  proofBlock: { gap: auroraTheme.spacing.xs, marginTop: auroraTheme.spacing.sm },
  proofLabel: { color: c.text.muted, fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: auroraTheme.spacing.sm, justifyContent: 'space-between' },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default DailyFocusScreen;
