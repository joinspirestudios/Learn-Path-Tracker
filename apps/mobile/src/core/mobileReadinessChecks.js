// Mobile readiness checks (pure). Combine environment config + dependency
// availability + runtime signals into safe status labels for the diagnostics
// screen. Returns labels only — never config values, tokens, or private data.

import { ENV_STATUS, apiBaseStatus, firebaseStatus, storageStatus } from './mobileEnvironmentChecks.js';

export const READINESS_STATUS = Object.freeze({
  CONFIGURED: 'configured',
  MISSING: 'missing',
  AVAILABLE: 'available',
  UNSUPPORTED: 'unsupported',
  ENABLED: 'enabled',
  DISABLED: 'disabled',
  SIGNED_IN: 'signed in',
  SIGNED_OUT: 'signed out',
  UNKNOWN: 'unknown',
});

function availability(flag) {
  if (flag === true) return READINESS_STATUS.AVAILABLE;
  if (flag === false) return READINESS_STATUS.MISSING;
  return READINESS_STATUS.UNKNOWN;
}

// Build a complete, value-free readiness report.
// signals: {
//   env, signedIn, imagePickerAvailable, asyncStorageAvailable,
//   fileSystemAvailable, notifications: 'enabled'|'disabled'|'unsupported',
//   appVersion, platform
// }
export function buildReadinessReport(signals = {}) {
  const env = signals.env;
  const notifications = [READINESS_STATUS.ENABLED, READINESS_STATUS.DISABLED, READINESS_STATUS.UNSUPPORTED]
    .includes(signals.notifications) ? signals.notifications : READINESS_STATUS.UNKNOWN;
  return {
    appVersion: typeof signals.appVersion === 'string' && signals.appVersion ? signals.appVersion : 'unknown',
    platform: typeof signals.platform === 'string' && signals.platform ? signals.platform : 'unknown',
    apiBase: apiBaseStatus(env),
    firebase: firebaseStatus(env),
    storage: storageStatus(env),
    auth: signals.signedIn === true ? READINESS_STATUS.SIGNED_IN
      : signals.signedIn === false ? READINESS_STATUS.SIGNED_OUT
      : READINESS_STATUS.UNKNOWN,
    imageProof: availability(signals.imagePickerAvailable),
    offlineDrafts: availability(signals.asyncStorageAvailable),
    fileSystem: availability(signals.fileSystemAvailable),
    notifications,
  };
}

// Whether the core cloud features are configured enough to run a beta.
export function coreCloudReady(signals = {}) {
  const env = signals.env;
  return firebaseStatus(env) === ENV_STATUS.CONFIGURED
    && storageStatus(env) === ENV_STATUS.CONFIGURED
    && apiBaseStatus(env) === ENV_STATUS.CONFIGURED;
}

export default {
  READINESS_STATUS,
  buildReadinessReport,
  coreCloudReady,
};
