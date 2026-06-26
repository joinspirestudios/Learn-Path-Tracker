// Mobile runtime diagnostics (DI). Gathers a SAFE diagnostics snapshot for the
// in-app diagnostics screen. It never sends anything to a server, never logs,
// and never returns secret values (API keys, tokens, buckets, storage paths,
// private proof). Dependency availability + env presence are resolved via
// injected probes so this stays testable without the native runtime.

import { buildReadinessReport } from '../core/mobileReadinessChecks.js';

// Default availability probes. Each returns a boolean and never throws.
function safeProbe(fn) {
  try { return !!fn(); } catch { return false; }
}

export function createMobileRuntimeDiagnostics({
  env = (typeof process !== 'undefined' && process.env) || {},
  appVersion = '0.1.0',
  platform = 'unknown',
  probes = {},
} = {}) {
  const imagePickerAvailable = probes.imagePickerAvailable
    ?? safeProbe(() => true); // expo-image-picker is a declared dependency
  const asyncStorageAvailable = probes.asyncStorageAvailable
    ?? safeProbe(() => true); // @react-native-async-storage/async-storage declared
  const fileSystemAvailable = probes.fileSystemAvailable
    ?? safeProbe(() => true); // expo-file-system declared

  return {
    // Build a value-free snapshot. `signedIn` and `notifications` are passed in
    // at call time from app state (never persisted here).
    snapshot({ signedIn = null, notifications = 'unknown' } = {}) {
      return buildReadinessReport({
        env,
        appVersion,
        platform,
        signedIn,
        notifications,
        imagePickerAvailable,
        asyncStorageAvailable,
        fileSystemAvailable,
      });
    },
  };
}

export default createMobileRuntimeDiagnostics;
