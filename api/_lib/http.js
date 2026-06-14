import { apiError } from './errors.js';

export function contentType(req){
  return String(req?.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase();
}

export function requireJsonBody(req, maxBytes = 48 * 1024){
  if(contentType(req) !== 'application/json'){
    throw apiError('invalid_request', 'Content-Type must be application/json.', 415);
  }
  const declaredLength = Number(req?.headers?.['content-length'] || 0);
  if(Number.isFinite(declaredLength) && declaredLength > maxBytes){
    throw apiError('payload_too_large', 'The request is too large.', 413);
  }

  let body = req?.body;
  if(typeof body === 'string'){
    if(Buffer.byteLength(body, 'utf8') > maxBytes){
      throw apiError('payload_too_large', 'The request is too large.', 413);
    }
    try{ body = JSON.parse(body || '{}'); }
    catch(error){ throw apiError('invalid_request', 'The request body must contain valid JSON.', 400); }
  }
  if(!body || typeof body !== 'object' || Array.isArray(body)){
    throw apiError('invalid_request', 'The request body must be a JSON object.', 400);
  }
  if(Buffer.byteLength(JSON.stringify(body), 'utf8') > maxBytes){
    throw apiError('payload_too_large', 'The request is too large.', 413);
  }
  return body;
}

export function boundedText(value, field, max, { required = false } = {}){
  const result = String(value == null ? '' : value).trim();
  if(required && !result) throw apiError('invalid_request', `${field} is required.`, 400);
  if(result.length > max) throw apiError('invalid_request', `${field} is too long.`, 400);
  return result;
}

export function boundedArray(value, field, maxItems){
  if(value == null) return [];
  if(!Array.isArray(value)) throw apiError('invalid_request', `${field} must be an array.`, 400);
  if(value.length > maxItems) throw apiError('invalid_request', `${field} contains too many items.`, 400);
  return value;
}
