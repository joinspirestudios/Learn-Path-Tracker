import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_VOICE_RECORDING_SECONDS, MAX_VOICE_UPLOAD_BYTES, VOICE_AUTO_STOP_BYTES,
  canTransitionVoicePhase, formatVoiceDuration, insertTranscriptAtSelection,
  isVoiceEligibleField, isVoicePayloadTooLarge, makeVoiceInputState,
  mapVoiceError, shouldAutoStopVoice, transitionVoiceState, voiceResultCanTarget,
} from '../src/voice-input-model.js';

test('voice input state starts idle with no persisted audio references', () => {
  const state = makeVoiceInputState();
  assert.equal(state.phase, 'idle');
  assert.equal(state.blob, null);
  assert.deepEqual(state.chunks, []);
});

test('voice phase transitions accept safe paths and reject invalid jumps', () => {
  assert.equal(canTransitionVoicePhase('idle', 'requesting_permission'), true);
  assert.equal(canTransitionVoicePhase('idle', 'transcribing'), false);
  assert.equal(transitionVoiceState({ phase:'idle' }, 'requesting_permission').phase, 'requesting_permission');
  assert.throws(() => transitionVoiceState({ phase:'idle' }, 'transcribing'), /Invalid voice transition/);
});

test('voice duration and auto-stop helpers use two-minute and safe-byte limits', () => {
  assert.equal(formatVoiceDuration(0), '0:00');
  assert.equal(formatVoiceDuration(75), '1:15');
  assert.equal(shouldAutoStopVoice({ durationSeconds:MAX_VOICE_RECORDING_SECONDS }), true);
  assert.equal(shouldAutoStopVoice({ recordedBytes:VOICE_AUTO_STOP_BYTES }), true);
  assert.equal(isVoicePayloadTooLarge(MAX_VOICE_UPLOAD_BYTES + 1), true);
});

test('transcript insertion supports empty, cursor, selected text, spacing, and repeated clips', () => {
  assert.deepEqual(insertTranscriptAtSelection({ currentValue:'', transcript:'Learn French' }), { value:'Learn French', cursor:12 });
  const inserted = insertTranscriptAtSelection({ currentValue:'Learn French', transcript:'from zero', selectionStart:12, selectionEnd:12 });
  assert.equal(inserted.value, 'Learn French from zero');
  const replaced = insertTranscriptAtSelection({ currentValue:'Learn Spanish quickly', transcript:'French', selectionStart:6, selectionEnd:13 });
  assert.equal(replaced.value, 'Learn French quickly');
  const repeated = insertTranscriptAtSelection({ currentValue:inserted.value, transcript:'with daily speaking', selectionStart:inserted.value.length });
  assert.equal(repeated.value, 'Learn French from zero with daily speaking');
});

test('voice target identity rejects stale fields', () => {
  const field = { id:'aiGoal', name:'aiGoal', dataset:{ voiceKey:'goal' } };
  assert.equal(voiceResultCanTarget({ context:'path_builder', targetId:'aiGoal', targetKey:'goal' }, field), true);
  assert.equal(voiceResultCanTarget({ context:'path_builder', targetId:'aiOther', targetKey:'goal' }, field), false);
  assert.equal(voiceResultCanTarget({ context:'path_builder', targetId:'aiGoal', targetKey:'other' }, field), false);
});

test('voice error mapping distinguishes permission, retryable provider errors, and payload size', () => {
  assert.equal(mapVoiceError('not_allowed').retryable, false);
  assert.match(mapVoiceError('not_found').message, /No microphone/);
  assert.equal(mapVoiceError('provider_timeout').retryable, true);
  assert.equal(mapVoiceError('payload_too_large').retryable, false);
});

test('voice field eligibility excludes URL, number, date, selects, and repeated task rows', () => {
  const field = props => ({
    disabled:false,
    readOnly:false,
    tagName:props.tagName || 'INPUT',
    type:props.type || 'text',
    dataset:props.dataset || {},
    classList:{ contains:name => (props.classes || []).includes(name) },
  });
  assert.equal(isVoiceEligibleField(field({ tagName:'TEXTAREA' })), true);
  assert.equal(isVoiceEligibleField(field({ type:'url' })), false);
  assert.equal(isVoiceEligibleField(field({ type:'number' })), false);
  assert.equal(isVoiceEligibleField(field({ type:'date' })), false);
  assert.equal(isVoiceEligibleField(field({ tagName:'SELECT' })), false);
  assert.equal(isVoiceEligibleField(field({ classes:['ai-task-field'] })), false);
  assert.equal(isVoiceEligibleField(field({ dataset:{ key:'dailyTimeAvailable' } })), true);
});
