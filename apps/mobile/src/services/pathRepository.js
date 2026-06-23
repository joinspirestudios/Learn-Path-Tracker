// Read-only user path repository.
//
// Separates Firestore read mechanics (the injected `gateway`) from normalization
// (mappers). No writes, no screen state, no live calls in tests (inject a fake
// gateway). Owner paths are loaded first; joined/enrolled membership loading is
// documented as pending in docs/mobile-auth-paths-discovery.md.

import { mapPathCard } from '../core/mobilePathMappers.js';

export function createPathRepository({ gateway } = {}) {
  if (!gateway) throw new Error('createPathRepository requires a gateway');
  return {
    async listUserPaths({ uid, limit = 50 } = {}) {
      if (!uid) return [];
      const records = await gateway.fetchOwnerPaths(uid, limit);
      return (records || []).map(r => mapPathCard(r));
    },
    async getPathById(pathId) {
      if (!pathId) return null;
      const record = await gateway.fetchPathById(pathId);
      return record ? mapPathCard(record) : null;
    },
  };
}

export default createPathRepository;
