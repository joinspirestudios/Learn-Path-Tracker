import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getMobileFirebaseConfig, hasMobileFirebaseConfig, getMobileApiBaseUrl, FIREBASE_ENV_KEYS,
} from '../apps/mobile/src/services/env.js';
import { createFirebaseClient } from '../apps/mobile/src/services/firebaseClient.js';
import { createMobileAuthService, safeAuthMessage, toSafeUser } from '../apps/mobile/src/services/authService.js';
import { createPathRepository } from '../apps/mobile/src/services/pathRepository.js';
import { createDiscoveryRepository } from '../apps/mobile/src/services/discoveryRepository.js';
import { createRoadmapRepository } from '../apps/mobile/src/services/roadmapRepository.js';
import {
  mapPathCard, mapPublicPreview, mapRoadmap, mapTask, isPublicDiscoverable,
} from '../apps/mobile/src/core/mobilePathMappers.js';
import { resolveAuthStatus, AUTH_STATUS } from '../apps/mobile/src/core/mobileCloudState.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = resolve(root, 'apps/mobile');

function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const FULL_ENV = {
  EXPO_PUBLIC_FIREBASE_API_KEY: 'k', EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'd',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'p', EXPO_PUBLIC_FIREBASE_APP_ID: 'a',
};

// A fake firebase SDK for client/gateway tests (no real network).
function fakeSdk(docs = []) {
  return {
    getApps: () => [],
    initializeApp: () => ({ name: 'app' }),
    getAuth: () => ({ currentUser: null }),
    getFirestore: () => ({}),
    collection: (...a) => ({ kind: 'col', a }),
    query: (...a) => ({ kind: 'q', a }),
    where: (...a) => ({ kind: 'where', a }),
    limit: (n) => ({ kind: 'limit', n }),
    doc: (...a) => ({ kind: 'doc', a }),
    getDocs: async () => ({ docs }),
    getDoc: async () => (docs[0]
      ? { exists: () => true, id: docs[0].id, data: docs[0].data }
      : { exists: () => false }),
    onAuthStateChanged: (auth, cb) => { cb(null); return () => {}; },
    signInWithEmailAndPassword: async () => ({ user: { uid: 'u1', email: 'x@y.z' } }),
    createUserWithEmailAndPassword: async () => ({ user: { uid: 'u2', email: 'n@y.z' } }),
    signOut: async () => {},
  };
}
function fakeDoc(id, data) { return { id, data: () => data }; }

/* ── 1. Dependencies and package boundaries ── */

test('Phase 6.12 mobile package may include firebase, not firebase-admin', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  assert.ok(pkg.dependencies.firebase, 'firebase present');
  assert.equal(pkg.dependencies['firebase-admin'], undefined, 'no firebase-admin');
  assert.equal(pkg.dependencies['@react-native-async-storage/async-storage'], undefined,
    'AsyncStorage deferred (persistence documented as limited)');
});

test('Phase 6.12 root package does not gain mobile Firebase/Auth deps', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const banned of ['expo', 'react-native', '@react-native-async-storage/async-storage']) {
    assert.equal(deps[banned], undefined, banned + ' must not be a root dependency');
  }
});

test('Phase 6.12 Vercel API function count unchanged (ai/community/voice)', () => {
  const apiDir = resolve(root, 'api');
  const deployable = readdirSync(apiDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map(e => e.name).sort();
  assert.deepEqual(deployable, ['ai.js', 'community.js', 'voice.js']);
  assert.ok(deployable.length < 12);
});

test('Phase 6.12 no committed node_modules, env files, or credentials in mobile', () => {
  assert.equal(existsSync(resolve(mobile, 'node_modules')), false);
  for (const b of ['.env', '.env.local', '.env.production', 'eas.json',
    'google-services.json', 'GoogleService-Info.plist']) {
    assert.equal(existsSync(resolve(mobile, b)), false, 'must not commit ' + b);
  }
});

/* ── 2. Env config ── */

test('Phase 6.12 env exposes firebase config helpers', () => {
  assert.equal(typeof getMobileFirebaseConfig, 'function');
  assert.equal(typeof hasMobileFirebaseConfig, 'function');
  assert.equal(typeof getMobileApiBaseUrl, 'function');
  assert.equal(FIREBASE_ENV_KEYS.apiKey, 'EXPO_PUBLIC_FIREBASE_API_KEY');
});

test('Phase 6.12 missing env returns safe missing-config state', () => {
  assert.equal(hasMobileFirebaseConfig({}), false);
  assert.deepEqual(getMobileFirebaseConfig({}), {});
  assert.equal(hasMobileFirebaseConfig(FULL_ENV), true);
  assert.equal(getMobileFirebaseConfig(FULL_ENV).apiKey, 'k');
});

test('Phase 6.12 .env.example documents EXPO_PUBLIC firebase variables, no real secrets', () => {
  const example = read('apps/mobile/.env.example');
  for (const key of Object.values(FIREBASE_ENV_KEYS)) assert.match(example, new RegExp(key));
  assert.doesNotMatch(example, /private_key|service_account|BEGIN PRIVATE KEY/i);
});

/* ── 3. Firebase client ── */

test('Phase 6.12 firebaseClient imports the client SDK only and lazily', () => {
  const src = read('apps/mobile/src/services/firebaseClient.js');
  assert.match(src, /firebase\/app/);
  assert.match(src, /firebase\/auth/);
  assert.match(src, /firebase\/firestore/);
  assert.doesNotMatch(src, /firebase-admin/);
  assert.doesNotMatch(src, /api-handlers|\/server\//);
  // Lazy: firebase is loaded via dynamic import(), not a static top-level import.
  assert.doesNotMatch(src, /^import\s+[^\n]*from\s+['"]firebase\//m);
  assert.match(src, /import\(['"]firebase\/app['"]\)/);
});

test('Phase 6.12 firebaseClient does no network at import time and is injectable', async () => {
  const client = createFirebaseClient({ config: FULL_ENV.then ? {} : { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' }, sdkLoader: async () => fakeSdk() });
  assert.equal(client.isConfigured(), true);
  const ensured = await client.ensure();
  assert.ok(ensured.app && ensured.auth && ensured.db);
});

test('Phase 6.12 firebaseClient gateway returns plain {id,data} records (read-only)', async () => {
  const docs = [fakeDoc('p1', { title: 'X', visibility: 'public', discoverable: true })];
  const client = createFirebaseClient({ config: { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' }, sdkLoader: async () => fakeSdk(docs) });
  const gw = client.createFirestoreGateway();
  const owner = await gw.fetchOwnerPaths('uid');
  assert.equal(owner[0].id, 'p1');
  assert.equal(owner[0].data.title, 'X');
  const pub = await gw.fetchPublicPaths();
  assert.equal(pub[0].id, 'p1');
});

/* ── 4. Auth service ── */

test('Phase 6.12 authService exposes the expected surface', () => {
  const client = { isConfigured: () => true, ensure: async () => ({ sdk: fakeSdk(), auth: { currentUser: null } }) };
  const svc = createMobileAuthService({ client });
  for (const m of ['isConfigured', 'subscribeAuthState', 'signIn', 'createAccount', 'signOut', 'getIdToken']) {
    assert.equal(typeof svc[m], 'function', 'has ' + m);
  }
});

test('Phase 6.12 authService sign in/create/sign out use injected SDK (no live calls)', async () => {
  const client = { isConfigured: () => true, ensure: async () => ({ sdk: fakeSdk(), auth: { currentUser: null } }) };
  const svc = createMobileAuthService({ client });
  const signedIn = await svc.signIn('x@y.z', 'pw');
  assert.equal(signedIn.ok, true);
  assert.equal(signedIn.user.email, 'x@y.z');
  const created = await svc.createAccount('n@y.z', 'pw');
  assert.equal(created.ok, true);
  const out = await svc.signOut();
  assert.equal(out.ok, true);
});

test('Phase 6.12 authService returns safe messages and never leaks codes', () => {
  assert.equal(safeAuthMessage({ code: 'auth/wrong-password' }, 'signIn'), 'Check your email and password.');
  assert.equal(safeAuthMessage({ code: 'auth/network-request-failed' }), 'You are offline or the connection failed.');
  assert.doesNotMatch(safeAuthMessage({ code: 'auth/internal' }, 'create'), /auth\//);
});

test('Phase 6.12 authService config-missing path returns safe message, no throw', async () => {
  const client = { isConfigured: () => false, ensure: async () => { throw new Error('should not be called'); } };
  const svc = createMobileAuthService({ client });
  const res = await svc.signIn('x', 'y');
  assert.equal(res.ok, false);
  assert.match(res.message, /not configured/i);
});

test('Phase 6.12 authService source does not log tokens, email, password or raw errors', () => {
  const src = read('apps/mobile/src/services/authService.js');
  assert.doesNotMatch(src, /console\.(log|info|warn|error)/);
  assert.match(src, /toSafeUser/);
  // Safe user carries no token.
  const safe = toSafeUser({ uid: 'abcdef123', email: 'e@x.z', accessToken: 'SECRET' });
  assert.equal(safe.accessToken, undefined);
  assert.equal(safe.email, 'e@x.z');
});

/* ── 5. Auth gate (source-level on MobileApp) ── */

test('Phase 6.12 MobileApp wires auth gate states', () => {
  const src = read('apps/mobile/src/app/MobileApp.js');
  assert.match(src, /createMobileAuthService/);
  assert.match(src, /AUTH_STATUS\.LOADING/);
  assert.match(src, /AUTH_STATUS\.SIGNED_IN/);
  assert.match(src, /AuthWelcomeScreen/);
  assert.match(src, /AuroraLoadingState/);
});

test('Phase 6.12 resolveAuthStatus maps configured/loading/user correctly', () => {
  assert.equal(resolveAuthStatus({ configured: false }), AUTH_STATUS.CONFIG_MISSING);
  assert.equal(resolveAuthStatus({ configured: true, loading: true }), AUTH_STATUS.LOADING);
  assert.equal(resolveAuthStatus({ configured: true, loading: false, user: null }), AUTH_STATUS.SIGNED_OUT);
  assert.equal(resolveAuthStatus({ configured: true, loading: false, user: { uid: 'u' } }), AUTH_STATUS.SIGNED_IN);
});

test('Phase 6.12 ProfileScreen shows sign out and never renders an ID token', () => {
  const src = read('apps/mobile/src/screens/ProfileScreen.js');
  assert.match(src, /Sign out/);
  assert.doesNotMatch(src, /getIdToken|idToken|accessToken/);
});

/* ── 6. Repositories ── */

const repoGateway = {
  fetchOwnerPaths: async () => [
    { id: 'mine', data: { title: 'Mine', visibility: 'private', taskCount: 3, evidenceUrl: 'https://secret/proof.png' } },
  ],
  fetchPublicPaths: async () => [
    { id: 'pub', data: { title: 'Public', visibility: 'public', discoverable: true } },
    { id: 'priv', data: { title: 'Private', visibility: 'private' } },
    { id: 'hidden', data: { title: 'Hidden', visibility: 'public', discoverable: false } },
  ],
  fetchPathById: async (id) => (id === 'pub'
    ? { id: 'pub', data: { title: 'Public', visibility: 'public', discoverable: true, description: 'D' } }
    : { id, data: { title: 'X', visibility: 'private' } }),
  fetchSubcollection: async (id, name) => (name === 'tasks'
    ? [{ id: 't1', data: { title: 'Task one', evidenceRequired: true, evidenceUrl: 'https://secret/x', sectionId: 's1' } }]
    : [{ id: 's1', data: { title: 'Section one' } }]),
};

test('Phase 6.12 pathRepository is read-only and normalizes owner paths', async () => {
  const repo = createPathRepository({ gateway: repoGateway });
  const paths = await repo.listUserPaths({ uid: 'u' });
  assert.equal(paths[0].title, 'Mine');
  assert.equal(paths[0].isCloud, true);
  assert.doesNotMatch(JSON.stringify(paths), /evidenceUrl|secret/);
});

test('Phase 6.12 discoveryRepository returns only public discoverable paths', async () => {
  const repo = createDiscoveryRepository({ gateway: repoGateway });
  const cards = await repo.listPublicPaths({});
  const ids = cards.map(c => c.id);
  assert.deepEqual(ids, ['pub'], 'private and non-discoverable excluded');
  const preview = await repo.getPublicPathPreview('pub');
  assert.equal(preview.title, 'Public');
  const blocked = await repo.getPublicPathPreview('priv');
  assert.equal(blocked, null, 'private path has no public preview');
});

test('Phase 6.12 discoveryRepository applies a local query filter', async () => {
  const repo = createDiscoveryRepository({ gateway: repoGateway });
  const hit = await repo.listPublicPaths({ filters: { query: 'public' } });
  assert.equal(hit.length, 1);
  const miss = await repo.listPublicPaths({ filters: { query: 'zzz-nomatch' } });
  assert.equal(miss.length, 0);
});

test('Phase 6.12 roadmapRepository maps sections/tasks without exposing evidence', async () => {
  const repo = createRoadmapRepository({ gateway: repoGateway });
  const roadmap = await repo.getRoadmap('pub');
  assert.equal(roadmap.pathId, 'pub');
  assert.ok(roadmap.daysOrSections.length >= 1);
  assert.equal(roadmap.tasks[0].title, 'Task one');
  assert.equal(roadmap.tasks[0].requiresProof, true);
  assert.doesNotMatch(JSON.stringify(roadmap), /evidenceUrl|secret/);
});

test('Phase 6.12 mappers strip private/evidence fields', () => {
  const card = mapPathCard({ id: 'p', data: { title: 'T', evidenceUrl: 'x', downloadURL: 'y', storagePath: 'z' } });
  assert.doesNotMatch(JSON.stringify(card), /evidenceUrl|downloadURL|storagePath/);
  const task = mapTask({ id: 't', data: { title: 'T', evidenceUrl: 'x', reflection: 'private' } });
  assert.doesNotMatch(JSON.stringify(task), /evidenceUrl|reflection/);
  assert.equal(isPublicDiscoverable({ data: { visibility: 'public', discoverable: true } }), true);
  assert.equal(isPublicDiscoverable({ data: { visibility: 'private' } }), false);
});

/* ── 7. Screens (source-level) ── */

test('Phase 6.12 PathsScreen renders loading/empty/error/loaded and separates local vs cloud', () => {
  const src = read('apps/mobile/src/screens/PathsScreen.js');
  assert.match(src, /ASYNC_STATUS\.LOADING/);
  assert.match(src, /ASYNC_STATUS\.ERROR/);
  assert.match(src, /ASYNC_STATUS\.EMPTY/);
  assert.match(src, /Local session/);
  assert.match(src, /Cloud paths/);
  assert.doesNotMatch(src, /joined|leaderboard|followers?/i);
});

test('Phase 6.12 PathRoadmapScreen renders read-only roadmap without inventing data', () => {
  const src = read('apps/mobile/src/screens/PathRoadmapScreen.js');
  assert.match(src, /MobileRoadmapList/);
  assert.match(src, /Read-only/i);
  assert.doesNotMatch(src, /evidenceUrl|downloadURL|storagePath/i);
});

test('Phase 6.12 DiscoverScreen has search + cards and no social ranking copy', () => {
  const src = read('apps/mobile/src/screens/DiscoverScreen.js');
  assert.match(src, /Search/);
  assert.match(src, /MobilePathCard/);
  assert.match(src, /not configured/i);
  assert.doesNotMatch(src, /Following|leaderboard|ranking|followers?/i);
});

test('Phase 6.12 PublicPathPreviewScreen previews without join writes', () => {
  const src = read('apps/mobile/src/screens/PublicPathPreviewScreen.js');
  assert.match(src, /Join coming soon|Join on web/i);
  assert.doesNotMatch(src, /joinPath|enroll|writeEnrollment/i);
});

test('Phase 6.12 TodayScreen labels cloud-path session as local/not synced', () => {
  const src = read('apps/mobile/src/screens/TodayScreen.js');
  assert.match(src, /not synced|not connected yet/i);
  assert.match(src, /selectedCloudPath/);
  assert.doesNotMatch(src, /proof verified|synced to cloud/i);
});

/* ── 8. No forbidden behavior (whole mobile tree) ── */

test('Phase 6.12 mobile source has no admin/server/web-DOM imports and no screen fetch', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /from\s+['"][^'"]*src\/views(\.js|\/)/, file);
    assert.doesNotMatch(src, /from\s+['"][^'"]*styles\.css/, file);
    assert.doesNotMatch(src, /from\s+['"][^'"]*\/header\.js/, file);
    assert.doesNotMatch(src, /from\s+['"]firebase-admin/, file);
    assert.doesNotMatch(src, /from\s+['"][^'"]*api-handlers\//, file);
  }
  // Screens must not call fetch directly or import the apiClient.
  for (const file of walk(resolve(mobile, 'src/screens'))) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /\bfetch\s*\(/, file + ' calls fetch');
    assert.doesNotMatch(src, /apiClient/, file + ' imports apiClient');
  }
});

test('Phase 6.12 no fake metrics or game economy anywhere in mobile source', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /leaderboard|hearts|gems|\blives\b|\bshop\b|proof verified/i, file);
  }
});

/* ── 9. Docs ── */

test('Phase 6.12 documentation exists and references the phase', () => {
  assert.ok(existsSync(resolve(root, 'docs/mobile-auth-paths-discovery.md')));
  assert.match(read('README.md'), /Phase 6\.12/);
  assert.match(read('apps/mobile/README.md'), /EXPO_PUBLIC_FIREBASE/);
  const doc = read('docs/mobile-auth-paths-discovery.md');
  assert.match(doc, /proof upload/i);
  assert.match(doc, /6\.13/);
  assert.match(doc, /read-only/i);
});
