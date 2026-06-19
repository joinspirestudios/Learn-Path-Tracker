// Firebase init - reads the PUBLIC web config from Vite env vars.
// These VITE_* values are inlined into the client bundle at build time.
// That is expected and safe: the Firebase apiKey is a project identifier,
// NOT a secret. Real security lives in your Firestore rules + Auth.
//
// TRULY SECRET keys (Gemini, YouTube Data API, Stripe, etc.) must NOT use a
// VITE_ prefix and must NOT be imported here - keep them server-side in /api.

import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, where, writeBatch } from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

const env = import.meta.env || {};

const cfg = {
  apiKey:     env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:      env.VITE_FIREBASE_APP_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
};

export const EXPECTED_FIREBASE_PROJECT_ID = 'learn-path-tracker';

const configComplete = !!(cfg.apiKey && cfg.authDomain && cfg.projectId && cfg.appId);
const present = configComplete;
let auth = null, db = null, storage = null;
let initializationError = null;
if (present) {
  try {
    const app = initializeApp(cfg);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    // Keep the user signed in across refreshes (localStorage-backed).
    setPersistence(auth, browserLocalPersistence).catch(e => console.warn('persistence:', e));
  } catch (e) {
    initializationError = e;
    console.warn('Firebase init failed - running in local mode.', e);
  }
}

export const firebaseDiagnostics = {
  projectId: cfg.projectId || null,
  expectedProjectId: EXPECTED_FIREBASE_PROJECT_ID,
  configComplete,
  firebaseInitialized: !!(auth || db),
  authInitialized: !!auth,
  firestoreInitialized: !!db,
  storageConfigured: !!cfg.storageBucket,
  initializationError: initializationError ? String(initializationError.message || initializationError) : null,
};

if(env.DEV){
  console.info('[firebase diagnostics]', {
    projectId: firebaseDiagnostics.projectId,
    expectedProjectId: firebaseDiagnostics.expectedProjectId,
    configComplete: firebaseDiagnostics.configComplete,
    firebaseInitialized: firebaseDiagnostics.firebaseInitialized,
    firestoreInitialized: firebaseDiagnostics.firestoreInitialized,
    storageConfigured: firebaseDiagnostics.storageConfigured,
  });
}

export const fb = {
  present, configComplete,
  ready: !!(auth && db),
  firestoreReady: !!db,
  projectId: cfg.projectId || null,
  initializationError,
  auth, db,
  storage, storageReady: !!(storage && cfg.storageBucket),
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail,
  doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, where, writeBatch,
  storageRef, uploadBytes, getDownloadURL,
};
