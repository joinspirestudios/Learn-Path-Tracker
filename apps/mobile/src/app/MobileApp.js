// Mobile app shell — auth gate + local core loop + cloud reads + day sync.
//
// Phase 6.12: auth gate + read-only cloud paths/discovery/roadmap.
// Phase 6.13: real write path — sync a FINISHED local day to the user's private
// cloud day log, and (explicitly) publish a sanitized public progress summary
// via the existing API. No media/file upload, no auto-sync, no auto-publish.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { MOBILE_TABS } from '../navigation/mobileTabs.js';
import {
  createInitialMobileLoopState, startTodaySession, markTaskDone, addTextProof,
  addLinkProof, addTaskReflection, goToNextTask, goToPreviousTask, finishMobileDay,
} from '../core/mobileCoreLoop.js';
import {
  AUTH_STATUS, resolveAuthStatus, createAsyncState, asyncLoading, asyncLoaded, asyncError,
} from '../core/mobileCloudState.js';
import { SYNC_STATUS } from '../core/mobileSyncStatus.js';
import { buildDayLogPayload } from '../core/mobileDaySync.js';
import { buildPublicSummary } from '../core/mobilePublicProgressMappers.js';
import { createFirebaseClient } from '../services/firebaseClient.js';
import { createMobileAuthService } from '../services/authService.js';
import { createPathRepository } from '../services/pathRepository.js';
import { createDiscoveryRepository } from '../services/discoveryRepository.js';
import { createRoadmapRepository } from '../services/roadmapRepository.js';
import { createDayLogRepository } from '../services/dayLogRepository.js';
import { createMobilePublicProgressRepository } from '../services/mobilePublicProgressRepository.js';
import { createApiClient } from '../services/apiClient.js';
import { getMobileApiBaseUrl } from '../services/env.js';

import { AuthWelcomeScreen } from '../screens/AuthWelcomeScreen.js';
import { TodayScreen } from '../screens/TodayScreen.js';
import { DailyFocusScreen } from '../screens/DailyFocusScreen.js';
import { CompletionResultScreen } from '../screens/CompletionResultScreen.js';
import { PathsScreen } from '../screens/PathsScreen.js';
import { PathRoadmapScreen } from '../screens/PathRoadmapScreen.js';
import { DiscoverScreen } from '../screens/DiscoverScreen.js';
import { ProgressScreen } from '../screens/ProgressScreen.js';
import { ProfileScreen } from '../screens/ProfileScreen.js';
import { PublicPathPreviewScreen } from '../screens/PublicPathPreviewScreen.js';
import { AuroraLoadingState } from '../components/AuroraLoadingState.js';

export function MobileApp() {
  // Services (lazy Firebase; no network until used).
  const client = useMemo(() => createFirebaseClient({}), []);
  const authService = useMemo(() => createMobileAuthService({ client }), [client]);
  const gateway = useMemo(() => client.createFirestoreGateway(), [client]);
  const pathRepo = useMemo(() => createPathRepository({ gateway }), [gateway]);
  const discoveryRepo = useMemo(() => createDiscoveryRepository({ gateway }), [gateway]);
  const roadmapRepo = useMemo(() => createRoadmapRepository({ gateway }), [gateway]);
  const userGateway = useMemo(() => client.createUserDataGateway(), [client]);
  const dayLogRepo = useMemo(() => createDayLogRepository({ gateway: userGateway }), [userGateway]);
  const apiClient = useMemo(
    () => createApiClient({ baseUrl: getMobileApiBaseUrl(), getIdToken: () => authService.getIdToken() }),
    [authService],
  );
  const publicProgressRepo = useMemo(
    () => createMobilePublicProgressRepository({ apiClient }),
    [apiClient],
  );
  const configured = authService.isConfigured();

  // Auth state.
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(configured);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [localMode, setLocalMode] = useState(false);

  // Local core-loop state (Phase 6.11).
  const [loopState, setLoopState] = useState(() => createInitialMobileLoopState());
  const [activeTab, setActiveTab] = useState('today');
  const [activeFlow, setActiveFlow] = useState('today'); // today | focus | completion
  const [pathView, setPathView] = useState('list'); // list | roadmap | preview

  // Cloud read-only state.
  const [pathsState, setPathsState] = useState(createAsyncState());
  const [discoveryState, setDiscoveryState] = useState(createAsyncState());
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState(null);
  const [roadmapState, setRoadmapState] = useState(createAsyncState());
  const [previewState, setPreviewState] = useState(createAsyncState());

  // Day sync + publish state (Phase 6.13).
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.LOCAL_ONLY);
  const [syncError, setSyncError] = useState('');
  const [publishStatus, setPublishStatus] = useState(SYNC_STATUS.PUBLISH_AVAILABLE);
  const [publishError, setPublishError] = useState('');
  const [publicCaption, setPublicCaption] = useState('');
  const [lastDayLog, setLastDayLog] = useState(null);

  useEffect(() => {
    let active = true;
    let unsub = () => {};
    if (!configured) { setAuthLoading(false); return () => {}; }
    authService.subscribeAuthState(user => {
      if (!active) return;
      setAuthUser(user);
      setAuthLoading(false);
    }).then(fn => { if (active && typeof fn === 'function') unsub = fn; else if (typeof fn === 'function') fn(); });
    return () => { active = false; unsub(); };
  }, [authService, configured]);

  const authStatus = resolveAuthStatus({ configured, loading: authLoading, user: authUser });

  const loadUserPaths = useCallback(async () => {
    if (!authUser) return;
    setPathsState(asyncLoading());
    try {
      const items = await pathRepo.listUserPaths({ uid: authUser.uid });
      setPathsState(asyncLoaded(items));
    } catch {
      setPathsState(asyncError('We could not load your paths yet.'));
    }
  }, [authUser, pathRepo]);

  const loadDiscovery = useCallback(async (query = '') => {
    setDiscoveryState(asyncLoading());
    try {
      const items = await discoveryRepo.listPublicPaths({ filters: { query } });
      setDiscoveryState(asyncLoaded(items));
    } catch {
      setDiscoveryState(asyncError('We could not load public paths yet.'));
    }
  }, [discoveryRepo]);

  useEffect(() => {
    if (authStatus === AUTH_STATUS.SIGNED_IN) loadUserPaths();
  }, [authStatus, loadUserPaths]);

  // ── Auth handlers ──
  async function handleSignIn(email, password) {
    setAuthBusy(true); setAuthError('');
    const res = await authService.signIn(email, password);
    setAuthBusy(false);
    if (!res.ok) setAuthError(res.message || 'Check your email and password.');
  }
  async function handleCreateAccount(email, password) {
    setAuthBusy(true); setAuthError('');
    const res = await authService.createAccount(email, password);
    setAuthBusy(false);
    if (!res.ok) setAuthError(res.message || 'This account could not be created yet.');
  }
  async function handleSignOut() {
    await authService.signOut();
    setAuthUser(null);
    setActiveTab('today'); setActiveFlow('today');
  }

  // ── Local loop handlers (Phase 6.11) ──
  function handleStartToday() { setLoopState(s => startTodaySession(s)); setActiveFlow('focus'); }
  function handleContinueDay() { setActiveFlow('focus'); }
  function handleViewResult() { setActiveFlow('completion'); }
  function handleProofChange(taskId, text) { setLoopState(s => addTextProof(s, taskId, text)); }
  function handleProofUrlChange(taskId, url) { setLoopState(s => addLinkProof(s, taskId, url)); }
  function handleReflectionChange(taskId, text) { setLoopState(s => addTaskReflection(s, taskId, text)); }
  function handleMarkDone(taskId) { setLoopState(s => markTaskDone(s, taskId)); }
  function handleNext() { setLoopState(s => goToNextTask(s)); }
  function handlePrev() { setLoopState(s => goToPreviousTask(s)); }
  function handleFinishDay() {
    setLoopState(s => finishMobileDay(s));
    setActiveFlow('completion');
    setSyncStatus(signedIn ? SYNC_STATUS.READY_TO_SYNC : SYNC_STATUS.LOCAL_ONLY);
    setSyncError(''); setPublishError('');
  }
  function handleBackToToday() { setActiveTab('today'); setActiveFlow('today'); }

  // ── Day sync + publish (Phase 6.13) ──
  async function handleSyncDay() {
    if (!authUser) { setSyncError('Please sign in again.'); return; }
    const pathId = (selectedPath && selectedPath.id) || loopState.path.id;
    const payload = buildDayLogPayload(loopState, {
      pathId, uid: authUser.uid, dayNumber: loopState.path.dayNumber,
    });
    if (!payload) { setSyncError('Finish the day before syncing.'); return; }
    setSyncStatus(SYNC_STATUS.SYNCING); setSyncError('');
    try {
      await dayLogRepo.upsertDayLog({ pathId, uid: authUser.uid, dayNumber: payload.dayNumber, dayLog: payload });
      setLastDayLog(payload);
      setSyncStatus(SYNC_STATUS.PUBLISH_AVAILABLE);
      setPublishStatus(SYNC_STATUS.PUBLISH_AVAILABLE);
    } catch {
      setSyncStatus(SYNC_STATUS.SYNC_FAILED);
      setSyncError('We could not sync your day yet. Check your connection and try again.');
    }
  }

  async function handlePublishProgress() {
    if (!lastDayLog) { setPublishError('Sync your day before publishing.'); return; }
    setPublishStatus(SYNC_STATUS.PUBLISHING); setPublishError('');
    const res = await publicProgressRepo.publish({ dayLog: lastDayLog, publicCaption });
    if (res.ok) {
      setPublishStatus(SYNC_STATUS.PUBLISHED);
    } else {
      setPublishStatus(SYNC_STATUS.PUBLISH_FAILED);
      setPublishError(res.message || 'We could not publish your progress yet.');
    }
  }

  const publicSummary = lastDayLog
    ? buildPublicSummary(lastDayLog, {
        uid: authUser && authUser.uid,
        pathTitle: (selectedPath && selectedPath.title) || loopState.path.title,
        publicCaption,
      })
    : null;

  // ── Cloud path handlers (read-only) ──
  async function handleOpenRoadmap(path) {
    setSelectedPath(path); setPathView('roadmap'); setRoadmapState(asyncLoading());
    try {
      const roadmap = await roadmapRepo.getRoadmap(path.id);
      setRoadmapState(roadmap ? asyncLoaded([roadmap]) : asyncError('This roadmap could not be loaded.'));
    } catch {
      setRoadmapState(asyncError('This roadmap could not be loaded.'));
    }
  }
  function handleSelectPath(path) { setSelectedPath(path); }
  async function handlePreview(card) {
    setActiveTab('discover'); setPathView('preview'); setPreviewState(asyncLoading());
    try {
      const preview = await discoveryRepo.getPublicPathPreview(card.id);
      setPreviewState(preview ? asyncLoaded([preview]) : asyncError('This preview could not be loaded.'));
    } catch {
      setPreviewState(asyncError('This preview could not be loaded.'));
    }
  }

  // ── Auth gate ──
  if (authStatus === AUTH_STATUS.LOADING) {
    return (
      <SafeAreaView style={styles.root}>
        <Header />
        <AuroraLoadingState message="Checking mobile cloud connection…" />
      </SafeAreaView>
    );
  }

  const inLocalOnly = authStatus === AUTH_STATUS.CONFIG_MISSING && localMode;
  const signedIn = authStatus === AUTH_STATUS.SIGNED_IN;

  if (!signedIn && !inLocalOnly) {
    return (
      <SafeAreaView style={styles.root}>
        <Header />
        <AuthWelcomeScreen
          configured={configured}
          busy={authBusy}
          error={authError}
          onSignIn={handleSignIn}
          onCreateAccount={handleCreateAccount}
          onContinueLocal={!configured ? () => setLocalMode(true) : undefined}
        />
      </SafeAreaView>
    );
  }

  function renderTodayTab() {
    if (activeFlow === 'focus') {
      return (
        <DailyFocusScreen
          loopState={loopState}
          onProofChange={handleProofChange}
          onProofUrlChange={handleProofUrlChange}
          onReflectionChange={handleReflectionChange}
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
          signedIn={signedIn}
          syncStatus={syncStatus}
          syncError={syncError}
          onSync={handleSyncDay}
          publishStatus={publishStatus}
          publishError={publishError}
          publicSummary={publicSummary}
          caption={publicCaption}
          onCaptionChange={setPublicCaption}
          onPublish={handlePublishProgress}
          onBackToToday={handleBackToToday}
          onReviewPath={() => { setActiveTab('paths'); setPathView('list'); }}
        />
      );
    }
    return (
      <TodayScreen
        loopState={loopState}
        selectedCloudPath={selectedPath}
        signedIn={signedIn}
        syncStatus={syncStatus}
        onStartToday={handleStartToday}
        onContinueDay={handleContinueDay}
        onViewResult={handleViewResult}
        onReviewPath={() => { setActiveTab('paths'); setPathView('list'); }}
      />
    );
  }

  function renderActiveContent() {
    if (activeTab === 'today') return renderTodayTab();
    if (activeTab === 'paths') {
      if (pathView === 'roadmap') {
        return (
          <PathRoadmapScreen
            roadmapState={roadmapState}
            selectedPath={selectedPath}
            onBack={() => setPathView('list')}
            onOpenToday={handleBackToToday}
          />
        );
      }
      return (
        <PathsScreen
          loopState={loopState}
          signedIn={signedIn}
          pathsState={pathsState}
          onReload={loadUserPaths}
          onSelectPath={handleSelectPath}
          onOpenRoadmap={handleOpenRoadmap}
          onOpenLocalToday={handleBackToToday}
        />
      );
    }
    if (activeTab === 'discover') {
      if (pathView === 'preview') {
        return (
          <PublicPathPreviewScreen
            previewState={previewState}
            onBack={() => setPathView('list')}
          />
        );
      }
      return (
        <DiscoverScreen
          configured={configured}
          discoveryState={discoveryState}
          query={discoveryQuery}
          onQueryChange={setDiscoveryQuery}
          onSearch={() => loadDiscovery(discoveryQuery)}
          onReload={() => loadDiscovery(discoveryQuery)}
          onPreview={handlePreview}
        />
      );
    }
    if (activeTab === 'progress') return <ProgressScreen />;
    if (activeTab === 'profile') {
      return (
        <ProfileScreen
          user={authUser}
          configured={configured}
          localMode={inLocalOnly}
          onSignOut={handleSignOut}
        />
      );
    }
    return renderTodayTab();
  }

  return (
    <SafeAreaView style={styles.root}>
      <Header />
      <View style={styles.content}>{renderActiveContent()}</View>
      <View style={styles.tabBar} accessibilityRole="tablist">
        {MOBILE_TABS.map(tab => {
          const isActive = tab.id === activeTab;
          return (
            <Pressable
              key={tab.id}
              onPress={() => {
                setActiveTab(tab.id);
                if (tab.id === 'paths' || tab.id === 'discover') setPathView('list');
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
              style={styles.tabButton}
            >
              <Text style={[styles.tabLabel, isActive ? styles.tabLabelActive : null]}>{tab.label}</Text>
              <View style={[styles.tabIndicator, isActive ? styles.tabIndicatorActive : null]} />
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Learn Path Tracker</Text>
      <Text style={styles.headerSubtitle}>Mobile</Text>
    </View>
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
  tabIndicator: { marginTop: 4, height: 3, width: 20, borderRadius: 2, backgroundColor: 'transparent' },
  tabIndicatorActive: { backgroundColor: c.accent.progress },
});

export default MobileApp;
