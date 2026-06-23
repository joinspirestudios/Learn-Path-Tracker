// Safe API client seam for the mobile skin.
//
// This is a thin transport helper that points at the existing Vercel API
// contract. Placeholder screens do NOT call it yet — it exists so later mobile
// phases have a single, privacy-safe place to wire real requests.
//
// Safety rules enforced here:
//   - Never logs Authorization tokens.
//   - Never logs request bodies (they may carry private proof/reflection text).
//   - Only attaches `Authorization: Bearer <token>` when a getIdToken function
//     is provided by the caller; tokens are never stored in this module.
//   - Throws structured, message-only errors with no token/body leakage.

import { getApiBaseUrl, DEFAULT_API_BASE_URL } from './env.js';

function joinUrl(baseUrl, endpoint) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const path = String(endpoint || '');
  if (/^https?:\/\//i.test(path)) return path;
  return base + (path.startsWith('/') ? path : '/' + path);
}

export function createApiClient({ baseUrl, getIdToken, fetchImpl } = {}) {
  const resolvedBase = baseUrl || getApiBaseUrl() || DEFAULT_API_BASE_URL;
  const doFetch = fetchImpl
    || (typeof fetch !== 'undefined' ? fetch : null);

  async function request(endpoint, { method = 'GET', body, headers = {}, signal } = {}) {
    if (!doFetch) {
      throw new Error('No fetch implementation available in this environment');
    }
    const url = joinUrl(resolvedBase, endpoint);
    const finalHeaders = { Accept: 'application/json', ...headers };
    let payload;
    if (body !== undefined && body !== null) {
      finalHeaders['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    if (typeof getIdToken === 'function') {
      const token = await getIdToken();
      if (token) {
        finalHeaders.Authorization = 'Bearer ' + token;
      }
    }

    let response;
    try {
      response = await doFetch(url, { method, headers: finalHeaders, body: payload, signal });
    } catch (networkError) {
      // Do not include headers or body in the surfaced error.
      throw new Error('Network request failed for ' + method + ' ' + endpoint);
    }

    const text = await response.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!response.ok) {
      const code = (data && data.code) || 'request_failed';
      const message = (data && data.error) || ('Request failed with status ' + response.status);
      const err = new Error(message);
      err.code = code;
      err.status = response.status;
      throw err;
    }
    return data;
  }

  return {
    baseUrl: resolvedBase,
    request,
    get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
    post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body }),
  };
}

export default createApiClient;
