// Read-only roadmap repository.
//
// Loads a cloud path plus its sections/tasks and normalizes them into the safe
// mobile roadmap shape. Read-only: no dates, progress, or completion are
// invented; no Firestore writes. Tests inject a fake gateway.

import { mapRoadmap } from '../core/mobilePathMappers.js';

export function createRoadmapRepository({ gateway } = {}) {
  if (!gateway) throw new Error('createRoadmapRepository requires a gateway');
  return {
    async getRoadmap(pathId) {
      if (!pathId) return null;
      const pathRecord = await gateway.fetchPathById(pathId);
      if (!pathRecord) return null;
      const [sections, tasks] = await Promise.all([
        gateway.fetchSubcollection(pathId, 'sections'),
        gateway.fetchSubcollection(pathId, 'tasks'),
      ]);
      return mapRoadmap(pathRecord, sections, tasks);
    },
  };
}

export default createRoadmapRepository;
