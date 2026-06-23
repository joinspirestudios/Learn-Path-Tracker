// Mobile scoring and completion tiers — pure JavaScript.
//
// Mirrors the web brain's scoring principle:
//   streak  = meaningful participation
//   score   = performance quality
//   proof   = trust layer
//
// To keep the mobile bundle self-contained (Metro does not reach outside
// apps/mobile cleanly), the thresholds below mirror the web "balanced" intensity
// policy in src/intensity-policy.js. A parity test
// (tests/phase-6.11-mobile-core-loop.test.js) asserts mobileTierForScore agrees
// with the web completionTierForScore across the full score range.

export const MOBILE_INTENSITY_POLICY = {
  id: 'balanced',
  passThreshold: 65,
  strongThreshold: 85,
  perfectThreshold: 100,
  participationThreshold: 40,
};

export const MOBILE_TIERS = [
  'not_started',
  'in_progress',
  'attempted',
  'passed',
  'strong',
  'perfect',
];

// Score-only tier mapping. Kept in exact parity with the web policy mapping.
export function mobileTierForScore(score, policy = MOBILE_INTENSITY_POLICY) {
  const p = policy || MOBILE_INTENSITY_POLICY;
  const n = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  if (n <= 0) return 'not_started';
  if (n < p.participationThreshold) return 'in_progress';
  if (n < p.passThreshold) return 'attempted';
  if (n >= p.perfectThreshold) return 'perfect';
  if (n >= p.strongThreshold) return 'strong';
  return 'passed';
}

// Weighted local score. Required tasks weigh 1, optional tasks weigh 0.5 (mirrors
// the web dailyCompletionScore weighting).
export function computeMobileScore(tasks = [], taskState = {}) {
  let completedWeight = 0;
  let totalWeight = 0;
  let completed = 0;
  let requiredTotal = 0;
  let requiredCompleted = 0;
  let proofRequired = 0;
  let proofSubmitted = 0;
  let reflectionCount = 0;

  for (const task of tasks) {
    const weight = task.required === false ? 0.5 : 1;
    totalWeight += weight;
    if (task.required !== false) requiredTotal += 1;
    if (task.requiresProof) proofRequired += 1;

    const st = taskState[task.id] || {};
    if (st.reflection && String(st.reflection).trim()) reflectionCount += 1;
    if (!st.done) continue;

    completed += 1;
    completedWeight += weight;
    if (task.required !== false) requiredCompleted += 1;
    if (task.requiresProof && st.proofText && String(st.proofText).trim()) {
      proofSubmitted += 1;
    }
  }

  const score = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0;
  return {
    score,
    completed,
    total: tasks.length,
    completedWeight,
    totalWeight,
    requiredTotal,
    requiredCompleted,
    proofRequired,
    proofSubmitted, // "submitted", never "verified"
    reflectionCount,
  };
}

// Full local completion tier. Uses score-based mapping, but "perfect" also
// requires every required proof to be submitted — a mobile-local trust rule.
// Documented in docs/mobile-core-loop-mvp.md.
export function mobileCompletionTier(scoreResult, policy = MOBILE_INTENSITY_POLICY) {
  const base = mobileTierForScore(scoreResult.score, policy);
  if (base === 'perfect') {
    const allProofIn = scoreResult.proofRequired === 0
      || scoreResult.proofSubmitted >= scoreResult.proofRequired;
    if (!allProofIn) return 'strong';
  }
  return base;
}

export default {
  MOBILE_INTENSITY_POLICY,
  MOBILE_TIERS,
  mobileTierForScore,
  computeMobileScore,
  mobileCompletionTier,
};
