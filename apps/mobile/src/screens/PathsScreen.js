import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { MobilePathCard } from '../components/MobilePathCard.js';
import { AuroraLoadingState } from '../components/AuroraLoadingState.js';
import { AuroraErrorState } from '../components/AuroraErrorState.js';
import { AuroraEmptyState } from '../components/AuroraEmptyState.js';
import { ASYNC_STATUS } from '../core/mobileCloudState.js';
import { getTodaySummary } from '../core/mobileCoreLoop.js';

export function PathsScreen({
  loopState, signedIn, pathsState, onReload, onSelectPath, onOpenRoadmap, onOpenLocalToday,
}) {
  const local = getTodaySummary(loopState);
  const state = pathsState || { status: ASYNC_STATUS.IDLE, items: [], error: '' };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Paths</Text>

      {/* Local demo path — never mixed into cloud workspace as if synced. */}
      <Text style={styles.sectionTitle}>Local session</Text>
      <MobilePathCard
        path={{
          id: 'local', title: local.pathTitle, description: 'Local starter path on this device.',
          durationLabel: 'Day ' + local.dayNumber, categoryLabel: '', intensityLabel: '',
          taskCount: local.totalTasks, sectionCount: 0, creatorName: '', isLocal: true, isCloud: false,
        }}
        onPress={onOpenLocalToday}
      />

      <Text style={styles.sectionTitle}>Cloud paths</Text>
      {!signedIn ? (
        <AuroraEmptyState title="Sign in to load cloud paths" message="Your owned paths appear here once signed in." />
      ) : state.status === ASYNC_STATUS.LOADING ? (
        <AuroraLoadingState message="Loading your paths…" />
      ) : state.status === ASYNC_STATUS.ERROR ? (
        <AuroraErrorState message={state.error} onRetry={onReload} />
      ) : state.status === ASYNC_STATUS.EMPTY ? (
        <AuroraEmptyState title="No cloud paths yet" message="Paths you own appear here. Membership loading is coming next." />
      ) : (
        state.items.map(path => (
          <View key={path.id} style={styles.pathBlock}>
            <MobilePathCard path={path} onPress={() => onSelectPath && onSelectPath(path)} />
            <AuroraButton label="View roadmap" variant="secondary" onPress={() => onOpenRoadmap(path)} />
          </View>
        ))
      )}

      <Text style={styles.note}>
        Cloud paths are read-only here. Daily sync is coming next; nothing is synced or published yet.
      </Text>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  sectionTitle: { color: c.text.primary, fontSize: 16, fontWeight: '700' },
  pathBlock: { gap: auroraTheme.spacing.xs },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default PathsScreen;
