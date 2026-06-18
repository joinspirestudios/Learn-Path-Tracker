import {
  MAX_VOICE_RECORDING_SECONDS,
  VOICE_AUTO_STOP_BYTES,
  VOICE_CHUNK_INTERVAL_MS,
} from './voice-input-model.js';

export const VOICE_MIME_PREFERENCES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg',
];

let activeRecorder = null;

export function supportsVoiceRecording(){
  return typeof navigator !== 'undefined'
    && !!navigator.mediaDevices?.getUserMedia
    && typeof MediaRecorder !== 'undefined';
}

export function supportedRecordingMimeType(){
  if(typeof MediaRecorder === 'undefined' || !MediaRecorder.isTypeSupported) return '';
  return VOICE_MIME_PREFERENCES.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function mapBrowserError(error){
  const name = String(error?.name || '');
  if(/NotAllowed|Permission/i.test(name)) return 'not_allowed';
  if(/NotFound|DevicesNotFound/i.test(name)) return 'not_found';
  if(/NotReadable|TrackStart/i.test(name)) return 'not_readable';
  if(/Security/i.test(name)) return 'security';
  return 'not_readable';
}

function cleanupAudioGraph(session){
  if(session.animationFrameId && typeof cancelAnimationFrame !== 'undefined'){
    cancelAnimationFrame(session.animationFrameId);
  }
  session.animationFrameId = null;
  try{ session.sourceNode?.disconnect?.(); }catch(e){}
  try{ session.analyser?.disconnect?.(); }catch(e){}
  try{ session.audioContext?.close?.(); }catch(e){}
  session.sourceNode = null;
  session.analyser = null;
  session.audioContext = null;
}

function cleanupStream(session){
  try{ session.stream?.getTracks?.().forEach(track => track.stop()); }catch(e){}
  session.stream = null;
}

function setupAnalyser(session, stream, onUpdate){
  const AudioCtor = typeof AudioContext !== 'undefined' ? AudioContext : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
  if(!AudioCtor || typeof requestAnimationFrame === 'undefined') return;
  try{
    const audioContext = new AudioCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64;
    const sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      try{
        analyser.getByteFrequencyData(data);
        const level = data.reduce((sum, value) => sum + value, 0) / Math.max(1, data.length) / 255;
        onUpdate?.({ voiceLevel:level });
      }catch(e){}
      session.animationFrameId = requestAnimationFrame(tick);
    };
    session.audioContext = audioContext;
    session.analyser = analyser;
    session.sourceNode = sourceNode;
    session.animationFrameId = requestAnimationFrame(tick);
  }catch(e){}
}

export async function startVoiceRecorder({
  onUpdate,
  onStop,
  onError,
} = {}){
  if(activeRecorder) throw Object.assign(new Error('A voice recorder is already active.'), { code:'recorder_active' });
  if(!supportsVoiceRecording()) throw Object.assign(new Error('Voice input is not supported.'), { code:'unsupported_browser' });
  const session = {
    recorder:null,
    stream:null,
    chunks:[],
    mimeType:'',
    recordedBytes:0,
    durationSeconds:0,
    startedAt:Date.now(),
    stopping:false,
    cancelled:false,
    timer:null,
    animationFrameId:null,
    analyser:null,
    audioContext:null,
    sourceNode:null,
  };
  activeRecorder = session;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    const mimeType = supportedRecordingMimeType();
    const options = mimeType ? { mimeType, audioBitsPerSecond:32000 } : { audioBitsPerSecond:32000 };
    const recorder = new MediaRecorder(stream, options);
    session.stream = stream;
    session.recorder = recorder;
    session.mimeType = recorder.mimeType || mimeType || 'audio/webm';
    recorder.ondataavailable = event => {
      if(!event.data || !event.data.size) return;
      session.chunks.push(event.data);
      session.recordedBytes += Number(event.data.size || 0);
      onUpdate?.({
        recordedBytes:session.recordedBytes,
        durationSeconds:session.durationSeconds,
        mimeType:session.mimeType,
      });
      if(session.recordedBytes >= VOICE_AUTO_STOP_BYTES) stopVoiceRecorder(false, 'byte_limit');
    };
    recorder.onstop = () => {
      if(session.timer) clearInterval(session.timer);
      cleanupAudioGraph(session);
      cleanupStream(session);
      activeRecorder = activeRecorder === session ? null : activeRecorder;
      if(session.cancelled) return onStop?.({ cancelled:true });
      const blob = new Blob(session.chunks, { type:session.mimeType });
      onStop?.({
        blob,
        mimeType:session.mimeType,
        recordedBytes:session.recordedBytes || blob.size,
        durationSeconds:session.durationSeconds || Math.max(1, Math.round((Date.now() - session.startedAt) / 1000)),
        reason:session.stopReason || 'manual',
      });
    };
    recorder.onerror = event => {
      onError?.(event?.error || event);
    };
    setupAnalyser(session, stream, onUpdate);
    recorder.start(VOICE_CHUNK_INTERVAL_MS);
    session.timer = setInterval(() => {
      session.durationSeconds = Math.max(0, Math.round((Date.now() - session.startedAt) / 1000));
      onUpdate?.({
        recordedBytes:session.recordedBytes,
        durationSeconds:session.durationSeconds,
        mimeType:session.mimeType,
      });
      if(session.durationSeconds >= MAX_VOICE_RECORDING_SECONDS) stopVoiceRecorder(false, 'duration_limit');
    }, 1000);
    return session;
  }catch(error){
    activeRecorder = activeRecorder === session ? null : activeRecorder;
    cleanupAudioGraph(session);
    cleanupStream(session);
    throw Object.assign(error, { code:error.code || mapBrowserError(error) });
  }
}

export function stopVoiceRecorder(cancelled = false, reason = 'manual'){
  const session = activeRecorder;
  if(!session || session.stopping) return false;
  session.stopping = true;
  session.cancelled = cancelled;
  session.stopReason = reason;
  if(session.timer) clearInterval(session.timer);
  try{
    if(session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
    else {
      cleanupAudioGraph(session);
      cleanupStream(session);
      activeRecorder = null;
    }
    return true;
  }catch(error){
    cleanupAudioGraph(session);
    cleanupStream(session);
    activeRecorder = null;
    throw error;
  }
}

export function cancelVoiceRecorder(){
  return stopVoiceRecorder(true, 'cancelled');
}

export function cleanupVoiceRecorder(){
  if(!activeRecorder) return;
  activeRecorder.cancelled = true;
  try{ stopVoiceRecorder(true, 'cleanup'); }
  catch(error){
    cleanupAudioGraph(activeRecorder);
    cleanupStream(activeRecorder);
    activeRecorder = null;
  }
}

export function hasActiveVoiceRecorder(){
  return !!activeRecorder;
}
