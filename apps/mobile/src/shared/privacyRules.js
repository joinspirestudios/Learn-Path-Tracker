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
  // Phase 6.15 — account/profile/path personalization:
  'Profile email and auth metadata are never shown publicly.',
  'Only public-safe profile fields (display name, username, bio, avatar, cover) may appear publicly.',
  'Bio and cover are hidden when the public profile is disabled.',
  'Profile/path-banner images use narrow Storage paths and image-only validation.',
  'Mobile 6.15 does not upload proof media, and does not add camera/audio/file pickers.',
  // Phase 6.16 / 6.16.1 — image proof upload + offline drafts:
  'Media proof is IMAGE only (JPEG/PNG/WebP) — no PDF/file/video/audio.',
  'Image proof is selected from the library or camera; permissions are requested only on the relevant tap.',
  'Image proof uploads to the owner-only path users/{uid}/proofMedia/{pathId}/day-N/{taskId}/{assetId}.',
  'Image proof is private by default; it is "submitted", never "verified".',
  'Offline drafts store only a local file URI + target task/day, never file bytes, base64 or tokens.',
  'Day-log proof includes uploaded storagePath/downloadURL only — never a local URI or draft-only proof.',
  'Uploaded download URLs and storage paths are owner-private and are not rendered publicly.',
  // Phase 6.17 — cross-platform notifications:
  'Notifications never include private proof bodies or private reflections.',
  'Notifications never include raw evidence URLs, Storage paths, tokens or passwords.',
  'Notifications live in the owner-only space users/{uid}/notifications and are never public.',
  'Mobile local notifications are opt-in; OS permission is requested only when reminders are enabled.',
  'Daily reminders and quiet hours are opt-in and stored per user.',
  'Remote mobile push is deferred; no Expo push token or store credentials are used.',
  // Phase 6.18 — store readiness + beta QA:
  'Diagnostics show status labels only — never API keys, ID tokens, Storage paths or private proof.',
  'Diagnostics are never sent to a server and never logged.',
  'Deep links accept only a fixed allowlist of routes; javascript:/data:/file: schemes are rejected.',
  'Deep links never parse tokens or private evidence URLs; unknown routes fall back to Today.',
  'The error boundary never renders stack traces, tokens or private data to normal users.',
  'No store credentials, keystores, certificates or service-account files are committed.',
  // Phase 7.0 — rolling adaptive planning:
  'Adaptive planning uses only structured progress metadata (scores/counts/task labels), never proof bodies, reflections, evidence URLs or storage paths.',
  'Adaptive recommendations are drafts only; nothing is applied automatically.',
  'Completed and missed days are never rewritten; public/canonical paths are never mutated for participants.',
  'AI-assisted recommendations only ever receive server-sanitized, value-free context.',
  // Phase 8.0 — evidence intelligence:
  'Evidence Intelligence is advisory; it never verifies that an activity happened and never scores truth/fraud.',
  'Evidence analysis uses only structured proof metadata (type/status/counts/coverage), never proof bodies, reflections, raw evidence URLs, storage paths or localUri.',
  'Public-safe evidence summaries never contain private proof, raw URLs or storage paths.',
  'Pending/failed uploads never count as uploaded evidence.',
  'Evidence insight drafts are private, owner-only, and never auto-published.',
  'No image content is read; no OCR/computer vision is used.',
  // Phase 8.1 — evidence review + public-safe summaries:
  'Evidence insight drafts are private by default and are never auto-published.',
  'A public-safe summary is a draft that requires explicit user review before any sharing.',
  'Public-safe summaries exclude private proof bodies, private reflections, raw evidence URLs, download URLs, Storage paths, localUri, tokens and emails/passwords.',
  'Reviewing or dismissing an evidence insight never publishes it, deletes proof, or changes proof visibility.',
  'Evidence insight drafts are not public progress entries.',
  // Phase 8.2 — Gemini Vision evidence understanding:
  'Gemini Vision analysis is opt-in and requires explicit consent; it is never automatic after upload.',
  'Mobile never calls Gemini directly and never holds the Gemini API key; analysis runs on the server only.',
  'Mobile never sends localUri, base64, downloadURL or Storage paths for vision analysis.',
  'Vision observations describe what an image appears to show; they never verify an activity, identify people, or infer sensitive traits.',
  'Vision insight drafts are private, owner-only, never auto-published, and never change proof visibility.',
];

export default MOBILE_PRIVACY_RULES;
