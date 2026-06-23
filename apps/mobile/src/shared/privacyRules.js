// Mobile privacy rules.
//
// High-level, human-readable privacy constraints for the mobile skin. These
// echo the shared brain's SHARED_PRIVACY_CONSTRAINTS (see
// ./api-contracts.generated.js) and add mobile-specific handling rules for
// credentials and logging. Kept as plain data so screens and the API client
// can reference a single list.

export const MOBILE_PRIVACY_RULES = [
  'Never expose private evidence URLs or file names.',
  'Never expose private reflections or day-log summaries.',
  'Never expose raw audio captured on device.',
  'Never expose or publish voice transcripts publicly.',
  'Never log Firebase ID tokens or Authorization headers.',
  'Never log request bodies that may contain private proof or reflection text.',
  'Never commit mobile signing credentials, keystores, or provisioning profiles.',
  'Never commit production env files or provider API keys.',
  'Only sanitized public progress metadata may be shown publicly.',
  // Phase 6.11 — local mobile core loop:
  'Text proof and reflections are local-only in Phase 6.11.',
  'Do not log proof or reflection text.',
  'Do not send proof or reflection text to any API yet.',
  'Do not call public-progress APIs from mobile in Phase 6.11.',
];

export default MOBILE_PRIVACY_RULES;
