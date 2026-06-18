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

export function enhanceVoiceFields(root, voiceState, handlers = {}){
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
    const trigger = controls.querySelector('[data-voice-action="start"]');
    const stop = controls.querySelector('[data-voice-action="stop"]');
    const cancel = controls.querySelector('[data-voice-action="cancel"]');
    const retry = controls.querySelector('[data-voice-action="retry"]');
    const clear = controls.querySelector('[data-voice-action="clear"]');
    if(trigger) trigger.onclick = () => handlers.onStart?.(field);
    if(stop) stop.onclick = () => handlers.onStop?.();
    if(cancel) cancel.onclick = () => handlers.onCancel?.();
    if(retry) retry.onclick = () => handlers.onRetry?.();
    if(clear) clear.onclick = () => handlers.onClear?.();
  });
  return fields;
}

export function voiceControlHTML(field, voiceState = {}){
  const targetId = field.id;
  const activeForField = voiceState.targetId === targetId;
  const label = field.dataset.voiceLabel || 'this field';
  const phase = activeForField ? voiceState.phase : 'idle';
  if(phase === 'requesting_permission'){
    return '<div class="voice-status" role="status" aria-live="polite">Requesting microphone access...</div>';
  }
  if(phase === 'recording' || phase === 'stopping'){
    const remaining = Math.max(0, MAX_VOICE_RECORDING_SECONDS - Number(voiceState.durationSeconds || 0));
    return '<div class="voice-status recording" role="status" aria-live="polite">'
      + '<span>Listening...</span><b class="voice-timer">' + esc(formatVoiceDuration(voiceState.durationSeconds)) + '</b>'
      + waveformHTML()
      + (remaining <= 15 ? '<small>' + esc(remaining) + 's left</small>' : '')
      + '<button class="btn gold voice-stop" type="button" data-voice-action="stop">Stop</button>'
      + '<button class="btn voice-cancel" type="button" data-voice-action="cancel">Cancel</button>'
      + '</div>';
  }
  if(phase === 'transcribing'){
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
