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
  // Phase 6.12 — auth, cloud paths, discovery (read-only):
  'Mobile auth uses the Firebase client SDK only; Firebase Admin never ships to mobile.',
  'ID tokens are never logged.',
  'Email and password are never logged.',
  'Private evidence URLs are never rendered.',
  'Private reflections are never rendered.',
  'Raw audio and transcripts are never rendered.',
  'Discovery only shows public/discoverable path metadata.',
  'Mobile 6.12 is read-only for path data; it does not write day logs or proof.',
  // Phase 6.13 — day sync, text/link proof, public progress:
  'Text and link proof are private by default.',
  'Reflection text is private by default.',
  'Public progress requires explicit user action; it is never automatic.',
  'Public progress summaries are sanitized: day result only, never private proof or reflection.',
  'Mobile 6.13 does not upload files or capture camera/audio.',
  'Mobile 6.13 does not publish comments or reactions.',
  'Mobile 6.13 does not verify proof; proof is submitted, not verified.',
  'ID tokens are never logged; proof and reflection bodies are never logged.',
];

export default MOBILE_PRIVACY_RULES;
