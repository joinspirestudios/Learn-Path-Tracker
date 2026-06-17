export const SERVER_FUNCTION_FAILED_MESSAGE = 'The AI service could not start correctly. Your goal is still saved. Please try again after the service is restored.';
export const INVALID_SERVER_RESPONSE_MESSAGE = 'The server returned an unreadable response.';

function responseHeader(response, name){
  return response?.headers?.get?.(name) || '';
}

function responseStatus(response){
  const status = Number(response?.status || 0);
  return Number.isFinite(status) ? status : 0;
}

function unreadableResponseError(response){
  const error = new Error(response?.ok ? INVALID_SERVER_RESPONSE_MESSAGE : SERVER_FUNCTION_FAILED_MESSAGE);
  error.code = response?.ok ? 'invalid_server_response' : 'server_function_failed';
  error.status = responseStatus(response);
  return error;
}

export async function parseAIResponse(response){
  const contentType = responseHeader(response, 'content-type').toLowerCase();
  if(!contentType.includes('application/json')){
    throw unreadableResponseError(response);
  }

  let payload;
  try{
    payload = await response.json();
  }catch(error){
    throw unreadableResponseError(response);
  }

  if(!payload || typeof payload !== 'object'){
    throw unreadableResponseError(response);
  }

  return payload;
}

export function errorFromAIPayload(payload, fallback = 'AI request failed.'){
  const error = new Error(payload?.message || fallback);
  error.code = payload?.error || payload?.code || '';
  error.status = payload?.status || null;
  error.requestId = payload?.requestId || null;
  return error;
}
