// Mobile proof repository — builds private, submitted text/link proof records.
//
// No Firebase, no network, no files/media/Storage. Proof is private by default
// and "submitted", never "verified". Proof bodies are never logged. The day-log
// repository persists proof inside the user's own private day-log record.

import { mapTextProof, mapLinkProof, isValidProofUrl } from '../core/mobileProofMappers.js';

export function createMobileProofRepository() {
  return {
    buildTextProof({ taskId, body } = {}) {
      return mapTextProof({ taskId, body });
    },
    buildLinkProof({ taskId, url } = {}) {
      return mapLinkProof({ taskId, url });
    },
    // Returns a valid private proof record, or { invalid:true } for bad links.
    buildProof({ taskId, type, body, url } = {}) {
      if (type === 'link') {
        const record = mapLinkProof({ taskId, url });
        return record;
      }
      return mapTextProof({ taskId, body });
    },
    isValidProofUrl,
  };
}

export default createMobileProofRepository;
