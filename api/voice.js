import deepgramTokenHandler from '../server/api-handlers/deepgram-token.js';
import transcribeVoiceHandler from '../server/api-handlers/transcribe-voice.js';
import { apiError, createRequestId, sendApiError, setPrivateNoStore } from './_lib/errors.js';

export const config = { api:{ bodyParser:false } };

const handlers = {
  'deepgram-token':deepgramTokenHandler,
  'transcribe-voice':transcribeVoiceHandler,
};

function routeNameFromRequest(req){
  const queryRoute = Array.isArray(req?.query?.route) ? req.query.route[0] : req?.query?.route;
  if(queryRoute) return String(queryRoute);
  try{
    const url = new URL(req?.url || '', 'https://learn-path-tracker.local');
    return url.searchParams.get('route') || url.pathname.split('/').filter(Boolean).pop() || '';
  } catch(error){
    return '';
  }
}

export default async function handler(req, res){
  const selected = handlers[routeNameFromRequest(req)];
  if(selected) return selected(req, res);
  const requestId = createRequestId();
  setPrivateNoStore(res, requestId);
  return sendApiError(res, apiError('not_found', 'API route not found.', 404), requestId);
}
