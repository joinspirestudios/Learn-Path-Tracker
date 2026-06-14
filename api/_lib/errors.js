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

export function sendApiError(res, error){
  const status = Number(error?.status) || 500;
  const code = error?.code || 'internal_error';
  const message = error?.message || 'An unexpected server error occurred.';
  if(error?.retryAfterSeconds){
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
  }
  return res.status(status).json({
    ok:false,
    error:code,
    code,
    message,
    details:error?.details ?? null,
    ...(error?.retryAfterSeconds ? { retryAfterSeconds:Math.ceil(error.retryAfterSeconds) } : {}),
  });
}

export function methodNotAllowed(res, allowed = 'POST'){
  res.setHeader('Allow', allowed);
  return sendApiError(res, apiError('method_not_allowed', `${allowed} only.`, 405));
}
