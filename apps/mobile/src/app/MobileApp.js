// Mobile app shell + local core-loop wiring.
//
// Holds the local mobile session state (React state only — no persistence
// dependency, no backend calls) and routes the Today tab through the
// Today -> Daily Focus -> Completion Result flow. Bottom tabs remain simple
// internal state; no navigation library.

import React, { useState } from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { MOBILE_TABS } from '../navigation/mobileTabs.js';
import {
  createInitialMobileLoopState,
  startTodaySession,
  markTaskDone,
  addTextProof,
  goToNextTask,
  goToPreviousTask,
  finishMobileDay,
} from '../core/mobileCoreLoop.js';
import { TodayScreen } from '../screens/TodayScreen.js';
import { DailyFocusScreen } from '../screens/DailyFocusScreen.js';
import { CompletionResultScreen } from '../screens/CompletionResultScreen.js';
import { PathsScreen } from '../screens/PathsScreen.js';
import { PathRoadmapScreen } from '../screens/PathRoadmapScreen.js';
import { DiscoverScreen } from '../screens/DiscoverScreen.js';
import { ProgressScreen } from '../screens/ProgressScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';

export function MobileApp() {
  const [loopState, setLoopState] = useState(() => createInitialMobileLoopState());
  const [activeTab, setActiveTab] = useState('today');
  const [activeFlow, setActiveFlow] = useState('today'); // today | focus | completion
  const [pathView, setPathView] = useState('list'); // list | roadmap

  const currentTaskId = loopState.tasks[loopState.session.currentTaskIndex]?.id;

  function handleStartToday() {
    setLoopState(s => startTodaySession(s));
    setActiveFlow('focus');
  }
  function handleContinueDay() {
    setActiveFlow('focus');
  }
  function handleViewResult() {
    setActiveFlow('completion');
  }
  function handleProofChange(taskId, text) {
    setLoopState(s => addTextProof(s, taskId, text));
  }
  function handleMarkDone(taskId) {
    setLoopState(s => markTaskDone(s, taskId));
  }
  function handleNext() {
    setLoopState(s => goToNextTask(s));
  }
  function handlePrev() {
    setLoopState(s => goToPreviousTask(s));
  }
  function handleFinishDay() {
    setLoopState(s => finishMobileDay(s));
    setActiveFlow('completion');
  }
  function handleBackToToday() {
    setActiveTab('today');
    setActiveFlow('today');
  }
  function handleReviewPath() {
    setActiveTab('paths');
    setPathView('roadmap');
  }

  function renderTodayTab() {
    if (activeFlow === 'focus') {
      return (
        <DailyFocusScreen
          loopState={loopState}
          onProofChange={handleProofChange}
          onMarkDone={handleMarkDone}
          onNext={handleNext}
          onPrevious={handlePrev}
          onFinishDay={handleFinishDay}
          onExit={handleBackToToday}
        />
      );
    }
    if (activeFlow === 'completion') {
      return (
        <CompletionResultScreen
          loopState={loopState}
          onBackToToday={handleBackToToday}
          onReviewPath={handleReviewPath}
        />
      );
    }
    return (
      <TodayScreen
        loopState={loopState}
        onStartToday={handleStartToday}
        onContinueDay={handleContinueDay}
        onViewResult={handleViewResult}
        onReviewPath={handleReviewPath}
      />
    );
  }

  function renderActiveContent() {
    if (activeTab === 'today') return renderTodayTab();
    if (activeTab === 'paths') {
      if (pathView === 'roadmap') {
        return (
          <PathRoadmapScreen
            loopState={loopState}
            onBack={() => setPathView('list')}
            onOpenToday={handleBackToToday}
          />
        );
      }
      return (
        <PathsScreen
          loopState={loopState}
          onOpenRoadmap={() => setPathView('roadmap')}
          onOpenToday={handleBackToToday}
        />
      );
    }
    if (activeTab === 'discover') return <DiscoverScreen />;
    if (activeTab === 'progress') return <ProgressScreen />;
    if (activeTab === 'profile') return <ProfileScreen loopState={loopState} />;
    return renderTodayTab();
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Learn Path Tracker</Text>
        <Text style={styles.headerSubtitle}>Local mobile session</Text>
      </View>

      <View style={styles.content}>{renderActiveContent()}</View>

      <View style={styles.tabBar} accessibilityRole="tablist">
        {MOBILE_TABS.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => { setActiveTab(tab.id); if (tab.id === 'paths') setPathView('list'); }}
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
