// Mobile auth service — Firebase client Auth only.
//
// Dependency-injectable: pass a `client` (from createFirebaseClient) so tests can
// supply a mocked SDK and never contact Firebase. Never logs tokens, email,
// password, or raw Firebase error objects. Maps errors to safe, user-facing
// messages.

const SAFE_MESSAGES = {
  configMissing: 'Mobile cloud connection is not configured.',
  signInFailed: 'Check your email and password.',
  createFailed: 'This account could not be created yet.',
  network: 'You are offline or the connection failed.',
  generic: 'Something went wrong. Please try again.',
};

// Map a (possibly Firebase) error to a safe message without leaking codes.
export function safeAuthMessage(error, kind = 'generic') {
  const code = error && typeof error.code === 'string' ? error.code : '';
  if (code.includes('network')) return SAFE_MESSAGES.network;
  if (kind === 'signIn') return SAFE_MESSAGES.signInFailed;
  if (kind === 'create') return SAFE_MESSAGES.createFailed;
  if (kind === 'config') return SAFE_MESSAGES.configMissing;
  return SAFE_MESSAGES.generic;
}

// Return only safe, minimal user info — never tokens.
export function toSafeUser(user) {
  if (!user) return null;
  const uid = user.uid || '';
  return {
    uid,
    email: user.email || '',
    shortUid: uid ? uid.slice(0, 6) : '',
  };
}

export function createMobileAuthService({ client } = {}) {
  if (!client) {
    throw new Error('createMobileAuthService requires a Firebase client');
  }

  function isConfigured() {
    return client.isConfigured();
  }

  async function subscribeAuthState(callback) {
    if (!client.isConfigured()) {
      // No cloud connection — report signed-out immediately, no subscription.
      callback(null);
      return () => {};
    }
    const { sdk, auth } = await client.ensure();
    return sdk.onAuthStateChanged(auth, user => callback(toSafeUser(user)));
  }

  async function signIn(email, password) {
    if (!client.isConfigured()) {
      return { ok: false, message: SAFE_MESSAGES.configMissing };
    }
    try {
      const { sdk, auth } = await client.ensure();
      const cred = await sdk.signInWithEmailAndPassword(auth, email, password);
      return { ok: true, user: toSafeUser(cred && cred.user) };
    } catch (error) {
      return { ok: false, message: safeAuthMessage(error, 'signIn') };
    }
  }

  async function createAccount(email, password) {
    if (!client.isConfigured()) {
      return { ok: false, message: SAFE_MESSAGES.configMissing };
    }
    try {
      const { sdk, auth } = await client.ensure();
      const cred = await sdk.createUserWithEmailAndPassword(auth, email, password);
      return { ok: true, user: toSafeUser(cred && cred.user) };
    } catch (error) {
      return { ok: false, message: safeAuthMessage(error, 'create') };
    }
  }

  async function signOut() {
    if (!client.isConfigured()) return { ok: true };
    try {
      const { sdk, auth } = await client.ensure();
      await sdk.signOut(auth);
      return { ok: true };
    } catch (error) {
      return { ok: false, message: safeAuthMessage(error) };
    }
  }

  // For future protected API calls. Returns null if unavailable; never logs it.
  async function getIdToken() {
    if (!client.isConfigured()) return null;
    const { auth } = await client.ensure();
    const user = auth && auth.currentUser;
    if (!user || typeof user.getIdToken !== 'function') return null;
    return user.getIdToken();
  }

  return {
    isConfigured,
    subscribeAuthState,
    signIn,
    createAccount,
    signOut,
    getIdToken,
  };
}

export { SAFE_MESSAGES };
export default createMobileAuthService;
