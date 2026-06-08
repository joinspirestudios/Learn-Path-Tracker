// Firebase init - reads the PUBLIC web config from Vite env vars.
// These VITE_* values are inlined into the client bundle at build time.
// That is expected and safe: the Firebase apiKey is a project identifier,
// NOT a secret. Real security lives in your Firestore rules + Auth.
//
// TRULY SECRET keys (Gemini, YouTube Data API, Stripe, etc.) must NOT use a
// VITE_ prefix and must NOT be imported here - keep them server-side in /api.

import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, where } from 'firebase/firestore';

const cfg = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:      import.meta.env.VITE_FIREBASE_APP_ID,
};

const present = !!(cfg.apiKey && cfg.projectId);
let auth = null, db = null;
if (present) {
  try {
    const app = initializeApp(cfg);
    auth = getAuth(app);
    db = getFirestore(app);
    // Keep the user signed in across refreshes (localStorage-backed).
    setPersistence(auth, browserLocalPersistence).catch(e => console.warn('persistence:', e));
  } catch (e) {
    console.warn('Firebase init failed - running in local mode.', e);
  }
}

export const fb = {
  present,
  ready: !!auth,
  auth, db,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail,
  doc, getDoc, setDoc, collection, getDocs, deleteDoc, query, where,
};
