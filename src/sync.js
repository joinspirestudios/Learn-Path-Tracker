export const READ_TIMEOUT_MS = 8000;
export const WRITE_TIMEOUT_MS = 12000;
export const PATH_OPEN_TIMEOUT_MS = 10000;
export const ENROLLMENT_TIMEOUT_MS = 8000;
export const AI_SAVE_TIMEOUT_MS = 20000;
export const FIRESTORE_PREFLIGHT_TIMEOUT_MS = 8000;

const SLOW_WARN_MS = 5000;

export function timeoutError(label){
  const err = new Error((label || 'Operation') + ' timed out. This is taking too long. Check your connection and try again.');
  err.code = 'operation_timeout';
  err.label = label || 'operation';
  return err;
}

export function withTimeout(promise, ms = READ_TIMEOUT_MS, label = 'operation'){
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(timeoutError(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function trackOperation(label, promise, warnMs = SLOW_WARN_MS){
  const started = Date.now();
  let warned = false;
  const timer = setTimeout(() => {
    warned = true;
    console.warn('[sync]', label, 'is slow', Date.now() - started + 'ms');
  }, warnMs);
  try{
    const value = await promise;
    const elapsed = Date.now() - started;
    if(warned || elapsed > warnMs) console.warn('[sync]', label, 'finished in', elapsed + 'ms');
    return value;
  }finally{
    clearTimeout(timer);
  }
}

export function userSyncMessage(error, fallback = 'This is taking too long. Check your connection and try again.'){
  const classified = classifyFirebaseError(error);
  if(classified.status !== 'unknown_error') return classified.message;
  return fallback;
}

export function cloudStatusMessage(status){
  return ({
    connected:'',
    permission_denied:'Firestore is connected, but security rules blocked this action. Check the published Firestore rules.',
    database_missing:"Firestore's default database was not found for the configured Firebase project. Confirm the Vercel project ID and Firestore database.",
    network_blocked:'Firestore requests appear to be blocked by a browser extension or network filter. Try Incognito or disable privacy/ad blockers for this site.',
    timeout:'Firestore did not respond in time. Your local data remains available. Retry cloud connection.',
    offline:'Firestore is unavailable or offline. Your local data remains available. Retry cloud connection.',
    unauthenticated:'Sign in again before starting this path.',
    invalid_argument:'The enrollment request is invalid. Reload the path and try again.',
    malformed_enrollment:'This enrollment record is incomplete and must be repaired.',
    enrollment_ownership_mismatch:'This enrollment record has an ownership mismatch and must be repaired.',
    configuration_error:'Firebase configuration is incomplete or points to the wrong project.',
    unknown_error:'Could not connect to Firestore. Your local data remains available. Retry cloud connection.',
    checking:'Checking Firestore connection...',
  })[status] || 'Could not connect to Firestore. Your local data remains available. Retry cloud connection.';
}

export function classifyFirebaseError(error){
  const rawCode = String((error && error.code) || '').toLowerCase();
  const code = rawCode.replace(/^firestore\//, '');
  const message = String((error && error.message) || error || '');
  const lower = message.toLowerCase();

  if(code === 'permission_denied') return { status:'permission_denied', message:cloudStatusMessage('permission_denied') };
  if(code === 'database_missing') return { status:'database_missing', message:cloudStatusMessage('database_missing') };
  if(code === 'network_blocked') return { status:'network_blocked', message:cloudStatusMessage('network_blocked') };
  if(code === 'configuration_error') return { status:'configuration_error', message:cloudStatusMessage('configuration_error') };
  if(code === 'offline') return { status:'offline', message:cloudStatusMessage('offline') };
  if(code === 'timeout') return { status:'timeout', message:cloudStatusMessage('timeout') };
  if(code === 'operation_timeout') return { status:'timeout', message:cloudStatusMessage('timeout') };
  if(code === 'unauthenticated' || lower.includes('unauthenticated')){
    return { status:'unauthenticated', message:cloudStatusMessage('unauthenticated') };
  }
  if(code === 'enrollment_ownership_mismatch'){
    return { status:'enrollment_ownership_mismatch', message:cloudStatusMessage('enrollment_ownership_mismatch') };
  }
  if(code === 'malformed_enrollment'){
    return { status:'malformed_enrollment', message:cloudStatusMessage('malformed_enrollment') };
  }
  if(code === 'permission-denied' || lower.includes('missing or insufficient permissions') || lower.includes('permission-denied')){
    return { status:'permission_denied', message:cloudStatusMessage('permission_denied') };
  }
  if(lower.includes("database '(default)' not found") || lower.includes('please check your project configuration')){
    return { status:'database_missing', message:cloudStatusMessage('database_missing') };
  }
  if(lower.includes('err_blocked_by_client') || lower.includes('blocked_by_client') || lower.includes('blocked by client')){
    return { status:'network_blocked', message:cloudStatusMessage('network_blocked') };
  }
  if(code === 'unavailable' || lower.includes('client is offline') || lower.includes('network is unavailable') || lower.includes('failed to get document because the client is offline')){
    return { status:'offline', message:cloudStatusMessage('offline') };
  }
  if(code === 'invalid-argument'){
    return { status:'invalid_argument', message:cloudStatusMessage('invalid_argument') };
  }
  if(code === 'failed-precondition' || lower.includes('invalid firebase') || lower.includes('project id')){
    return { status:'configuration_error', message:cloudStatusMessage('configuration_error') };
  }
  return { status:'unknown_error', message:cloudStatusMessage('unknown_error') };
}

export function isTemporaryFirebaseError(error){
  const status = classifyFirebaseError(error).status;
  return ['offline', 'timeout', 'network_blocked'].includes(status);
}

export function enrollmentStartErrorMessage(error){
  const classified = classifyFirebaseError(error);
  if(classified.status === 'permission_denied'){
    return "Firestore blocked enrollment creation. The app's enrollment rules or document ownership do not match the signed-in user.";
  }
  if(classified.status === 'offline' || classified.status === 'timeout' || classified.status === 'network_blocked'){
    return 'Started locally \u2014 waiting to sync';
  }
  if(classified.status === 'unknown_error'){
    return 'Could not start this path. Please try again.';
  }
  return classified.message;
}
