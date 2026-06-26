import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraTaskCard } from '../components/AuroraTaskCard.js';
import { AuroraProgressBar } from '../components/AuroraProgressBar.js';
import { AuroraStatusPill } from '../components/AuroraStatusPill.js';
import { MobileProofInput } from '../components/MobileProofInput.js';
import { MobileMediaProofPicker } from '../components/MobileMediaProofPicker.js';
import { MobileProofDraftCard } from '../components/MobileProofDraftCard.js';
import {
  getCurrentTask, getCompletionSummary, canFinishMobileDay,
} from '../core/mobileCoreLoop.js';
import { isValidProofUrl } from '../core/mobileProofMappers.js';
import { UPLOAD_STATUS } from '../core/mobileProofUploadState.js';

// Daily Focus shows exactly ONE task at a time — never the whole task list.
// Proof is text, link, or UPLOADED image (library/camera). Draft-only local
// images are shown as pending and do not satisfy the task until uploaded.
export function DailyFocusScreen({
  loopState, signedIn,
  proofDraftsForTask, proofUploadError = '',
  onAddImageProof, onUploadDraft, onRetryDraft, onRemoveDraft,
  onProofChange, onProofUrlChange, onReflectionChange,
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
  const drafts = (typeof proofDraftsForTask === 'function' ? proofDraftsForTask(current.id) : []) || [];
  const hasUploadedMedia = !!(st.mediaProof && st.mediaProof.storagePath);
  const hasPendingDraft = drafts.some(d =>
    d.status === UPLOAD_STATUS.QUEUED || d.status === UPLOAD_STATUS.OFFLINE_QUEUED ||
    d.status === UPLOAD_STATUS.UPLOADING || d.status === UPLOAD_STATUS.FAILED);
  const hasValidProof = proofText.trim() !== '' || isValidProofUrl(proofUrl) || hasUploadedMedia;
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

        {/* Image proof (library or camera) — uploaded proof satisfies the task. */}
        {signedIn ? (
          <MobileMediaProofPicker onPicked={asset => onAddImageProof && onAddImageProof(current.id, asset)} />
        ) : (
          <Text style={styles.note}>Sign in to add image proof.</Text>
        )}
        {hasUploadedMedia ? <AuroraStatusPill label="Image proof submitted" tone="proof" /> : null}
        {drafts.map(d => (
          <MobileProofDraftCard
            key={d.id}
            draft={d}
            onRetry={() => onRetryDraft && onRetryDraft(d.id)}
            onRemove={() => onRemoveDraft && onRemoveDraft(d.id)}
          />
        ))}
        {hasPendingDraft ? <Text style={styles.pending}>Upload proof before syncing — upload pending.</Text> : null}
        {proofUploadError ? <Text style={styles.error}>{proofUploadError}</Text> : null}
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

      <Text style={styles.note}>Proof and reflections stay private on this device until you sync. Proof is submitted, not verified.</Text>
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
  pending: { color: c.accent.warning, fontSize: 12 },
  error: { color: c.accent.danger, fontSize: 12 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default DailyFocusScreen;
