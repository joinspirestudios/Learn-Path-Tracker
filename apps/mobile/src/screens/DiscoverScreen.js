import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraTextInput } from '../components/AuroraTextInput.js';
import { AuroraButton } from '../components/AuroraButton.js';
import { MobilePathCard } from '../components/MobilePathCard.js';
import { AuroraLoadingState } from '../components/AuroraLoadingState.js';
import { AuroraErrorState } from '../components/AuroraErrorState.js';
import { AuroraEmptyState } from '../components/AuroraEmptyState.js';
import { ASYNC_STATUS } from '../core/mobileCloudState.js';

// Public discovery. Only public + discoverable paths. No social graph, no
// vanity counts, no public-progress feed, and no joining in this phase.
export function DiscoverScreen({
  configured, discoveryState, query, onQueryChange, onSearch, onReload, onPreview,
}) {
  const state = discoveryState || { status: ASYNC_STATUS.IDLE, items: [], error: '' };

  if (!configured) {
    return (
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>Discover</Text>
        <AuroraEmptyState
          title="Cloud discovery is not configured yet"
          message="Public path discovery needs the mobile cloud connection."
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.kicker}>Discover</Text>
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <AuroraTextInput
            value={query}
            onChangeText={onQueryChange}
            placeholder="Search public paths"
            multiline={false}
            autoCapitalize="none"
          />
        </View>
        <AuroraButton label="Search" variant="primary" onPress={onSearch} />
      </View>

      {state.status === ASYNC_STATUS.IDLE ? (
        <AuroraButton label="Load public paths" variant="secondary" onPress={onReload} />
      ) : state.status === ASYNC_STATUS.LOADING ? (
        <AuroraLoadingState message="Loading public paths…" />
      ) : state.status === ASYNC_STATUS.ERROR ? (
        <AuroraErrorState message={state.error} onRetry={onReload} />
      ) : state.status === ASYNC_STATUS.EMPTY ? (
        <AuroraEmptyState title="No public paths found" message="Try a different search." />
      ) : (
        state.items.map(card => (
          <MobilePathCard key={card.id} path={card} onPress={() => onPreview && onPreview(card)} />
        ))
      )}

      <Text style={styles.note}>Only public, discoverable paths are shown. No vanity counts.</Text>
    </ScrollView>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: c.surface.canvas },
  content: { padding: auroraTheme.layout.screenPadding, gap: auroraTheme.spacing.md },
  kicker: { color: c.text.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  searchRow: { flexDirection: 'row', gap: auroraTheme.spacing.sm, alignItems: 'center' },
  searchInput: { flex: 1 },
  note: { color: c.text.muted, fontSize: 12, lineHeight: 18 },
});

export default DiscoverScreen;
