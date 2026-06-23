// Read-only public discovery repository.
//
// Only public + discoverable paths are returned. No private/unlisted paths, no
// vanity counts, no social-graph features, no public-progress feed, no joining.
// Search/filter is applied locally to the loaded set (no extra Firestore query
// support is added in this phase). No writes; tests inject a fake gateway.

import { mapPathCard, mapPublicPreview, isPublicDiscoverable } from '../core/mobilePathMappers.js';

export function createDiscoveryRepository({ gateway } = {}) {
  if (!gateway) throw new Error('createDiscoveryRepository requires a gateway');
  return {
    async listPublicPaths({ limit = 30, filters } = {}) {
      const records = await gateway.fetchPublicPaths(limit);
      const publicOnly = (records || []).filter(isPublicDiscoverable);
      let cards = publicOnly.map(r => mapPathCard(r));
      const query = filters && filters.query ? String(filters.query).toLowerCase().trim() : '';
      if (query) {
        cards = cards.filter(c =>
          (c.title + ' ' + c.description + ' ' + c.categoryLabel).toLowerCase().includes(query));
      }
      return cards;
    },
    async getPublicPathPreview(pathId) {
      if (!pathId) return null;
      const record = await gateway.fetchPathById(pathId);
      if (!record || !isPublicDiscoverable(record)) return null;
      return mapPublicPreview(record);
    },
  };
}

export default createDiscoveryRepository;
