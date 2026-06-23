# Mobile Day Sync, Text/Link Proof and Public Progress (Phase 6.13)

Phase 6.13 introduces the first real mobile **write** path: syncing a finished
local day to the cloud, capturing private text/link proof, and explicitly
publishing a sanitized public progress summary. It does not add media upload,
offline drafts, notifications, comments/reactions, or mobile join.

## Scope

- Complete the local Daily Focus day, add **text or link** proof (private), and
  finish the day.
- **Sync** the finished day to the user's private cloud day-log record.
- **Explicitly publish** a sanitized public progress summary after sync.

## One brain, two skins

Mobile reuses the web trust model: proof-backed progress, private evidence
handling, no fake metrics, no raw evidence URLs in public, explicit action
before publishing, and proof labeled "submitted" (never "verified").

## Day-log schema and storage

Mobile day logs are written to the signed-in user's **private space**:

```
users/{uid}/mobileDayLogs/{pathId__uid__day_N}
```

This is **distinct from** the web's enrollment-based day logs
(`enrollments/{enrollmentId}/dayLogs/{n}`). Mobile join/enrollment is deferred
(Phase 6.13 does not write enrollments), so a mobile day log cannot live under an
enrollment that does not exist. The private user space is already owner-restricted
by existing Firestore rules (`match /users/{uid}/{document=**}` →
`request.auth.uid == uid`), so **no rule change is required**. The two day-log
locations do not conflict.

> **Resolved in Phase 6.14:** the server now reads the mobile private day log when
> there is no web enrollment, so mobile-origin publishes succeed through the
> existing `/api/publish-progress` route. See
> [mobile-public-progress-server-bridge.md](mobile-public-progress-server-bridge.md).

The mobile day-log payload (`mobileDaySync.buildDayLogPayload`) includes:
`id`, `pathId`, `uid`, `dayNumber`, `status:'completed'`, `completionScore`,
`completionTier`, `totalTaskCount`, `completedTaskCount`, `completedTaskIds`,
`proofSubmittedCount`, `proof` (private), `reflections` (private), `source:'mobile'`,
`schemaVersion`.

## Day sync model

- Only **finished** days sync; in-progress sessions return `null` and never sync
  as completed.
- Deterministic identity: `pathId + uid + dayNumber` → idempotent upsert
  (`merge:true`), so re-syncing the same day updates rather than duplicates.
- Score/tier come from the mobile scoring model.
- Input session state is never mutated.

Sync status states: `local_only`, `ready_to_sync`, `syncing`, `synced`,
`sync_failed`, `publish_available`, `publishing`, `published`, `publish_failed`.
No hidden writes: nothing syncs while typing, and publishing never happens
automatically after sync.

## Text/link proof model

Proof in this phase is **text or link only** — no photo/video/audio/file capture.

- Text proof: what was done / a brief evidence note.
- Link proof: a user-entered URL, validated as `http(s)` only. The app never
  fetches, scrapes, or previews the URL; it stores normalized safe URL text.
- A required-proof task cannot be marked done without valid text **or** link proof
  (the Phase 6.11 rule is preserved).

## Private proof/reflection rules

Text proof, link proof, and reflections are **private by default**. They are
stored only in the user's private day-log document, never logged, and never
included in public progress.

## Public progress publishing model

Public progress is published through the existing **web-safe API route**
`/api/publish-progress` (shared API contract), with the Firebase ID token
attached via `authService.getIdToken` through the mobile `apiClient`. No new
Vercel route is added, and no direct Firestore write is attempted (rules deny
client writes to `publicProgress`). Publishing:

- requires an explicit tap, only after a successful day sync;
- sends the minimal contract body `{ pathId, dayNumber, publicCaption }`;
- is idempotent (server keys the entry by uid + day), so re-publishing updates.

### What is sanitized / never published

The public summary contains only the day **result**: `pathId`, `dayNumber`,
`pathTitle`, `dayTitle`, `tier`, `score`, `tasksCompleted`, `proofSubmittedCount`,
and an optional `publicSummary` caption. It **never** includes raw private proof
bodies, private reflections, raw audio, transcripts, private evidence URLs, file
paths, ID tokens, or credentials.

## Today and Roadmap sync state

- Today shows the day sync status (e.g. "Sync pending" / "Synced") for a finished
  day and never claims synced before a successful write.
- Roadmap shows a read-only structure and a synced note when the active day has a
  cloud record; it never invents dates, progress, or completion, and locked/future
  days cannot sync.

## Intentionally deferred

Account/profile/path personalization (**Phase 6.15**), media/file/camera/audio
proof upload and offline drafts (**Phase 6.16**), notifications (**Phase 6.17**),
store readiness/beta QA (**Phase 6.18**), mobile comments/reactions/moderation
writes, mobile join/enrollment, AI generation, adaptive planning, and evidence
intelligence. No leaderboards, followers, rankings, or hearts/gems/shop economy.
The product is not renamed.

## Firestore rules strategy

No rule change is required. Mobile day logs use the existing owner-only
`users/{uid}/**` subtree; public progress continues to be published only through
the server-side API (client writes to `publicProgress` remain denied); and
server-managed stats (`participantStats`, path `stats`) remain client-deny.

## Testing strategy

`tests/phase-6.13-mobile-day-sync-proof-public-progress.test.js` uses pure
modules plus dependency-injected gateways/clients and a fake API client — no live
Firebase/Vercel/Anthropic/Deepgram/Expo calls. It verifies the sync payload
(finished-only, deterministic, idempotent, non-mutating), proof mappers (private,
submitted, link validation, no media fields), the day-log repository (own-user
writes, idempotent upsert, private space), public-progress sanitization and the
existing-endpoint publish, sync-status transitions, screen wiring (source-level),
the absence of forbidden behavior, and that Firestore rules are relied upon
unchanged.
