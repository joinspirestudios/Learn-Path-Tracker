// Persists the offline media-proof draft queue using AsyncStorage.
//
// Dependency-injected `storage` adapter ({ getItem, setItem, removeItem }) so
// tests use an in-memory fake — no AsyncStorage import at test time. The default
// adapter lazily imports @react-native-async-storage/async-storage on first use.
// Draft media is referenced by local URI only; no file bytes are stored here.

import {
  addDraft, removeDraft, markDraftStatus, listDrafts, pendingDrafts, nextPendingDraft,
} from '../core/mobileOfflineDrafts.js';

const STORAGE_KEY = 'lpt.mobile.proofDrafts.v1';

function lazyAsyncStorageAdapter() {
  let mod = null;
  async function load() {
    if (!mod) {
      const imported = await import('@react-native-async-storage/async-storage');
      mod = imported.default || imported;
    }
    return mod;
  }
  return {
    async getItem(key) { return (await load()).getItem(key); },
    async setItem(key, value) { return (await load()).setItem(key, value); },
    async removeItem(key) { return (await load()).removeItem(key); },
  };
}

export function createMobileOfflineDraftRepository({ storage = lazyAsyncStorageAdapter(), key = STORAGE_KEY } = {}) {
  async function readAll() {
    try {
      const raw = await storage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  async function writeAll(drafts) {
    await storage.setItem(key, JSON.stringify(listDrafts(drafts)));
    return listDrafts(drafts);
  }

  return {
    async loadDrafts() { return readAll(); },
    async saveDraft(draft) { return writeAll(addDraft(await readAll(), draft)); },
    async removeDraft(draftId) { return writeAll(removeDraft(await readAll(), draftId)); },
    async setDraftStatus(draftId, status, error = '') { return writeAll(markDraftStatus(await readAll(), draftId, status, error)); },
    async pending() { return pendingDrafts(await readAll()); },
    async nextPending() { return nextPendingDraft(await readAll()); },
    async clear() { await storage.removeItem(key); return []; },
  };
}

export { STORAGE_KEY };
export default createMobileOfflineDraftRepository;
