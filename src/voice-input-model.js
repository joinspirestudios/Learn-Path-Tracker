export const MAX_VOICE_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_VOICE_RECORDING_SECONDS = 120;
export const VOICE_CHUNK_INTERVAL_MS = 1000;
export const VOICE_AUTO_STOP_BYTES = Math.floor(3.75 * 1024 * 1024);

export const VOICE_PHASES = [
  'idle',
  'requesting_permission',
  'recording',
  'stopping',
  'transcribing',
  'error',
];

const TRANSITIONS = {
  idle:['requesting_permission', 'error'],
  requesting_permission:['recording', 'idle', 'error'],
  recording:['stopping', 'transcribing', 'idle', 'error'],
  stopping:['transcribing', 'idle', 'error'],
  transcribing:['idle', 'error'],
  error:['idle', 'requesting_permission', 'transcribing'],
};

export function makeVoiceInputState(prev = {}){
  return {
    phase:VOICE_PHASES.includes(prev.phase) ? prev.phase : 'idle',
    context:prev.context || 'path_builder',
    targetId:prev.targetId || '',
    targetKey:prev.targetKey || '',
    targetLabel:prev.targetLabel || '',
    targetType:prev.targetType || '',
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
    requestToken:prev.requestToken || null,
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
  if(code === 'not_readable') return { code, retryable:true, message:'The microphone is busy or unavailable. Close other recording apps and try again.' };
  if(code === 'security') return { code, retryable:false, message:'Microphone access requires a secure browser context. Continue typing for now.' };
  if(code === 'unsupported_browser') return { code, retryable:false, message:'Voice input is not supported in this browser. You can still type.' };
  if(code === 'payload_too_large') return { code, retryable:false, message:'This voice note is too large to transcribe. Keep recordings under two minutes and try again.' };
  if(code === 'unauthorized') return { code, retryable:true, message:'Your session expired. Sign in again to transcribe voice input.' };
  if(code === 'rate_limited') return { code, retryable:true, message:'You have reached the current transcription limit. Try again later.' };
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
  return ['requesting_permission', 'recording', 'stopping', 'transcribing'].includes(state?.phase);
}

export function voiceCanRetry(state){
  return state?.phase === 'error' && state.retryable === true && !!state.blob;
}
