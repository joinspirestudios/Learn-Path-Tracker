function cleanText(value){
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeNumber(value, fallback = 0){
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function needsSpaceBefore(value){
  return !!value && !/[\s([{/"']$/.test(value);
}

function needsSpaceAfter(value){
  return !!value && !/^[\s.,!?;:)\]}]/.test(value);
}

function joinNatural(parts){
  return parts.map(cleanText).filter(Boolean).reduce((result, part) => {
    if(!result) return part;
    return result + (needsSpaceBefore(result) && needsSpaceAfter(part) ? ' ' : '') + part;
  }, '');
}

function selectionBounds(baseText, insertionStart = 0, insertionEnd = insertionStart){
  const value = String(baseText || '');
  const start = Math.max(0, Math.min(value.length, safeNumber(insertionStart, 0)));
  const end = Math.max(start, Math.min(value.length, safeNumber(insertionEnd, start)));
  return { value, start, end };
}

export function makeLiveTranscriptState(input = {}){
  const { value, start, end } = selectionBounds(input.baseText, input.insertionStart, input.insertionEnd);
  return {
    baseText:value,
    insertionStart:start,
    insertionEnd:end,
    finalizedSegments:Array.isArray(input.finalizedSegments) ? input.finalizedSegments.map(normalizeSegment).filter(Boolean) : [],
    interimTranscript:cleanText(input.interimTranscript),
    interimKey:input.interimKey || '',
    interimStartMs:safeNumber(input.interimStartMs, -1),
  };
}

function normalizeSegment(segment = {}){
  const transcript = cleanText(segment.transcript);
  if(!transcript) return null;
  const startMs = Math.max(0, Math.round(safeNumber(segment.startMs, 0)));
  const durationMs = Math.max(0, Math.round(safeNumber(segment.durationMs, 0)));
  const channelIndex = Math.max(0, Math.round(safeNumber(segment.channelIndex, 0)));
  return {
    key:segment.key || `${channelIndex}:${startMs}:${durationMs}`,
    channelIndex,
    startMs,
    durationMs,
    transcript,
  };
}

export function segmentKeyFromDeepgram(message = {}){
  const channelIndex = Array.isArray(message.channel_index)
    ? safeNumber(message.channel_index[0], 0)
    : safeNumber(message.channel_index ?? message.channel?.channel_index, 0);
  const alternative = message.channel?.alternatives?.[0] || {};
  const words = Array.isArray(alternative.words) ? alternative.words : [];
  const firstWord = words[0] || {};
  const lastWord = words[words.length - 1] || {};
  const start = safeNumber(message.start ?? firstWord.start, 0);
  const duration = safeNumber(
    message.duration ?? (
      lastWord.end != null && start != null ? safeNumber(lastWord.end, start) - safeNumber(start, 0) : 0
    ),
    0,
  );
  return `${Math.round(channelIndex)}:${Math.round(start * 1000)}:${Math.round(duration * 1000)}`;
}

export function transcriptEventFromDeepgram(message = {}){
  const transcript = cleanText(message.channel?.alternatives?.[0]?.transcript);
  if(!transcript) return null;
  const key = segmentKeyFromDeepgram(message);
  const [channelIndex, startMs, durationMs] = key.split(':').map(value => Math.max(0, Math.round(safeNumber(value, 0))));
  return {
    key,
    channelIndex,
    startMs,
    durationMs,
    transcript,
    isFinal:message.is_final === true || message.speech_final === true,
    speechFinal:message.speech_final === true,
  };
}

export function finalizedTranscript(state = {}){
  return (Array.isArray(state.finalizedSegments) ? state.finalizedSegments : [])
    .slice()
    .sort((a, b) => (a.startMs - b.startMs) || (a.durationMs - b.durationMs) || String(a.key).localeCompare(String(b.key)))
    .map(segment => cleanText(segment.transcript))
    .filter(Boolean)
    .reduce((result, part) => joinNatural([result, part]), '');
}

export function sessionTranscript(state = {}){
  return joinNatural([finalizedTranscript(state), state.interimTranscript]);
}

export function liveTranscriptValue(state = {}){
  const value = String(state.baseText || '');
  const start = Math.max(0, Math.min(value.length, safeNumber(state.insertionStart, 0)));
  const end = Math.max(start, Math.min(value.length, safeNumber(state.insertionEnd, start)));
  const before = value.slice(0, start);
  const after = value.slice(end);
  const live = sessionTranscript(state);
  if(!live) return before + after;
  const inserted = (needsSpaceBefore(before) ? ' ' : '') + live + (needsSpaceAfter(after) ? ' ' : '');
  return before + inserted + after;
}

export function applyTranscriptEvent(stateInput = {}, eventInput = {}){
  const state = makeLiveTranscriptState(stateInput);
  const event = eventInput?.channel ? transcriptEventFromDeepgram(eventInput) : eventInput;
  if(!event?.transcript) return { state, changed:false };
  const segment = normalizeSegment(event);
  if(!segment) return { state, changed:false };
  const finalizedSegments = state.finalizedSegments.slice();
  const existingIndex = finalizedSegments.findIndex(item => item.key === segment.key);

  if(event.isFinal){
    if(existingIndex >= 0){
      if(finalizedSegments[existingIndex].transcript === segment.transcript){
        return {
          state:makeLiveTranscriptState({
            ...state,
            interimTranscript:state.interimKey === segment.key ? '' : state.interimTranscript,
            interimKey:state.interimKey === segment.key ? '' : state.interimKey,
            finalizedSegments,
          }),
          changed:false,
        };
      }
      finalizedSegments[existingIndex] = segment;
    } else {
      finalizedSegments.push(segment);
    }
    return {
      state:makeLiveTranscriptState({
        ...state,
        finalizedSegments,
        interimTranscript:state.interimKey === segment.key ? '' : state.interimTranscript,
        interimKey:state.interimKey === segment.key ? '' : state.interimKey,
        interimStartMs:state.interimKey === segment.key ? -1 : state.interimStartMs,
      }),
      changed:true,
      finalized:true,
    };
  }

  if(existingIndex >= 0) return { state, changed:false };
  if(state.finalizedSegments.some(item => item.startMs >= segment.startMs && item.startMs <= segment.startMs + Math.max(1, segment.durationMs))){
    return { state, changed:false };
  }
  if(state.interimStartMs > segment.startMs && state.interimTranscript) return { state, changed:false };
  return {
    state:makeLiveTranscriptState({
      ...state,
      interimTranscript:segment.transcript,
      interimKey:segment.key,
      interimStartMs:segment.startMs,
    }),
    changed:true,
    finalized:false,
  };
}

export function applyFallbackTranscript(stateInput = {}, transcript = ''){
  const state = makeLiveTranscriptState(stateInput);
  const cleaned = cleanText(transcript);
  return makeLiveTranscriptState({
    ...state,
    finalizedSegments:cleaned ? [{ key:'fallback:0:0', channelIndex:0, startMs:0, durationMs:0, transcript:cleaned }] : [],
    interimTranscript:'',
    interimKey:'',
    interimStartMs:-1,
  });
}

export function cancelLiveTranscript(stateInput = {}){
  const state = makeLiveTranscriptState(stateInput);
  return state.baseText;
}
