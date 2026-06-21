import { createRouteLogger, elapsedMs, requestBodyBytes } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { runProviderRequest } from '../../api/_lib/provider.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';

export const DEEPGRAM_TOKEN_TIMEOUT_MS = 10_000;
export const DEEPGRAM_TOKEN_TTL_SECONDS = 30;

function mapDeepgramGrantError(status){
  if(status === 429) return apiError('provider_unavailable', 'The transcription service is rate limited. Try again later.', 503);
  if(status === 401 || status === 403) return apiError('server_misconfigured', 'Voice transcription credentials were rejected.', 503);
  if(status >= 500) return apiError('provider_unavailable', 'Live transcription is temporarily unavailable.', 503);
  return apiError('provider_unavailable', 'Live transcription could not start.', 503);
}

function normalizeGrantPayload(payload){
  const accessToken = String(payload?.access_token || '').trim();
  const expiresIn = Number(payload?.expires_in);
  if(!accessToken) throw apiError('provider_unavailable', 'Live transcription returned an invalid token response.', 502);
  return {
    accessToken,
    expiresIn:Number.isFinite(expiresIn) ? Math.max(1, Math.round(expiresIn)) : DEEPGRAM_TOKEN_TTL_SECONDS,
  };
}

export async function requestDeepgramToken(signal){
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if(!apiKey) throw apiError('server_misconfigured', 'Voice transcription requires Deepgram configuration.', 503);
  const response = await fetch('https://api.deepgram.com/v1/auth/grant', {
    method:'POST',
    headers:{
      Authorization:`Token ${apiKey}`,
      'Content-Type':'application/json',
    },
    body:JSON.stringify({ ttl_seconds:DEEPGRAM_TOKEN_TTL_SECONDS }),
    signal,
  });
  if(!response.ok) throw mapDeepgramGrantError(response.status);
  let payload;
  try{ payload = await response.json(); }
  catch(error){ throw apiError('provider_unavailable', 'Live transcription returned an invalid token response.', 502); }
  return normalizeGrantPayload(payload);
}

export function createDeepgramTokenHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  provider = requestDeepgramToken,
  runProvider = runProviderRequest,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('deepgram-token', requestId);
    setPrivateNoStore(res, requestId);
    log.event('deepgram_token_request_started', {
      requestBodyBytes:requestBodyBytes(req),
      timeoutMs:DEEPGRAM_TOKEN_TIMEOUT_MS,
    });
    if(req.method !== 'POST'){
      res.setHeader('Allow', 'POST');
      log.event('deepgram_token_response_sent', { status:405, code:'method_not_allowed', result:'error' });
      return sendApiError(res, apiError('method_not_allowed', 'POST only.', 405), requestId);
    }
    try{
      const auth = await authenticate(req);
      log.event('deepgram_token_auth_complete', { result:'ok' });
      await rateLimit(auth.uid, 'transcribe');
      log.event('deepgram_token_rate_limit_complete', { result:'ok' });
      const startedAt = Date.now();
      log.event('deepgram_token_provider_started', { timeoutMs:DEEPGRAM_TOKEN_TIMEOUT_MS });
      let grant;
      try{
        grant = await runProvider(req, DEEPGRAM_TOKEN_TIMEOUT_MS, signal => provider(signal));
        log.event('deepgram_token_provider_completed', {
          providerElapsedMs:elapsedMs(startedAt),
          timeoutMs:DEEPGRAM_TOKEN_TIMEOUT_MS,
          result:'ok',
        });
      }catch(error){
        if(error?.code === 'provider_timeout'){
          log.event('deepgram_token_provider_timeout', {
            providerElapsedMs:elapsedMs(startedAt),
            timeoutMs:DEEPGRAM_TOKEN_TIMEOUT_MS,
            providerStatus:504,
            result:'timeout',
          }, 'warn');
        }
        throw error;
      }
      log.event('deepgram_token_response_sent', { status:200, result:'ok' });
      return sendPrivateJson(res, 200, {
        ok:true,
        accessToken:grant.accessToken,
        expiresIn:grant.expiresIn,
      }, requestId);
    }catch(error){
      const code = error?.code === 'provider_timeout' ? 'provider_timeout' : (error?.code || 'internal_error');
      log.event('deepgram_token_response_sent', {
        status:Number(error?.status) || 500,
        code,
        result:'error',
      }, error?.code === 'provider_timeout' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createDeepgramTokenHandler();
