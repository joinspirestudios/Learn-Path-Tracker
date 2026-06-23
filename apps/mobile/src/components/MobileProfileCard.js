import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { safePublicProfile } from '../core/mobileProfileMappers.js';

// Safe public profile preview. Shows only public-safe fields; never tokens/email.
export function MobileProfileCard({ profile }) {
  const safe = safePublicProfile(profile) || {};
  return (
    <View style={styles.card}>
      {safe.coverURL ? <Image source={{ uri: safe.coverURL }} style={styles.cover} /> : null}
      <View style={styles.head}>
        {safe.avatarURL
          ? <Image source={{ uri: safe.avatarURL }} style={styles.avatar} />
          : <View style={[styles.avatar, styles.avatarEmpty]} />}
        <View style={styles.headText}>
          <Text style={styles.name}>{safe.displayName || 'Your name'}</Text>
          {safe.username ? <Text style={styles.handle}>@{safe.username}</Text> : null}
        </View>
      </View>
      {safe.bio ? <Text style={styles.bio}>{safe.bio}</Text> : null}
    </View>
  );
}

const c = auroraTheme.colors;
const styles = StyleSheet.create({
  card: {
    backgroundColor: c.surface.panel, borderColor: c.border.subtle, borderWidth: 1,
    borderRadius: auroraTheme.radius.panel, padding: auroraTheme.layout.cardPadding, gap: auroraTheme.spacing.sm,
  },
  cover: { width: '100%', height: 88, borderRadius: auroraTheme.radius.card, backgroundColor: c.surface.raised },
  head: { flexDirection: 'row', alignItems: 'center', gap: auroraTheme.spacing.md },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surface.raised },
  avatarEmpty: { borderWidth: 1, borderColor: c.border.subtle },
  headText: { flexShrink: 1 },
  name: { color: c.text.primary, fontSize: 18, fontWeight: '700' },
  handle: { color: c.text.muted, fontSize: 13 },
  bio: { color: c.text.secondary, fontSize: 14, lineHeight: 20 },
});

export default MobileProfileCard;
