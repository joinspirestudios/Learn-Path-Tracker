import { createRouteLogger, elapsedMs, requestBodyBytes } from './_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from './_lib/errors.js';
import { contentType } from './_lib/http.js';
import { runProviderRequest } from './_lib/provider.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { requireAuth } from './_lib/require-auth.js';

const ACCEPTED_AUDIO_TYPES = new Set([
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg',
]);
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
export const TRANSCRIBE_TIMEOUT_MS = 60_000;

export const config = { api:{ bodyParser:false } };

function text(value, fallback = ''){
  return String(value == null ? fallback : value).trim();
}

export function sanitizeFileName(value){
  return text(value, 'voice-recording')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120) || 'voice-recording';
}

async function readAudioBody(req){
  if(req.body){
    if(Buffer.isBuffer(req.body)) return req.body;
    if(typeof req.body === 'string') return Buffer.from(req.body);
    if(req.body instanceof ArrayBuffer) return Buffer.from(req.body);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req){
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if(size > MAX_AUDIO_BYTES){
      req.destroy?.();
      throw apiError('payload_too_large', 'This recording is larger than the 25 MB upload limit.', 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function mapDeepgramError(status){
  if(status === 429) return apiError('provider_unavailable', 'The transcription service is rate limited. Try again later.', 503);
  if(status === 401 || status === 403) return apiError('provider_unavailable', 'The transcription service credentials were rejected.', 503);
  return apiError('provider_unavailable', 'The transcription service is temporarily unavailable.', 503);
}

function extractTranscript(payload){
  const alternative = payload?.results?.channels?.[0]?.alternatives?.[0];
  const transcript = text(alternative?.transcript);
  const confidence = Number(alternative?.confidence);
  const duration = Number(payload?.metadata?.duration);
  return {
    transcript,
    confidence:Number.isFinite(confidence) ? confidence : null,
    duration:Number.isFinite(duration) ? duration : null,
  };
}

export async function callDeepgram({ audio, mimeType }, signal){
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if(!apiKey) throw apiError('provider_unavailable', 'Voice transcription requires Deepgram configuration.', 503);
  const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true', {
    method:'POST',
    headers:{ Authorization:`Token ${apiKey}`, 'Content-Type':mimeType },
    body:audio,
    signal,
  });
  if(!response.ok) throw mapDeepgramError(response.status);
  let payload;
  try{ payload = await response.json(); }
  catch(error){ throw apiError('invalid_provider_response', 'The transcription service returned an invalid response.', 502); }
  return extractTranscript(payload);
}

export function createTranscribeVoiceHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  provider = callDeepgram,
  runProvider = runProviderRequest,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('transcribe-voice', requestId);
    setPrivateNoStore(res, requestId);
    log.event('transcribe_request_started', {
      requestBodyBytes:requestBodyBytes(req),
      timeoutMs:TRANSCRIBE_TIMEOUT_MS,
    });
    if(req.method !== 'POST'){
      res.setHeader('Allow', 'POST');
      log.event('transcribe_response_sent', { status:405, code:'method_not_allowed', result:'error' });
      return sendApiError(res, apiError('method_not_allowed', 'POST only.', 405), requestId);
    }
    try{
      const auth = await authenticate(req);
      log.event('transcribe_auth_complete', { result:'ok' });
      const mimeType = contentType(req);
      const contentLength = Number(req.headers?.['content-length'] || 0);
      if(Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES){
        throw apiError('payload_too_large', 'This recording is larger than the 25 MB upload limit.', 413);
      }
      await rateLimit(auth.uid, 'transcribe');
      log.event('transcribe_rate_limit_complete', {
        contentLength:Number.isFinite(contentLength) ? contentLength : 0,
        mimeType,
        result:'ok',
      });
      const audio = await readAudioBody(req);
      if(!audio.length) throw apiError('invalid_request', 'Add an audio recording before transcribing.', 400);
      if(audio.length > MAX_AUDIO_BYTES) throw apiError('payload_too_large', 'This recording is larger than the 25 MB upload limit.', 413);
      if(!ACCEPTED_AUDIO_TYPES.has(mimeType)){
        throw apiError('invalid_request', 'This audio format is not supported. Record WebM, MP4, MP3, WAV, or OGG audio.', 415);
      }
      const fileName = sanitizeFileName(req.headers?.['x-file-name']);
      const providerStartedAt = Date.now();
      log.event('transcribe_provider_started', {
        timeoutMs:TRANSCRIBE_TIMEOUT_MS,
        audioBytes:audio.length,
        mimeType,
      });
      let result;
      try{
        result = await runProvider(req, TRANSCRIBE_TIMEOUT_MS, signal => provider({ audio, mimeType, fileName }, signal));
        log.event('transcribe_provider_completed', {
          providerElapsedMs:elapsedMs(providerStartedAt),
          timeoutMs:TRANSCRIBE_TIMEOUT_MS,
          audioBytes:audio.length,
          mimeType,
          result:'ok',
        });
      }catch(error){
        if(error?.code === 'provider_timeout'){
          log.event('transcribe_provider_timeout', {
            providerElapsedMs:elapsedMs(providerStartedAt),
            timeoutMs:TRANSCRIBE_TIMEOUT_MS,
            providerStatus:504,
            audioBytes:audio.length,
            mimeType,
            result:'timeout',
          }, 'warn');
        }
        throw error;
      }
      if(!result?.transcript){
        throw apiError('invalid_provider_response', 'We could not detect speech clearly. Try recording again or type your goal manually.', 422);
      }
      log.event('transcribe_response_sent', { status:200, result:'ok' });
      return sendPrivateJson(res, 200, { ok:true, transcript:result.transcript, duration:result.duration, confidence:result.confidence }, requestId);
    }catch(error){
      log.event('transcribe_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'provider_timeout' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createTranscribeVoiceHandler();
