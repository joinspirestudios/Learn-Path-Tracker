export const INTENSITY_LEVELS = ['soft', 'balanced', 'intensive'];

export const INTENSITY_POLICIES = {
  soft: {
    id: 'soft',
    label: 'Soft',
    passThreshold: 55,
    strongThreshold: 80,
    perfectThreshold: 100,
    participationThreshold: 35,
    suggestedDailyTaskRange: [1, 3],
    flexibility: 'high',
    proofStrictness: 'light/moderate',
    resourceDepth: 'simple',
    encouragementTone: 'gentle, sustainable',
    description: 'A gentler route with fewer daily commitments, more recovery, more flexibility and lighter proof expectations.',
  },
  balanced: {
    id: 'balanced',
    label: 'Balanced',
    passThreshold: 65,
    strongThreshold: 85,
    perfectThreshold: 100,
    participationThreshold: 40,
    suggestedDailyTaskRange: [3, 5],
    flexibility: 'moderate',
    proofStrictness: 'standard',
    resourceDepth: 'structured',
    encouragementTone: 'disciplined but realistic',
    description: 'A steady route with realistic discipline, moderate daily workload and standard proof expectations.',
  },
  intensive: {
    id: 'intensive',
    label: 'Intensive',
    passThreshold: 75,
    strongThreshold: 90,
    perfectThreshold: 100,
    participationThreshold: 50,
    suggestedDailyTaskRange: [5, 8],
    flexibility: 'low',
    proofStrictness: 'stronger',
    resourceDepth: 'deep',
    encouragementTone: 'focused, high-commitment',
    description: 'A focused route with higher commitment, deeper work and stronger proof expectations while staying achievable.',
  },
};

const INTENSITY_ALIASES = {
  light: 'soft',
  gentle: 'soft',
  easy: 'soft',
  moderate: 'balanced',
  medium: 'balanced',
  normal: 'balanced',
  standard: 'balanced',
  hard: 'intensive',
  intense: 'intensive',
  high: 'intensive',
};

function clean(value){
  return String(value == null ? '' : value).trim().toLowerCase();
}

export function normalizeIntensityPolicy(value){
  const key = clean(value);
  if(INTENSITY_LEVELS.includes(key)) return key;
  return INTENSITY_ALIASES[key] || 'balanced';
}

export function policyForIntensity(value){
  return INTENSITY_POLICIES[normalizeIntensityPolicy(value)] || INTENSITY_POLICIES.balanced;
}

export function passThresholdForIntensity(value){
  return policyForIntensity(value).passThreshold;
}

export function completionTierForScore(score, policy = INTENSITY_POLICIES.balanced){
  const p = policy || INTENSITY_POLICIES.balanced;
  const n = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  if(n <= 0) return 'not_started';
  if(n < p.participationThreshold) return 'in_progress';
  if(n < p.passThreshold) return 'attempted';
  if(n >= p.perfectThreshold) return 'perfect';
  if(n >= p.strongThreshold) return 'strong';
  return 'passed';
}

export function intensityPolicySummary(value){
  const policy = policyForIntensity(value);
  return `${policy.label}: pass ${policy.passThreshold}%, ${policy.suggestedDailyTaskRange[0]}-${policy.suggestedDailyTaskRange[1]} tasks/day, ${policy.flexibility} flexibility, ${policy.proofStrictness} proof, ${policy.resourceDepth} resources, ${policy.encouragementTone} tone.`;
}
