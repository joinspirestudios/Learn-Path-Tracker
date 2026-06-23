// Mobile day-log repository (read + write the signed-in user's OWN day logs).
//
// Day logs are stored in the user's private space: users/{uid}/mobileDayLogs/{id}.
// Firestore rules already restrict this subtree to the owning user, so no rule
// change is required. This is distinct from the web's enrollment-based day logs
// (mobile join/enrollment is deferred); see
// docs/mobile-day-sync-proof-public-progress.md.
//
// Dependency-injected (`gateway`) so tests never call live Firebase. Writes only
// the current user's own day log; never another user's; never public progress;
// never files. Proof/reflection bodies are never logged here.

import { mobileDayLogId } from '../core/mobileDaySync.js';

const SUBCOLLECTION = 'mobileDayLogs';

export function createDayLogRepository({ gateway } = {}) {
  if (!gateway) throw new Error('createDayLogRepository requires a gateway');

  return {
    async getDayLog({ pathId, uid, dayNumber } = {}) {
      if (!uid || !pathId) return null;
      const id = mobileDayLogId({ pathId, uid, dayNumber });
      const record = await gateway.getUserDoc(uid, SUBCOLLECTION, id);
      return record ? { id: record.id, ...record.data } : null;
    },

    async upsertDayLog({ pathId, uid, dayNumber, dayLog } = {}) {
      if (!uid || !pathId || !dayLog) throw new Error('upsertDayLog requires uid, pathId and dayLog');
      if (dayLog.uid && dayLog.uid !== uid) {
        throw new Error('Refusing to write a day log for a different user');
      }
      const id = mobileDayLogId({ pathId, uid, dayNumber: dayNumber || dayLog.dayNumber });
      // Idempotent upsert (merge) — syncing the same day twice updates, not dupes.
      await gateway.setUserDoc(uid, SUBCOLLECTION, id, { ...dayLog, id, uid });
      return { id };
    },

    async listRecentDayLogs({ uid, limit = 20 } = {}) {
      if (!uid) return [];
      const records = await gateway.listUserDocs(uid, SUBCOLLECTION, limit);
      return records.map(r => ({ id: r.id, ...r.data }));
    },
  };
}

export { SUBCOLLECTION as MOBILE_DAY_LOG_SUBCOLLECTION };
export default createDayLogRepository;
