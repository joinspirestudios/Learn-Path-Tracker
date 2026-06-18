import test from 'node:test';
import assert from 'node:assert/strict';

import { LIVE_FINALIZE_TIMEOUT_MS, LIVE_VOICE_TIMESLICE_MS } from '../src/voice-input-model.js';
import {
  cancelLiveVoiceSession,
  cleanupLiveVoiceSession,
  deepgramLiveSocketProtocols,
  deepgramLiveSocketUrl,
  hasActiveLiveVoiceSession,
  startLiveVoiceSession,
  stopLiveVoiceSession,
} from '../src/live-voice-session.js';

const TEMPORARY_JWT = 'eyJhbGciOiJIUzI1NiJ9.test-payload.test-signature';

function fieldMock(value = ''){
  const classes = new Set();
  return {
    id:'aiGoal',
    value,
    readOnly:false,
    scrollTop:0,
    events:[],
    classList:{
      add:name => classes.add(name),
      remove:name => classes.delete(name),
      contains:name => classes.has(name),
    },
    dispatchEvent(event){ this.events.push(event.type); return true; },
    focus(){ this.focused = true; },
  };
}

function installLiveMocks({ socketOpens = true, throwOnSend = false } = {}){
  const original = {
    navigator:Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    MediaRecorder:globalThis.MediaRecorder,
    WebSocket:globalThis.WebSocket,
    AudioContext:globalThis.AudioContext,
    requestAnimationFrame:globalThis.requestAnimationFrame,
    cancelAnimationFrame:globalThis.cancelAnimationFrame,
    setTimeout:globalThis.setTimeout,
    clearTimeout:globalThis.clearTimeout,
    setInterval:globalThis.setInterval,
    clearInterval:globalThis.clearInterval,
  };
  const tracks = [{ stopped:false, stop(){ this.stopped = true; } }];
  const stream = { getTracks(){ return tracks; } };
  Object.defineProperty(globalThis, 'navigator', {
    configurable:true,
    value:{ mediaDevices:{ getUserMedia:async () => stream } },
  });
  const finalizers = [];
  globalThis.setTimeout = (fn, ms, ...args) => {
    if(ms === LIVE_FINALIZE_TIMEOUT_MS){ finalizers.push(() => fn(...args)); return 5001; }
    return original.setTimeout(fn, ms, ...args);
  };
  globalThis.clearTimeout = id => {
    if(id === 5001) return;
    return original.clearTimeout(id);
  };
  globalThis.setInterval = () => 6001;
  globalThis.clearInterval = () => {};
  globalThis.requestAnimationFrame = () => 7001;
  globalThis.cancelAnimationFrame = () => {};
  globalThis.AudioContext = class {
    createAnalyser(){ return { fftSize:0, frequencyBinCount:4, getByteFrequencyData(){}, disconnect(){} }; }
    createMediaStreamSource(){ return { connect(){}, disconnect(){} }; }
    close(){ this.closed = true; }
  };
  class MockMediaRecorder{
    static isTypeSupported(type){ return type === 'audio/webm;codecs=opus' || type === 'audio/webm'; }
    constructor(inputStream, options = {}){
      this.stream = inputStream;
      this.options = options;
      this.mimeType = options.mimeType || 'audio/webm';
      this.state = 'inactive';
      this.stopCalls = 0;
      MockMediaRecorder.instances.push(this);
    }
    start(timeslice){ this.state = 'recording'; this.timeslice = timeslice; }
    stop(){ this.stopCalls += 1; this.state = 'inactive'; this.onstop?.(); }
    emit(size){ this.ondataavailable?.({ data:new Blob([Buffer.alloc(size)], { type:this.mimeType }) }); }
  }
  MockMediaRecorder.instances = [];
  class MockWebSocket{
    constructor(url, protocols){
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0;
      this.sent = [];
      this.closeCalls = 0;
      MockWebSocket.instances.push(this);
      queueMicrotask(() => {
        const [scheme, credential] = protocols || [];
        const isJwt = String(credential || '').split('.').length === 3;
        if(isJwt && scheme !== 'bearer'){
          this.onerror?.(new Error('invalid authentication scheme'));
          this.onclose?.({ code:1006, reason:'authentication failed' });
          return;
        }
        if(!socketOpens) return this.onerror?.(new Error('socket failed'));
        this.readyState = 1;
        this.onopen?.();
      });
    }
    send(value){
      if(throwOnSend) throw new Error('send failed');
      this.sent.push(value);
    }
    close(code = 1000, reason = ''){ this.closeCalls += 1; this.readyState = 3; this.onclose?.({ code, reason }); }
    message(payload){ this.onmessage?.({ data:JSON.stringify(payload) }); }
  }
  MockWebSocket.instances = [];
  globalThis.MediaRecorder = MockMediaRecorder;
  globalThis.WebSocket = MockWebSocket;
  return {
    tracks,
    finalizers,
    mediaRecorders:MockMediaRecorder.instances,
    sockets:MockWebSocket.instances,
    restore(){
      cleanupLiveVoiceSession();
      if(original.navigator) Object.defineProperty(globalThis, 'navigator', original.navigator);
      else delete globalThis.navigator;
      globalThis.MediaRecorder = original.MediaRecorder;
      globalThis.WebSocket = original.WebSocket;
      globalThis.AudioContext = original.AudioContext;
      globalThis.requestAnimationFrame = original.requestAnimationFrame;
      globalThis.cancelAnimationFrame = original.cancelAnimationFrame;
      globalThis.setTimeout = original.setTimeout;
      globalThis.clearTimeout = original.clearTimeout;
      globalThis.setInterval = original.setInterval;
      globalThis.clearInterval = original.clearInterval;
    },
  };
}

test('Deepgram live socket URL uses safe default streaming parameters', () => {
  const url = new URL(deepgramLiveSocketUrl());
  assert.equal(url.origin, 'wss://api.deepgram.com');
  assert.equal(url.pathname, '/v1/listen');
  assert.equal(url.searchParams.get('model'), 'nova-3');
  assert.equal(url.searchParams.get('interim_results'), 'true');
  assert.equal(url.searchParams.get('language'), 'en');
});

test('Deepgram live socket protocols use bearer for temporary JWTs and reject empty credentials', () => {
  assert.deepEqual(deepgramLiveSocketProtocols(TEMPORARY_JWT), ['bearer', TEMPORARY_JWT]);
  assert.deepEqual(deepgramLiveSocketProtocols('  ' + TEMPORARY_JWT + '  '), ['bearer', TEMPORARY_JWT]);
  assert.notDeepEqual(deepgramLiveSocketProtocols(TEMPORARY_JWT), ['token', TEMPORARY_JWT]);
  for(const value of ['', '   ', null, undefined]){
    assert.throws(() => deepgramLiveSocketProtocols(value), error => error.code === 'live_token_failed');
  }
});

test('live voice opens socket before recorder starts, streams chunks, and keeps Stop stable', async () => {
  const mock = installLiveMocks();
  const field = fieldMock('I want');
  const phases = [];
  const diagnostics = [];
  let renderCount = 0;
  try{
    const session = await startLiveVoiceSession({
      targetElement:field,
      target:{ insertionStart:6, insertionEnd:6 },
      builderSessionId:'builder-1',
      requestToken:'session-1',
      requestTokenGrant:async () => ({ accessToken:TEMPORARY_JWT, expiresIn:30 }),
      transcribeFallback:async () => { throw new Error('fallback should not run'); },
      callbacks:{
        onPhase:update => phases.push(update.phase),
        onTranscriptPatch:() => {},
        onVoiceLevel:() => { renderCount += 0; },
        onDiagnostic:update => diagnostics.push(update),
      },
    });
    assert.equal(mock.sockets[0].protocols[0], 'bearer');
    assert.equal(mock.sockets[0].protocols[1], TEMPORARY_JWT);
    assert.equal(session.websocketSessionToken, null);
    assert.equal(mock.mediaRecorders[0].timeslice, LIVE_VOICE_TIMESLICE_MS);
    assert.equal(mock.mediaRecorders[0].options.audioBitsPerSecond, 32000);
    assert.equal(mock.mediaRecorders.length, 1);
    assert.equal(phases.includes('recording'), true);
    assert.equal(diagnostics.some(item => item.event === 'socket_open' && item.protocol === 'bearer'), true);
    assert.equal(JSON.stringify(diagnostics).includes(TEMPORARY_JWT), false);
    mock.mediaRecorders[0].emit(256);
    mock.mediaRecorders[0].emit(0);
    assert.equal(mock.sockets[0].sent.some(item => item instanceof Blob), true);
    assert.equal(mock.sockets[0].sent.filter(item => item instanceof Blob).length, 1);
    assert.equal(renderCount, 0);
    assert.equal(stopLiveVoiceSession('manual'), true);
    assert.equal(stopLiveVoiceSession('manual'), false);
    assert.equal(mock.sockets[0].sent.filter(item => typeof item === 'string' && item.includes('Finalize')).length, 1);
    mock.finalizers[0]();
    assert.equal(mock.sockets[0].sent.filter(item => typeof item === 'string' && item.includes('CloseStream')).length, 1);
    assert.equal(mock.mediaRecorders[0].stopCalls, 1);
    assert.equal(mock.tracks[0].stopped, true);
  } finally {
    mock.restore();
  }
});

test('interim and final websocket results update the active field without duplicate text', async () => {
  const mock = installLiveMocks();
  const field = fieldMock('Goal:');
  try{
    const session = await startLiveVoiceSession({
      targetElement:field,
      target:{ insertionStart:5, insertionEnd:5 },
      builderSessionId:'builder-1',
      requestToken:'session-2',
      requestTokenGrant:async () => ({ accessToken:TEMPORARY_JWT, expiresIn:30 }),
      callbacks:{},
    });
    mock.sockets[0].message({ type:'Results', channel_index:[0, 1], start:0, duration:1, is_final:false, channel:{ alternatives:[{ transcript:'learn Fr' }] } });
    assert.equal(field.value, 'Goal: learn Fr');
    assert.deepEqual(field.events, []);
    mock.sockets[0].message({ type:'Results', channel_index:[0, 1], start:0, duration:1, is_final:false, channel:{ alternatives:[{ transcript:'learn French' }] } });
    assert.equal(field.value, 'Goal: learn French');
    mock.sockets[0].message({ type:'Results', channel_index:[0, 1], start:0, duration:1, is_final:true, channel:{ alternatives:[{ transcript:'learn French.' }] } });
    mock.sockets[0].message({ type:'Results', channel_index:[0, 1], start:0, duration:1, is_final:true, channel:{ alternatives:[{ transcript:'learn French.' }] } });
    assert.equal(field.value, 'Goal: learn French.');
    assert.equal(field.events.filter(type => type === 'input').length, 1);
  } finally {
    mock.restore();
  }
});

test('Cancel restores exact base text, closes socket, and never calls fallback', async () => {
  const mock = installLiveMocks();
  const field = fieldMock('Original text');
  let fallbackCalls = 0;
  try{
    const session = await startLiveVoiceSession({
      targetElement:field,
      target:{ insertionStart:13, insertionEnd:13 },
      requestToken:'session-3',
      requestTokenGrant:async () => ({ accessToken:TEMPORARY_JWT, expiresIn:30 }),
      transcribeFallback:async () => { fallbackCalls += 1; },
      callbacks:{},
    });
    assert.equal(mock.sockets[0].protocols[0], 'bearer');
    mock.sockets[0].message({ type:'Results', channel_index:[0, 1], start:0, duration:1, channel:{ alternatives:[{ transcript:' extra' }] } });
    assert.equal(field.value, 'Original text extra');
    assert.equal(cancelLiveVoiceSession(), true);
    assert.equal(cancelLiveVoiceSession(), false);
    assert.equal(session.websocketSessionToken, null);
    assert.equal(field.value, 'Original text');
    assert.equal(field.readOnly, false);
    assert.equal(fallbackCalls, 0);
    assert.equal(mock.sockets[0].closeCalls >= 1, true);
  } finally {
    mock.restore();
  }
});

test('socket connection failure records locally and Stop calls fallback once', async () => {
  const mock = installLiveMocks({ socketOpens:false });
  const field = fieldMock('I want');
  let fallbackCalls = 0;
  try{
    await startLiveVoiceSession({
      targetElement:field,
      target:{ insertionStart:6, insertionEnd:6 },
      requestToken:'session-4',
      requestTokenGrant:async () => ({ accessToken:TEMPORARY_JWT, expiresIn:30 }),
      transcribeFallback:async ({ blob }) => {
        fallbackCalls += 1;
        assert.equal(blob instanceof Blob, true);
        return { transcript:'learn French from zero' };
      },
      callbacks:{},
    });
    assert.equal(hasActiveLiveVoiceSession(), true);
    assert.equal(mock.mediaRecorders[0].state, 'recording');
    mock.mediaRecorders[0].emit(512);
    assert.equal(stopLiveVoiceSession('manual'), true);
    assert.equal(stopLiveVoiceSession('manual'), false);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(fallbackCalls, 1);
    assert.equal(field.value, 'I want learn French from zero');
    assert.equal(field.events.includes('input'), true);
  } finally {
    mock.restore();
  }
});

test('unexpected socket close switches to fallback while deliberate Stop close does not', async () => {
  const mock = installLiveMocks();
  const field = fieldMock('I want');
  const phases = [];
  let fallbackCalls = 0;
  try{
    await startLiveVoiceSession({
      targetElement:field,
      target:{ insertionStart:6, insertionEnd:6 },
      requestToken:'session-5',
      requestTokenGrant:async () => ({ accessToken:TEMPORARY_JWT, expiresIn:30 }),
      transcribeFallback:async () => {
        fallbackCalls += 1;
        return { transcript:'learn French' };
      },
      callbacks:{ onPhase:update => phases.push(update.phase) },
    });
    mock.sockets[0].close(1000, 'provider closed');
    assert.equal(phases.includes('fallback_recording'), true);
    mock.mediaRecorders[0].emit(128);
    assert.equal(stopLiveVoiceSession('manual'), true);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(fallbackCalls, 1);
  } finally {
    mock.restore();
  }

  const second = installLiveMocks();
  const secondField = fieldMock('Goal:');
  const secondPhases = [];
  try{
    await startLiveVoiceSession({
      targetElement:secondField,
      target:{ insertionStart:5, insertionEnd:5 },
      requestToken:'session-6',
      requestTokenGrant:async () => ({ accessToken:TEMPORARY_JWT, expiresIn:30 }),
      callbacks:{ onPhase:update => secondPhases.push(update.phase) },
    });
    assert.equal(stopLiveVoiceSession('manual'), true);
    second.finalizers[0]();
    assert.equal(secondPhases.includes('fallback_recording'), false);
  } finally {
    second.restore();
  }
});

test('binary send failure transitions to fallback without logging the JWT', async () => {
  const mock = installLiveMocks({ throwOnSend:true });
  const field = fieldMock('I want');
  const diagnostics = [];
  let fallbackCalls = 0;
  try{
    await startLiveVoiceSession({
      targetElement:field,
      target:{ insertionStart:6, insertionEnd:6 },
      requestToken:'session-7',
      requestTokenGrant:async () => ({ accessToken:TEMPORARY_JWT, expiresIn:30 }),
      transcribeFallback:async () => {
        fallbackCalls += 1;
        return { transcript:'learn French' };
      },
      callbacks:{ onDiagnostic:update => diagnostics.push(update) },
    });
    mock.mediaRecorders[0].emit(256);
    assert.equal(diagnostics.some(item => item.event === 'binary_send_failed'), true);
    assert.equal(JSON.stringify(diagnostics).includes(TEMPORARY_JWT), false);
    assert.equal(stopLiveVoiceSession('manual'), true);
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(fallbackCalls, 1);
  } finally {
    mock.restore();
  }
});
