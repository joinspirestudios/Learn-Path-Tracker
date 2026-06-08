// ── store.js ──────────────────────────────────────────────────────────────
// Single source of truth for shared mutable state. Every module that needs
// to read or write the live state imports `store` from here.
//
// Why an object (not individual lets)? With `let` exports, modules can read
// but can't reassign across module boundaries. Wrapping everything in `store`
// lets modules do `store.catalogue = store.catalogue.filter(...)` cleanly.

export const STATE_KEY  = 'lpt_state';
export const CAT_PREFIX = 'lpt_cat:';
export const LEGACY_KEY = 'dp_state';

/* ---------- SCHEMA VERSION + MIGRATIONS ----------
   Bump SCHEMA_VERSION and add a numbered migration block below whenever the
   stored shape changes. Migrations run once per load on both local and cloud
   bundles, so deployed users do not silently break when data.js evolves. */
export const SCHEMA_VERSION = 4;
export function migrateState(s){
  s = s && typeof s === 'object' ? s : {};
  // Treat any pre-versioning bundle as v1.
  const startedAt = s.version || 1;
  // v1 → v2: bring forward into the versioned shape. (No structural changes
  // yet — this is the first version write so future migrations have a floor.)
  // Future migrations slot in here, gated on `if(startedAt < N)`.
  s.skills    = s.skills    || {};
  s.userPaths = s.userPaths || {};
  s.enrollments = s.enrollments || {};
  Object.keys(s.enrollments).forEach(id => {
    const en = s.enrollments[id] || {};
    en.dayLogs = en.dayLogs || {};
    if(en.freezeCount == null) en.freezeCount = 1;
    if(en.lastActivityDate == null) en.lastActivityDate = null;
    if(en.missedDate == null) en.missedDate = null;
    Object.keys(en.dayLogs).forEach(day => {
      const log = en.dayLogs[day] || {};
      log.date = log.date || null;
      log.frozenAt = log.frozenAt || null;
      log.completedTaskIds = Array.isArray(log.completedTaskIds) ? log.completedTaskIds : [];
      log.totalTaskCount = Number(log.totalTaskCount || 0);
      en.dayLogs[day] = log;
    });
    s.enrollments[id] = en;
  });
  s.current   = s.current   || null;
  s.version   = SCHEMA_VERSION;
  return s;
}

/* The live shared state. Modules read/write through `store.*` references. */
export const store = {
  state:           { current:null, skills:{}, userPaths:{}, enrollments:{}, version:0 },
  catalogue:       [],     // every render entry, each carries .skill
  platformPaths:   {},     // cloud platform paths, normalized into userPaths for rendering
  enrollments:     {},     // current user's per-path enrollment progress
  accessRequests:  {},
  route:           { kind:'catalog' },
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
  },
};
