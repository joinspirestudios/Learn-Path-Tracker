import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

const apiDir = new URL('../api/', import.meta.url);
const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

const oldEndpointFiles = [
  'comment-progress.js',
  'deepgram-token.js',
  'generate-path.js',
  'hide-progress-comment.js',
  'interpret-goal.js',
  'join-path.js',
  'publish-progress.js',
  'react-progress.js',
  'report-path.js',
  'report-progress-comment.js',
  'sync-path-metrics.js',
  'transcribe-voice.js',
  'unpublish-progress.js',
];

const expectedRouters = ['ai.js', 'voice.js', 'community.js'];

test('top-level Vercel API function count stays under the Hobby deployment cap', () => {
  const deployable = readdirSync(apiDir, { withFileTypes:true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js') && !entry.name.startsWith('_'))
    .map(entry => entry.name)
    .sort();
  assert.deepEqual(deployable, expectedRouters.toSorted());
  assert.ok(deployable.length <= 5);
  assert.ok(deployable.length < 12);
});

test('old endpoint files moved out of the deployable api directory', () => {
  for(const file of oldEndpointFiles){
    assert.equal(existsSync(new URL(file, apiDir)), false, file);
    assert.equal(existsSync(new URL(`../server/api-handlers/${file}`, import.meta.url)), true, file);
  }
});

test('Vercel function config targets only consolidated router files', () => {
  assert.deepEqual(Object.keys(vercel.functions || {}).sort(), [
    'api/ai.js',
    'api/community.js',
    'api/voice.js',
  ]);
  assert.equal(vercel.functions['api/ai.js'].maxDuration, 240);
  assert.equal(vercel.functions['api/voice.js'].maxDuration, 90);
  assert.equal(vercel.functions['api/community.js'].maxDuration, 15);
});
