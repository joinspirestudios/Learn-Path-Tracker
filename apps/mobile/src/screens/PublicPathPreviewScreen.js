import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraCard } from '../components/AuroraCard.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraStatusPill } from '../components/AuroraStatusPill.js';
import { AuroraLoadingState } from '../components/AuroraLoadingState.js';
import { AuroraErrorState } from '../components/AuroraErrorState.js';
import { AuroraEmptyState } from '../components/AuroraEmptyState.js';
import { ASYNC_STATUS } from '../core/mobileCloudState.js';

// Preview-first public path view. Mobile join is NOT implemented yet — no
// membership writes, no fake counts, no trust metrics.
export function PublicPathPreviewScreen({ previewState, onBack }) {
  const state = previewState || { status: ASYNC_STATUS.IDLE, items: [], error: '' };
  const preview = state.items && state.items[0];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Public preview</Text>

      {state.status === ASYNC_STATUS.LOADING ? (
        <AuroraLoadingState message="Loading preview…" />
      ) : state.status === ASYNC_STATUS.ERROR ? (
        <AuroraErrorState message={state.error} />
      ) : !preview ? (
        <AuroraEmptyState title="Preview unavailable" message="We could not load this path preview yet." />
      ) : (
        <>
          <View style={styles.headRow}>
            <Text style={styles.title}>{preview.title}</Text>
            <AuroraStatusPill label={preview.visibility === 'public' ? 'Public' : preview.visibility} tone="progress" />
          </View>
          {preview.creatorName ? <Text style={styles.creator}>By {preview.creatorName}</Text> : null}
          <AuroraCard>
            {preview.description ? <Text style={styles.body}>{preview.description}</Text> : null}
            <Text style={styles.meta}>
              {[preview.durationLabel, preview.categoryLabel, preview.intensityLabel].filter(Boolean).join(' · ')}
            </Text>
            {(preview.sectionCount || preview.taskCount) ? (
              <Text style={styles.meta}>
                {[preview.sectionCount ? preview.sectionCount + ' sections' : '', preview.taskCount ? preview.taskCount + ' tasks' : ''].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </AuroraCard>
          <AuroraButton label="Join coming soon" variant="secondary" disabled />
          <Text style={styles.note}>Joining a path on mobile is coming next. For now, join on the web.</Text>
        </>
      )}

      <AuroraButton label="Back to discover" variant="ghost" onPress={onBack} />
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: c.text.primary, fontSize: 22, fontWeight: '700', flexShrink: 1 },
  creator: { color: c.text.muted, fontSize: 13, fontStyle: 'italic' },
  body: { color: c.text.secondary, fontSize: 14, lineHeight: 20 },
  meta: { color: c.text.muted, fontSize: 12 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default PublicPathPreviewScreen;
