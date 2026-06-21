import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  MOBILE_ARCHITECTURE_PRINCIPLES,
  MOBILE_TABS,
  MOBILE_MVP_SCREENS,
  MOBILE_API_CONTRACTS,
  MOBILE_SHARED_BRAIN_MODULES,
  MOBILE_REBUILT_SKIN_AREAS,
  MOBILE_DEFERRED_FEATURES,
  MOBILE_SECRET_HANDLING_RULES,
} from '../src/mobile-architecture.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('mobile architecture principles include one brain/two skins', () => {
  assert.ok(MOBILE_ARCHITECTURE_PRINCIPLES.some(p => /one brain.*two skins/i.test(p)));
});

test('mobile tabs include Today, Paths, Discover, Progress and Profile', () => {
  const ids = MOBILE_TABS.map(t => t.id);
  assert.ok(ids.includes('today'));
  assert.ok(ids.includes('paths'));
  assert.ok(ids.includes('discover'));
  assert.ok(ids.includes('progress'));
  assert.ok(ids.includes('profile'));
  assert.equal(MOBILE_TABS.length, 5);
  MOBILE_TABS.forEach(tab => {
    assert.ok(tab.label, `tab ${tab.id} has label`);
    assert.ok(tab.purpose, `tab ${tab.id} has purpose`);
  });
});

test('mobile MVP screens include DailyFocusScreen', () => {
  assert.ok(MOBILE_MVP_SCREENS.some(s => s.id === 'DailyFocusScreen'));
});

test('mobile MVP screens include ProofCaptureScreen', () => {
  assert.ok(MOBILE_MVP_SCREENS.some(s => s.id === 'ProofCaptureScreen'));
});

test('mobile MVP screens include CompletionResultScreen', () => {
  assert.ok(MOBILE_MVP_SCREENS.some(s => s.id === 'CompletionResultScreen'));
});

test('mobile MVP screens cover auth, today, paths, discover, progress and profile', () => {
  const ids = MOBILE_MVP_SCREENS.map(s => s.id);
  ['AuthWelcomeScreen', 'SignInScreen', 'TodayScreen', 'DailyFocusScreen',
   'ProofCaptureScreen', 'CompletionResultScreen', 'JoinedPathsScreen',
   'PathRoadmapScreen', 'PublicPathPreviewScreen', 'DiscoverScreen',
   'PublicProgressEntryScreen', 'ProfileScreen', 'SettingsScreen'].forEach(id => {
    assert.ok(ids.includes(id), `missing screen: ${id}`);
  });
  MOBILE_MVP_SCREENS.forEach(screen => {
    assert.ok(screen.purpose, `screen ${screen.id} has purpose`);
  });
});

test('API contracts include all current public API URLs', () => {
  const urls = Object.keys(MOBILE_API_CONTRACTS);
  ['/api/generate-path', '/api/interpret-goal', '/api/deepgram-token',
   '/api/transcribe-voice', '/api/join-path', '/api/publish-progress',
   '/api/unpublish-progress', '/api/react-progress', '/api/comment-progress',
   '/api/hide-progress-comment', '/api/report-path', '/api/report-progress-comment',
   '/api/sync-path-metrics'].forEach(url => {
    assert.ok(urls.includes(url), `missing API contract: ${url}`);
  });
  Object.entries(MOBILE_API_CONTRACTS).forEach(([url, contract]) => {
    assert.equal(contract.method, 'POST', `${url} method is POST`);
    assert.equal(contract.auth, true, `${url} requires auth`);
    assert.ok(contract.mobileUse, `${url} has mobile use case`);
  });
});

test('shared brain modules include daily-session scoring', () => {
  assert.ok(MOBILE_SHARED_BRAIN_MODULES.includes('src/daily-session-model.js'));
});

test('shared brain modules include intensity policy', () => {
  assert.ok(MOBILE_SHARED_BRAIN_MODULES.includes('src/intensity-policy.js'));
});

test('shared brain modules include schema versioning', () => {
  assert.ok(MOBILE_SHARED_BRAIN_MODULES.includes('src/schema-versioning.js'));
});

test('shared brain modules include public progress', () => {
  assert.ok(MOBILE_SHARED_BRAIN_MODULES.includes('src/public-progress.js'));
});

test('rebuilt skin areas include views.js web presentation layer', () => {
  assert.ok(MOBILE_REBUILT_SKIN_AREAS.includes('src/views.js'));
});

test('rebuilt skin areas include web-only modules that cannot transfer to mobile', () => {
  assert.ok(MOBILE_REBUILT_SKIN_AREAS.includes('src/views/daily-session.js'));
  assert.ok(MOBILE_REBUILT_SKIN_AREAS.includes('src/views/catalog/'));
  assert.ok(MOBILE_REBUILT_SKIN_AREAS.includes('src/styles.css'));
  assert.ok(MOBILE_REBUILT_SKIN_AREAS.includes('index.html'));
});

test('deferred features include push notifications, adaptive planning and Gemini/evidence intelligence', () => {
  assert.ok(MOBILE_DEFERRED_FEATURES.includes('Push notifications'));
  assert.ok(MOBILE_DEFERRED_FEATURES.includes('Adaptive planning'));
  assert.ok(MOBILE_DEFERRED_FEATURES.includes('Gemini/evidence intelligence'));
});

test('deferred features include product renaming and game economy', () => {
  assert.ok(MOBILE_DEFERRED_FEATURES.includes('Product renaming'));
  assert.ok(MOBILE_DEFERRED_FEATURES.includes('Leaderboards'));
  assert.ok(MOBILE_DEFERRED_FEATURES.includes('Hearts/gems/shop economy'));
});

test('secret handling rules reject committing Firebase service accounts, provider keys and EAS credentials', () => {
  const rules = MOBILE_SECRET_HANDLING_RULES.join(' ');
  assert.match(rules, /Firebase.*service account/i);
  assert.match(rules, /Deepgram/i);
  assert.match(rules, /Anthropic/i);
  assert.match(rules, /EAS/i);
  assert.match(rules, /Apple.*signing/i);
  assert.match(rules, /Google Play.*keystore/i);
});

test('mobile architecture module has no DOM or Firebase imports', () => {
  const source = readFileSync(resolve(root, 'src/mobile-architecture.js'), 'utf8');
  assert.doesNotMatch(source, /import.*from.*firebase/i);
  assert.doesNotMatch(source, /import.*from.*views/i);
  assert.doesNotMatch(source, /document\./);
  assert.doesNotMatch(source, /window\./);
  assert.doesNotMatch(source, /process\.env/);
});

test('docs/mobile-core-loop-and-architecture.md exists and covers required topics', () => {
  const docPath = resolve(root, 'docs/mobile-core-loop-and-architecture.md');
  assert.ok(existsSync(docPath), 'documentation file exists');
  const doc = readFileSync(docPath, 'utf8');
  assert.match(doc, /React Native/);
  assert.match(doc, /Expo/);
  assert.match(doc, /one.brain/i);
  assert.match(doc, /two.skins/i);
  assert.match(doc, /Daily Focus/);
  assert.match(doc, /proof upload/i);
  assert.match(doc, /API endpoint/i);
  assert.match(doc, /No mobile app is built yet/i);
});

test('no Expo project scaffold exists yet', () => {
  assert.equal(existsSync(resolve(root, 'apps', 'mobile')), false, 'no apps/mobile/');
  assert.equal(existsSync(resolve(root, 'mobile')), false, 'no mobile/');
  assert.equal(existsSync(resolve(root, 'expo')), false, 'no expo/');
  assert.equal(existsSync(resolve(root, 'app.json')), false, 'no app.json');
  assert.equal(existsSync(resolve(root, 'eas.json')), false, 'no eas.json');
  assert.equal(existsSync(resolve(root, 'app.config.js')), false, 'no app.config.js');
});

test('no EAS config or mobile signing credentials exist', () => {
  assert.equal(existsSync(resolve(root, 'eas.json')), false);
  assert.equal(existsSync(resolve(root, 'android')), false, 'no android project');
  assert.equal(existsSync(resolve(root, 'ios')), false, 'no ios project');
});
