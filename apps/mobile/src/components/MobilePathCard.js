import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { AuroraStatusPill } from './AuroraStatusPill.js';

// Renders a normalized path card (cloud or local). Shows only safe metadata —
// no private evidence, no fake public metrics.
export function MobilePathCard({ path, onPress }) {
  const meta = [path.durationLabel, path.categoryLabel, path.intensityLabel].filter(Boolean).join(' · ');
  const counts = [];
  if (path.sectionCount) counts.push(path.sectionCount + ' sections');
  if (path.taskCount) counts.push(path.taskCount + ' tasks');

  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.card}>
      <View style={styles.headRow}>
        <Text style={styles.title}>{path.title}</Text>
        <AuroraStatusPill
          label={path.isLocal ? 'Local only' : 'Cloud path'}
          tone={path.isLocal ? 'muted' : 'progress'}
        />
      </View>
      {path.description ? <Text style={styles.desc} numberOfLines={2}>{path.description}</Text> : null}
      {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      {counts.length ? <Text style={styles.meta}>{counts.join(' · ')}</Text> : null}
      {path.creatorName ? <Text style={styles.creator}>By {path.creatorName}</Text> : null}
    </Pressable>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  card: {
    backgroundColor: c.surface.panel,
    borderColor: c.border.subtle,
    borderWidth: 1,
    borderRadius: auroraTheme.radius.card,
    padding: auroraTheme.layout.cardPadding,
    gap: auroraTheme.spacing.xs,
  },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: auroraTheme.spacing.sm },
  title: { color: c.text.primary, fontSize: 16, fontWeight: '700', flexShrink: 1 },
  desc: { color: c.text.secondary, fontSize: 13, lineHeight: 19 },
  meta: { color: c.text.muted, fontSize: 12 },
  creator: { color: c.text.muted, fontSize: 12, fontStyle: 'italic' },
});

export default MobilePathCard;
