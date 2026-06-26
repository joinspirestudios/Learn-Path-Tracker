// ── service-worker-registration.js ──────────────────────────────────────────
// Registers the Learn Path service worker used for browser push. Registration
// only happens when called (never at import) and only when service workers are
// supported. The worker does not cache app assets in this phase.

export const LEARN_PATH_SERVICE_WORKER_URL = '/learn-path-service-worker.js';

export function serviceWorkerSupported(scope = globalThis) {
  return !!(scope && scope.navigator && 'serviceWorker' in scope.navigator);
}

// Register (or return the existing) service worker. Resolves to the
// registration, or null when unsupported / registration fails. Never throws.
export async function registerLearnPathServiceWorker(scope = globalThis) {
  if (!serviceWorkerSupported(scope)) return null;
  try {
    const existing = await scope.navigator.serviceWorker.getRegistration(LEARN_PATH_SERVICE_WORKER_URL);
    if (existing) return existing;
    return await scope.navigator.serviceWorker.register(LEARN_PATH_SERVICE_WORKER_URL);
  } catch {
    return null;
  }
}

export async function unregisterLearnPathServiceWorker(scope = globalThis) {
  if (!serviceWorkerSupported(scope)) return false;
  try {
    const reg = await scope.navigator.serviceWorker.getRegistration(LEARN_PATH_SERVICE_WORKER_URL);
    if (reg) return await reg.unregister();
    return false;
  } catch {
    return false;
  }
}

export default {
  LEARN_PATH_SERVICE_WORKER_URL,
  serviceWorkerSupported,
  registerLearnPathServiceWorker,
  unregisterLearnPathServiceWorker,
};
