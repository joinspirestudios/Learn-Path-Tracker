import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildDailyDocumentationEntries, buildDailyDocumentationEntry,
  dailyDocumentationMediaPreview, dailyDocumentationTaskSummary, dailyDocumentationMilestone,
  isPublicDocumentationEntry, privateDocumentationEntryViewModel, publicDocumentationEntryViewModel,
} from '../src/daily-documentation-model.js';
import {
  dailyDocumentationFeedHTML, dailyDocumentationEntryHTML, dailyDocumentationMediaGridHTML,
  dayProofGalleryHTML, compactDayProofPreviewHTML, publicDailyDocumentationFeedHTML,
} from '../src/views/daily-documentation-feed.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }

const imageProof = { id: 'a', pathId: 'p1', dayNumber: 1, taskTitle: 'Sketch', evidenceType: 'file', fileType: 'image/png', evidenceUrl: 'https://store.example/u/x.png', note: 'private sketch note' };
const urlProof = { id: 'b', pathId: 'p1', dayNumber: 1, taskTitle: 'Read', evidenceType: 'url', evidenceUrl: 'https://example.com/post', note: 'private reading note' };
const fileProof = { id: 'c', pathId: 'p1', dayNumber: 2, taskTitle: 'Report', evidenceType: 'file', fileName: 'r.pdf', fileType: 'application/pdf', storagePath: 'evidence/u/e/r.pdf' };
const paths = { p1: { id: 'p1', title: 'Drawing path', visibility: 'public' } };
const dayLogs = { p1__day_1: { pathId: 'p1', dayNumber: 1, status: 'completed', completionScore: 86, completionTier: 'strong', completedTaskIds: ['t1', 't2'], totalTaskCount: 3 } };

/* ── Model ── */

test('Phase 6.15.4 buildDailyDocumentationEntries groups by path/day', () => {
  const entries = buildDailyDocumentationEntries({ submissions: [imageProof, urlProof, fileProof], paths, dayLogs });
  assert.equal(entries.length, 2);
  const day1 = entries.find(e => e.dayNumber === 1);
  assert.equal(day1.pathTitle, 'Drawing path');
  assert.equal(day1.proofSubmittedCount, 2);
  assert.equal(day1.completionScore, 86);
  assert.equal(day1.completedTaskCount, 2);
  assert.ok(day1.taskSummary.includes('Sketch'));
});

test('Phase 6.15.4 entry includes media preview and task summary', () => {
  const entry = buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 1, submissions: [imageProof, urlProof], dayLog: dayLogs.p1__day_1 });
  const media = dailyDocumentationMediaPreview(entry);
  assert.ok(media.primary, 'image is primary media');
  assert.equal(media.total, 2);
  const summary = dailyDocumentationTaskSummary(entry);
  assert.ok(summary.titles.length >= 1);
});

test('Phase 6.15.4 milestone omits fake streak/PB when unavailable', () => {
  const entry = buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 1, submissions: [urlProof], dayLog: { dayNumber: 1, status: 'completed', completionTier: 'passed' } });
  assert.equal(dailyDocumentationMilestone(entry), null);
  const perfect = buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 1, submissions: [urlProof], dayLog: { dayNumber: 1, completionTier: 'perfect' } });
  assert.equal(dailyDocumentationMilestone(perfect), 'Perfect day');
  const streak = buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 1, submissions: [urlProof], dayLog: { dayNumber: 1, streak: 5 } });
  assert.equal(dailyDocumentationMilestone(streak), '5 day streak');
});

test('Phase 6.15.4 public view model excludes private notes/paths; private may include them', () => {
  const entry = buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 1, submissions: [imageProof, urlProof], dayLog: dayLogs.p1__day_1 });
  const pub = publicDocumentationEntryViewModel(entry);
  const pubJson = JSON.stringify(pub);
  assert.doesNotMatch(pubJson, /private sketch note|private reading note|store\.example|storagePath/);
  assert.equal(isPublicDocumentationEntry(entry), true);
  const priv = privateDocumentationEntryViewModel(entry);
  assert.match(JSON.stringify(priv), /private sketch note|private reading note/);
});

/* ── Rendering ── */

test('Phase 6.15.4 feed renders one card per day', () => {
  const entries = buildDailyDocumentationEntries({ submissions: [imageProof, urlProof, fileProof], paths, dayLogs });
  const html = dailyDocumentationFeedHTML(entries, { title: 'Daily Documentation' });
  assert.equal((html.match(/daily-doc-entry/g) || []).length, 2);
  assert.match(html, /Daily Documentation/);
  assert.match(html, /documented day/);
});

test('Phase 6.15.4 entry renders metrics, task summary and gallery action', () => {
  const entry = buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 1, submissions: [imageProof, urlProof], dayLog: dayLogs.p1__day_1 });
  const html = dailyDocumentationEntryHTML(entry, {});
  assert.match(html, /daily-doc-metrics/);
  assert.match(html, /proof submitted/);
  assert.match(html, /data-proof-gallery="p1__day_1"/);
  assert.match(html, /View gallery/);
});

test('Phase 6.15.4 media grid renders primary image and artifact tiles', () => {
  const entry = buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 1, submissions: [imageProof, urlProof] });
  const html = dailyDocumentationMediaGridHTML(entry, {});
  assert.match(html, /daily-doc-media-primary/);
  assert.match(html, /daily-doc-artifact-tile/);
});

test('Phase 6.15.4 day proof gallery groups by task', () => {
  const entry = buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 1, submissions: [imageProof, urlProof] });
  const html = dayProofGalleryHTML(entry, {});
  assert.match(html, /day-proof-gallery/);
  assert.match(html, /day-proof-task-group/);
  assert.match(html, /Sketch/);
  assert.match(html, /Read/);
});

test('Phase 6.15.4 compact preview limits and shows +N more with View gallery', () => {
  const many = [imageProof, urlProof, { ...fileProof, dayNumber: 1 }, { id: 'd', pathId: 'p1', dayNumber: 1, taskTitle: 'X', evidenceType: 'url', evidenceUrl: 'https://x.com' }];
  const entry = buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 1, submissions: many });
  const html = compactDayProofPreviewHTML(entry, { title: 'Day proof' });
  assert.match(html, /day-proof-compact-preview/);
  assert.match(html, /\+1/);
  assert.match(html, /View gallery/);
  // Empty state
  const empty = compactDayProofPreviewHTML(buildDailyDocumentationEntry({ path: paths.p1, dayNumber: 9, submissions: [] }), { emptyState: true });
  assert.match(empty, /No proof submitted yet/);
});

test('Phase 6.15.4 public daily documentation feed excludes private fields', () => {
  const entries = buildDailyDocumentationEntries({ submissions: [imageProof, urlProof], paths, dayLogs });
  const html = publicDailyDocumentationFeedHTML(entries, {});
  assert.match(html, /Public proof timeline/);
  assert.doesNotMatch(html, /private sketch note|private reading note|store\.example|storagePath/);
});

/* ── views.js wiring (source-level) ── */

test('Phase 6.15.4 Progress page uses daily documentation feed before raw grid', () => {
  const views = read('src/views.js');
  const block = views.slice(views.indexOf('export function renderProgress'), views.indexOf('export function renderProgress') + 1200);
  assert.match(block, /privateDailyDocumentationFeedHTML/);
  assert.match(block, /View all proof/); // raw grid demoted into a details/disclosure
  const feedPos = block.indexOf('privateDailyDocumentationFeedHTML');
  const galleryPos = block.indexOf('aurora-progress-gallery');
  assert.ok(feedPos > 0 && galleryPos > feedPos, 'feed appears before the raw gallery');
});

test('Phase 6.15.4 Today uses compact proof preview (not long grid) + chip copy fix', () => {
  const views = read('src/views.js');
  const block = views.slice(views.indexOf('function platformDailyFocusHTML'), views.indexOf('function selectedDayDetailRailCardHTML'));
  assert.match(block, /compactDayProofPreviewHTML/);
  assert.doesNotMatch(block, /compactProofStripHTML/);
  assert.match(block, /Proof submitted/);
  assert.match(block, /is-submitted/);
});

test('Phase 6.15.4 right rail uses compact preview with View gallery, no card dump', () => {
  const views = read('src/views.js');
  const block = views.slice(views.indexOf('function selectedDayDetailRailCardHTML'), views.indexOf('function platformRightRailHTML'));
  assert.match(block, /compactDayProofPreviewHTML/);
  assert.doesNotMatch(block, /compactProofStripHTML/);
});

test('Phase 6.15.4 public path proof timeline renders daily documentation entries for public paths only', () => {
  const views = read('src/views.js');
  const block = views.slice(views.indexOf('function publicPathProofTimelineHTML'), views.indexOf('function publicPathProofTimelineHTML') + 2000);
  assert.match(block, /visibility !== 'public'/);
  assert.match(block, /publicDailyDocumentationFeedHTML/);
});

/* ── Styling ── */

test('Phase 6.15.4 daily-doc styles exist', () => {
  const css = read('src/styles.css');
  assert.match(css, /\.daily-doc-feed/);
  assert.match(css, /\.daily-doc-entry/);
  assert.match(css, /\.day-proof-gallery/);
  assert.match(css, /\.day-proof-compact-preview/);
});

/* ── No forbidden behavior ── */

test('Phase 6.15.4 mobile deps unchanged; no capture/upload', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@react-native-async-storage/async-storage', 'expo', 'expo-file-system', 'expo-image-picker', 'firebase', 'react', 'react-native']);
});

test('Phase 6.15.4 Vercel function count unchanged; rules unchanged', () => {
  const files = readdirSync(resolve(root, 'api'), { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  const fr = read('firestore.rules');
  assert.match(fr, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
  const sr = read('storage.rules');
  assert.doesNotMatch(sr, /match \/\{allPaths=\*\*\}/);
});

/* ── Docs ── */

test('Phase 6.15.4 documentation exists', () => {
  const doc = read('docs/proof-feed-gallery-ux.md');
  assert.match(doc, /daily documentation/i);
  assert.match(doc, /proof gallery/i);
  assert.match(read('README.md'), /Phase 6\.15\.4/);
});
