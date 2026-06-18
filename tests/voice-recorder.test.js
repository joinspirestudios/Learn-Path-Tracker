import test from 'node:test';
import assert from 'node:assert/strict';

import { VOICE_CHUNK_INTERVAL_MS } from '../src/voice-input-model.js';
import {
  cancelVoiceRecorder, cleanupVoiceRecorder, hasActiveVoiceRecorder,
  startVoiceRecorder, supportedRecordingMimeType, supportsVoiceRecording,
} from '../src/voice-recorder.js';

function installRecorderMocks(){
  const original = {
    navigator:Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    MediaRecorder:globalThis.MediaRecorder,
    AudioContext:globalThis.AudioContext,
    requestAnimationFrame:globalThis.requestAnimationFrame,
    cancelAnimationFrame:globalThis.cancelAnimationFrame,
  };
  const tracks = [{ stopped:false, stop(){ this.stopped = true; } }];
  const stream = { getTracks(){ return tracks; } };
  let requested = 0;
  Object.defineProperty(globalThis, 'navigator', {
    configurable:true,
    value:{ mediaDevices:{ getUserMedia:async constraints => { requested += 1; assert.deepEqual(constraints, { audio:true }); return stream; } } },
  });
  class MockMediaRecorder{
    static isTypeSupported(type){ return type === 'audio/webm;codecs=opus' || type === 'audio/webm'; }
    constructor(inputStream, options = {}){
      this.stream = inputStream;
      this.mimeType = options.mimeType || 'audio/webm';
      this.options = options;
      this.state = 'inactive';
      MockMediaRecorder.instances.push(this);
    }
    start(timeslice){ this.state = 'recording'; this.timeslice = timeslice; }
    stop(){ this.state = 'inactive'; this.onstop?.(); }
    emit(size){ this.ondataavailable?.({ data:new Blob([Buffer.alloc(size)], { type:this.mimeType }) }); }
  }
  MockMediaRecorder.instances = [];
  globalThis.MediaRecorder = MockMediaRecorder;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.AudioContext = class {
    createAnalyser(){ return { fftSize:0, frequencyBinCount:4, getByteFrequencyData(){}, disconnect(){} }; }
    createMediaStreamSource(){ return { connect(){}, disconnect(){} }; }
    close(){ this.closed = true; }
  };
  return {
    tracks,
    get requested(){ return requested; },
    instances:MockMediaRecorder.instances,
    restore(){
      cleanupVoiceRecorder();
      if(original.navigator) Object.defineProperty(globalThis, 'navigator', original.navigator);
      else delete globalThis.navigator;
      globalThis.MediaRecorder = original.MediaRecorder;
      globalThis.AudioContext = original.AudioContext;
      globalThis.requestAnimationFrame = original.requestAnimationFrame;
      globalThis.cancelAnimationFrame = original.cancelAnimationFrame;
    },
  };
}

test('voice recorder requests microphone on start, chooses supported MIME, and uses one-second chunks', async () => {
  const mock = installRecorderMocks();
  try{
    assert.equal(supportsVoiceRecording(), true);
    assert.equal(supportedRecordingMimeType(), 'audio/webm;codecs=opus');
    await startVoiceRecorder();
    assert.equal(mock.requested, 1);
    assert.equal(mock.instances[0].timeslice, VOICE_CHUNK_INTERVAL_MS);
    assert.equal(mock.instances[0].options.audioBitsPerSecond, 32000);
    cancelVoiceRecorder();
  } finally {
    mock.restore();
  }
});

test('voice recorder tracks bytes, prevents a second active recorder, and stops media tracks on cancel', async () => {
  const mock = installRecorderMocks();
  const updates = [];
  let stopped = null;
  try{
    await startVoiceRecorder({ onUpdate:update => updates.push(update), onStop:result => { stopped = result; } });
    assert.equal(hasActiveVoiceRecorder(), true);
    await assert.rejects(() => startVoiceRecorder(), /already active/);
    mock.instances[0].emit(2048);
    assert.equal(updates.some(update => update.recordedBytes === 2048), true);
    cancelVoiceRecorder();
    assert.equal(stopped.cancelled, true);
    assert.equal(mock.tracks[0].stopped, true);
  } finally {
    mock.restore();
  }
});
