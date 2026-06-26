import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  API_ENDPOINTS as ROOT_ENDPOINTS,
  API_CONTRACTS as ROOT_CONTRACTS,
  API_ROUTE_GROUPS as ROOT_GROUPS,
} from '../src/shared-api-contracts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mobile = resolve(root, 'apps/mobile');

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...walk(full));
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/* ── 1. Mobile app structure ── */

test('Phase 6.10 mobile foundation files exist', () => {
  const files = [
    'apps/mobile/package.json',
    'apps/mobile/app.json',
    'apps/mobile/App.js',
    'apps/mobile/README.md',
    'apps/mobile/src/app/MobileApp.js',
    'apps/mobile/src/theme/auroraTheme.js',
    'apps/mobile/src/navigation/mobileTabs.js',
    'apps/mobile/src/services/env.js',
    'apps/mobile/src/services/apiClient.js',
    'apps/mobile/src/shared/privacyRules.js',
    'apps/mobile/src/shared/api-contracts.generated.js',
  ];
  for (const f of files) assert.ok(existsSync(resolve(root, f)), 'missing ' + f);
});

test('Phase 6.10 all placeholder screens exist', () => {
  const screens = [
    'AuthWelcomeScreen', 'TodayScreen', 'DailyFocusScreen', 'CompletionResultScreen',
    'PathsScreen', 'PathRoadmapScreen', 'DiscoverScreen', 'PublicPathPreviewScreen',
    'ProgressScreen', 'ProfileScreen', 'SettingsScreen',
  ];
  for (const s of screens) {
    assert.ok(existsSync(resolve(mobile, 'src/screens/' + s + '.js')), 'missing screen ' + s);
  }
});

/* ── 2. Package boundaries ── */

test('Phase 6.10 root package.json does not add Expo/React Native deps', () => {
  const pkg = JSON.parse(read('package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const forbidden of ['expo', 'react-native', 'react', '@expo/cli', 'expo-router']) {
    assert.equal(deps[forbidden], undefined, forbidden + ' must not be a root dependency');
  }
});

test('Phase 6.10 mobile dependencies live only in apps/mobile/package.json', () => {
  const mobilePkg = JSON.parse(read('apps/mobile/package.json'));
  assert.ok(mobilePkg.dependencies.expo, 'expo present in mobile package');
  assert.ok(mobilePkg.dependencies.react, 'react present in mobile package');
  assert.ok(mobilePkg.dependencies['react-native'], 'react-native present in mobile package');
  assert.equal(mobilePkg.name, 'learn-path-tracker-mobile');
  assert.equal(mobilePkg.private, true);
});

test('Phase 6.10 root adds generate:mobile-contracts and runs the phase test', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['generate:mobile-contracts'], 'node scripts/generate-mobile-contracts.mjs');
  assert.match(pkg.scripts.test, /phase-6\.10-mobile-foundation\.test\.js/);
});

test('Phase 6.10 root Vercel function count is unchanged (community/ai/voice only)', () => {
  const apiDir = resolve(root, 'api');
  const deployable = readdirSync(apiDir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map(e => e.name)
    .sort();
  assert.deepEqual(deployable, ['ai.js', 'community.js', 'voice.js']);
  assert.ok(deployable.length < 12);
});

test('Phase 6.10 no apps/mobile/node_modules or env/credentials committed', () => {
  // node_modules should not be present in the working tree as committed content.
  assert.equal(existsSync(resolve(mobile, 'node_modules')), false, 'no committed node_modules');
  // Phase 6.18 adds a SAFE credential-free eas.json, so it is no longer banned;
  // real secrets/credentials remain banned below.
  const banned = ['.env', '.env.local', '.env.production',
    'google-services.json', 'GoogleService-Info.plist'];
  for (const b of banned) {
    assert.equal(existsSync(resolve(mobile, b)), false, 'must not commit ' + b);
  }
  // No keystores/certs/provisioning profiles anywhere in the mobile tree.
  for (const f of walkAll(mobile)) {
    assert.doesNotMatch(f, /\.(keystore|jks|p8|p12|mobileprovision|cer)$/i, 'credential file: ' + f);
  }
});

function walkAll(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkAll(full));
    else out.push(full);
  }
  return out;
}

/* ── 3. No forbidden imports ── */

test('Phase 6.10 mobile source does not import web DOM modules or server code', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  const forbidden = [
    /from\s+['"][^'"]*src\/views(\.js|\/)/,
    /from\s+['"][^'"]*styles\.css/,
    /from\s+['"][^'"]*\/header\.js/,
    /from\s+['"][^'"]*index\.html/,
    /from\s+['"]firebase-admin/,
    /from\s+['"][^'"]*api-handlers\//,
    /from\s+['"][^'"]*\/server\//,
  ];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    for (const re of forbidden) {
      assert.doesNotMatch(src, re, file + ' violates forbidden import ' + re);
    }
  }
});

test('Phase 6.10 mobile source does not use document/window/localStorage directly', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /\bdocument\./, file + ' uses document.');
    assert.doesNotMatch(src, /\bwindow\./, file + ' uses window.');
    assert.doesNotMatch(src, /\blocalStorage\b/, file + ' uses localStorage');
  }
});

/* ── 4. Aurora mobile theme ── */

test('Phase 6.10 Aurora mobile theme keeps the correct direction', async () => {
  const theme = (await import('../apps/mobile/src/theme/auroraTheme.js')).auroraTheme;
  assert.equal(theme.colors.accent.progress, '#6D5DF6', 'indigo is primary action/progress');
  assert.equal(theme.colors.accent.proof, '#2ED06E', 'green is proof/success');
  assert.equal(theme.colors.accent.success, '#2ED06E');
  assert.equal(theme.colors.accent.peak, '#B15CF6', 'purple is peak/perfect');
  assert.equal(theme.colors.accent.danger, '#FB5B5B', 'coral red is danger');
  assert.equal(theme.colors.surface.canvas, '#15131C');
  assert.equal(theme.colors.text.primary, '#F2EFF7');
});

test('Phase 6.10 Aurora theme does not restore gold as a primary accent', () => {
  const src = read('apps/mobile/src/theme/auroraTheme.js');
  assert.doesNotMatch(src, /#f2c75c/i, 'no gold primary');
  assert.doesNotMatch(src, /gold:/i, 'no gold accent key');
});

test('Phase 6.10 Aurora theme exposes spacing, radius and layout tokens', async () => {
  const theme = (await import('../apps/mobile/src/theme/auroraTheme.js')).auroraTheme;
  for (const k of ['xs', 'sm', 'md', 'lg', 'xl', 'xxl']) {
    assert.equal(typeof theme.spacing[k], 'number', 'spacing.' + k);
  }
  for (const k of ['sm', 'md', 'lg', 'card', 'panel', 'pill']) {
    assert.equal(typeof theme.radius[k], 'number', 'radius.' + k);
  }
  for (const k of ['screenPadding', 'cardPadding', 'rowGap', 'controlHeight']) {
    assert.equal(typeof theme.layout[k], 'number', 'layout.' + k);
  }
});

/* ── 5. API contracts sync ── */

test('Phase 6.10 contract generator and generated file exist', () => {
  assert.ok(existsSync(resolve(root, 'scripts/generate-mobile-contracts.mjs')));
  assert.ok(existsSync(resolve(mobile, 'src/shared/api-contracts.generated.js')));
});

test('Phase 6.10 generated file carries the generated-file warning', () => {
  const gen = read('apps/mobile/src/shared/api-contracts.generated.js');
  assert.match(gen, /Generated by scripts\/generate-mobile-contracts\.mjs\. Do not edit by hand\./);
});

test('Phase 6.10 generated contracts match the root source of truth', async () => {
  const gen = await import('../apps/mobile/src/shared/api-contracts.generated.js');
  assert.deepEqual(gen.API_ENDPOINTS, ROOT_ENDPOINTS, 'endpoints match');
  assert.deepEqual(Object.keys(gen.API_CONTRACTS).sort(), Object.keys(ROOT_CONTRACTS).sort(), 'contract keys match');
  assert.deepEqual(gen.API_ROUTE_GROUPS, ROOT_GROUPS, 'route groups match');
  assert.ok(Array.isArray(gen.SHARED_PRIVACY_CONSTRAINTS) && gen.SHARED_PRIVACY_CONSTRAINTS.length > 0);
});

test('Phase 6.10 generation does not change API endpoint paths', async () => {
  const gen = await import('../apps/mobile/src/shared/api-contracts.generated.js');
  for (const [k, v] of Object.entries(ROOT_ENDPOINTS)) {
    assert.equal(gen.API_ENDPOINTS[k], v, 'endpoint path stable for ' + k);
  }
});

/* ── 6. API client ── */

test('Phase 6.10 apiClient exports createApiClient and joins base + endpoint safely', async () => {
  const { createApiClient } = await import('../apps/mobile/src/services/apiClient.js');
  assert.equal(typeof createApiClient, 'function');

  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true }) };
  };
  const client = createApiClient({ baseUrl: 'https://example.test/', fetchImpl: fakeFetch });
  const result = await client.post('/api/join-path', { pathId: 'p1' });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0].url, 'https://example.test/api/join-path', 'no double slash, joined safely');
});

test('Phase 6.10 apiClient attaches Authorization only through getIdToken and never logs it', async () => {
  const { createApiClient } = await import('../apps/mobile/src/services/apiClient.js');
  const src = read('apps/mobile/src/services/apiClient.js');
  // No console logging of tokens or request bodies in the client.
  assert.doesNotMatch(src, /console\.(log|info|warn|error)[^\n]*(token|Authorization|body|payload)/i);

  let seenAuth = null;
  const fakeFetch = async (url, opts) => {
    seenAuth = opts.headers.Authorization || null;
    return { ok: true, status: 200, text: async () => '{}' };
  };
  const withToken = createApiClient({
    baseUrl: 'https://example.test',
    getIdToken: async () => 'secret-token',
    fetchImpl: fakeFetch,
  });
  await withToken.post('/api/join-path', { a: 1 });
  assert.equal(seenAuth, 'Bearer secret-token');

  const withoutToken = createApiClient({ baseUrl: 'https://example.test', fetchImpl: fakeFetch });
  await withoutToken.get('/api/join-path');
  assert.equal(seenAuth, null, 'no Authorization header without getIdToken');
});

test('Phase 6.10 env reads EXPO_PUBLIC_LEARN_PATH_API_BASE_URL', async () => {
  const env = await import('../apps/mobile/src/services/env.js');
  assert.equal(env.API_BASE_URL_ENV, 'EXPO_PUBLIC_LEARN_PATH_API_BASE_URL');
  assert.equal(env.getApiBaseUrl({ EXPO_PUBLIC_LEARN_PATH_API_BASE_URL: 'https://x.test/' }), 'https://x.test');
  assert.ok(env.getApiBaseUrl({}).startsWith('https://'), 'documented fallback');
});

/* ── 7. Privacy ── */

test('Phase 6.10 privacy rules cover evidence, reflections, audio, transcripts, tokens, secrets', async () => {
  const { MOBILE_PRIVACY_RULES } = await import('../apps/mobile/src/shared/privacyRules.js');
  const joined = MOBILE_PRIVACY_RULES.join(' ');
  assert.match(joined, /evidence URL/i);
  assert.match(joined, /reflection/i);
  assert.match(joined, /raw audio/i);
  assert.match(joined, /transcript/i);
  assert.match(joined, /token/i);
  assert.match(joined, /(credential|env|key)/i);
});

test('Phase 6.10 mobile placeholders contain no fake metrics or economy/social features', () => {
  const sources = [resolve(mobile, 'App.js'), ...walk(resolve(mobile, 'src'))];
  for (const file of sources) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /leaderboard|followers?|hearts|gems|shop|streak freeze shop/i, file);
  }
});

/* ── 8. Docs ── */

test('Phase 6.10 documentation exists and is referenced', () => {
  assert.ok(existsSync(resolve(root, 'docs/mobile-app-foundation.md')));
  assert.ok(existsSync(resolve(root, 'docs/aurora-ui-feedback-backlog.md')));
  assert.match(read('README.md'), /apps\/mobile/);
  assert.match(read('docs/mobile-core-loop-and-architecture.md'), /Phase 6\.10/);
});

test('Phase 6.10 backlog parks remaining web UI feedback for a later web-polish phase', () => {
  const backlog = read('docs/aurora-ui-feedback-backlog.md');
  assert.match(backlog, /6\.9\.12|Aurora Web UI Final Polish/i);
});

test('Phase 6.10 product name is not changed in mobile config', () => {
  const appJson = JSON.parse(read('apps/mobile/app.json'));
  assert.equal(appJson.expo.name, 'Learn Path Tracker');
  assert.doesNotMatch(read('apps/mobile/app.json'), /Prova/i);
});
