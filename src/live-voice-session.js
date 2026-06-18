import {
  LIVE_FINALIZE_TIMEOUT_MS,
  LIVE_KEEPALIVE_INTERVAL_MS,
  LIVE_SOCKET_CONNECT_TIMEOUT_MS,
  LIVE_TOKEN_TIMEOUT_MS,
  LIVE_VOICE_TIMESLICE_MS,
  MAX_VOICE_UPLOAD_BYTES,
  MAX_VOICE_RECORDING_SECONDS,
  VOICE_AUTO_STOP_BYTES,
} from './voice-input-model.js';
import { supportedRecordingMimeType, supportsVoiceRecording } from './voice-recorder.js';
import {
  applyFallbackTranscript,
  applyTranscriptEvent,
  finalizedTranscript,
  liveTranscriptValue,
  makeLiveTranscriptState,
  sessionTranscript,
} from './live-transcript-model.js';

let activeSession = null;

function makeId(prefix = 'voice'){
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

function mapBrowserError(error){
  const name = String(error?.name || error?.code || '');
  if(/NotAllowed|Permission/i.test(name)) return 'not_allowed';
  if(/NotFound|DevicesNotFound/i.test(name)) return 'not_found';
  if(/NotReadable|TrackStart/i.test(name)) return 'not_readable';
  if(/Security/i.test(name)) return 'security';
  return 'not_readable';
}

function clearTimer(id){
  if(id) clearTimeout(id);
}

function clearIntervalTimer(id){
  if(id) clearInterval(id);
}

function safeCloseSocket(socket, code = 1000, reason = 'done'){
  try{
    if(socket && socket.readyState < 2) socket.close(code, reason);
  }catch(error){}
}

function cleanupAudioGraph(session){
  if(session.animationFrameId && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(session.animationFrameId);
  session.animationFrameId = null;
  try{ session.sourceNode?.disconnect?.(); }catch(error){}
  try{ session.analyser?.disconnect?.(); }catch(error){}
  try{ session.audioContext?.close?.(); }catch(error){}
  session.sourceNode = null;
  session.analyser = null;
  session.audioContext = null;
}

function cleanupMedia(session){
  try{ session.mediaStream?.getTracks?.().forEach(track => track.stop()); }catch(error){}
  session.mediaStream = null;
}

function cleanupTimers(session){
  clearIntervalTimer(session.timerId);
  clearIntervalTimer(session.keepAliveTimerId);
  clearTimer(session.connectTimerId);
  clearTimer(session.tokenTimerId);
  clearTimer(session.finalizationTimerId);
  session.timerId = null;
  session.keepAliveTimerId = null;
  session.connectTimerId = null;
  session.tokenTimerId = null;
  session.finalizationTimerId = null;
}

function cleanupSession(session, { closeSocket = true, stopRecorder = false, stopMedia = true } = {}){
  cleanupTimers(session);
  cleanupAudioGraph(session);
  if(stopRecorder){
    try{
      if(session.mediaRecorder && session.mediaRecorder.state !== 'inactive') session.mediaRecorder.stop();
    }catch(error){}
  }
  if(closeSocket) safeCloseSocket(session.websocket);
  if(stopMedia) cleanupMedia(session);
  session.websocket = null;
  session.websocketSessionToken = null;
}

function setupAnalyser(session){
  const AudioCtor = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
  if(!AudioCtor || typeof requestAnimationFrame === 'undefined' || !session.mediaStream) return;
  try{
    const audioContext = new AudioCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    const sourceNode = audioContext.createMediaStreamSource(session.mediaStream);
    sourceNode.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if(activeSession !== session || session.closed) return;
      try{
        analyser.getByteFrequencyData(data);
        const level = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length) / 255;
        session.callbacks.onVoiceLevel?.(level);
      }catch(error){}
      session.animationFrameId = requestAnimationFrame(tick);
    };
    session.audioContext = audioContext;
    session.analyser = analyser;
    session.sourceNode = sourceNode;
    session.animationFrameId = requestAnimationFrame(tick);
  }catch(error){}
}

export function deepgramLiveSocketUrl({ language = 'en' } = {}){
  const url = new URL('wss://api.deepgram.com/v1/listen');
  const params = new URLSearchParams({
    model:'nova-3',
    interim_results:'true',
    smart_format:'true',
    punctuate:'true',
    endpointing:'400',
    utterance_end_ms:'1000',
    language:String(language || 'en'),
  });
  url.search = params.toString();
  return url.toString();
}

export function deepgramLiveSocketProtocols(accessToken){
  const normalized = String(accessToken || '').trim();
  if(!normalized){
    throw Object.assign(new Error('Missing Deepgram access token.'), { code:'live_token_failed' });
  }
  return ['bearer', normalized];
}

export function supportsLiveVoiceInput(){
  return supportsVoiceRecording() && typeof WebSocket !== 'undefined';
}

export function hasActiveLiveVoiceSession(){
  return !!activeSession;
}

function notifyPhase(session, phase, statusMessage = ''){
  if(activeSession !== session || session.closed) return;
  session.phase = phase;
  session.callbacks.onPhase?.({
    phase,
    statusMessage,
    durationSeconds:session.durationSeconds,
    recordedBytes:session.recordedBytes,
    mimeType:session.mimeType,
    fallbackRequired:session.fallbackRequired,
    fallbackReason:session.fallbackReason,
    visibleSessionTranscript:sessionTranscript(session.transcriptState),
    interimTranscript:session.transcriptState.interimTranscript,
    finalizedSegments:session.transcriptState.finalizedSegments,
  });
}

function notifyDiagnostic(session, event, fields = {}){
  if(activeSession !== session || session.closed) return;
  session.callbacks.onDiagnostic?.({
    event,
    phase:session.phase,
    socketReadyState:Number(session.websocket?.readyState ?? -1),
    credentialPresent:!!session.websocketSessionToken,
    fallbackRequired:session.fallbackRequired,
    recordedBytes:session.recordedBytes,
    binaryChunkCount:session.binaryChunkCount,
    finalEventCount:session.finalEventCount,
    interimEventCount:session.interimEventCount,
    ...fields,
  });
}

function patchField(session, { final = false } = {}){
  if(activeSession !== session || session.closed || !session.targetElement) return;
  const field = session.targetElement;
  const previousScrollTop = field.scrollTop;
  field.value = liveTranscriptValue(session.transcriptState);
  try{ field.scrollTop = previousScrollTop; }catch(error){}
  session.callbacks.onTranscriptPatch?.({
    value:field.value,
    finalizedTranscript:finalizedTranscript(session.transcriptState),
    interimTranscript:session.transcriptState.interimTranscript,
    visibleSessionTranscript:sessionTranscript(session.transcriptState),
    final,
  });
  if(final) field.dispatchEvent(new Event('input', { bubbles:true }));
}

function handleDeepgramMessage(session, data){
  if(activeSession !== session || session.closed) return;
  let payload;
  try{ payload = typeof data === 'string' ? JSON.parse(data) : JSON.parse(String(data || '')); }
  catch(error){ return; }
  if(payload?.type === 'Results' || payload?.channel?.alternatives){
    const result = applyTranscriptEvent(session.transcriptState, payload);
    if(!result.changed) return;
    session.transcriptState = result.state;
    if(result.finalized) session.finalEventCount += 1;
    else session.interimEventCount += 1;
    patchField(session, { final:!!result.finalized });
    return;
  }
  if(payload?.type === 'Error'){
    session.fallbackRequired = true;
    session.fallbackReason = 'live_interrupted';
    notifyPhase(session, 'fallback_recording', 'Live transcription interrupted. Keep speaking, then stop to transcribe.');
  }
}

function sendSocket(session, payload){
  if(activeSession !== session || session.closed) return false;
  if(!session.websocket || session.websocket.readyState !== 1) return false;
  try{
    session.websocket.send(typeof payload === 'string' || payload instanceof Blob ? payload : JSON.stringify(payload));
    return true;
  }catch(error){
    return false;
  }
}

async function requestTokenWithTimeout(session){
  return await new Promise((resolve, reject) => {
    let settled = false;
    session.tokenTimerId = setTimeout(() => {
      if(settled) return;
      settled = true;
      reject(Object.assign(new Error('Live token request timed out.'), { code:'live_token_failed' }));
    }, LIVE_TOKEN_TIMEOUT_MS);
    Promise.resolve()
      .then(() => session.callbacks.requestToken?.({ sessionId:session.id }))
      .then(result => {
        if(settled) return;
        settled = true;
        clearTimer(session.tokenTimerId);
        session.tokenTimerId = null;
        if(!result?.accessToken) throw Object.assign(new Error('Missing live transcription token.'), { code:'live_token_failed' });
        resolve(result);
      })
      .catch(error => {
        if(settled) return;
        settled = true;
        clearTimer(session.tokenTimerId);
        session.tokenTimerId = null;
        reject(Object.assign(error, { code:error?.code || 'live_token_failed' }));
      });
  });
}

async function openSocketWithTimeout(session, accessToken){
  const url = deepgramLiveSocketUrl({ language:session.language });
  return await new Promise((resolve, reject) => {
    let settled = false;
    const protocols = deepgramLiveSocketProtocols(accessToken);
    const socket = new WebSocket(url, protocols);
    session.websocket = socket;
    session.websocketSessionToken = protocols[1];
    session.tokenExpiresIn = null;
    notifyDiagnostic(session, 'socket_connecting', { protocol:protocols[0] });
    session.connectTimerId = setTimeout(() => {
      if(settled) return;
      settled = true;
      session.websocketSessionToken = null;
      notifyDiagnostic(session, 'socket_connect_timeout', { protocol:protocols[0] });
      safeCloseSocket(socket, 1000, 'connect-timeout');
      reject(Object.assign(new Error('Live socket timed out.'), { code:'live_connect_failed' }));
    }, LIVE_SOCKET_CONNECT_TIMEOUT_MS);
    socket.onopen = () => {
      if(settled) return;
      settled = true;
      clearTimer(session.connectTimerId);
      session.connectTimerId = null;
      session.websocketSessionToken = null;
      notifyDiagnostic(session, 'socket_open', { protocol:protocols[0] });
      resolve(socket);
    };
    socket.onmessage = event => handleDeepgramMessage(session, event.data);
    socket.onerror = () => {
      if(settled){
        session.fallbackRequired = true;
        session.fallbackReason = 'live_interrupted';
        session.websocketSessionToken = null;
        notifyDiagnostic(session, 'socket_error_after_open', { protocol:protocols[0] });
        notifyPhase(session, 'fallback_recording', 'Live transcription interrupted. Keep speaking, then stop to transcribe.');
        return;
      }
      settled = true;
      clearTimer(session.connectTimerId);
      session.connectTimerId = null;
      session.websocketSessionToken = null;
      notifyDiagnostic(session, 'socket_connect_error', { protocol:protocols[0] });
      reject(Object.assign(new Error('Live socket failed.'), { code:'live_connect_failed' }));
    };
    socket.onclose = event => {
      if(activeSession !== session || session.closed || session.stopping || session.cancelled) return;
      session.websocketSessionToken = null;
      session.fallbackRequired = true;
      session.fallbackReason = 'live_interrupted';
      notifyDiagnostic(session, 'socket_unexpected_close', { closeCode:Number(event?.code || 0) });
      notifyPhase(session, 'fallback_recording', 'Live transcription interrupted. Keep speaking, then stop to transcribe.');
    };
  });
}

function startRecorder(session){
  const mimeType = supportedRecordingMimeType();
  const options = mimeType ? { mimeType, audioBitsPerSecond:32000 } : { audioBitsPerSecond:32000 };
  const recorder = new MediaRecorder(session.mediaStream, options);
  session.mediaRecorder = recorder;
  session.mimeType = recorder.mimeType || mimeType || 'audio/webm';
  recorder.ondataavailable = event => {
    if(activeSession !== session || session.closed || !event.data || !event.data.size) return;
    session.chunks.push(event.data);
    session.recordedBytes += Number(event.data.size || 0);
    session.binaryChunkCount += 1;
    if(!session.fallbackRequired && !sendSocket(session, event.data)){
      session.fallbackRequired = true;
      session.fallbackReason = 'live_interrupted';
      notifyDiagnostic(session, 'binary_send_failed');
      notifyPhase(session, 'fallback_recording', 'Live transcription interrupted. Keep speaking, then stop to transcribe.');
    }
    session.callbacks.onMetrics?.({
      recordedBytes:session.recordedBytes,
      durationSeconds:session.durationSeconds,
      mimeType:session.mimeType,
    });
    if(session.recordedBytes >= VOICE_AUTO_STOP_BYTES) stopLiveVoiceSession('byte_limit');
  };
  recorder.onstop = () => {
    if(activeSession !== session || session.closed) return;
    if(session.cancelled){
      finishCancelledSession(session);
      return;
    }
    if(session.fallbackRequired) void runFallbackTranscription(session);
    else finishLiveSession(session);
  };
  recorder.onerror = () => {
    session.fallbackRequired = true;
    session.fallbackReason = 'live_interrupted';
    notifyPhase(session, 'fallback_recording', 'Live transcription interrupted. Keep speaking, then stop to transcribe.');
  };
  setupAnalyser(session);
  recorder.start(LIVE_VOICE_TIMESLICE_MS);
  session.startedAt = Date.now();
  session.timerId = setInterval(() => {
    if(activeSession !== session || session.closed) return;
    session.durationSeconds = Math.max(0, Math.round((Date.now() - session.startedAt) / 1000));
    session.callbacks.onMetrics?.({
      recordedBytes:session.recordedBytes,
      durationSeconds:session.durationSeconds,
      mimeType:session.mimeType,
    });
    if(session.durationSeconds >= MAX_VOICE_RECORDING_SECONDS) stopLiveVoiceSession('duration_limit');
  }, 1000);
  session.keepAliveTimerId = setInterval(() => {
    if(!session.fallbackRequired) sendSocket(session, { type:'KeepAlive' });
  }, LIVE_KEEPALIVE_INTERVAL_MS);
  notifyPhase(
    session,
    session.fallbackRequired ? 'fallback_recording' : 'recording',
    session.fallbackRequired ? 'Recording for fallback' : 'Listening',
  );
}

async function startFallbackRecorder(session, code = 'live_connect_failed'){
  session.fallbackRequired = true;
  session.fallbackReason = code;
  notifyPhase(session, 'fallback_recording', 'Live transcription could not connect. Your voice can still be recorded and transcribed after you stop.');
  try{
    startRecorder(session);
  }catch(error){
    throw Object.assign(error, { code:error?.code || 'not_readable' });
  }
}

async function runFallbackTranscription(session){
  if(activeSession !== session || session.closed || session.fallbackStarted) return;
  session.fallbackStarted = true;
  cleanupTimers(session);
  cleanupAudioGraph(session);
  cleanupMedia(session);
  notifyPhase(session, 'fallback_transcribing', 'Turning your recording into text');
  const blob = new Blob(session.chunks, { type:session.mimeType || 'audio/webm' });
  if(blob.size > MAX_VOICE_UPLOAD_BYTES){
    failSession(session, 'payload_too_large');
    return;
  }
  try{
    const payload = await session.callbacks.transcribeFallback?.({
      blob,
      mimeType:blob.type || session.mimeType || 'audio/webm',
      sessionId:session.id,
    });
    if(activeSession !== session || session.closed) return;
    session.transcriptState = applyFallbackTranscript(session.transcriptState, payload?.transcript || '');
    patchField(session, { final:true });
    finishLiveSession(session);
  }catch(error){
    failSession(session, error?.code || 'fallback_transcription_failed', error?.message);
  }
}

function finishLiveSession(session){
  if(activeSession !== session || session.closed || session.completed) return;
  session.completed = true;
  cleanupSession(session, { closeSocket:true, stopMedia:true });
  const field = session.targetElement;
  if(field){
    field.readOnly = false;
    field.classList.remove('voice-field-live');
    try{ field.focus({ preventScroll:true }); }catch(error){ field.focus?.(); }
  }
  const value = field?.value || liveTranscriptValue(session.transcriptState);
  activeSession = null;
  session.callbacks.onDone?.({
    value,
    transcript:sessionTranscript(session.transcriptState),
    durationSeconds:session.durationSeconds,
    recordedBytes:session.recordedBytes,
    fallbackUsed:session.fallbackRequired,
  });
}

function finishCancelledSession(session){
  if(activeSession !== session || session.closed) return;
  session.closed = true;
  cleanupSession(session, { closeSocket:true, stopMedia:true });
  const field = session.targetElement;
  if(field){
    field.value = session.transcriptState.baseText;
    field.readOnly = false;
    field.classList.remove('voice-field-live');
    field.dispatchEvent(new Event('input', { bubbles:true }));
    try{ field.focus({ preventScroll:true }); }catch(error){ field.focus?.(); }
  }
  activeSession = null;
  session.callbacks.onCancel?.();
}

function failSession(session, code, message = ''){
  if(activeSession !== session || session.closed) return;
  cleanupSession(session, { closeSocket:true, stopMedia:true });
  const field = session.targetElement;
  if(field){
    field.readOnly = false;
    field.classList.remove('voice-field-live');
  }
  activeSession = null;
  session.callbacks.onError?.({ code, message, blob:session.chunks.length ? new Blob(session.chunks, { type:session.mimeType || 'audio/webm' }) : null });
}

export async function startLiveVoiceSession({
  targetElement,
  target,
  builderSessionId = '',
  requestToken = makeId('voice'),
  language = 'en',
  requestTokenGrant,
  transcribeFallback,
  callbacks = {},
} = {}){
  if(activeSession) throw Object.assign(new Error('A voice session is already active.'), { code:'recorder_active' });
  if(!supportsLiveVoiceInput()) throw Object.assign(new Error('Voice input is not supported.'), { code:'unsupported_browser' });
  const session = {
    id:requestToken,
    builderSessionId,
    targetElement,
    target,
    language,
    callbacks:{ ...callbacks, requestToken:requestTokenGrant, transcribeFallback },
    transcriptState:makeLiveTranscriptState({
      baseText:targetElement?.value || '',
      insertionStart:target?.insertionStart || 0,
      insertionEnd:target?.insertionEnd ?? target?.insertionStart ?? 0,
    }),
    phase:'idle',
    mediaStream:null,
    mediaRecorder:null,
    websocket:null,
    chunks:[],
    recordedBytes:0,
    durationSeconds:0,
    startedAt:0,
    mimeType:supportedRecordingMimeType(),
    interimEventCount:0,
    finalEventCount:0,
    binaryChunkCount:0,
    fallbackRequired:false,
    fallbackReason:'',
    stopping:false,
    cancelled:false,
    completed:false,
    closed:false,
    fallbackStarted:false,
    timerId:null,
    keepAliveTimerId:null,
    connectTimerId:null,
    tokenTimerId:null,
    finalizationTimerId:null,
    animationFrameId:null,
    audioContext:null,
    analyser:null,
    sourceNode:null,
    websocketSessionToken:null,
  };
  activeSession = session;
  try{
    notifyPhase(session, 'requesting_permission', 'Requesting microphone');
    session.mediaStream = await navigator.mediaDevices.getUserMedia({ audio:true });
    if(activeSession !== session) return null;
    session.targetElement.readOnly = true;
    session.targetElement.classList.add('voice-field-live');
    notifyPhase(session, 'requesting_token', 'Connecting live transcription');
    const grant = await requestTokenWithTimeout(session);
    if(activeSession !== session) return null;
    notifyPhase(session, 'connecting', 'Connecting live transcription');
    await openSocketWithTimeout(session, grant.accessToken);
    if(activeSession !== session) return null;
    startRecorder(session);
    return session;
  }catch(error){
    if(activeSession !== session) return null;
    const code = error?.code || mapBrowserError(error);
    if(session.mediaStream && ['live_token_failed', 'live_connect_failed', 'provider_unavailable', 'provider_timeout'].includes(code)){
      try{
        await startFallbackRecorder(session, code);
        return session;
      }catch(fallbackError){
        failSession(session, fallbackError?.code || code, fallbackError?.message || error?.message);
        return null;
      }
    }
    failSession(session, code, error?.message);
    return null;
  }
}

export function stopLiveVoiceSession(reason = 'manual'){
  const session = activeSession;
  if(!session || session.stopping || session.cancelled) return false;
  session.stopping = true;
  session.stopReason = reason;
  if(session.fallbackRequired){
    notifyPhase(session, 'fallback_transcribing', 'Turning your recording into text');
    try{
      if(session.mediaRecorder && session.mediaRecorder.state !== 'inactive') session.mediaRecorder.stop();
      else void runFallbackTranscription(session);
    }catch(error){
      failSession(session, 'fallback_transcription_failed', error?.message);
    }
    return true;
  }
  notifyPhase(session, 'finalizing', 'Finalizing speech');
  sendSocket(session, { type:'Finalize' });
  session.finalizationTimerId = setTimeout(() => {
    if(activeSession !== session || session.closed) return;
    sendSocket(session, { type:'CloseStream' });
    safeCloseSocket(session.websocket, 1000, 'done');
    try{
      if(session.mediaRecorder && session.mediaRecorder.state !== 'inactive') session.mediaRecorder.stop();
      else finishLiveSession(session);
    }catch(error){
      finishLiveSession(session);
    }
  }, LIVE_FINALIZE_TIMEOUT_MS);
  return true;
}

export function cancelLiveVoiceSession(){
  const session = activeSession;
  if(!session || session.cancelled) return false;
  session.cancelled = true;
  try{
    if(session.mediaRecorder && session.mediaRecorder.state !== 'inactive') session.mediaRecorder.stop();
    else finishCancelledSession(session);
  }catch(error){
    finishCancelledSession(session);
  }
  return true;
}

export function cleanupLiveVoiceSession(){
  const session = activeSession;
  if(!session) return;
  session.cancelled = true;
  finishCancelledSession(session);
}
