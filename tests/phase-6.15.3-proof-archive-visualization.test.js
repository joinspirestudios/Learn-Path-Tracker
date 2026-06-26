import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeProofSubmissions, proofKind, proofDomain, proofIsImage, proofIsFile, proofIsUrl,
  groupProofByDay, groupProofByTask, privateProofCardViewModel, publicProofCardViewModel,
  publicProofSummary, isProofPublicVisible,
} from '../src/proof-archive-model.js';
import {
  proofCardHTML, publicProofCardHTML, proofArchiveHTML, publicProofTimelineHTML,
  compactProofStripHTML,
} from '../src/views/proof-archive.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }

const urlProof = { id: 's1', dayNumber: 1, taskTitle: 'Read article', evidenceType: 'url', evidenceUrl: 'https://example.com/post', note: 'private note here' };
const imageProof = { id: 's2', dayNumber: 1, taskTitle: 'Sketch', evidenceType: 'file', fileType: 'image/png', evidenceUrl: 'https://store.example/u/x.png', note: 'private sketch note' };
const fileProof = { id: 's3', dayNumber: 2, taskTitle: 'Report', evidenceType: 'file', fileName: 'report.pdf', fileType: 'application/pdf', storagePath: 'evidence/u/e/report.pdf' };
const noteProof = { id: 's4', dayNumber: 2, taskTitle: 'Reflect', evidenceType: '', note: 'a private reflection' };

/* ── Model ── */

test('Phase 6.15.3 normalizes and classifies proof kinds', () => {
  assert.equal(proofKind(urlProof), 'url');
  assert.equal(proofKind(imageProof), 'image');
  assert.equal(proofKind(fileProof), 'file');
  assert.equal(proofKind(noteProof), 'note');
  assert.equal(proofIsUrl(urlProof), true);
  assert.equal(proofIsImage(imageProof), true);
  assert.equal(proofIsFile(fileProof), true);
  assert.equal(normalizeProofSubmissions([urlProof, imageProof]).length, 2);
});

test('Phase 6.15.3 extracts a safe domain', () => {
  assert.equal(proofDomain(urlProof), 'example.com');
});

test('Phase 6.15.3 groups proof by day and task', () => {
  const byDay = groupProofByDay([urlProof, imageProof, fileProof]);
  assert.deepEqual(byDay.map(g => g.dayNumber), [1, 2]);
  const byTask = groupProofByTask([urlProof, imageProof]);
  assert.equal(byTask.length, 2);
});

test('Phase 6.15.3 private view model may include owner URL + note', () => {
  const vm = privateProofCardViewModel(urlProof);
  assert.equal(vm.url, 'https://example.com/post');
  assert.equal(vm.note, 'private note here');
  assert.equal(vm.label, 'Private proof');
});

test('Phase 6.15.3 public view model excludes private note, storage path and private file URL', () => {
  const urlPub = publicProofCardViewModel(urlProof);
  assert.equal(urlPub.url, 'https://example.com/post'); // user-attached URL is public-safe
  assert.equal(urlPub.caption, ''); // no private note as caption
  assert.doesNotMatch(JSON.stringify(urlPub), /private note here/);

  const filePub = publicProofCardViewModel(fileProof);
  assert.equal(filePub.url, ''); // private file download not exposed
  assert.equal(filePub.placeholder, true); // safe "Proof submitted" placeholder
  assert.doesNotMatch(JSON.stringify(filePub), /evidence\/u\/e|report\.pdf.*storage|storagePath/);

  const imgPub = publicProofCardViewModel(imageProof);
  assert.equal(imgPub.thumbURL, ''); // private upload not auto-public
  assert.doesNotMatch(JSON.stringify(imgPub), /private sketch note/);
});

test('Phase 6.15.3 public proof summary excludes raw urls/notes/paths', () => {
  const summary = publicProofSummary([urlProof, imageProof, fileProof]);
  assert.equal(summary.count, 3);
  assert.doesNotMatch(JSON.stringify(summary), /example\.com\/post|private|storagePath|report\.pdf/);
});

test('Phase 6.15.3 public visibility policy', () => {
  assert.equal(isProofPublicVisible(urlProof, { pathVisibility: 'public' }), true);
  assert.equal(isProofPublicVisible(urlProof, { pathVisibility: 'private' }), false);
  assert.equal(isProofPublicVisible({ ...urlProof, visibility: 'private' }, { pathVisibility: 'public' }), false);
  assert.equal(isProofPublicVisible(urlProof, { ownerView: true }), true);
});

/* ── Web rendering ── */

test('Phase 6.15.3 proofCardHTML renders url/image/file cards', () => {
  assert.match(proofCardHTML(urlProof), /proof-card is-url/);
  assert.match(proofCardHTML(urlProof), /proof-card-domain/);
  assert.match(proofCardHTML(imageProof), /proof-card-thumb/);
  assert.match(proofCardHTML(fileProof), /proof-card-file/);
});

test('Phase 6.15.3 publicProofCardHTML never leaks private storage path or note', () => {
  const html = publicProofCardHTML(fileProof);
  assert.doesNotMatch(html, /evidence\/u\/e|storagePath/);
  assert.match(html, /Proof submitted/); // placeholder
  const imgHtml = publicProofCardHTML(imageProof);
  assert.doesNotMatch(imgHtml, /private sketch note/);
});

test('Phase 6.15.3 proofArchiveHTML + compactProofStripHTML render and limit', () => {
  const archive = proofArchiveHTML([urlProof, imageProof, fileProof], { title: 'Proof archive' });
  assert.match(archive, /Proof archive/);
  assert.match(archive, /3 proof submitted/);
  const strip = compactProofStripHTML([urlProof, imageProof, fileProof, noteProof], { max: 2 });
  assert.match(strip, /\+2 more proof items/);
});

test('Phase 6.15.3 publicProofTimelineHTML groups by day', () => {
  const html = publicProofTimelineHTML([urlProof, imageProof, fileProof]);
  assert.match(html, /public-proof-timeline/);
  assert.match(html, /public-proof-day-group/);
  assert.match(html, /Day 1/);
  assert.match(html, /Day 2/);
});

/* ── Today / rail / completed day wiring (source-level) ── */

test('Phase 6.15.3 Today shows a proof preview and fixed proof-submitted chip', () => {
  // Phase 6.15.4 replaced the strip with a compact day-proof preview.
  const views = read('src/views.js');
  const block = views.slice(views.indexOf('function platformDailyFocusHTML'), views.indexOf('function selectedDayDetailRailCardHTML'));
  assert.match(block, /compactDayProofPreviewHTML/);
  assert.match(block, /Proof submitted/);
  assert.match(block, /is-submitted/);
});

test('Phase 6.15.3 right rail day detail includes a proof preview', () => {
  // Phase 6.15.4 uses a compact preview instead of stacked cards.
  const views = read('src/views.js');
  const block = views.slice(views.indexOf('function selectedDayDetailRailCardHTML'), views.indexOf('function platformRightRailHTML'));
  assert.match(block, /compactDayProofPreviewHTML/);
});

test('Phase 6.15.3 completed day detail uses card-based proof archive', () => {
  const views = read('src/views.js');
  const block = views.slice(views.indexOf('function evidenceListHTML'), views.indexOf('function evidenceListHTML') + 400);
  assert.match(block, /proofArchiveHTML/);
});

test('Phase 6.15.3 Progress page renders a private proof archive', () => {
  const views = read('src/views.js');
  assert.match(views, /Your Proof Archive/);
  assert.match(views, /privateProofArchiveHTML/);
});

test('Phase 6.15.3 public path page renders a public proof timeline for public paths only', () => {
  const views = read('src/views.js');
  assert.match(views, /publicPathProofTimelineHTML/);
  const block = views.slice(views.indexOf('function publicPathProofTimelineHTML'), views.indexOf('function publicPathProofTimelineHTML') + 2000);
  assert.match(block, /visibility !== 'public'/);
  // Phase 6.15.4 renders the public timeline as daily documentation entries.
  assert.match(block, /publicDailyDocumentationFeedHTML/);
});

/* ── Styling exists ── */

test('Phase 6.15.3 proof card styles exist', () => {
  const css = read('src/styles.css');
  assert.match(css, /\.proof-card/);
  assert.match(css, /\.public-proof-timeline/);
  assert.match(css, /\.aurora-chip-proof\.is-submitted/);
});

/* ── Mobile ── */

test('Phase 6.15.3 mobile proof display components exist and are display-only', () => {
  const summary = read('apps/mobile/src/components/MobileProofSummaryCard.js');
  const strip = read('apps/mobile/src/components/MobileProofArchiveStrip.js');
  assert.match(summary, /Proof submitted/);
  assert.doesNotMatch(summary, /ImagePicker|launchImageLibrary|uploadBytes/);
  assert.doesNotMatch(strip, /ImagePicker|launchImageLibrary|uploadBytes/);
  assert.match(read('apps/mobile/src/screens/CompletionResultScreen.js'), /MobileProofSummaryCard/);
});

test('Phase 6.15.3 mobile deps unchanged (no capture/upload deps)', () => {
  const pkg = JSON.parse(read('apps/mobile/package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@react-native-async-storage/async-storage', 'expo', 'expo-file-system', 'expo-image-picker', 'expo-notifications', 'firebase', 'react', 'react-native']);
});

/* ── Rules + function count unchanged ── */

test('Phase 6.15.3 Firestore/Storage rules unchanged and strict', () => {
  const fr = read('firestore.rules');
  assert.match(fr, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
  assert.match(fr, /match \/users\/\{uid\}\/\{document=\*\*\}/);
  const sr = read('storage.rules');
  assert.match(sr, /match \/evidence\/\{userId\}\/\{enrollmentId\}\/\{allPaths=\*\*\}/);
  assert.doesNotMatch(sr, /match \/\{allPaths=\*\*\}/);
});
