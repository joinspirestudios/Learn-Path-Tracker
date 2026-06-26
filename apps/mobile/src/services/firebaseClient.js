// Firebase client setup for mobile — client SDK only.
//
// Hard rules:
//   - Uses the Firebase CLIENT SDK only (firebase/app, firebase/auth,
//     firebase/firestore). NEVER the Admin SDK.
//   - Never imports server/Vercel handlers or web DOM modules.
//   - Lazy: the SDK is loaded via dynamic import on first use, never at module
//     import time, so importing this file performs no network and works in tests.
//   - Dependency-injectable: pass a `sdkLoader` (and `config`) to test without
//     contacting Firebase.
//   - Never logs config values or tokens.
//
// Auth session persistence note: this phase uses the default in-memory auth
// instance (getAuth). Durable session persistence (AsyncStorage-backed) is
// intentionally deferred to a later mobile phase; see
// docs/mobile-auth-paths-discovery.md. AsyncStorage is therefore NOT a
// dependency in this phase.

import { resolveFirebaseConfig, isFirebaseConfigured } from './firebaseConfig.js';

// Default loader uses dynamic import so nothing loads until ensure() is called.
async function defaultSdkLoader() {
  const [appMod, authMod, firestoreMod, storageMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
    import('firebase/storage'),
  ]);
  return { ...appMod, ...authMod, ...firestoreMod, ...storageMod };
}

export function createFirebaseClient({ env, config, sdkLoader = defaultSdkLoader } = {}) {
  const resolvedConfig = config || resolveFirebaseConfig(env);
  const configured = !!config || isFirebaseConfigured(env);
  let cache = null;

  async function ensure() {
    if (!configured) {
      throw new Error('Mobile cloud connection is not configured');
    }
    if (cache) return cache;
    const sdk = await sdkLoader();
    const apps = typeof sdk.getApps === 'function' ? sdk.getApps() : [];
    const app = apps && apps.length ? apps[0] : sdk.initializeApp(resolvedConfig);
    const auth = sdk.getAuth(app);
    const db = sdk.getFirestore(app);
    const storage = typeof sdk.getStorage === 'function' ? sdk.getStorage(app) : null;
    cache = { sdk, app, auth, db, storage };
    return cache;
  }

  return {
    isConfigured: () => configured,
    ensure,
    // Read-only Firestore gateway used by repositories. No writes here.
    createFirestoreGateway() {
      return createFirestoreGateway({ ensure });
    },
    // User-owned data gateway (users/{uid}/...). Used for the signed-in user's
    // own private mobile day logs only — never another user's data.
    createUserDataGateway() {
      return createUserDataGateway({ ensure });
    },
    // Storage gateway for the signed-in user's own media proof uploads only.
    createStorageGateway() {
      return createStorageGateway({ ensure });
    },
  };
}

// Uploads a file/blob to a Storage path and returns its download URL. Used only
// for the signed-in user's own evidence uploads (rules enforce owner-only).
export function createStorageGateway({ ensure }) {
  async function uploadFile(path, data, metadata = {}) {
    const { sdk, storage } = await ensure();
    if (!storage) throw new Error('Storage is not available');
    const ref = sdk.ref(storage, path);
    await sdk.uploadBytes(ref, data, metadata);
    const url = await sdk.getDownloadURL(ref);
    return { path, downloadURL: url };
  }
  async function getDownloadURL(path) {
    const { sdk, storage } = await ensure();
    if (!storage) throw new Error('Storage is not available');
    const ref = sdk.ref(storage, path);
    return sdk.getDownloadURL(ref);
  }
  return { uploadFile, getDownloadURL };
}

// Reads/writes documents under users/{uid}/{sub}/{id}. Firestore rules already
// restrict this subtree to the owning user. No public/shared writes here.
export function createUserDataGateway({ ensure }) {
  function docToRecord(d) {
    const exists = typeof d.exists === 'function' ? d.exists() : d.exists;
    if (!exists) return null;
    return { id: d.id, data: typeof d.data === 'function' ? d.data() : {} };
  }

  async function getUserDoc(uid, sub, id) {
    const { sdk, db } = await ensure();
    const ref = sdk.doc(db, 'users', uid, sub, id);
    const snap = await sdk.getDoc(ref);
    return docToRecord(snap);
  }

  async function setUserDoc(uid, sub, id, data) {
    const { sdk, db } = await ensure();
    const ref = sdk.doc(db, 'users', uid, sub, id);
    const stamped = { ...data, updatedAt: sdk.serverTimestamp ? sdk.serverTimestamp() : Date.now() };
    // merge:true keeps the write idempotent (upsert, no duplicate doc).
    await sdk.setDoc(ref, stamped, { merge: true });
    return { id, ...data };
  }

  async function listUserDocs(uid, sub, max = 30) {
    const { sdk, db } = await ensure();
    const col = sdk.collection(db, 'users', uid, sub);
    const q = sdk.limit ? sdk.query(col, sdk.limit(max)) : col;
    const snap = await sdk.getDocs(q);
    return (snap.docs || []).map(docToRecord).filter(Boolean);
  }

  return { getUserDoc, setUserDoc, listUserDocs };
}

// Read-only Firestore gateway. Returns plain { id, data } records so mappers can
// normalize without any Firebase objects leaking into UI state.
export function createFirestoreGateway({ ensure }) {
  function docToRecord(d) {
    return { id: d.id, data: typeof d.data === 'function' ? d.data() : {} };
  }

  async function fetchOwnerPaths(uid, max = 50) {
    const { sdk, db } = await ensure();
    const col = sdk.collection(db, 'paths');
    const q = sdk.query(col, sdk.where('ownerId', '==', uid), sdk.limit(max));
    const snap = await sdk.getDocs(q);
    return (snap.docs || []).map(docToRecord);
  }

  async function fetchPublicPaths(max = 30) {
    const { sdk, db } = await ensure();
    const col = sdk.collection(db, 'paths');
    const q = sdk.query(col, sdk.where('visibility', '==', 'public'), sdk.limit(max));
    const snap = await sdk.getDocs(q);
    return (snap.docs || []).map(docToRecord);
  }

  async function fetchPathById(pathId) {
    const { sdk, db } = await ensure();
    const ref = sdk.doc(db, 'paths', pathId);
    const snap = await sdk.getDoc(ref);
    if (!snap || (typeof snap.exists === 'function' ? !snap.exists() : !snap.exists)) return null;
    return docToRecord(snap);
  }

  async function fetchSubcollection(pathId, name, max = 200) {
    const { sdk, db } = await ensure();
    const col = sdk.collection(db, 'paths', pathId, name);
    const q = sdk.limit ? sdk.query(col, sdk.limit(max)) : col;
    const snap = await sdk.getDocs(q);
    return (snap.docs || []).map(docToRecord);
  }

  return { fetchOwnerPaths, fetchPublicPaths, fetchPathById, fetchSubcollection };
}

export default createFirebaseClient;
