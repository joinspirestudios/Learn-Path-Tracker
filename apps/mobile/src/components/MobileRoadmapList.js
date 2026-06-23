import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';

// Renders a read-only roadmap (sections/blocks + tasks) from normalized data.
// Status reflects only loaded data; no dates/progress/completion are invented.
export function MobileRoadmapList({ roadmap }) {
  const blocks = (roadmap && roadmap.daysOrSections) || [];
  return (
    <View style={styles.wrap}>
      {blocks.map(block => (
        <View key={block.id} style={styles.block}>
          <Text style={styles.blockTitle}>{block.title}</Text>
          {(block.tasks || []).map(task => (
            <View key={task.id} style={styles.taskRow}>
              <Text style={styles.taskTitle}>{task.title}</Text>
              {task.requiresProof ? <Text style={styles.proof}>Proof</Text> : null}
            </View>
          ))}
          {(!block.tasks || !block.tasks.length) ? (
            <Text style={styles.empty}>No tasks loaded for this block.</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  wrap: { gap: auroraTheme.spacing.md },
  block: {
    backgroundColor: c.surface.panel,
    borderColor: c.border.subtle,
    borderWidth: 1,
    borderRadius: auroraTheme.radius.card,
    padding: auroraTheme.layout.cardPadding,
    gap: auroraTheme.spacing.xs,
  },
  blockTitle: { color: c.text.primary, fontSize: 15, fontWeight: '700' },
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskTitle: { color: c.text.secondary, fontSize: 13, flexShrink: 1 },
  proof: { color: c.accent.proof, fontSize: 11, fontWeight: '800' },
  empty: { color: c.text.muted, fontSize: 12 },
});

export default MobileRoadmapList;
