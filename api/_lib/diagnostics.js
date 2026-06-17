const SAFE_LOG_FIELDS = new Set([
  'requestId', 'route', 'event', 'elapsedMs', 'providerElapsedMs', 'timeoutMs',
  'result', 'providerStatus', 'model', 'inputTokens', 'outputTokens',
  'requestBodyBytes', 'goalCharacterCount', 'clarificationRound',
  'durationDays', 'contentLength', 'audioBytes', 'mimeType', 'status', 'code',
  'stopReason', 'contentBlockTypes', 'toolUseFound', 'rawTaskCount',
  'rawSectionCount', 'validationReason',
]);

export function elapsedMs(startedAt, now = Date.now()){
  return Math.max(0, Math.round(now - startedAt));
}

export function requestBodyBytes(req, body = null){
  const declared = Number(req?.headers?.['content-length'] || 0);
  if(Number.isFinite(declared) && declared > 0) return declared;
  if(Buffer.isBuffer(body)) return body.length;
  if(typeof body === 'string') return Buffer.byteLength(body, 'utf8');
  if(body && typeof body === 'object'){
    try{ return Buffer.byteLength(JSON.stringify(body), 'utf8'); }
    catch(error){ return null; }
  }
  return null;
}

export function usageFromMessage(message){
  const inputTokens = Number(message?.usage?.input_tokens);
  const outputTokens = Number(message?.usage?.output_tokens);
  return {
    inputTokens:Number.isFinite(inputTokens) ? inputTokens : null,
    outputTokens:Number.isFinite(outputTokens) ? outputTokens : null,
  };
}

export function safeLog(logger, level, event, fields = {}){
  const entry = { event };
  Object.entries(fields).forEach(([key, value]) => {
    if(!SAFE_LOG_FIELDS.has(key)) return;
    if(value == null) return;
    if(['string', 'number', 'boolean'].includes(typeof value)) entry[key] = value;
    else if(Array.isArray(value) && value.every(item => typeof item === 'string')) entry[key] = value.slice(0, 20);
  });
  const target = level === 'warn' ? 'warn' : 'info';
  logger?.[target]?.(event, entry);
  return entry;
}

export function createRouteLogger(route, requestId, { logger = console, now = Date.now } = {}){
  const startedAt = now();
  return {
    startedAt,
    event(event, fields = {}, level = 'info'){
      return safeLog(logger, level, event, {
        requestId,
        route,
        elapsedMs:elapsedMs(startedAt, now()),
        ...fields,
      });
    },
  };
}
