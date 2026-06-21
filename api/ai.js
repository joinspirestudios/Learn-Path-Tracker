import generatePathHandler from '../server/api-handlers/generate-path.js';
import interpretGoalHandler from '../server/api-handlers/interpret-goal.js';
import { apiError, createRequestId, sendApiError, setPrivateNoStore } from './_lib/errors.js';

const handlers = {
  'generate-path':generatePathHandler,
  'interpret-goal':interpretGoalHandler,
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
