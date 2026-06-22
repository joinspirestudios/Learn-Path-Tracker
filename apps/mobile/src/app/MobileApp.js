// Mobile app shell.
//
// A simple internal tab-state shell — no navigation library yet. Renders a top
// header, the active tab's screen, and an accessible bottom tab bar. Mobile-first
// only: there is no desktop side nav here.

import React, { useState } from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { MOBILE_TABS } from '../navigation/mobileTabs.js';
import { TodayScreen } from '../screens/TodayScreen.js';
import { PathsScreen } from '../screens/PathsScreen.js';
import { DiscoverScreen } from '../screens/DiscoverScreen.js';
import { ProgressScreen } from '../screens/ProgressScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';

const TAB_SCREENS = {
  today: TodayScreen,
  paths: PathsScreen,
  discover: DiscoverScreen,
  progress: ProgressScreen,
  profile: ProfileScreen,
};

export function MobileApp() {
  const [activeTab, setActiveTab] = useState('today');
  const ActiveScreen = TAB_SCREENS[activeTab] || TodayScreen;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Learn Path Tracker</Text>
        <Text style={styles.headerSubtitle}>Mobile foundation</Text>
      </View>

      <View style={styles.content}>
        <ActiveScreen />
      </View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        {MOBILE_TABS.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => setActiveTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              style={styles.tabButton}
            >
              <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : null]}>
                {tab.label}
              </Text>
              <View style={[styles.tabIndicator, isActive ? styles.tabIndicatorActive : null]} />
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const c = auroraTheme.colors;
const s = auroraTheme.spacing;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: c.surface.canvas },
  header: {
    paddingHorizontal: auroraTheme.layout.screenPadding,
    paddingVertical: s.md,
    borderBottomColor: c.border.subtle,
    borderBottomWidth: 1,
    backgroundColor: c.surface.panel,
  },
  headerTitle: { color: c.text.primary, fontSize: 18, fontWeight: '700' },
  headerSubtitle: { color: c.text.muted, fontSize: 12, marginTop: 2 },
  content: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    borderTopColor: c.border.subtle,
    borderTopWidth: 1,
    backgroundColor: c.surface.panel,
  },
  tabButton: {
    flex: 1,
    minHeight: auroraTheme.layout.controlHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: s.sm,
  },
  tabLabel: { color: c.text.secondary, fontSize: 12, fontWeight: '600' },
  tabLabelActive: { color: c.text.primary, fontWeight: '800' },
  tabIndicator: {
    marginTop: 4,
    height: 3,
    width: 20,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  tabIndicatorActive: { backgroundColor: c.accent.progress },
});

export default MobileApp;
