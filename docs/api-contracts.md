# API Contracts

Phase 6.7 reference. All 13 public API endpoints rewritten through `vercel.json` to three consolidated serverless routers for Vercel Hobby compatibility.

## Router architecture

| Router | `maxDuration` | Endpoints |
| --- | ---: | --- |
| `api/ai.js` | 240s | generate-path, interpret-goal |
| `api/voice.js` | 90s | deepgram-token, transcribe-voice |
| `api/community.js` | 15s | join-path, publish-progress, unpublish-progress, react-progress, comment-progress, hide-progress-comment, report-path, report-progress-comment, sync-path-metrics |

All endpoints use `POST` and require `Authorization: Bearer <firebase-id-token>`.

## Endpoints

### POST /api/generate-path

- **Router**: `api/ai.js`
- **Purpose**: AI-powered roadmap generation from a confirmed brief
- **Auth**: Required
- **Method**: POST
- **Request**: `{ confirmedBrief, saveOptions: { visibility } }`
- **Response**: `{ ok, path, requestId }` or error
- **Privacy**: Brief content is not logged; only safe diagnostics
- **Mobile use case**: AI path creation (deferred from first MVP)

### POST /api/interpret-goal

- **Router**: `api/ai.js`
- **Purpose**: AI goal interpretation and clarification
- **Auth**: Required
- **Method**: POST
- **Request**: `{ goal, context }`
- **Response**: `{ ok, interpretation, requestId }` or error
- **Privacy**: Goal text is not logged server-side
- **Mobile use case**: AI goal interpretation (deferred from first MVP)

### POST /api/deepgram-token

- **Router**: `api/voice.js`
- **Purpose**: Obtain temporary Deepgram JWT for live voice transcription
- **Auth**: Required
- **Method**: POST
- **Request**: `{}`
- **Response**: `{ ok, token, expiresAt, requestId }`
- **Privacy**: Permanent Deepgram key never returned; only temporary JWT
- **Mobile use case**: Obtain temporary Deepgram JWT for live voice transcription

### POST /api/transcribe-voice

- **Router**: `api/voice.js`
- **Purpose**: Fallback audio transcription when live streaming is unavailable
- **Auth**: Required
- **Method**: POST
- **Request**: Raw audio body (WebM/MP4/MP3/WAV/OGG, max 4 MB)
- **Response**: `{ ok, transcript, requestId }`
- **Privacy**: Audio is not stored server-side after transcription
- **Mobile use case**: Fallback audio transcription when live streaming is unavailable

### POST /api/join-path

- **Router**: `api/community.js`
- **Purpose**: Join a public or unlisted path
- **Auth**: Required
- **Method**: POST
- **Request**: `{ pathId }`
- **Response**: `{ ok, enrollmentId, requestId }` or error
- **Privacy**: Does not expose other members data
- **Mobile use case**: Join a public or unlisted path

### POST /api/publish-progress

- **Router**: `api/community.js`
- **Purpose**: Publish a sanitized completed-day entry to the public timeline
- **Auth**: Required
- **Method**: POST
- **Request**: `{ pathId, dayNumber, publicCaption }`
- **Response**: `{ ok, entryId, requestId }` or error
- **Privacy**: Only sanitized metadata published; no private evidence URLs
- **Mobile use case**: Publish sanitized completed-day entry to public timeline

### POST /api/unpublish-progress

- **Router**: `api/community.js`
- **Purpose**: Remove a published progress entry
- **Auth**: Required
- **Method**: POST
- **Request**: `{ pathId, dayNumber }`
- **Response**: `{ ok, requestId }`
- **Privacy**: Deletes public mirror only; private day log stays intact
- **Mobile use case**: Remove a published progress entry

### POST /api/react-progress

- **Router**: `api/community.js`
- **Purpose**: React to a public progress entry
- **Auth**: Required
- **Method**: POST
- **Request**: `{ pathId, entryId, reaction }`
- **Response**: `{ ok, requestId }`
- **Privacy**: Reaction is public; linked to user display name
- **Mobile use case**: React to a public progress entry

### POST /api/comment-progress

- **Router**: `api/community.js`
- **Purpose**: Comment on a public progress entry
- **Auth**: Required
- **Method**: POST
- **Request**: `{ pathId, entryId, body }`
- **Response**: `{ ok, commentId, requestId }`
- **Privacy**: Comment text is bounded plain text; visible publicly
- **Mobile use case**: Comment on a public progress entry

### POST /api/hide-progress-comment

- **Router**: `api/community.js`
- **Purpose**: Hide a comment (own comment or path owner moderation)
- **Auth**: Required
- **Method**: POST
- **Request**: `{ pathId, entryId, commentId }`
- **Response**: `{ ok, requestId }`
- **Privacy**: Hidden comments are no longer visible; not permanently deleted
- **Mobile use case**: Hide a comment (own comment or path owner moderation)

### POST /api/report-path

- **Router**: `api/community.js`
- **Purpose**: Report a public path for moderation
- **Auth**: Required
- **Method**: POST
- **Request**: `{ pathId, reason, note }`
- **Response**: `{ ok, reportId, requestId }`
- **Privacy**: Report is private; only safe public snapshot stored
- **Mobile use case**: Report a public path for moderation

### POST /api/report-progress-comment

- **Router**: `api/community.js`
- **Purpose**: Report a public progress comment for moderation
- **Auth**: Required
- **Method**: POST
- **Request**: `{ pathId, entryId, commentId, reason, note }`
- **Response**: `{ ok, reportId, requestId }`
- **Privacy**: Report is private; only short visible comment snippet stored
- **Mobile use case**: Report a public progress comment for moderation

### POST /api/sync-path-metrics

- **Router**: `api/community.js`
- **Purpose**: Sync path trust metrics after day completion or milestone
- **Auth**: Required
- **Method**: POST
- **Request**: `{ pathId, event, dayNumber }`
- **Response**: `{ ok, requestId }`
- **Privacy**: Only aggregate counts updated; no private data exposed
- **Mobile use case**: Sync path trust metrics after day completion or milestone

## Shared privacy constraints

All endpoints enforce these privacy constraints:

1. Never expose private evidence URLs or file names in public responses
2. Never expose private reflections or day log summaries publicly
3. Never expose participantStats documents to non-server callers
4. Never expose user email addresses in public-facing data
5. Never expose Firebase ID tokens in response payloads
6. Never expose Anthropic or Deepgram API keys to browsers
7. Never expose raw audio or voice transcripts in analytics or logs
8. Never expose private task descriptions in public progress entries
9. Only sanitized completion metadata may appear in public progress
10. Aggregate trust metrics use counts only; no per-user breakdowns

## Contract modules

Shared contract definitions live in pure data modules with no DOM, Firebase, or environment dependencies:

- [`src/shared-api-contracts.js`](../src/shared-api-contracts.js) — `API_ENDPOINTS`, `API_ROUTE_GROUPS`, `API_CONTRACTS`, `SHARED_PRIVACY_CONSTRAINTS`
- [`src/shared-dtos.js`](../src/shared-dtos.js) — Privacy-safe DTO helpers: `pathSummaryDTO`, `publicPathPreviewDTO`, `dailyFocusDTO`, `completionResultDTO`, `publicProgressDTO`, `trustMetricsDTO`, `discoveryCardDTO`, `moderationReportDTO`

These modules can be imported by both web and mobile skins without pulling in browser-specific code.

## Mobile contract sync (Phase 6.10)

To avoid hand-maintained divergence, the mobile skin does not duplicate these
contracts by hand. `scripts/generate-mobile-contracts.mjs` imports from
[`src/shared-api-contracts.js`](../src/shared-api-contracts.js) and writes
`apps/mobile/src/shared/api-contracts.generated.js`, which re-exports
`API_ENDPOINTS`, `API_ROUTE_GROUPS`, `API_CONTRACTS`, and
`SHARED_PRIVACY_CONSTRAINTS`. The generated file carries a "do not edit by hand"
header. Regenerate with `npm run generate:mobile-contracts` from the repo root.
Generation never changes endpoint paths and never adds Vercel routes.

### Mobile cloud reads (Phase 6.12)

Phase 6.12 reads path/discovery/roadmap data on mobile directly via the Firebase
**client** SDK (read-only), not through the Vercel API. No new API routes are
added and the Vercel function count is unchanged. The mobile API client seam
(`apiClient`) remains available for future protected calls; the auth service
exposes `getIdToken()` for when those calls are wired in a later phase.

### Mobile public progress publishing (Phase 6.13)

Phase 6.13 publishes public progress from mobile through the **existing**
`/api/publish-progress` route (no new route, function count unchanged), using the
shared `API_ENDPOINTS.PUBLISH_PROGRESS` constant and attaching the Firebase ID
token via the mobile `apiClient`. The request body matches the web contract
(`{ pathId, dayNumber, publicCaption }`); the server builds and sanitizes the
stored entry. Mobile day-log writes go to the user's private
`users/{uid}/mobileDayLogs` space via the Firestore client SDK, not the API.
