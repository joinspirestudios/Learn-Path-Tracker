// Path personalization persistence (web). Owner-only writes of safe visual
// identity fields onto the path document under a `personalization` map.
//
// Server-managed stats and identity fields are never written here.

import { fb as defaultFb } from './firebase.js';
import {
  sanitizePathPersonalization, canEditPathPersonalization,
} from './path-personalization-model.js';

function pathRef(fb, pathId) {
  return fb.doc(fb.db, 'paths', pathId);
}

export async function savePathPersonalization(pathId, path, input, { fb = defaultFb, uid, now = new Date() } = {}) {
  if (!canEditPathPersonalization(path, uid)) {
    throw new Error('Only the path owner can personalize this path.');
  }
  const personalization = sanitizePathPersonalization(input, { uid, now });
  await fb.setDoc(pathRef(fb, pathId), { personalization }, { merge: true });
  return personalization;
}

export default { savePathPersonalization };
