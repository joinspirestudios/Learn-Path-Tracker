// Mobile app shell — auth gate + local core loop + cloud reads + day sync.
//
// Phase 6.12: auth gate + read-only cloud paths/discovery/roadmap.
// Phase 6.13: real write path — sync a FINISHED local day to the user's private
// cloud day log, and (explicitly) publish a sanitized public progress summary
// via the existing API. No media/file upload, no auto-sync, no auto-publish.

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { SafeAreaView, View, Text, Pressable, StyleSheet, Platform } from 'react-native';

import { auroraTheme } from '../theme/auroraTheme.js';
import { MOBILE_TABS } from '../navigation/mobileTabs.js';
import {
  createInitialMobileLoopState, startTodaySession, markTaskDone, addTextProof,
  addLinkProof, addTaskReflection, addUploadedMediaProof,
  goToNextTask, goToPreviousTask, finishMobileDay,
} from '../core/mobileCoreLoop.js';
import {
  AUTH_STATUS, resolveAuthStatus, createAsyncState, asyncLoading, asyncLoaded, asyncError,
} from '../core/mobileCloudState.js';
import { SYNC_STATUS } from '../core/mobileSyncStatus.js';
import { buildDayLogPayload } from '../core/mobileDaySync.js';
import { buildPublicSummary } from '../core/mobilePublicProgressMappers.js';
import {
  createProofDraft, addDraft, removeDraft, markDraftStatus, pendingDrafts,
} from '../core/mobileOfflineDrafts.js';
import { UPLOAD_STATUS } from '../core/mobileProofUploadState.js';
import { createFirebaseClient } from '../services/firebaseClient.js';
import { createMobileAuthService } from '../services/authService.js';
import { createPathRepository } from '../services/pathRepository.js';
import { createDiscoveryRepository } from '../services/discoveryRepository.js';
import { createRoadmapRepository } from '../services/roadmapRepository.js';
import { createDayLogRepository } from '../services/dayLogRepository.js';
import { createMobilePublicProgressRepository } from '../services/mobilePublicProgressRepository.js';
import { createProfileRepository } from '../services/profileRepository.js';
import { createMobileNotificationRepository } from '../services/mobileNotificationRepository.js';
import { createMobileLocalNotificationService } from '../services/mobileLocalNotificationService.js';
import { createMobileRuntimeDiagnostics } from '../services/mobileRuntimeDiagnostics.js';
import { createMobileAdaptivePlanningRepository } from '../services/mobileAdaptivePlanningRepository.js';
import { createMobileEvidenceIntelligenceRepository } from '../services/mobileEvidenceIntelligenceRepository.js';
import { createMobileProofStorageRepository } from '../services/mobileProofStorageRepository.js';
import { createMobileMediaProofRepository } from '../services/mobileMediaProofRepository.js';
import { createMobileOfflineDraftRepository } from '../services/mobileOfflineDraftRepository.js';
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
import { NotificationsScreen } from '../screens/NotificationsScreen.js';
import { MobileDiagnosticsScreen } from '../screens/MobileDiagnosticsScreen.js';
import { AdaptivePlanningScreen } from '../screens/AdaptivePlanningScreen.js';
import { EvidenceInsightsScreen } from '../screens/EvidenceInsightsScreen.js';
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
  const profileRepo = useMemo(() => createProfileRepository({ gateway: userGateway }), [userGateway]);
  const notificationRepo = useMemo(() => createMobileNotificationRepository({ gateway: userGateway }), [userGateway]);
  const localNotificationService = useMemo(() => createMobileLocalNotificationService({}), []);
  const runtimeDiagnostics = useMemo(() => createMobileRuntimeDiagnostics({ platform: Platform.OS }), []);
  const adaptiveRepo = useMemo(() => createMobileAdaptivePlanningRepository({ apiClient }), [apiClient]);
  const evidenceRepo = useMemo(() => createMobileEvidenceIntelligenceRepository({ apiClient }), [apiClient]);
  const storageGateway = useMemo(() => client.createStorageGateway(), [client]);
  const proofStorageRepo = useMemo(() => createMobileProofStorageRepository({ storageGateway }), [storageGateway]);
  const mediaProofRepo = useMemo(() => createMobileMediaProofRepository({ storageRepo: proofStorageRepo }), [proofStorageRepo]);
  const offlineDraftRepo = useMemo(() => createMobileOfflineDraftRepository({}), []);
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

  // Profile state (Phase 6.15).
  const [profile, setProfile] = useState(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileStatus, setProfileStatus] = useState('');

  // Media proof drafts + upload state (Phase 6.16.1).
  const [proofDrafts, setProofDrafts] = useState([]);
  const [proofUploadError, setProofUploadError] = useState('');

  // Notifications (Phase 6.17).
  const [notifications, setNotifications] = useState([]);
  const [notifUnread, setNotifUnread] = useState(0);
  const [notifPrefs, setNotifPrefs] = useState(null);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsStatus, setPrefsStatus] = useState('');
  const [profileView, setProfileView] = useState('main'); // main | notifications | diagnostics | adaptive | evidence

  // Adaptive planning (Phase 7.0) — review/dismiss only on mobile.
  const [adaptiveDraft, setAdaptiveDraft] = useState(null);
  const [adaptiveLoading, setAdaptiveLoading] = useState(false);

  // Evidence intelligence (Phase 8.0) — review/dismiss only on mobile.
  const [evidenceDraft, setEvidenceDraft] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

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

  const loadProfile = useCallback(async () => {
    if (!authUser) return;
    try {
      const p = await profileRepo.getProfile(authUser.uid);
      setProfile(p);
    } catch {
      setProfile(null);
    }
  }, [authUser, profileRepo]);

  const loadNotifications = useCallback(async () => {
    if (!authUser) { setNotifications([]); setNotifUnread(0); setNotifPrefs(null); return; }
    try {
      const [items, unread, prefs] = await Promise.all([
        notificationRepo.listNotifications({ uid: authUser.uid }),
        notificationRepo.unreadCount({ uid: authUser.uid }),
        notificationRepo.loadPreferences({ uid: authUser.uid }),
      ]);
      setNotifications(items);
      setNotifUnread(unread);
      setNotifPrefs(prefs);
    } catch {
      // Non-critical chrome; never block the app.
    }
  }, [authUser, notificationRepo]);

  useEffect(() => {
    if (authStatus === AUTH_STATUS.SIGNED_IN) { loadUserPaths(); loadProfile(); loadNotifications(); }
  }, [authStatus, loadUserPaths, loadProfile, loadNotifications]);

  // ── Notification handlers (Phase 6.17) ──
  async function handleMarkNotificationRead(notificationId) {
    if (!authUser) return;
    await notificationRepo.markRead({ uid: authUser.uid, notificationId });
    await loadNotifications();
  }
  async function handleMarkAllNotificationsRead() {
    if (!authUser) return;
    for (const n of notifications.filter(x => !x.read)) {
      // eslint-disable-next-line no-await-in-loop
      await notificationRepo.markRead({ uid: authUser.uid, notificationId: n.id });
    }
    await loadNotifications();
  }
  async function handleClearNotification(notificationId) {
    if (!authUser) return;
    await notificationRepo.archive({ uid: authUser.uid, notificationId });
    await loadNotifications();
  }
  // OS permission is requested ONLY here, when the user enables mobile reminders.
  async function handleEnableLocalNotifications() {
    return localNotificationService.requestPermission();
  }
  async function handleSaveNotificationPreferences(draft) {
    if (!authUser) { setPrefsStatus('Please sign in again.'); return; }
    setPrefsBusy(true); setPrefsStatus('');
    try {
      const saved = await notificationRepo.savePreferences({ uid: authUser.uid, preferences: draft });
      setNotifPrefs(saved);
      // Reflect reminder changes on-device (schedules or cancels as needed).
      await localNotificationService.scheduleDailyReminder({ preferences: saved });
      setPrefsStatus('Saved');
    } catch {
      setPrefsStatus('Could not save preferences yet.');
    } finally {
      setPrefsBusy(false);
    }
  }

  async function handleSaveProfile(fields) {
    if (!authUser) { setProfileStatus('Please sign in again.'); return; }
    setProfileBusy(true); setProfileStatus('');
    try {
      await profileRepo.saveProfileText(authUser.uid, fields);
      await loadProfile();
      setProfileStatus('Saved');
    } catch {
      setProfileStatus('Could not save profile yet.');
    } finally {
      setProfileBusy(false);
    }
  }

  // ── Adaptive planning handlers (Phase 7.0) ──
  async function loadAdaptiveDraft() {
    if (!authUser) { setAdaptiveDraft(null); return; }
    setAdaptiveLoading(true);
    try {
      const pid = (selectedPath && selectedPath.id) || loopState.path.id;
      const draft = await adaptiveRepo.fetchDraft({
        pathId: pid,
        context: {
          pathTitle: (selectedPath && selectedPath.title) || loopState.path.title,
          currentDayNumber: loopState.path.dayNumber,
          pendingProofCount,
        },
      });
      setAdaptiveDraft(draft);
    } catch {
      setAdaptiveDraft(null);
    } finally {
      setAdaptiveLoading(false);
    }
  }
  function handleDismissAdaptiveDraft() { setAdaptiveDraft(null); }

  // ── Evidence intelligence handlers (Phase 8.0) ──
  async function loadEvidenceInsight() {
    if (!authUser) { setEvidenceDraft(null); return; }
    setEvidenceLoading(true);
    try {
      const pid = (selectedPath && selectedPath.id) || loopState.path.id;
      const draft = await evidenceRepo.fetchInsight({
        pathId: pid,
        context: {
          pathTitle: (selectedPath && selectedPath.title) || loopState.path.title,
          currentDayNumber: loopState.path.dayNumber,
          pendingProofUploadCount: pendingProofCount,
        },
      });
      setEvidenceDraft(draft);
    } catch {
      setEvidenceDraft(null);
    } finally {
      setEvidenceLoading(false);
    }
  }
  function handleDismissEvidenceDraft() { setEvidenceDraft(null); }

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

  // ── Media proof drafts + upload (Phase 6.16.1) ──
  const currentPathId = () => (selectedPath && selectedPath.id) || loopState.path.id;

  const loadProofDrafts = useCallback(async () => {
    try { setProofDrafts(await offlineDraftRepo.loadDrafts()); }
    catch { setProofDrafts([]); }
  }, [offlineDraftRepo]);

  useEffect(() => { loadProofDrafts(); }, [loadProofDrafts]);

  async function persistAndSet(drafts) {
    setProofDrafts(drafts);
    try { await offlineDraftRepo.clear(); for (const d of drafts) await offlineDraftRepo.saveDraft(d); } catch { /* best effort */ }
  }

  async function handleAddImageProofDraft(taskId, asset) {
    if (!authUser) { setProofUploadError('Please sign in to attach proof.'); return; }
    const draft = createProofDraft({
      pathId: currentPathId(), dayNumber: loopState.path.dayNumber, taskId, asset, uid: authUser.uid,
    });
    const next = addDraft(proofDrafts, draft);
    await persistAndSet(next);
    handleUploadProofDraft(draft.id, next);
  }

  async function handleUploadProofDraft(draftId, source) {
    const drafts = source || proofDrafts;
    const draft = drafts.find(d => d.id === draftId);
    if (!draft || !authUser) return;
    setProofUploadError('');
    await persistAndSet(markDraftStatus(drafts, draftId, UPLOAD_STATUS.UPLOADING));
    try {
      const record = await mediaProofRepo.submitMediaProof({
        uid: authUser.uid, pathId: draft.pathId, dayNumber: draft.dayNumber, taskId: draft.taskId, asset: draft.asset,
      });
      // Attach the UPLOADED proof to the task (storagePath/downloadURL only).
      setLoopState(s => addUploadedMediaProof(s, draft.taskId, record));
      await persistAndSet(removeDraft(markDraftStatus(drafts, draftId, UPLOAD_STATUS.UPLOADED), draftId));
    } catch (error) {
      const offline = error && error.code === 'unauthenticated' ? false : true;
      await persistAndSet(markDraftStatus(drafts, draftId,
        offline ? UPLOAD_STATUS.FAILED : UPLOAD_STATUS.FAILED, 'Upload failed. Tap retry.'));
      setProofUploadError('We could not upload that proof image. Tap retry.');
    }
  }

  function handleRetryProofDraft(draftId) { handleUploadProofDraft(draftId); }

  async function handleRemoveProofDraft(draftId) {
    await persistAndSet(removeDraft(proofDrafts, draftId));
  }

  const proofDraftsForTask = (taskId) => proofDrafts.filter(d => d.taskId === taskId);
  const pendingProofCount = pendingDrafts(proofDrafts).length;
  const failedProofCount = proofDrafts.filter(d => d.status === UPLOAD_STATUS.FAILED).length;
  const uploadingProofCount = proofDrafts.filter(d => d.status === UPLOAD_STATUS.UPLOADING).length;

  // ── Day sync + publish (Phase 6.13) ──
  async function handleSyncDay() {
    if (!authUser) { setSyncError('Please sign in again.'); return; }
    // Block sync while required media proof is still pending/failed upload.
    if (pendingProofCount > 0 || uploadingProofCount > 0) {
      setSyncError('Upload your pending proof images before syncing the day.');
      return;
    }
    const pathId = currentPathId();
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
          signedIn={signedIn}
          proofDraftsForTask={proofDraftsForTask}
          proofUploadError={proofUploadError}
          onAddImageProof={handleAddImageProofDraft}
          onUploadDraft={handleRetryProofDraft}
          onRetryDraft={handleRetryProofDraft}
          onRemoveDraft={handleRemoveProofDraft}
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
          pendingProofCount={pendingProofCount}
          failedProofCount={failedProofCount}
          uploadingProofCount={uploadingProofCount}
          onRetryUploads={() => pendingDrafts(proofDrafts).forEach(d => handleRetryProofDraft(d.id))}
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
        pendingProofCount={pendingProofCount}
        failedProofCount={failedProofCount}
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
            pendingProofCount={pendingProofCount}
            failedProofCount={failedProofCount}
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
      if (profileView === 'evidence') {
        return (
          <EvidenceInsightsScreen
            draft={evidenceDraft}
            loading={evidenceLoading}
            onRefresh={loadEvidenceInsight}
            onDismiss={handleDismissEvidenceDraft}
            onReviewOnWeb={handleDismissEvidenceDraft}
            onBack={() => setProfileView('main')}
          />
        );
      }
      if (profileView === 'adaptive') {
        return (
          <AdaptivePlanningScreen
            draft={adaptiveDraft}
            loading={adaptiveLoading}
            onRefresh={loadAdaptiveDraft}
            onDismiss={handleDismissAdaptiveDraft}
            onReviewOnWeb={handleDismissAdaptiveDraft}
            onBack={() => setProfileView('main')}
          />
        );
      }
      if (profileView === 'diagnostics') {
        const notifStatus = notifPrefs
          ? (notifPrefs.mobileLocalEnabled ? 'enabled' : 'disabled')
          : 'unknown';
        return (
          <MobileDiagnosticsScreen
            snapshot={runtimeDiagnostics.snapshot({ signedIn, notifications: notifStatus })}
            onBack={() => setProfileView('main')}
          />
        );
      }
      if (profileView === 'notifications') {
        return (
          <NotificationsScreen
            notifications={notifications}
            unreadCount={notifUnread}
            preferences={notifPrefs}
            prefsBusy={prefsBusy}
            prefsStatus={prefsStatus}
            onMarkRead={handleMarkNotificationRead}
            onMarkAllRead={handleMarkAllNotificationsRead}
            onClear={handleClearNotification}
            onSavePreferences={handleSaveNotificationPreferences}
            onEnableLocal={handleEnableLocalNotifications}
            onBack={() => setProfileView('main')}
          />
        );
      }
      return (
        <ProfileScreen
          user={authUser}
          configured={configured}
          localMode={inLocalOnly}
          profile={profile}
          profileBusy={profileBusy}
          profileStatus={profileStatus}
          notificationUnreadCount={notifUnread}
          onOpenNotifications={() => setProfileView('notifications')}
          onOpenDiagnostics={() => setProfileView('diagnostics')}
          onOpenAdaptivePlanning={() => { setProfileView('adaptive'); loadAdaptiveDraft(); }}
          onOpenEvidenceInsights={() => { setProfileView('evidence'); loadEvidenceInsight(); }}
          onSaveProfile={handleSaveProfile}
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
                if (tab.id === 'profile') setProfileView('main');
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
