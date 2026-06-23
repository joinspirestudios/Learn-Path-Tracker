# Mobile Public Progress Server Bridge (Phase 6.14)

Phase 6.14 closes the server compatibility gap left by Phase 6.13: the existing
`/api/publish-progress` route can now publish from **either** the web enrollment
day log **or** the mobile private day log. No new API route is added; web
behavior is unchanged.

## Why the bridge exists

Phase 6.13 stored mobile day logs in the user-owned private location
`users/{uid}/mobileDayLogs/{pathId__uid__day_N}` (safe, owner-only, and not
dependent on enrollment, since mobile join/enrollment is deferred). But the
publish-progress server handler historically read completed day logs only from
the web enrollment location `enrollments/{enrollmentId}/dayLogs/{dayNumber}`. So
a mobile-synced day could not be published. This phase teaches the server to find
the mobile day log when there is no web enrollment.

## Source resolution order

`server/public-progress-source-resolver.js` resolves the source inside the
publish transaction:

1. **Web enrollment first.** If an enrollment exists for `(pathId, uid)`, use the
   web enrollment day log with exactly the same checks and errors as before.
   Mobile is never consulted in this case — web behavior is byte-for-byte
   preserved.
2. **Mobile fallback.** If no enrollment exists, fall back to the mobile private
   day log (`server/mobile-day-log-source.js`), but only for a path the user
   owns.

Sources: `web_enrollment_day_log` and `mobile_private_day_log`.

## Web enrollment source behavior

Unchanged: `enrollmentId = enrollmentIdFor(pathId, uid)`, read
`enrollments/{enrollmentId}` and `.../dayLogs/{dayNumber}`, require ownership and
`status === 'completed'`, and build the entry with the existing
`createSanitizedPublicProgressEntry` (web tasks + evidence submissions).

## Mobile private day-log source behavior

The deterministic id is shared via `src/mobile-day-log-ids.js`
(`pathId__uid__day_N`); a parity test asserts the mobile client and server
produce identical ids. The mobile source is valid only if `dayLog.uid === uid`,
`dayLog.pathId === pathId`, `dayLog.dayNumber === dayNumber`, `status` is
completed/finished, `completionScore` is finite, and `completionTier` is present.
Otherwise it throws safe errors: `day_log_not_found`, `day_not_completed`,
`forbidden`, `invalid_day_log`. No private content appears in error messages.

## Path permission rules

Mobile-origin publish is allowed only when the path is public/unlisted (existing
`isPublishablePath` check) **and** the user owns it
(`ownerId`/`creatorId`/`creatorUid === uid`). Because mobile join/enrollment is
deferred, owned paths are the safe mobile publish source. A private path returns
`path_not_publishable`; a non-owned public path with no enrollment returns
`forbidden`.

## Mobile publish payload

The mobile client still calls `POST /api/publish-progress` with only
`{ pathId, dayNumber, publicCaption }`. It never sends proof bodies, reflection
bodies, link-proof URLs, or the day log itself — the server fetches the trusted
private day log on its own.

## Public progress sanitization

`createSanitizedPublicProgressEntryFromMobileDayLog` (in `src/public-progress.js`)
produces the same public entry shape as the web builder. It includes only the day
**result**: counts, `completionScore`, `completionTier`, `evidenceCount` (= proof
submitted count), `publicCaption`, and timestamps, with `source: 'mobile-day-log'`.
It **excludes** private proof bodies, private link-proof URLs, private
reflections, raw evidence URLs, audio, transcripts, file paths, tokens, and
credentials. `taskSummary` is empty (web task titles are not available
server-side; counts still reflect real completion). Proof is "submitted", never
"verified".

## Idempotency strategy

The public entry id stays `publicProgressEntryId(uid, dayNumber)`, so the same
user/path/day always writes the same entry. Re-publishing updates that entry
(`alreadyPublished`), and `publicProgressCount` is incremented only on first
publish.

## Stats update strategy

Reuses the existing delta logic: `publicProofCount(entry)` reads `evidenceCount`,
so a mobile text/link proof contributes a submitted-proof count without leaking
proof data. `proofSubmissionCount` adjusts by the sanitized delta and does not
double-count on repeat publish. `participantStats` and path `stats` remain
server-managed (clients cannot write them).

## What remains deferred

Mobile join/enrollment writes, media/file/camera/audio proof upload, offline
drafts, notifications, profile personalization, mobile comments/reactions/
moderation. No new dependencies. Firestore and Storage rules are unchanged.

## Testing strategy

`tests/phase-6.14-mobile-public-progress-server-bridge.test.js` uses a path-keyed
Firestore mock and dependency-injected auth — no live services. It verifies
id parity, resolver precedence and rejections, mobile publish (sanitized,
idempotent, correct stats), private/non-owned rejection, the mobile client
request shape and error mapping, an unchanged Vercel function count, and that
Firestore rules remain strict. Existing web publish tests continue to pass
unchanged.
