import { randomUUID } from 'node:crypto';

export class ApiError extends Error {
  constructor(code, message, status = 500, details = null){
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function apiError(code, message, status = 500, details = null){
  return new ApiError(code, message, status, details);
}

export function setPrivateNoStore(res, requestId = null){
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  if(requestId) res.setHeader('X-Request-Id', requestId);
}

export function sendPrivateJson(res, status, payload, requestId = randomUUID()){
  setPrivateNoStore(res, requestId);
  return res.status(status).json({ ...payload, requestId });
}

export function sendApiError(res, error, requestId = randomUUID()){
  const trusted = error instanceof ApiError;
  const status = trusted ? (Number(error.status) || 500) : 500;
  const code = trusted ? (error.code || 'internal_error') : 'internal_error';
  const message = trusted ? error.message : 'An unexpected server error occurred. Please try again.';
  const details = trusted ? (error.details ?? null) : null;
  if(trusted && error.retryAfterSeconds){
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
  }
  if(!trusted){
    console.error('Unhandled API error', {
      requestId,
      name:error?.name || 'Error',
      code:error?.code || null,
      status:Number(error?.status) || null,
      stackFrames:String(error?.stack || '').split('\n').slice(1, 8),
    });
  }
  return sendPrivateJson(res, status, {
    ok:false,
    error:code,
    code,
    message,
    details,
    ...(trusted && error.retryAfterSeconds ? { retryAfterSeconds:Math.ceil(error.retryAfterSeconds) } : {}),
  }, requestId);
}

export function methodNotAllowed(res, allowed = 'POST'){
  res.setHeader('Allow', allowed);
  return sendApiError(res, apiError('method_not_allowed', `${allowed} only.`, 405));
}

export function createRequestId(){
  return randomUUID();
}
