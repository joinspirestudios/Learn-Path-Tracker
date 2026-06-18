import { esc } from '../helpers.js';
import {
  formatVoiceDuration, isVoiceEligibleField, MAX_VOICE_RECORDING_SECONDS,
  voiceCanRetry,
} from '../voice-input-model.js';

function micIcon(){
  return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>';
}

function waveformHTML(){
  return '<span class="voice-waveform" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>';
}

function byId(root, id){
  if(!root || !id) return null;
  if(typeof CSS !== 'undefined' && CSS.escape) return root.querySelector('#' + CSS.escape(id));
  return root.querySelector('#' + String(id).replace(/["\\#.;,[\]()=>+~*^$|]/g, '\\$&'));
}

export function enhanceVoiceFields(root, voiceState){
  if(!root) return [];
  const fields = [...root.querySelectorAll('input, textarea')]
    .filter(field => isVoiceEligibleField(field));
  fields.forEach(field => {
    if(!field.id) field.id = 'voice-field-' + Math.random().toString(36).slice(2);
    field.dataset.voiceKey = field.dataset.voiceKey || field.dataset.key || field.name || field.id;
    field.dataset.voiceEnabled = 'true';
    const label = field.dataset.voiceLabel || field.closest('.field')?.querySelector('label')?.textContent || field.getAttribute('aria-label') || 'this field';
    field.dataset.voiceLabel = label;
    const parent = field.parentElement;
    if(!parent) return;
    let wrapper = field.closest('.voice-field');
    if(!wrapper){
      wrapper = document.createElement('div');
      wrapper.className = 'voice-field';
      parent.insertBefore(wrapper, field);
      wrapper.appendChild(field);
    }
    let controls = wrapper.querySelector('.voice-inline-controls');
    if(!controls){
      controls = document.createElement('div');
      controls.className = 'voice-inline-controls';
      wrapper.appendChild(controls);
    }
    controls.innerHTML = voiceControlHTML(field, voiceState);
  });
  return fields;
}

export function updateVoiceControlForField(field, voiceState = {}){
  const controls = field?.closest('.voice-field')?.querySelector('.voice-inline-controls');
  if(!controls) return;
  controls.innerHTML = voiceControlHTML(field, voiceState);
}

export function updateVoiceMetrics(root, voiceState = {}){
  const field = byId(root, voiceState.targetId);
  const wrapper = field?.closest('.voice-field');
  if(!wrapper) return;
  const timer = wrapper.querySelector('.voice-timer');
  if(timer) timer.textContent = formatVoiceDuration(voiceState.durationSeconds);
  const remaining = wrapper.querySelector('[data-voice-remaining]');
  if(remaining){
    const seconds = Math.max(0, MAX_VOICE_RECORDING_SECONDS - Number(voiceState.durationSeconds || 0));
    remaining.textContent = seconds <= 15 ? `${seconds}s left` : '';
  }
}

export function updateVoiceInterim(root, voiceState = {}){
  const field = byId(root, voiceState.targetId);
  const wrapper = field?.closest('.voice-field');
  if(!wrapper) return;
  const interim = wrapper.querySelector('[data-voice-interim]');
  if(interim){
    interim.textContent = voiceState.interimTranscript ? `Hearing: "${voiceState.interimTranscript}"` : '';
  }
}

export function updateVoiceWaveform(root, targetId, level = 0){
  const field = byId(root, targetId);
  const wrapper = field?.closest('.voice-field');
  if(!wrapper) return;
  wrapper.querySelectorAll('.voice-waveform i').forEach((bar, index) => {
    const height = 8 + Math.round(Math.max(0, Math.min(1, level)) * (8 + index * 2));
    bar.style.height = `${height}px`;
  });
}

export function voiceControlHTML(field, voiceState = {}){
  const targetId = field.id;
  const activeForField = voiceState.targetId === targetId;
  const label = field.dataset.voiceLabel || 'this field';
  const phase = activeForField ? voiceState.phase : 'idle';
  if(phase === 'requesting_permission'){
    return '<div class="voice-status" role="status" aria-live="polite">Requesting microphone...</div>';
  }
  if(phase === 'requesting_token' || phase === 'connecting'){
    return '<div class="voice-status" role="status" aria-live="polite">Connecting live transcription...</div>';
  }
  if(['recording', 'finalizing', 'fallback_recording'].includes(phase)){
    const remaining = Math.max(0, MAX_VOICE_RECORDING_SECONDS - Number(voiceState.durationSeconds || 0));
    const label = phase === 'finalizing' ? 'Finalizing speech...' : (phase === 'fallback_recording' ? 'Recording for fallback...' : 'Listening...');
    return '<div class="voice-status recording" role="status" aria-live="polite">'
      + '<span>' + esc(label) + '</span><b class="voice-timer">' + esc(formatVoiceDuration(voiceState.durationSeconds)) + '</b>'
      + waveformHTML()
      + '<small data-voice-remaining>' + (remaining <= 15 ? esc(remaining) + 's left' : '') + '</small>'
      + '<button class="btn gold voice-stop" type="button" data-voice-action="stop" ' + (phase === 'finalizing' ? 'disabled' : '') + '>Stop</button>'
      + '<button class="btn voice-cancel" type="button" data-voice-action="cancel">Cancel</button>'
      + '<span class="voice-interim" data-voice-interim aria-live="polite">' + (voiceState.interimTranscript ? 'Hearing: "' + esc(voiceState.interimTranscript) + '"' : '') + '</span>'
      + '</div>';
  }
  if(phase === 'fallback_transcribing'){
    return '<div class="voice-status" role="status" aria-live="polite">Turning your voice into text...</div>';
  }
  if(activeForField && phase === 'error'){
    return '<div class="voice-error" role="alert"><span>' + esc(voiceState.errorMessage || 'Voice input failed.') + '</span>'
      + '<div class="voice-retry-actions">'
      + (voiceCanRetry(voiceState) ? '<button class="btn" type="button" data-voice-action="retry">Retry transcription</button>' : '')
      + '<button class="btn" type="button" data-voice-action="clear">Continue typing</button>'
      + '</div></div>';
  }
  const disabled = ['recording', 'requesting_permission', 'stopping', 'transcribing'].includes(voiceState.phase) && !activeForField;
  return '<button class="voice-trigger" type="button" data-voice-action="start" aria-label="' + esc('Use voice for ' + label) + '" aria-pressed="false" ' + (disabled ? 'disabled' : '') + '>'
    + micIcon()
    + '</button>';
}
