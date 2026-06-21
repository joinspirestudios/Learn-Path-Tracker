import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  PRODUCT_ANALYTICS_EVENTS,
  ANALYTICS_PRIVACY_RULES,
} from '../src/product-analytics-plan.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('analytics event taxonomy includes app_opened', () => {
  assert.ok(PRODUCT_ANALYTICS_EVENTS.app_opened);
  assert.ok(PRODUCT_ANALYTICS_EVENTS.app_opened.purpose);
});

test('analytics event taxonomy includes path_created', () => {
  assert.ok(PRODUCT_ANALYTICS_EVENTS.path_created);
});

test('analytics event taxonomy includes path_joined', () => {
  assert.ok(PRODUCT_ANALYTICS_EVENTS.path_joined);
});

test('analytics event taxonomy includes daily_focus_started', () => {
  assert.ok(PRODUCT_ANALYTICS_EVENTS.daily_focus_started);
});

test('analytics event taxonomy includes proof_uploaded', () => {
  assert.ok(PRODUCT_ANALYTICS_EVENTS.proof_uploaded);
});

test('analytics event taxonomy includes day_passed, day_strong and day_perfect', () => {
  assert.ok(PRODUCT_ANALYTICS_EVENTS.day_passed);
  assert.ok(PRODUCT_ANALYTICS_EVENTS.day_strong);
  assert.ok(PRODUCT_ANALYTICS_EVENTS.day_perfect);
});

test('analytics event taxonomy includes progress_published', () => {
  assert.ok(PRODUCT_ANALYTICS_EVENTS.progress_published);
});

test('analytics event taxonomy includes discover_search_used', () => {
  assert.ok(PRODUCT_ANALYTICS_EVENTS.discover_search_used);
});

test('each event has purpose, trigger, privacy classification and allowed properties', () => {
  Object.entries(PRODUCT_ANALYTICS_EVENTS).forEach(([name, event]) => {
    assert.ok(event.purpose, `${name} has purpose`);
    assert.ok(event.trigger, `${name} has trigger`);
    assert.ok(event.privacy, `${name} has privacy classification`);
    assert.ok(Array.isArray(event.allowedProperties), `${name} has allowedProperties array`);
    assert.ok(event.retentionRelevance, `${name} has retentionRelevance`);
  });
});

test('events explicitly forbid private evidence URLs, comment bodies, user emails, tokens, raw audio and transcripts', () => {
  Object.entries(PRODUCT_ANALYTICS_EVENTS).forEach(([name, event]) => {
    assert.ok(Array.isArray(event.forbiddenProperties), `${name} has forbiddenProperties`);
    const forbidden = event.forbiddenProperties.join(' ');
    assert.match(forbidden, /evidence.*URL/i, `${name} forbids evidence URLs`);
    assert.match(forbidden, /comment.*bod/i, `${name} forbids comment bodies`);
    assert.match(forbidden, /email/i, `${name} forbids emails`);
    assert.match(forbidden, /token/i, `${name} forbids tokens`);
    assert.match(forbidden, /audio/i, `${name} forbids raw audio`);
    assert.match(forbidden, /transcript/i, `${name} forbids transcripts`);
  });
});

test('analytics privacy rules are defined and comprehensive', () => {
  assert.ok(Array.isArray(ANALYTICS_PRIVACY_RULES));
  assert.ok(ANALYTICS_PRIVACY_RULES.length >= 5);
  const rules = ANALYTICS_PRIVACY_RULES.join(' ');
  assert.match(rules, /evidence/i);
  assert.match(rules, /email/i);
  assert.match(rules, /token/i);
  assert.match(rules, /audio/i);
});

test('analytics plan module does not import Firebase, analytics SDKs, DOM or environment variables', () => {
  const source = readFileSync(resolve(root, 'src/product-analytics-plan.js'), 'utf8');
  assert.doesNotMatch(source, /import.*from.*firebase/i);
  assert.doesNotMatch(source, /import.*from.*analytics/i);
  assert.doesNotMatch(source, /import.*from.*posthog/i);
  assert.doesNotMatch(source, /import.*from.*amplitude/i);
  assert.doesNotMatch(source, /import.*from.*segment/i);
  assert.doesNotMatch(source, /import.*from.*mixpanel/i);
  assert.doesNotMatch(source, /document\./);
  assert.doesNotMatch(source, /window\./);
  assert.doesNotMatch(source, /process\.env/);
  assert.doesNotMatch(source, /gtag/);
});

test('docs/behavioral-ux-retention-redesign-spec.md exists and covers required topics', () => {
  const docPath = resolve(root, 'docs/behavioral-ux-retention-redesign-spec.md');
  assert.ok(existsSync(docPath), 'behavioral UX doc exists');
  const doc = readFileSync(docPath, 'utf8');
  assert.match(doc, /habit loop/i);
  assert.match(doc, /retention/i);
  assert.match(doc, /D1/);
  assert.match(doc, /D7/);
  assert.match(doc, /D30/);
  assert.match(doc, /Daily Focus/);
  assert.match(doc, /AI Path Builder/);
  assert.match(doc, /Discover/);
  assert.match(doc, /motion/i);
  assert.match(doc, /Figma/i);
  assert.match(doc, /No analytics SDK was implemented/i);
  assert.match(doc, /No UI redesign was implemented/i);
});

test('no Firebase Analytics SDK or gtag tracking is added to the codebase', () => {
  const mainSource = readFileSync(resolve(root, 'src/main.js'), 'utf8');
  assert.doesNotMatch(mainSource, /gtag\(/);
  assert.doesNotMatch(mainSource, /firebase\/analytics/);
  assert.doesNotMatch(mainSource, /getAnalytics/);
  assert.doesNotMatch(mainSource, /logEvent/);
});

test('no Expo or native mobile scaffold was added', () => {
  assert.equal(existsSync(resolve(root, 'app.json')), false);
  assert.equal(existsSync(resolve(root, 'eas.json')), false);
  assert.equal(existsSync(resolve(root, 'expo')), false);
  assert.equal(existsSync(resolve(root, 'apps', 'mobile')), false);
});
