export const MAX_VOICE_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_VOICE_RECORDING_SECONDS = 120;
export const VOICE_CHUNK_INTERVAL_MS = 1000;
export const LIVE_VOICE_TIMESLICE_MS = 250;
export const LIVE_TOKEN_TIMEOUT_MS = 10_000;
export const LIVE_SOCKET_CONNECT_TIMEOUT_MS = 10_000;
export const LIVE_FINALIZE_TIMEOUT_MS = 2_500;
export const LIVE_KEEPALIVE_INTERVAL_MS = 8_000;
export const VOICE_AUTO_STOP_BYTES = Math.floor(3.75 * 1024 * 1024);

export const VOICE_PHASES = [
  'idle',
  'requesting_permission',
  'requesting_token',
  'connecting',
  'recording',
  'finalizing',
  'fallback_recording',
  'fallback_transcribing',
  'transcribing',
  'error',
];

const TRANSITIONS = {
  idle:['requesting_permission', 'requesting_token', 'connecting', 'error'],
  requesting_permission:['requesting_token', 'fallback_recording', 'idle', 'error'],
  requesting_token:['connecting', 'fallback_recording', 'idle', 'error'],
  connecting:['recording', 'fallback_recording', 'idle', 'error'],
  recording:['finalizing', 'fallback_recording', 'idle', 'error'],
  finalizing:['fallback_transcribing', 'idle', 'error'],
  fallback_recording:['fallback_transcribing', 'idle', 'error'],
  fallback_transcribing:['idle', 'error'],
  transcribing:['idle', 'error'],
  error:['idle', 'requesting_permission', 'fallback_transcribing', 'transcribing'],
};

export function makeVoiceInputState(prev = {}){
  return {
    phase:VOICE_PHASES.includes(prev.phase) ? prev.phase : 'idle',
    context:prev.context || 'path_builder',
    targetId:prev.targetId || '',
    targetKey:prev.targetKey || '',
    targetLabel:prev.targetLabel || '',
    targetType:prev.targetType || '',
    builderSessionId:prev.builderSessionId || '',
    baseText:prev.baseText || '',
    finalizedSegments:Array.isArray(prev.finalizedSegments) ? prev.finalizedSegments : [],
    interimTranscript:prev.interimTranscript || '',
    visibleSessionTranscript:prev.visibleSessionTranscript || '',
    insertionStart:Number.isFinite(Number(prev.insertionStart)) ? Number(prev.insertionStart) : 0,
    insertionEnd:Number.isFinite(Number(prev.insertionEnd)) ? Number(prev.insertionEnd) : 0,
    recorder:null,
    mediaRecorder:null,
    mediaStream:null,
    analyser:null,
    audioContext:null,
    animationFrameId:null,
    chunks:[],
    blob:prev.blob || null,
    mimeType:prev.mimeType || '',
    recordedBytes:Number(prev.recordedBytes || 0),
    durationSeconds:Number(prev.durationSeconds || 0),
    startedAt:prev.startedAt || null,
    errorCode:prev.errorCode || '',
    errorMessage:prev.errorMessage || '',
    retryable:prev.retryable === true,
    liveStreamingAvailable:prev.liveStreamingAvailable !== false,
    fallbackRequired:prev.fallbackRequired === true,
    fallbackReason:prev.fallbackReason || '',
    requestToken:prev.requestToken || null,
    websocketSessionToken:prev.websocketSessionToken || null,
    statusMessage:prev.statusMessage || '',
  };
}

export function canTransitionVoicePhase(from, to){
  return !!TRANSITIONS[from]?.includes(to);
}

export function transitionVoiceState(state, phase, patch = {}){
  const current = state?.phase || 'idle';
  if(!VOICE_PHASES.includes(phase)) throw new Error('Unknown voice phase.');
  if(!canTransitionVoicePhase(current, phase)) throw new Error(`Invalid voice transition: ${current} -> ${phase}`);
  return makeVoiceInputState({ ...state, ...patch, phase });
}

export function formatVoiceDuration(value){
  const seconds = Math.max(0, Math.floor(Number(value || 0)));
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function isVoicePayloadTooLarge(bytes){
  return Number(bytes || 0) > MAX_VOICE_UPLOAD_BYTES;
}

export function shouldAutoStopVoice({ durationSeconds = 0, recordedBytes = 0 } = {}){
  return Number(durationSeconds || 0) >= MAX_VOICE_RECORDING_SECONDS
    || Number(recordedBytes || 0) >= VOICE_AUTO_STOP_BYTES;
}

function needsSpaceBefore(value){
  return !!value && !/[\s([{/"']$/.test(value);
}

function needsSpaceAfter(value){
  return !!value && !/^[\s.,!?;:)\]}]/.test(value);
}

export function insertTranscriptAtSelection({
  currentValue = '',
  transcript = '',
  selectionStart = 0,
  selectionEnd = selectionStart,
} = {}){
  const text = String(transcript || '').trim();
  const value = String(currentValue || '');
  const start = Math.max(0, Math.min(value.length, Number(selectionStart || 0)));
  const end = Math.max(start, Math.min(value.length, Number(selectionEnd == null ? start : selectionEnd)));
  if(!text) return { value, cursor:start };
  const before = value.slice(0, start);
  const after = value.slice(end);
  const inserted = (needsSpaceBefore(before) ? ' ' : '') + text + (needsSpaceAfter(after) ? ' ' : '');
  const next = before + inserted + after;
  return {
    value:next,
    cursor:(before + inserted).length,
  };
}

export function mapVoiceError(code, fallback = ''){
  if(code === 'not_allowed') return { code, retryable:false, message:'Microphone access was denied. Allow microphone access or continue typing.' };
  if(code === 'not_found') return { code, retryable:false, message:'No microphone was found. Connect a microphone or continue typing.' };
  if(code === 'not_readable') return { code, retryable:true, message:'Your microphone is currently unavailable or being used by another application.' };
  if(code === 'security') return { code, retryable:false, message:'Microphone access requires a secure browser context. Continue typing for now.' };
  if(code === 'unsupported_browser') return { code, retryable:false, message:'Voice input is not supported in this browser. You can still type.' };
  if(code === 'payload_too_large') return { code, retryable:false, message:'This voice note is too large to transcribe. Keep recordings under two minutes and try again.' };
  if(code === 'unauthorized') return { code, retryable:true, message:'Your session expired. Sign in again to transcribe voice input.' };
  if(code === 'rate_limited') return { code, retryable:true, message:'You have reached the current voice limit. Continue by typing or try again later.' };
  if(code === 'live_token_failed') return { code, retryable:true, message:'Live transcription could not start. You can try again or continue by typing.' };
  if(code === 'live_connect_failed') return { code, retryable:true, message:'Live transcription could not connect. Your voice can still be recorded and transcribed after you stop.' };
  if(code === 'live_interrupted') return { code, retryable:true, message:'Live transcription was interrupted. Your recording is still being captured.' };
  if(code === 'fallback_transcription_failed') return { code, retryable:true, message:'The recording could not be transcribed. Your typed text is still safe.' };
  if(code === 'server_function_failed') return { code, retryable:true, message:'The transcription route could not start. Your recording is still available to retry.' };
  if(['operation_timeout', 'provider_timeout'].includes(code)) return { code, retryable:true, message:'Voice transcription took too long. Retry or continue typing.' };
  if(code === 'provider_unavailable') return { code, retryable:true, message:'Voice transcription is temporarily unavailable. Retry or continue typing.' };
  if(code === 'invalid_provider_response') return { code, retryable:false, message:fallback || 'We could not detect speech clearly. Record again or type instead.' };
  if(code === 'invalid_request') return { code, retryable:false, message:fallback || 'This recording could not be accepted. Record again or type instead.' };
  return { code:code || 'voice_failed', retryable:true, message:fallback || 'Voice input failed. Retry or continue typing.' };
}

export function voiceTargetFromField(field, context = 'path_builder'){
  if(!field) return null;
  const start = Number.isFinite(field.selectionStart) ? field.selectionStart : String(field.value || '').length;
  const end = Number.isFinite(field.selectionEnd) ? field.selectionEnd : start;
  return {
    context,
    targetId:field.id || '',
    targetKey:field.dataset.voiceKey || field.dataset.key || field.name || field.id || '',
    targetLabel:field.dataset.voiceLabel || field.getAttribute('aria-label') || field.closest('.field')?.querySelector('label')?.textContent || 'field',
    targetType:field.tagName?.toLowerCase() || 'input',
    insertionStart:start,
    insertionEnd:end,
  };
}

export function isVoiceEligibleField(field){
  if(!field || field.disabled || field.readOnly) return false;
  if(field.dataset.voiceEnabled === 'false') return false;
  if(field.dataset.voiceEnabled === 'true') return true;
  const tag = field.tagName?.toLowerCase();
  if(tag === 'textarea') return !field.classList.contains('ai-task-field');
  if(tag !== 'input') return false;
  const type = String(field.type || 'text').toLowerCase();
  if(!['text', 'search'].includes(type)) return false;
  if(field.classList.contains('ai-task-field')) return false;
  const identity = field.dataset.key || field.id || field.name || '';
  if(/dailyTime|availableTime/i.test(identity)) return true;
  if(/url|date|durationdays|minutes|hours|week|day|time/i.test(identity)) return false;
  return true;
}

export function voiceResultCanTarget(state, field){
  if(!state || !field) return false;
  return state.context === 'path_builder'
    && !!state.targetId
    && field.id === state.targetId
    && (state.targetKey || '') === (field.dataset.voiceKey || field.dataset.key || field.name || field.id || '');
}

export function voiceIsActive(state){
  return [
    'requesting_permission',
    'requesting_token',
    'connecting',
    'recording',
    'finalizing',
    'fallback_recording',
    'fallback_transcribing',
    'transcribing',
  ].includes(state?.phase);
}

export function voiceCanRetry(state){
  return state?.phase === 'error' && state.retryable === true && !!state.blob;
}
