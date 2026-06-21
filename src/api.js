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

function interactionMessage(status, payload = {}, action = 'update this interaction'){
  const code = payload?.code || payload?.error || '';
  if(status === 401 || code === 'unauthorized') return action === 'comment' ? 'Sign in to comment.' : 'Sign in to cheer this progress.';
  if(status === 403 || ['path_not_public', 'forbidden'].includes(code)) return 'This progress entry is not available for that action.';
  if(status === 404 || ['path_not_found', 'progress_not_found', 'comment_not_found'].includes(code)) return 'This progress entry could not be found.';
  if(status === 400 || ['invalid_request', 'invalid_reaction', 'invalid_comment'].includes(code)) return payload?.message || 'Check the details and try again.';
  if(status === 429 || code === 'rate_limited') return 'Too many attempts. Try again later.';
  if(status >= 500) return 'Could not update this progress interaction right now. Try again.';
  return payload?.message || 'Could not update this progress interaction.';
}

function reportMessage(status, payload = {}, target = 'content'){
  const code = payload?.code || payload?.error || '';
  const label = target === 'comment' ? 'comment' : 'path';
  if(status === 401 || code === 'unauthorized') return `Sign in to report this ${label}.`;
  if(status === 403 || ['path_not_public', 'forbidden'].includes(code)) return `This ${label} is not available for reporting.`;
  if(status === 404 || ['path_not_found', 'progress_not_found', 'comment_not_found'].includes(code)) return `This ${label} could not be found.`;
  if(status === 400 || ['invalid_request', 'invalid_report_reason'].includes(code)) return payload?.message || 'Choose a supported report reason.';
  if(status === 429 || code === 'rate_limited') return 'Too many reports. Try again later.';
  if(status >= 500) return `Could not report this ${label} right now. Try again.`;
  return payload?.message || `Could not report this ${label}.`;
}

function metricsMessage(status, payload = {}){
  const code = payload?.code || payload?.error || '';
  if(status === 401 || code === 'unauthorized') return 'Sign in again to sync path metrics.';
  if(status === 403 || code === 'forbidden') return 'Path metrics could not be updated for this account.';
  if(status === 404 || ['path_not_found', 'enrollment_not_found', 'day_log_not_found'].includes(code)) return 'Path metrics source data is not ready yet.';
  if(status === 409 || code === 'milestone_not_verified') return 'Path metrics will update after this milestone is verified.';
  if(status === 400 || ['invalid_request', 'invalid_event'].includes(code)) return payload?.message || 'Path metrics request was invalid.';
  if(status === 429 || code === 'rate_limited') return 'Path metrics are syncing too often. They will catch up later.';
  if(status >= 500) return 'Path metrics could not sync right now.';
  return payload?.message || 'Path metrics could not sync.';
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

async function interactionRequest(url, body, action){
  const response = await authFetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(body),
  });
  let payload = null;
  try{ payload = await response.json(); }
  catch(error){ payload = {}; }
  if(!response.ok || !payload?.ok){
    const error = new Error(interactionMessage(response.status, payload, action));
    error.code = payload?.code || payload?.error || `${action}_failed`;
    error.status = response.status;
    error.retryAfterSeconds = payload?.retryAfterSeconds || null;
    throw error;
  }
  return payload;
}

export async function reactToProgress(pathId, entryId, reaction){
  return interactionRequest('/api/react-progress', { pathId, entryId, reaction }, 'react');
}

export async function commentOnProgress(pathId, entryId, body){
  return interactionRequest('/api/comment-progress', { pathId, entryId, body }, 'comment');
}

export async function hideProgressComment(pathId, entryId, commentId){
  return interactionRequest('/api/hide-progress-comment', { pathId, entryId, commentId }, 'hide');
}

async function reportRequest(url, body, target){
  const response = await authFetch(url, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(body),
  });
  let payload = null;
  try{ payload = await response.json(); }
  catch(error){ payload = {}; }
  if(!response.ok || !payload?.ok){
    const error = new Error(reportMessage(response.status, payload, target));
    error.code = payload?.code || payload?.error || `${target}_report_failed`;
    error.status = response.status;
    error.retryAfterSeconds = payload?.retryAfterSeconds || null;
    throw error;
  }
  return payload;
}

export async function reportPath(pathId, reason, note = ''){
  return reportRequest('/api/report-path', { pathId, reason, note }, 'path');
}

export async function reportProgressComment(pathId, entryId, commentId, reason, note = ''){
  return reportRequest('/api/report-progress-comment', { pathId, entryId, commentId, reason, note }, 'comment');
}

export async function syncPathMetrics(pathId, event, dayNumber = null){
  const body = { pathId, event };
  if(dayNumber != null) body.dayNumber = dayNumber;
  const response = await authFetch('/api/sync-path-metrics', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify(body),
  });
  let payload = null;
  try{ payload = await response.json(); }
  catch(error){ payload = {}; }
  if(!response.ok || !payload?.ok){
    const error = new Error(metricsMessage(response.status, payload));
    error.code = payload?.code || payload?.error || 'metrics_sync_failed';
    error.status = response.status;
    error.retryAfterSeconds = payload?.retryAfterSeconds || null;
    throw error;
  }
  return payload;
}
