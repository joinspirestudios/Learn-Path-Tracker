import { fb } from './firebase.js';

function authError(){
  const error = new Error('Your session has expired. Sign in again to continue.');
  error.code = 'unauthorized';
  return error;
}

export async function authFetch(url, options = {}){
  const user = fb.auth?.currentUser;
  if(!user) throw authError();

  const request = async (forceRefresh = false) => {
    let token;
    try{ token = await user.getIdToken(forceRefresh); }
    catch(error){ throw authError(); }
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  const response = await request(false);
  if(response.status !== 401) return response;
  return request(true);
}

function joinPathMessage(status, payload = {}){
  const code = payload?.code || payload?.error || '';
  if(status === 401 || code === 'unauthorized') return 'Sign in to join this path.';
  if(status === 403 || code === 'path_private') return 'This path is private.';
  if(status === 404 || code === 'path_not_found') return 'This path could not be found.';
  if(status === 429 || code === 'rate_limited') return 'Too many join attempts. Try again later.';
  if(status >= 500) return 'Could not join this path right now. Try again.';
  return payload?.message || 'Could not join this path.';
}

function progressMessage(status, payload = {}, action = 'publish'){
  const code = payload?.code || payload?.error || '';
  if(status === 401 || code === 'unauthorized') return 'Sign in to share progress.';
  if(status === 403 || code === 'path_not_publishable') return 'Public progress is only available on public or unlisted paths.';
  if(status === 403 || code === 'forbidden') return 'You can only update your own progress timeline.';
  if(status === 404 || code === 'path_not_found') return 'This path could not be found.';
  if(status === 404 || code === 'enrollment_not_found') return 'Start or join this path before sharing progress.';
  if(status === 404 || code === 'day_log_not_found') return 'This completed day could not be found.';
  if(status === 409 || code === 'day_not_completed') return 'Only completed days can be published.';
  if(status === 429 || code === 'rate_limited') return 'Too many progress updates. Try again later.';
  if(status >= 500) return `Could not ${action} progress right now. Try again.`;
  return payload?.message || `Could not ${action} progress.`;
}

export async function joinPath(pathId){
  const response = await authFetch('/api/join-path', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ pathId }),
  });
  let payload = null;
  try{ payload = await response.json(); }
  catch(error){ payload = {}; }
  if(!response.ok || !payload?.ok){
    const error = new Error(joinPathMessage(response.status, payload));
    error.code = payload?.code || payload?.error || (response.status === 401 ? 'unauthorized' : 'join_failed');
    error.status = response.status;
    error.retryAfterSeconds = payload?.retryAfterSeconds || null;
    throw error;
  }
  return payload;
}

async function progressRequest(url, body, action){
  const response = await authFetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(body),
  });
  let payload = null;
  try{ payload = await response.json(); }
  catch(error){ payload = {}; }
  if(!response.ok || !payload?.ok){
    const error = new Error(progressMessage(response.status, payload, action));
    error.code = payload?.code || payload?.error || `${action}_progress_failed`;
    error.status = response.status;
    error.retryAfterSeconds = payload?.retryAfterSeconds || null;
    throw error;
  }
  return payload;
}

export async function publishProgress(pathId, dayNumber, payload = {}){
  return progressRequest('/api/publish-progress', {
    pathId,
    dayNumber,
    publicCaption:payload.publicCaption || payload.caption || '',
  }, 'publish');
}

export async function unpublishProgress(pathId, dayNumber){
  return progressRequest('/api/unpublish-progress', { pathId, dayNumber }, 'unpublish');
}
