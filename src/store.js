// ── store.js ──────────────────────────────────────────────────────────────
// Single source of truth for shared mutable state. Every module that needs
// to read or write the live state imports `store` from here.
//
// Why an object (not individual lets)? With `let` exports, modules can read
// but can't reassign across module boundaries. Wrapping everything in `store`
// lets modules do `store.catalogue = store.catalogue.filter(...)` cleanly.

import { normalizeDurationDays, SCHEDULE_TYPES } from './journey.js';
import { DEFAULT_DISCOVERY_PAGE } from './discovery-pagination.js';
import { normalizeDocumentSchemaVersion } from './schema-versioning.js';

export const STATE_KEY  = 'lpt_state';
export const CAT_PREFIX = 'lpt_cat:';
export const LEGACY_KEY = 'dp_state';
export const LAST_ROUTE_KEY = 'lpt_last_route';

/* ---------- SCHEMA VERSION + MIGRATIONS ----------
   Bump SCHEMA_VERSION and add a numbered migration block below whenever the
   stored shape changes. Migrations run once per load on both local and cloud
   bundles, so deployed users do not silently break when data.js evolves. */
export const SCHEMA_VERSION = 5;
function cleanNumber(value, fallback = null){
  if(value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function migrateState(s){
  s = s && typeof s === 'object' ? s : {};
  // Treat any pre-versioning bundle as v1.
  const startedAt = s.version || 1;
  // v1 → v2: bring forward into the versioned shape. (No structural changes
  // yet — this is the first version write so future migrations have a floor.)
  // Future migrations slot in here, gated on `if(startedAt < N)`.
  s.skills    = s.skills    || {};
  s.userPaths = s.userPaths || {};
  Object.keys(s.userPaths).forEach(id => {
    const path = s.userPaths[id] || {};
    path.durationDays = normalizeDurationDays(path.durationDays, path.durationLabel);
    (path.weeks || []).forEach(week => {
      (week.tasks || []).forEach(task => {
        if(task.scheduleType && !SCHEDULE_TYPES.includes(task.scheduleType)) task.scheduleType = null;
      });
    });
    if(path.platform && path.childrenLoaded == null){
      path.childrenLoaded = (path.weeks || []).some(week =>
        (week.tasks || []).length || (week.resources || []).length
      );
    }
    s.userPaths[id] = path;
  });
  s.enrollments = s.enrollments || {};
  Object.keys(s.enrollments).forEach(id => {
    const en = s.enrollments[id] || {};
    en.dayLogs = en.dayLogs || {};
    if(en.freezeCount == null) en.freezeCount = 1;
    en.schemaVersion = normalizeDocumentSchemaVersion('enrollment', en);
    if(en.lastActivityDate == null) en.lastActivityDate = null;
    if(en.missedDate == null) en.missedDate = null;
    Object.keys(en.dayLogs).forEach(day => {
      const log = en.dayLogs[day] || {};
      log.date = log.date || null;
      log.frozenAt = log.frozenAt || null;
      log.completedTaskIds = Array.isArray(log.completedTaskIds) ? log.completedTaskIds : [];
      log.verifiedTaskIds = Array.isArray(log.verifiedTaskIds) ? log.verifiedTaskIds : [];
      log.unverifiedTaskIds = Array.isArray(log.unverifiedTaskIds)
        ? log.unverifiedTaskIds
        : log.completedTaskIds.filter(id => !log.verifiedTaskIds.includes(id));
      log.pendingTaskIds = Array.isArray(log.pendingTaskIds) ? log.pendingTaskIds : [];
      log.optionalSkippedTaskIds = Array.isArray(log.optionalSkippedTaskIds) ? log.optionalSkippedTaskIds : [];
      log.taskReflections = log.taskReflections && typeof log.taskReflections === 'object' ? log.taskReflections : {};
      log.sessionStartedAt = log.sessionStartedAt || null;
      log.sessionLastActiveAt = log.sessionLastActiveAt || null;
      log.lastActiveTaskId = log.lastActiveTaskId || null;
      log.sessionViewState = log.sessionViewState || null;
      log.sessionCompletedAt = log.sessionCompletedAt || null;
      log.completionScore = cleanNumber(log.completionScore);
      log.completionTier = log.completionTier || null;
      log.passThreshold = cleanNumber(log.passThreshold);
      log.intensity = log.intensity || null;
      log.anchorSatisfied = log.anchorSatisfied == null ? null : !!log.anchorSatisfied;
      log.completedWeight = cleanNumber(log.completedWeight);
      log.totalWeight = cleanNumber(log.totalWeight);
      log.requiredCompleted = cleanNumber(log.requiredCompleted);
      log.requiredTotal = cleanNumber(log.requiredTotal);
      log.optionalCompleted = cleanNumber(log.optionalCompleted);
      log.optionalTotal = cleanNumber(log.optionalTotal);
      log.evidenceCompleted = cleanNumber(log.evidenceCompleted);
      log.evidenceRequired = cleanNumber(log.evidenceRequired);
      log.totalTaskCount = Math.max(0, Math.floor(cleanNumber(log.totalTaskCount, 0) || 0));
      log.schemaVersion = normalizeDocumentSchemaVersion('dayLog', log);
      en.dayLogs[day] = log;
    });
    s.enrollments[id] = en;
  });
  s.evidenceSubmissions = s.evidenceSubmissions || {};
  s.current   = s.current   || null;
  s.version   = SCHEMA_VERSION;
  return s;
}

/* The live shared state. Modules read/write through `store.*` references. */
export const store = {
  state:           { current:null, skills:{}, userPaths:{}, enrollments:{}, evidenceSubmissions:{}, version:0 },
  catalogue:       [],     // every render entry, each carries .skill
  platformPaths:   {},     // cloud platform paths, normalized into userPaths for rendering
  publicProgress:  {},     // sanitized public timeline entries keyed by path id
  discovery:       { query:'', category:'all', duration:'all', intensity:'all', proof:'all', sort:'recommended' },
  discoveryPage:   { ...DEFAULT_DISCOVERY_PAGE, loadedPublicIds:[] },
  enrollments:     {},     // current user's per-path enrollment progress
  evidenceSubmissions: {},
  accessRequests:  {},
  route:           { kind:'catalog' },
  pendingRoute:    null,
  bootReady:       false,
  authSoftTimedOut:false,
  syncStatus:      '',
  cloudStatus:     'checking',
  cloudMessage:    '',
  cloudCheck:      null,
  cloudDiagnostics:{
    projectId:null,
    firebaseInitialized:false,
    firestoreInitialized:false,
    preflightElapsedMs:null,
    platformSummaryElapsedMs:null,
    selectedPathChildrenStatus:'idle',
    latestErrorStatus:null,
    latestErrorMessage:null,
    publicProgressStatus:null,
    publicProgressMessage:null,
    publicProgressFailedAt:null,
    commentLoadStatus:null,
    commentLoadMessage:null,
    commentLoadFailedAt:null,
    reactionLoadStatus:null,
    reactionLoadMessage:null,
    reactionLoadFailedAt:null,
    metricsSyncStatus:null,
    metricsSyncMessage:null,
    metricsSyncFailedAt:null,
    discoveryPageSize:null,
    discoveryLoadedCount:null,
    discoveryHasMore:null,
    discoveryLastLoadElapsedMs:null,
    discoveryLoadStatus:null,
    discoveryLoadMessage:null,
  },
  currentUser:     null,
  authChecked:     false,
  activeTab:       'week',
  currentWeek:     1,
  editMode:        false,
  /* Navigation handlers — main.js assigns these on init so views.js can
     trigger routing without importing main (which would be circular). */
  nav: {
    switchTab:  null,  // (tabName) => void
    goCatalog:  null,  // () => void
    goWeek:     null,  // (weekNumber) => void
    openSkill:  null,  // (skillId) => void
    handleHash: null,  // () => boolean
    retryCloud:null,   // () => void
  },
};
