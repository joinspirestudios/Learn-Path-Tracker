import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseDeepLink, deepLinkTab, DEEP_LINK_TABS,
} from '../apps/mobile/src/navigation/mobileDeepLinks.js';
import {
  ENV_STATUS, apiBaseStatus, firebaseStatus, storageStatus, environmentSummary,
} from '../apps/mobile/src/core/mobileEnvironmentChecks.js';
import {
  buildReadinessReport, coreCloudReady, READINESS_STATUS,
} from '../apps/mobile/src/core/mobileReadinessChecks.js';
import {
  storeReadinessChecklistStatus, betaBlockers, canStartInternalBeta, canSubmitToStore,
  INTERNAL_BETA_ITEMS, STORE_SUBMISSION_ITEMS,
} from '../apps/mobile/src/core/mobileStoreReadinessGates.js';
import { createMobileRuntimeDiagnostics } from '../apps/mobile/src/services/mobileRuntimeDiagnostics.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = resolve(root, 'apps/mobile');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const CONFIGURED_ENV = {
  EXPO_PUBLIC_LEARN_PATH_API_BASE_URL: 'https://learn-path-tracker.vercel.app',
  EXPO_PUBLIC_FIREBASE_API_KEY: 'k', EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'a.firebaseapp.com',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'p', EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'p.appspot.com',
  EXPO_PUBLIC_FIREBASE_APP_ID: '1:1:web:x',
};

/* ── 1. App config ── */

test('Phase 6.18 app.json has stable identity, scheme and identifiers', () => {
  const app = JSON.parse(read('apps/mobile/app.json')).expo;
  assert.equal(app.name, 'Learn Path Tracker');
  assert.ok(app.slug && /^[a-z0-9-]+$/.test(app.slug), 'stable slug');
  assert.equal(app.scheme, 'learnpathtracker');
  assert.ok(app.version, 'version present');
  assert.equal(app.ios.bundleIdentifier, 'com.joinspirestudios.learnpathtracker');
  assert.equal(app.android.package, 'com.joinspirestudios.learnpathtracker');
});

test('Phase 6.18 app.json includes accurate permission copy', () => {
  const raw = read('apps/mobile/app.json');
  assert.match(raw, /uses your camera only when you choose to take a proof photo/i);
  assert.match(raw, /uses your photo library only when you choose an image as proof/i);
  assert.match(raw, /sends reminders and progress alerts only when you enable notifications/i);
});

test('Phase 6.18 app.json does not request location/contacts/microphone', () => {
  const raw = read('apps/mobile/app.json');
  assert.doesNotMatch(raw, /NSLocation|NSContacts|NSMicrophone|ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION|RECORD_AUDIO|READ_CONTACTS/i);
});

/* ── 2. Env example ── */

test('Phase 6.18 .env.example exists with public placeholders only', () => {
  const env = read('apps/mobile/.env.example');
  assert.match(env, /EXPO_PUBLIC_LEARN_PATH_API_BASE_URL/);
  assert.match(env, /EXPO_PUBLIC_FIREBASE_API_KEY/);
  // No private/admin/secret fields.
  assert.doesNotMatch(env, /FIREBASE_PRIVATE_KEY|client_email|private_key|service_account|WEB_PUSH_PRIVATE_VAPID_KEY|ANTHROPIC|DEEPGRAM/i);
});

/* ── 3. Deep links ── */

test('Phase 6.18 deep links parse known routes', () => {
  assert.deepEqual(parseDeepLink('learnpathtracker://today'), { tab: 'today', pathId: null, reason: 'ok' });
  assert.equal(deepLinkTab('learnpathtracker://notifications'), 'notifications');
  assert.deepEqual(parseDeepLink('learnpathtracker://path/my-path_1'), { tab: 'paths', pathId: 'my-path_1', reason: 'ok' });
  for (const tab of DEEP_LINK_TABS) assert.equal(parseDeepLink('learnpathtracker://' + tab).tab, tab);
});

test('Phase 6.18 deep links reject unsafe schemes and fall back to today', () => {
  assert.equal(parseDeepLink('javascript:alert(1)').tab, 'today');
  assert.equal(parseDeepLink('data:text/html,x').tab, 'today');
  assert.equal(parseDeepLink('file:///etc/passwd').tab, 'today');
  assert.equal(parseDeepLink('learnpathtracker://unknown-route').tab, 'today');
  assert.equal(parseDeepLink('').tab, 'today');
  assert.equal(parseDeepLink('learnpathtracker://path/../../etc').tab, 'today'); // invalid id
});

test('Phase 6.18 deep links drop query/hash so tokens/evidence are never parsed', () => {
  const r = parseDeepLink('learnpathtracker://today?token=eyJsecret&evidenceUrl=https://x/proof');
  assert.equal(r.tab, 'today');
  assert.doesNotMatch(JSON.stringify(r), /eyJsecret|evidenceUrl|proof/);
});

/* ── 4. Diagnostics / readiness checks ── */

test('Phase 6.18 environment checks report status without exposing values', () => {
  assert.equal(firebaseStatus({}), ENV_STATUS.MISSING);
  assert.equal(firebaseStatus(CONFIGURED_ENV), ENV_STATUS.CONFIGURED);
  assert.equal(storageStatus(CONFIGURED_ENV), ENV_STATUS.CONFIGURED);
  assert.equal(apiBaseStatus(CONFIGURED_ENV), ENV_STATUS.CONFIGURED);
  const summary = environmentSummary(CONFIGURED_ENV);
  // Only status labels — never the actual key/bucket values.
  assert.doesNotMatch(JSON.stringify(summary), /firebaseapp\.com|appspot\.com|1:1:web/);
});

test('Phase 6.18 readiness report returns safe labels only', () => {
  const report = buildReadinessReport({
    env: CONFIGURED_ENV, signedIn: true, appVersion: '0.1.0', platform: 'ios',
    imagePickerAvailable: true, asyncStorageAvailable: true, fileSystemAvailable: true, notifications: 'enabled',
  });
  assert.equal(report.firebase, ENV_STATUS.CONFIGURED);
  assert.equal(report.auth, READINESS_STATUS.SIGNED_IN);
  assert.equal(report.imageProof, READINESS_STATUS.AVAILABLE);
  assert.equal(report.notifications, 'enabled');
  assert.equal(coreCloudReady({ env: CONFIGURED_ENV }), true);
  assert.equal(coreCloudReady({ env: {} }), false);
});

test('Phase 6.18 runtime diagnostics snapshot never contains secret values', () => {
  const diag = createMobileRuntimeDiagnostics({ env: CONFIGURED_ENV, appVersion: '0.1.0', platform: 'android' });
  const snap = diag.snapshot({ signedIn: false, notifications: 'disabled' });
  assert.equal(snap.appVersion, '0.1.0');
  assert.equal(snap.auth, READINESS_STATUS.SIGNED_OUT);
  const json = JSON.stringify(snap);
  assert.doesNotMatch(json, /firebaseapp\.com|appspot\.com|1:1:web|eyJ|Bearer /);
});

/* ── 5. Diagnostics UI ── */

test('Phase 6.18 diagnostics UI exists and renders status labels only', () => {
  const card = read('apps/mobile/src/components/MobileDiagnosticsCard.js');
  const screen = read('apps/mobile/src/screens/MobileDiagnosticsScreen.js');
  assert.match(card, /App diagnostics/);
  assert.match(screen, /MobileDiagnosticsCard/);
  // No rendering of secrets / tokens / private proof / storage paths.
  for (const src of [card, screen]) {
    assert.doesNotMatch(src, /apiKey|idToken|getIdToken|storagePath|proofBody|evidenceUrl/i);
  }
});

test('Phase 6.18 diagnostics reachable from Profile', () => {
  assert.match(read('apps/mobile/src/screens/ProfileScreen.js'), /onOpenDiagnostics/);
  assert.match(read('apps/mobile/src/app/MobileApp.js'), /MobileDiagnosticsScreen/);
});

/* ── 6. Error boundary ── */

test('Phase 6.18 error boundary exists, renders safe fallback, hides private data', () => {
  const src = read('apps/mobile/src/components/MobileErrorBoundary.js');
  assert.match(src, /getDerivedStateFromError/);
  assert.match(src, /Something went wrong/);
  assert.match(src, /Restart app/);
  assert.match(src, /Open diagnostics/);
  // Never renders tokens/private proof; sanitizes any message it keeps.
  assert.doesNotMatch(src, /idToken|proofBody|evidenceUrl|storagePath/i);
  // App is wrapped by the boundary.
  assert.match(read('apps/mobile/App.js'), /MobileErrorBoundary/);
});

/* ── 7. EAS / readiness docs ── */

test('Phase 6.18 beta QA + EAS readiness docs exist with required content', () => {
  const qa = read('docs/mobile-store-readiness-beta-qa.md');
  assert.match(qa, /Do not proceed to store submission until this checklist is manually run/i);
  assert.match(qa, /data.safety/i);
  const eas = read('apps/mobile/eas-readiness.md');
  assert.match(eas, /EAS CLI/);
  assert.match(eas, /internal testing/i);
  assert.match(eas, /TestFlight/i);
  assert.match(eas, /never be committed/i);
  assert.match(eas, /privacy/i);
});

test('Phase 6.18 eas.json is safe (no credentials) with dev/preview/production profiles', () => {
  assert.equal(existsSync(resolve(mobile, 'eas.json')), true);
  const eas = JSON.parse(read('apps/mobile/eas.json'));
  assert.ok(eas.build.development && eas.build.preview && eas.build.production);
  const raw = read('apps/mobile/eas.json');
  assert.doesNotMatch(raw, /keystore|serviceAccount|service_account|password|p12|p8|certificate|EXPO_TOKEN|private_key/i);
});

/* ── 8. Store readiness gates ── */

test('Phase 6.18 store readiness gates require stronger gates for submission than beta', () => {
  // Nothing done → blocked for both.
  assert.equal(canStartInternalBeta({}), false);
  assert.equal(canSubmitToStore({}), false);
  assert.ok(betaBlockers({}).length > 0);

  // All beta items complete → beta allowed, store still blocked.
  const betaItems = {};
  for (const k of INTERNAL_BETA_ITEMS) betaItems[k] = true;
  assert.equal(canStartInternalBeta(betaItems), true);
  assert.equal(canSubmitToStore(betaItems), false, 'store needs strictly more than beta');

  // All submission items complete → both allowed.
  const allItems = {};
  for (const k of STORE_SUBMISSION_ITEMS) allItems[k] = true;
  assert.equal(canSubmitToStore(allItems), true);
  assert.ok(STORE_SUBMISSION_ITEMS.length > INTERNAL_BETA_ITEMS.length);
  // Checklist status maps every item.
  const status = storeReadinessChecklistStatus(allItems);
  assert.ok(Object.values(status).every(v => v === 'complete'));
});

/* ── 9. Mobile foundation registration ── */

test('Phase 6.18 foundation check lists the new mobile files', () => {
  const script = read('apps/mobile/scripts/check-foundation.mjs');
  for (const rel of [
    'src/components/MobileErrorBoundary.js', 'src/components/MobileDiagnosticsCard.js',
    'src/screens/MobileDiagnosticsScreen.js', 'src/core/mobileEnvironmentChecks.js',
    'src/core/mobileReadinessChecks.js', 'src/core/mobileStoreReadinessGates.js',
    'src/services/mobileRuntimeDiagnostics.js', 'src/navigation/mobileDeepLinks.js',
  ]) {
    assert.match(script, new RegExp(rel.replace(/[/.]/g, '\\$&')), rel);
  }
});

/* ── 10. No forbidden behavior ── */

test('Phase 6.18 no store credentials / keystores / service accounts in the repo tree', () => {
  const banned = /\.keystore$|\.jks$|\.p12$|\.p8$|google-services\.json$|GoogleService-Info\.plist$|credentials\.json$/i;
  function scan(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) scan(full);
      else assert.doesNotMatch(e.name, banned, full);
    }
  }
  scan(root);
});

test('Phase 6.18 no analytics/email/SMS/social/economy added in new mobile modules', () => {
  const files = [
    ...walk(resolve(mobile, 'src/core')).filter(f => /mobile(Environment|Readiness|StoreReadiness)/.test(f)),
    resolve(mobile, 'src/services/mobileRuntimeDiagnostics.js'),
    resolve(mobile, 'src/navigation/mobileDeepLinks.js'),
    resolve(mobile, 'src/components/MobileErrorBoundary.js'),
    resolve(mobile, 'src/components/MobileDiagnosticsCard.js'),
    resolve(mobile, 'src/screens/MobileDiagnosticsScreen.js'),
  ];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /\bfollowers?\b|\bfollowing\b|leaderboard|\branking\b|\bhearts?\b|\bgems?\b|shop economy/i, file);
    assert.doesNotMatch(src, /twilio|sendgrid|mailgun|nodemailer|@segment|mixpanel|amplitude\.com|google-analytics|gtag\(/i, file);
    assert.doesNotMatch(src, /from\s+['"]firebase-admin/, file);
  }
});

test('Phase 6.18 no new top-level Vercel API route files; admin pinned; mobile deps unchanged set', () => {
  const apiFiles = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_')).map(e => e.name).sort();
  assert.deepEqual(apiFiles, ['ai.js', 'community.js', 'voice.js']);
  assert.equal(JSON.parse(read('package.json')).dependencies['firebase-admin'], '13.10.0');
  // No new mobile runtime deps were needed for readiness work.
  assert.deepEqual(Object.keys(JSON.parse(read('apps/mobile/package.json')).dependencies).sort(),
    ['@react-native-async-storage/async-storage', 'expo', 'expo-file-system', 'expo-image-picker', 'expo-notifications', 'firebase', 'react', 'react-native']);
});
