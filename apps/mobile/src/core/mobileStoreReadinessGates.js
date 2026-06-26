// Mobile store-readiness gates (pure checklist/status model). This NEVER submits
// anything and NEVER claims submission is complete — it only computes whether the
// manually-tracked readiness items satisfy the gate for internal beta vs. store
// submission.

// Items that gate an internal beta.
export const INTERNAL_BETA_ITEMS = [
  'manualMobileQaCompleted',
  'productionEnvConfigured',
  'firebaseRulesDeployed',
  'storageRulesDeployed',
  'crashErrorHandlingPresent',
  'notificationOptInReviewed',
  'imageProofTestedOnDevice',
  'noSecretsCommitted',
];

// Additional items required before store submission (beyond the beta gate).
export const STORE_SUBMISSION_EXTRA_ITEMS = [
  'privacyPolicyAvailable',
  'termsAvailable',
  'appIconSplashReviewed',
  'permissionCopyReviewed',
];

export const STORE_SUBMISSION_ITEMS = [...INTERNAL_BETA_ITEMS, ...STORE_SUBMISSION_EXTRA_ITEMS];

function bool(items, key) {
  return !!(items && items[key] === true);
}

// Per-item status map ('complete' | 'pending') for the full submission list.
export function storeReadinessChecklistStatus(items = {}) {
  const status = {};
  for (const key of STORE_SUBMISSION_ITEMS) {
    status[key] = bool(items, key) ? 'complete' : 'pending';
  }
  return status;
}

// The internal-beta items that are still pending.
export function betaBlockers(items = {}) {
  return INTERNAL_BETA_ITEMS.filter(key => !bool(items, key));
}

// The store-submission items (full list) still pending.
export function storeBlockers(items = {}) {
  return STORE_SUBMISSION_ITEMS.filter(key => !bool(items, key));
}

export function canStartInternalBeta(items = {}) {
  return betaBlockers(items).length === 0;
}

// Store submission requires a strictly stronger set of gates than internal beta.
export function canSubmitToStore(items = {}) {
  return storeBlockers(items).length === 0;
}

export default {
  INTERNAL_BETA_ITEMS,
  STORE_SUBMISSION_EXTRA_ITEMS,
  STORE_SUBMISSION_ITEMS,
  storeReadinessChecklistStatus,
  betaBlockers,
  storeBlockers,
  canStartInternalBeta,
  canSubmitToStore,
};
