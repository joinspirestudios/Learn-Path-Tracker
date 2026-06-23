import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { AuroraStatusPill } from '../components/AuroraStatusPill.js';
import { MobileRoadmapList } from '../components/MobileRoadmapList.js';
import { AuroraLoadingState } from '../components/AuroraLoadingState.js';
import { AuroraErrorState } from '../components/AuroraErrorState.js';
import { AuroraEmptyState } from '../components/AuroraEmptyState.js';
import { ASYNC_STATUS } from '../core/mobileCloudState.js';

// Read-only cloud roadmap. No invented dates/progress/completion.
export function PathRoadmapScreen({ roadmapState, selectedPath, activeDaySynced, onBack, onOpenToday }) {
  const state = roadmapState || { status: ASYNC_STATUS.IDLE, items: [], error: '' };
  const roadmap = state.items && state.items[0];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Roadmap</Text>
      <View style={styles.headRow}>
        <Text style={styles.title}>{(roadmap && roadmap.title) || (selectedPath && selectedPath.title) || 'Path'}</Text>
        <AuroraStatusPill label="Read-only" tone="muted" />
      </View>

      {state.status === ASYNC_STATUS.LOADING ? (
        <AuroraLoadingState message="Loading roadmap…" />
      ) : state.status === ASYNC_STATUS.ERROR ? (
        <AuroraErrorState message={state.error} />
      ) : !roadmap ? (
        <AuroraEmptyState title="Roadmap unavailable" message="We could not load this roadmap yet." />
      ) : (
        <>
          {roadmap.description ? <Text style={styles.desc}>{roadmap.description}</Text> : null}
          {activeDaySynced ? (
            <Text style={styles.synced}>Your active day for this path is synced to your private cloud record.</Text>
          ) : null}
          <MobileRoadmapList roadmap={roadmap} />
          <Text style={styles.note}>Cloud daily sessions are coming next. This roadmap is read-only and shows no invented progress.</Text>
        </>
      )}

      <AuroraButton label="Back to paths" variant="ghost" onPress={onBack} />
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
  desc: { color: c.text.secondary, fontSize: 14, lineHeight: 20 },
  synced: { color: c.accent.proof, fontSize: 13, lineHeight: 19 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default PathRoadmapScreen;
