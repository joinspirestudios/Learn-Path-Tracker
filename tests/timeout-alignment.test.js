import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { GENERATE_TIMEOUT_MS } from '../api/generate-path.js';
import { INTERPRET_TIMEOUT_MS } from '../api/interpret-goal.js';
import { TRANSCRIBE_TIMEOUT_MS } from '../api/transcribe-voice.js';
import { AI_GENERATE_TIMEOUT_MS, AI_INTERPRET_TIMEOUT_MS, VOICE_TRANSCRIBE_TIMEOUT_MS } from '../src/ai-timeouts.js';

const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('interpretation timeout hierarchy is server < browser < Vercel max duration', () => {
  const maxDurationMs = vercel.functions['api/interpret-goal.js'].maxDuration * 1000;
  assert.equal(INTERPRET_TIMEOUT_MS, 90_000);
  assert.equal(AI_INTERPRET_TIMEOUT_MS, 105_000);
  assert.equal(maxDurationMs, 120_000);
  assert.ok(INTERPRET_TIMEOUT_MS < AI_INTERPRET_TIMEOUT_MS);
  assert.ok(AI_INTERPRET_TIMEOUT_MS < maxDurationMs);
});

test('generation timeout hierarchy is server < browser < Vercel max duration', () => {
  const maxDurationMs = vercel.functions['api/generate-path.js'].maxDuration * 1000;
  assert.equal(GENERATE_TIMEOUT_MS, 180_000);
  assert.equal(AI_GENERATE_TIMEOUT_MS, 195_000);
  assert.equal(maxDurationMs, 240_000);
  assert.ok(GENERATE_TIMEOUT_MS < AI_GENERATE_TIMEOUT_MS);
  assert.ok(AI_GENERATE_TIMEOUT_MS < maxDurationMs);
});

test('transcription timeout hierarchy is server < browser < Vercel max duration', () => {
  const maxDurationMs = vercel.functions['api/transcribe-voice.js'].maxDuration * 1000;
  assert.equal(TRANSCRIBE_TIMEOUT_MS, 60_000);
  assert.equal(VOICE_TRANSCRIBE_TIMEOUT_MS, 75_000);
  assert.equal(maxDurationMs, 90_000);
  assert.ok(TRANSCRIBE_TIMEOUT_MS < VOICE_TRANSCRIBE_TIMEOUT_MS);
  assert.ok(VOICE_TRANSCRIBE_TIMEOUT_MS < maxDurationMs);
});
