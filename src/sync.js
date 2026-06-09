export const READ_TIMEOUT_MS = 8000;
export const WRITE_TIMEOUT_MS = 12000;
export const PATH_OPEN_TIMEOUT_MS = 10000;
export const ENROLLMENT_TIMEOUT_MS = 8000;
export const AI_SAVE_TIMEOUT_MS = 20000;

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
  const code = error && error.code;
  const message = String((error && error.message) || '');
  if(code === 'permission-denied' || message.includes('permission-denied')){
    return 'Firebase rules blocked this action. Check Firestore rules.';
  }
  if(code === 'operation_timeout') return fallback;
  return fallback;
}
