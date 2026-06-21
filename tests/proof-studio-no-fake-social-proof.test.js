import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const productionSources = [
  '../src/views.js',
  '../src/ui/core-components.js',
  '../src/ui/design-gallery.js',
  '../src/styles.css',
  '../README.md',
  '../docs/design-system-foundation.md',
  '../docs/phase-6.9-core-ui-rollout.md',
  '../docs/behavioral-ux-retention-redesign-spec.md',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');

const viewSource = readFileSync(new URL('../src/views.js', import.meta.url), 'utf8');

test('production source does not add hardcoded impressive trust metrics', () => {
  assert.doesNotMatch(productionSources, /\b(1,284|9,512|18,330)\b/);
  assert.doesNotMatch(viewSource, /weekly ranking|leaderboard|following filter/i);
});

test('public proof source does not expose raw evidence URLs', () => {
  const progressBlock = viewSource.slice(viewSource.indexOf('function publicProgressTimelineHTML'), viewSource.indexOf('function updateProgressEntry'));
  assert.doesNotMatch(progressBlock, /evidenceUrl|fileUrl|downloadURL|storagePath/);
  assert.match(progressBlock, /Proof submitted/);
});
