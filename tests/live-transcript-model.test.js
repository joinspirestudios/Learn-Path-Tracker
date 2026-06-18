import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyFallbackTranscript,
  applyTranscriptEvent,
  cancelLiveTranscript,
  liveTranscriptValue,
  makeLiveTranscriptState,
  sessionTranscript,
} from '../src/live-transcript-model.js';

test('live transcript state starts empty while preserving base text and selection', () => {
  const state = makeLiveTranscriptState({ baseText:'Learn Spanish quickly', insertionStart:6, insertionEnd:13 });
  assert.equal(state.baseText, 'Learn Spanish quickly');
  assert.equal(liveTranscriptValue(state), 'Learn  quickly');
  assert.equal(sessionTranscript(state), '');
});

test('interim transcript replaces earlier provisional text instead of appending', () => {
  let state = makeLiveTranscriptState({ baseText:'I want', insertionStart:6, insertionEnd:6 });
  state = applyTranscriptEvent(state, { key:'0:0:100', transcript:'to learn Fr', startMs:0, durationMs:100 }).state;
  assert.equal(liveTranscriptValue(state), 'I want to learn Fr');
  state = applyTranscriptEvent(state, { key:'0:0:200', transcript:'to learn French', startMs:0, durationMs:200 }).state;
  assert.equal(liveTranscriptValue(state), 'I want to learn French');
});

test('final result replaces overlapping interim and duplicate finals are ignored', () => {
  let state = makeLiveTranscriptState({ baseText:'Goal:', insertionStart:5, insertionEnd:5 });
  state = applyTranscriptEvent(state, { key:'0:0:1000', transcript:'learn french', startMs:0, durationMs:1000 }).state;
  let result = applyTranscriptEvent(state, { key:'0:0:1000', transcript:'learn French.', startMs:0, durationMs:1000, isFinal:true });
  state = result.state;
  assert.equal(result.finalized, true);
  assert.equal(sessionTranscript(state), 'learn French.');
  assert.equal(state.interimTranscript, '');
  result = applyTranscriptEvent(state, { key:'0:0:1000', transcript:'learn French.', startMs:0, durationMs:1000, isFinal:true });
  assert.equal(result.changed, false);
  assert.equal(liveTranscriptValue(result.state), 'Goal: learn French.');
});

test('multiple finalized segments stay chronological with natural punctuation spacing', () => {
  let state = makeLiveTranscriptState({ baseText:'', insertionStart:0 });
  state = applyTranscriptEvent(state, { key:'0:2000:500', transcript:'every morning.', startMs:2000, durationMs:500, isFinal:true }).state;
  state = applyTranscriptEvent(state, { key:'0:0:1000', transcript:'Practise French', startMs:0, durationMs:1000, isFinal:true }).state;
  assert.equal(sessionTranscript(state), 'Practise French every morning.');
});

test('out-of-order interim cannot replace a finalized segment and empty transcripts are ignored', () => {
  let state = makeLiveTranscriptState({ baseText:'', insertionStart:0 });
  state = applyTranscriptEvent(state, { key:'0:1000:500', transcript:'daily', startMs:1000, durationMs:500, isFinal:true }).state;
  assert.equal(applyTranscriptEvent(state, { key:'0:1000:500', transcript:'daily-ish', startMs:1000, durationMs:500 }).changed, false);
  assert.equal(applyTranscriptEvent(state, { key:'0:1500:500', transcript:'  ', startMs:1500, durationMs:500 }).changed, false);
});

test('fallback transcript replaces live partials without duplicating base text', () => {
  let state = makeLiveTranscriptState({ baseText:'I want', insertionStart:6, insertionEnd:6 });
  state = applyTranscriptEvent(state, { key:'0:0:500', transcript:'learn Fr', startMs:0, durationMs:500 }).state;
  state = applyFallbackTranscript(state, 'learn French from zero');
  assert.equal(liveTranscriptValue(state), 'I want learn French from zero');
  assert.equal(state.interimTranscript, '');
});

test('cancel restores the exact base field value', () => {
  const state = makeLiveTranscriptState({ baseText:'Keep this exact text.', insertionStart:10 });
  const updated = applyTranscriptEvent(state, { key:'0:0:500', transcript:'new words', startMs:0, durationMs:500 }).state;
  assert.equal(cancelLiveTranscript(updated), 'Keep this exact text.');
});
