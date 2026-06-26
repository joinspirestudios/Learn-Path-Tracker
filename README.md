# Learn Path Tracker

Learn Path Tracker is a Vite + Firebase proof-of-growth app for creating learning paths, habits, challenges, and personal-development roadmaps. It supports local mode, platform paths, creator attribution, enrollments, day logs, streaks, freezes, evidence, templates, and an optional Anthropic-powered AI path builder.

Phase 6.9.10 fixes the Aurora shell host wrapper: the legacy `.wrap` container no longer constrains Aurora screens, the shell truly spans the viewport, and Today/path pages use the shell's rightRail slot. Phase 5.8 adds public progress timelines on top of stable live voice transcription, responsive guided path creation, protected Phase 5 AI routes, and the guided daily evidence session. The web app guides users through goal entry, adaptive clarification, path creation, daily agenda review, evidence preparation, one-task-at-a-time completion, pending tasks, day completion, and optional sanitized progress sharing. Live web research is not part of this phase.

## Install and run

Use Node.js 22.x. The production Vercel runtime, `package.json` engines, and `.nvmrc` are aligned on Node 22 for the protected API routes.

```bash
npm install
npm run dev
```

The Vite frontend runs without Firebase variables in local tracker mode. Protected AI and voice routes require Firebase Authentication and server environment variables, so use Vercel local development for the complete stack:

```bash
npx vercel dev
```

Useful checks:

```bash
npm test
npm run test:rules
npm run build
npm run preview
```

Firestore Rules tests use the Firebase Emulator Suite and require Java. The test project ID is `learn-path-tracker-rules-test`; tests never connect to production data.

For guided creation QA, use the unit tests plus manual viewport checks at 1440x900, 1280x720, 1024x768, 768x1024, 430x932, 390x844, and 360x800. Manual goal scenarios should include vague and detailed French goals, general fitness, a 1 km to 15 km running plan, design portfolio, prayer habit, weekly video publishing, a fixed 14-day gratitude challenge, and the existing 75 Hard template.

## Environment variables

Copy `.env.example` to a local ignored environment file and configure matching variables in Vercel for Preview and Production as needed. Never commit real credentials.

### Public Firebase web config

These values are bundled into the browser by Vite:

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

Firebase web configuration is public project configuration. Access control still depends on Firebase Authentication plus the deployed Firestore and Storage rules.

File evidence upload additionally requires Firebase Storage to be enabled, `storage.rules` to be published, and `VITE_FIREBASE_STORAGE_BUCKET` to identify the enabled bucket.

## Safe external links

Only absolute `http://` and `https://` links are supported. Manual, imported, stored, evidence, legacy, and AI-generated URLs all pass through the same protocol allowlist before storage or rendering. Unsupported schemes such as `javascript:`, `data:`, `file:`, `blob:`, and `vbscript:` remain non-clickable descriptive text; user and AI links are never trusted automatically.

### Firebase Admin

The protected serverless routes verify Firebase ID tokens with Firebase Admin. Configure these server-only variables in Vercel:

```text
FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY
```

For `FIREBASE_ADMIN_PRIVATE_KEY`, Vercel may store newlines as `\n`; the server converts escaped newlines before initializing the Admin SDK. Firebase Admin credentials must never use a `VITE_` prefix.

### Paid providers

```text
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
DEEPGRAM_API_KEY
```

`ANTHROPIC_MODEL` is optional and defaults to `claude-sonnet-4-6`. Anthropic powers goal interpretation and roadmap generation. Deepgram powers voice transcription. Provider keys are server-only and must not be prefixed with `VITE_`.

Basic starter is local and does not call a protected AI route or consume Anthropic usage.

## AI request concurrency

Voice transcription, goal interpretation, and roadmap generation use independent request tokens and abort controllers, but paid operations cannot run concurrently. Starting one disables conflicting paid actions and duplicate submission controls. Closing the builder aborts all active requests, invalidates their tokens, closes live voice sockets, clears loading state, and prevents stale responses from mutating or reopening the modal.

## AI timeout and latency behavior

Protected provider routes use intentional timeout tiers so the server can return structured JSON before the browser or Vercel cancels the request:

| Operation | Provider timeout | Browser timeout | Vercel `maxDuration` |
| --- | ---: | ---: | ---: |
| Goal interpretation | 90 seconds | 105 seconds | 120 seconds |
| Roadmap generation | 180 seconds | 195 seconds | 240 seconds |
| Voice transcription | 60 seconds | 75 seconds | 90 seconds |

Anthropic goal interpretation and roadmap generation use the SDK streaming API internally, then wait for the accumulated final message before parsing the required tool-use output. The browser still receives one final JSON response; partial AI deltas are not streamed to the UI in this version.

Server provider timers return `provider_timeout`. Browser-side timers use `operation_timeout`, because the browser cannot know whether Anthropic or Deepgram timed out. Both codes keep the builder state intact and show the same safe timeout copy to the user.

Protected AI routes emit safe structured latency logs with a request ID, route, elapsed time, configured timeout, provider elapsed time, result, status/code, model, token usage when the provider returns it, and size/count metadata. Logs must not include raw goals, transcripts, clarification answers, generated roadmap content, auth headers, provider keys, Firebase credentials, email addresses, or private resource URLs. The same request ID appears in safe logs, the `X-Request-Id` response header, and JSON success/error payloads.

Browser `net::ERR_BLOCKED_BY_CLIENT` messages on Firestore Listen/Write channels are separate from AI provider timeouts. Treat them as privacy-blocker or Firestore connectivity issues, not as evidence that Anthropic timed out.

## Structured roadmap generation

Roadmap generation uses a compact strict Anthropic tool schema. Claude returns a supporting roadmap specification: title, description, sections, bounded reusable task definitions, preview copy, and notes. The server owns the confirmed brief fields and deterministically assembles the saved draft.

Confirmed Core Commitments are never regenerated, weakened, or removed by Claude. The server converts every confirmed commitment into a canonical task using its confirmed cadence, required status, evidence preference, and the confirmed duration. Claude may add supporting milestones, progression tasks, implementation checks, and review tasks, but the AI output is limited to 40 supporting task definitions. Roadmap tasks are reusable definitions; the journey engine calculates which recurring tasks apply to each day.

Unused AI task fields use neutral values in the strict tool contract: `0` for unused numbers, empty strings for unused text, empty arrays for unused arrays, and `"none"` for unused progression curves. Server normalization converts those sentinels to canonical `null` values before saving so they do not leak into the UI or saved-path model.

The generation route checks Anthropic `stop_reason` before normalization. `max_tokens` returns `provider_output_truncated`, context exhaustion returns `provider_context_limit`, refusal returns `provider_refusal`, and a completed response without the required tool call returns `missing_tool_use`. Partial or unexpected output is not normalized as a finished roadmap.

If Claude returns a valid compact response with no usable supporting tasks, and the confirmed commitments are sufficient to build a coherent draft, the server recovers a safe editable draft from those commitments plus deterministic review milestones. That recovery uses no second paid provider request and is labeled `anthropic_recovered` in the response.

Generation diagnostics add safe validation metadata such as stop reason, content block types, expected tool-use presence, raw task count, raw section count, and validation reason. They still exclude prompts, confirmed brief text, Core Commitment titles, generated task descriptions, resource URLs, credentials, and auth data.

## Guided creation

The Build with AI entry is a guided web flow rather than a dense all-fields form. The first screen asks only what the user wants to achieve, with inline voice input, examples, Basic starter, and Build with AI. Claude interpretation always happens before AI roadmap generation. When the goal is vague, the app shows one material clarification question at a time with structured choices and custom-answer support. When enough information exists, the flow moves through recommended rhythm, concise path brief, roadmap generation, preview, creation, and a ready screen.

Core Commitments and cadence are presented in natural language. Advanced schedule controls remain available behind an adjustment section so users can edit duration, time, commitments, frequency, constraints, resources, evidence preference, and assumptions without returning to the old dense prompt. The saved path model is unchanged: final paths still use the existing sections, tasks, resources, visibility, creator metadata, enrollments, day logs, evidence, streak, and freeze structures.

Basic starter remains a local non-AI route. It uses the same guided shell, creates a simple editable draft from the entered goal, shows the concise preview first, and saves through the normal local or platform path system.

### AI builder module layout

The guided AI builder is split into focused frontend modules under `src/views/ai-builder/`. `src/views.js` remains the app coordinator for modal lifecycle, authenticated requests, saving, live voice wiring, and navigation, while AI builder rendering, suggestion state, example rotation, draft normalization, and save-shape conversion live in the `ai-builder` modules. Add future AI builder screens or review controls there instead of growing the main view coordinator.

### Public path pages

Public and unlisted paths have shareable preview pages that explain what the path is, who created it, duration, intensity, evidence expectations and milestones. Owners can copy a clean `/path/{pathId}/preview` share link for Public or Unlisted paths; legacy `#/path/{pathId}/preview` links remain supported. The app preserves shared path routes during boot and retries them after cloud readiness so direct links do not fall back to Discover. Private paths remain private and are not exposed through guessed links.

### Discovery and curation

Phase 5.11 adds search, filters, sort options and curated discovery sections for public discoverable paths. Discover can search public path title, goal, preview copy, creator display name, category/domain and intensity; filter by category, duration, intensity and proof/activity signals; and sort by recommended, newest, most joined, most proof-backed, recently active, most completed, shortest and longest.

Discover uses public path metadata and aggregate trust metrics only. It does not expose private enrollments, day logs, submissions, participantStats, members lists, private evidence, raw proof URLs, private reflections or full task/section content to public viewers. Discovery cards use real stored metrics only; fake numbers, placeholder activity and stale active-this-week badges are not displayed.

Phase 6.3 compacts Discover into a slimmer toolbar with a prominent search field, reachable sort control, chip-style filters and a clear-filters action. Search, category, duration, intensity, proof/activity filters, sorting, pagination, curated sections and preview-first access behavior are preserved while reducing the old form-like control block.

Public discovery is preview-first. Signed-out users and signed-in users who have not joined a public path see the preview page and must join before opening the full roadmap or starting the path. Joined users and owners can open the full path through the existing access model.

Personalized recommendations, trending algorithms, global feeds, followers, notifications, public media proof display, Gemini evidence intelligence, research, citations, adaptive planning and paid promotion remain deferred.

Phase 5.11.1 modularizes catalog/discovery rendering and event binding without changing product behaviour. `src/views/catalog/render.js` composes the Discover/catalog HTML, `src/views/catalog/cards.js` renders public and workspace cards, `src/views/catalog/controls.js` renders search/filter/sort controls, `src/views/catalog/sections.js` builds curated and filtered sections, `src/views/catalog/events.js` binds catalog UI actions, and `src/views/catalog/access.js` owns catalog-specific access/CTA helpers. Full route orchestration remains in `src/views.js` for now because it coordinates path loading, preview rendering, pending shared routes and full-path opening state; moving it safely needs a later router-only pass.

Phase 5.11.2 adds bounded discovery loading and a Load more control so Discover no longer assumes every public path can be loaded at once. The public query reads `visibility == "public"` path documents with a safe page limit, then uses a runtime cursor for additional pages. Owner paths still load separately into the signed-in user's workspace and duplicate path IDs are deduped.

Discovery cards use public path metadata and aggregate stats only. They do not load child sections/tasks, comments, reactions, public progress entries, private day logs, evidence submissions, participantStats or member lists. Search, filters, sort options and curated sections operate on the loaded public path set until a full search backend is introduced.

Server-side/full-database search, personalized recommendations, trending algorithms and external search providers remain deferred.

### Public progress timelines

Phase 5.8 lets a signed-in learner publish a completed day from their own enrollment to `paths/{pathId}/publicProgress/{entryId}` when the source path is Public or Unlisted. Publishing is explicit and optional; completing a day does not automatically make anything public.

Public timeline entries are sanitized mirrors. They include public author display metadata, day number, completed task counts, evidence count, evidence type labels and an optional public caption. They do not expose private evidence URLs, file names, evidence notes, task reflections, day-log summaries, enrollment documents, raw submissions or another user's progress records.

Public progress timeline reads are constrained to documents where `visibility == "public"` so Firestore Rules can authorize collection queries safely.

Browser clients cannot write public progress documents directly. `POST /api/publish-progress` and `POST /api/unpublish-progress` verify Firebase Authentication server-side, confirm the enrollment belongs to the caller, require the day log to be completed, sanitize the public entry, and update `stats.publicProgressCount` plus `stats.proofSubmissionCount` from the sanitized public entry evidence count. Unpublishing deletes only the public mirror and leaves private day logs and evidence history intact.

### Path trust metrics

Phase 5.10 adds server-managed path trust metrics: joined count, current-week activity when accurately computed, Day 1 starts, Day 7 reached, halfway reached, completed count, public progress count and public proof submission count.

Trust metrics live on the path document as aggregate `stats`. Per-user milestone state lives in server-only `paths/{pathId}/participantStats/{uid}` documents so each learner is counted once per milestone. The protected `POST /api/sync-path-metrics` route verifies Firebase Authentication, the caller-owned enrollment and the relevant day log before updating milestone counts. The join, publish and unpublish routes also maintain the relevant stats in Firestore transactions.

These metrics are aggregate counts only. Public viewers cannot inspect participantStats, members lists, private enrollments, day logs, submissions, evidence URLs, evidence file names, notes, reflections or private progress records. The app displays only real server-managed metrics. Uncomputed or stale metrics are hidden or shown as neutral zero states; stale `activeThisWeek` values are not shown as current activity.

Trending, ranking, creator analytics dashboards, notifications, followers, public media proof feeds, Gemini evidence intelligence, research enrichment and adaptive planning remain deferred.

### Cheers and comments

Phase 5.9 adds lightweight reactions and comments to sanitized public progress entries. Interactions attach only to `paths/{pathId}/publicProgress/{entryId}`. They do not attach to private day logs, private evidence submissions, private reflections, enrollments, unpublished completed days or the path itself as a general wall.

Reaction and comment writes use protected API routes:

- `POST /api/react-progress`
- `POST /api/comment-progress`
- `POST /api/hide-progress-comment`

The browser can read visible public comments and safe aggregate counts, but it cannot directly create comments, create reactions or update interaction counters. Reaction counts and visible comment counts are server-managed. Repeated reactions are idempotent, removals do not decrement below zero, and comments are stored as bounded plain text.

Users can remove their own comments. Path owners can hide comments on their paths. This is a moderation foundation only: full moderation queues, reporting dashboards and notifications remain deferred.

Private day logs, private evidence, private reflections and raw proof URLs remain private. Public progress entries continue to expose only sanitized proof summaries such as counts and evidence type labels.

### Moderation reports

Phase 6.3 adds basic moderation report infrastructure for public paths and public progress comments:

- `POST /api/report-path`
- `POST /api/report-progress-comment`

Report routes require Firebase Authentication, use private no-store responses, return request IDs, run through the Firestore-backed rate limiter and create server-managed `moderationReports/{reportId}` documents. Browser clients cannot directly read or write moderation reports through Firestore Rules.

Reports store a bounded reason, a trimmed optional note and only a minimal public snapshot such as the public path title or a short visible public comment snippet. They do not store Firebase ID tokens, emails, provider tokens, private day logs, private evidence, raw evidence URLs, private reflections, participantStats or uploaded proof files.

Reporting does not automatically hide paths or comments, does not remove content from discovery and does not mutate `visibleCommentCount`. Comment authors and path owners keep the existing hide controls. A full moderation dashboard, admin roles, automated moderation, public progress entry reports, notifications, followers, global feed, adaptive planning and Gemini/evidence intelligence remain deferred.

### Joinable paths

When a user joins a path, the source path remains owned by the creator. The joiner receives their own membership, enrollment, day logs and evidence records, and does not receive editor permissions or an editable cloned copy of the source path.

Phase 5.7 introduces real joined-count tracking. Phase 5.8 adds accurate public progress counts from the server-managed timeline mirror. Phase 5.9 adds lightweight cheers and comments on public progress entries. Phase 5.10 adds server-managed aggregate trust metrics for public and unlisted paths without exposing private learner data. Notifications, followers, global feeds, trending, ranking, public media proof, Gemini evidence intelligence, research and adaptive planning are not part of Phase 5.10.

### Domain-aware setup

Phase 5.5 helps Learn Path Tracker recognize course, book, fitness and general goal context during setup. The builder shows six lightweight goal suggestions, rotates calm empty-field examples until the user focuses, types, pastes or starts voice input, and asks only missing questions that materially affect duration, schedule, sequence, milestones, safety, evidence or progression.

Confirmed courses, books and existing programmes are preserved as structured resources in the canonical brief and supplied to roadmap generation. Course and programme sequences can be marked fixed, book page scope and current progress can be preserved, and fitness baselines, training frequency, session length and limitations become protected planning context. Claude may organize around these resources, but it must not silently replace them, invent course lessons, fabricate book chapters or weaken fixed challenge rules.

Path intensity uses the user-facing labels `Soft`, `Balanced` and `Intensive`, with canonical values `soft`, `balanced` and `intensive`. Intensity affects time load, task volume, progression, recovery, required versus optional work and evidence expectations. It never overrides safety boundaries, fixed challenge rules, confirmed resources, fixed course or programme sequence, or explicit user availability.

Phase 6.1 makes intensity part of daily completion policy. Days can pass once the learner completes enough meaningful weighted work for the path intensity, while perfect days are still celebrated separately. Required tasks carry full weight, optional tasks carry lighter weight, skipped optional tasks do not add score, evidence-required tasks count only after proof is verified, and explicit anchor/core tasks can still block completion.

Soft paths use a gentler workload, lower pass threshold and more flexibility. Balanced paths use realistic discipline, a moderate pass threshold and standard proof expectations. Intensive paths use a focused workload, higher pass threshold and stronger proof expectations while staying achievable.

Completion scores and tiers are safe aggregate metadata. Private task details, private reflections, private evidence and raw evidence URLs remain private. Public progress may show sanitized completion score/tier metadata for completed days without exposing failed task details.

Adaptive replanning, Gemini evidence intelligence, full UI redesign, notifications and personalized recommendations remain deferred.

### Schema versioning

Phase 6.2 centralizes persisted document schema versions in `src/schema-versioning.js`. Current versions are:

| Document type | Version |
| --- | ---: |
| `path` | 1 |
| `pathStats` | 1 |
| `member` | 1 |
| `participantStats` | 1 |
| `enrollment` | 1 |
| `dayLog` | 2 |
| `evidenceSubmission` | 1 |
| `publicProgress` | 2 |
| `publicProgressComment` | 1 |
| `publicProgressReaction` | 1 |
| `discoveryPagination` | 1 |
| `moderationReport` | 1 |
| `rateLimit` | 1 |

Legacy documents without `schemaVersion` are normalized safely in memory as legacy version `0`. Malformed schema versions also normalize safely. New writes attach the current `schemaVersion`, while explicitly newer versions are not downgraded. Bulk production migrations remain deferred until needed and must be bounded, authenticated, rate-limited and tested before launch.

Schema versioning does not make private data public. Private day logs, private evidence submissions, raw evidence URLs, enrollments, participantStats, private path content and user-private local state remain protected by the existing access model.

Phase 5.5 does not fetch course or book metadata, perform live web research, verify external resources or add citations. Gemini evidence intelligence, research enrichment and rolling adaptive planning remain deferred.

## Unified voice input

Eligible path-creation text fields include an inline microphone button. Tap the microphone, grant permission, and the browser requests an authenticated short-lived Deepgram token from `POST /api/deepgram-token`. The browser then opens a direct live WebSocket to Deepgram, starts recording only after the socket is connected, and streams microphone chunks while the user speaks.

The server uses the permanent Deepgram API key to request a short-lived JWT from `/v1/auth/grant`. The browser uses that short-lived JWT to authenticate the direct Deepgram WebSocket with the Bearer scheme through `Sec-WebSocket-Protocol`; the JWT is not placed in the URL or stored in persistent browser storage.

Interim words appear live in the active field and may be refined as recognition improves. Finalized phrases become stable, Stop sends a finalization request, and the normal field remains editable after the microphone and socket close. Multiple voice sessions can be added to the same field without replacing existing text unless text was deliberately selected.

Voice input is available for useful natural-language fields in goal entry, clarification text answers, resource title and note fields, rhythm adjustments, brief review, and high-level roadmap review fields. It is intentionally excluded from URLs, dates, numbers, selectors, booleans, authentication fields, and repeated generated task rows so the interface stays calm.

Only one microphone session can run at a time. Requesting microphone, connecting live transcription, listening, finalizing, fallback recording, and fallback transcription states are shown inline with a timer, compact waveform, Stop/Cancel controls, retry where possible, and polite status messages. Interpretation, generation, and saving remain deliberate user actions and are blocked while voice recording or transcription is active.

If live streaming is unavailable or interrupted, the in-memory recording can continue locally and Stop sends the completed audio once through `POST /api/transcribe-voice`. The fallback transcript replaces the partial live transcript so text is not duplicated.

### Voice limits and privacy

Maximum recording duration: 120 seconds. Maximum fallback audio payload: 4 MB. Recordings may stop automatically at the safe duration or byte threshold.

During live voice input, audio is sent securely from the browser to the configured transcription provider using a short-lived access token. Raw audio is not stored in the user's path, Firestore, Firebase Storage or permanent browser storage.

When live streaming is unavailable, the in-memory recording may be sent through the authenticated fallback transcription endpoint. The recording is discarded after transcription or cancellation. Transcription requires authentication and a network connection; users can always continue by typing.

Phase 5.5 does not add voice commands, emotion analysis, evidence analysis, Gemini, research enrichment, citations, adaptive planning, payments or social features.

## Guided Daily Session

Opening an active journey day now starts with Daily Session Focus Mode instead of the old long-scroll task and proof form. The focused view shows one task at a time, while Overview mode shows required task count, optional task count, evidence-required count, estimated effort when task durations exist, a full task scan and saved progress when the session is being resumed.

If any task requires proof, the next step is an evidence preparation summary. It lists the tasks that need proof and the supported proof style already stored on the task model. Users can start the session without gathering every proof item first.

Phase 6.4 adds Daily Session Focus Mode: a one-task-at-a-time daily practice flow with a visible score, pass threshold, completion tier, proof status, calm feedback after task actions and a completion result state for passed, strong and perfect days. Overview mode remains available for users who want to scan the full day before jumping back into a specific task.

Phase 6.4.2 refines the daily focus flow and catalog states:

- Daily Focus Mode is now a dedicated route and screen (`#/path/{id}/plan/roadmap/day/{N}/focus`) instead of being embedded at the bottom of the roadmap. Start Day and Continue Day navigate to the focused screen; a back link returns to the roadmap.
- Pass mark percentage is no longer displayed before day completion. The threshold remains internal to the scoring engine and is shown only on the result screen after a day is completed.
- Signed-out users see a "Start your own journey" section with a sign-in prompt instead of the authenticated workspace.
- The legacy built-in Cinematic Storytelling starter path is removed from the active catalog. `SKILLS` is now empty; template constants remain in source for reference.

Focus Mode uses the Phase 6.1 scoring engine. It does not weaken proof requirements: evidence-required tasks count only when verified, optional skipped tasks do not add score, and anchor/core tasks can still block completion even when the score is high enough. Complete Day recomputes the score from canonical tasks, day logs and evidence before saving completion metadata.

The active session shows one task at a time with progress, title, description, criteria, estimate when available, required/optional status, resource link, evidence state, and focused actions. Required tasks without evidence can be marked done or left as `Not done yet`. Required tasks with evidence must use the existing evidence submission system before they become complete. Optional tasks can be marked done, skipped, or left for later.

`Not done yet` keeps a task unresolved and pending; it does not count toward progress and pending required tasks block day completion. `Skip optional task` resolves an optional task as skipped, does not count as completed work, and does not block day completion.

Every meaningful session action saves immediately through the existing local-first day-log path and Firestore sync path: session start, task completion, evidence submission, reflection, optional skip, pending mark, agenda/review navigation, and completion. Refreshing or reopening the day derives the session from canonical day-log fields plus the additive session fields, so legacy logs still open without migration.

### Completion semantics

Required progress is calculated as resolved required tasks divided by total required tasks. Optional tasks are displayed separately and never inflate the required progress percentage. Evidence-required tasks count only when the canonical verified task state exists; evidence records alone do not fake completion.

Day completion still uses the existing journey completion flow for status, streak, missed-day recovery, freeze handling, and next-day availability. The guided session only prepares the day log for that canonical completion write.

Completed days open as a concise summary with required task count, optional completion/skips, evidence count, and existing evidence history. Phase 5.3 does not analyse evidence or adapt future roadmap days. It creates the structured daily-session and evidence foundation for later adaptive-planning phases.

Native mobile app packaging, push notifications, adaptive replanning, Gemini evidence intelligence, full UI redesign, leaderboards and any hearts/gems/shop-style game economy remain deferred.

## Responsive behavior

Phase 5.3 improves the responsive web application. It does not create the native mobile application yet.

Desktop and laptop browsers use a focused work area for guided creation and daily sessions. Tablet and smaller laptop widths switch to a single-column layout with summary information above or below the active task. Mobile browsers use compact progress, touch-friendly controls, and sticky daily-session actions so the primary decision stays reachable.

All viewport presentations use the same canonical builder state, daily-session state, request controllers, day logs, and save path. There is no separate mobile business logic. Future native clients should be able to reuse the product flow, backend contracts, and saved-path data model established here, but Capacitor, React Native, Expo, Android, and iOS packaging remain deferred.

## Product principles

- Ask only material questions that can change the roadmap.
- Use progressive disclosure so secondary details do not crowd the first decision.
- Prefer useful choices while keeping a custom answer available where appropriate.
- Show schedules, commitments, and evidence in human language instead of internal schema labels.
- Do not fabricate research, citations, social proof, success rates, or live resource verification.

### Rate limits

The server applies verified-UID limits before calling Anthropic or Deepgram. Defaults are:

| Route | 10-minute burst | Hourly |
| --- | ---: | ---: |
| Goal interpretation | 8 | 40 |
| Roadmap generation | 3 | 12 |
| Voice transcription | 6 | 20 |
| Join path | 12 | 80 |
| Publish progress | 10 | 60 |
| Unpublish progress | 20 | 80 |

Override them with positive integers:

```text
RATE_LIMIT_INTERPRET_PER_HOUR
RATE_LIMIT_GENERATE_PER_HOUR
RATE_LIMIT_TRANSCRIBE_PER_HOUR
RATE_LIMIT_JOIN_PATH_PER_HOUR
RATE_LIMIT_PUBLISH_PROGRESS_PER_HOUR
RATE_LIMIT_UNPUBLISH_PROGRESS_PER_HOUR
RATE_LIMIT_INTERPRET_BURST_PER_10_MINUTES
RATE_LIMIT_GENERATE_BURST_PER_10_MINUTES
RATE_LIMIT_TRANSCRIBE_BURST_PER_10_MINUTES
RATE_LIMIT_JOIN_PATH_BURST_PER_10_MINUTES
RATE_LIMIT_PUBLISH_PROGRESS_BURST_PER_10_MINUTES
RATE_LIMIT_UNPUBLISH_PROGRESS_BURST_PER_10_MINUTES
```

Counters are stored by Firebase Admin in `_internalRateLimits`. Each user/route uses one rolling document with `expiresAt`, so document growth is bounded. Client Firestore rules explicitly deny all access. For automatic cleanup, enable a Firestore TTL policy on the `expiresAt` field for the `_internalRateLimits` collection group.

## Protected API routes

These routes require `Authorization: Bearer <firebase-id-token>`:

- `POST /api/interpret-goal`
- `POST /api/generate-path`
- `POST /api/deepgram-token`
- `POST /api/transcribe-voice`
- `POST /api/join-path`
- `POST /api/publish-progress`
- `POST /api/unpublish-progress`
- `POST /api/sync-path-metrics`

The frontend obtains the current Firebase user's ID token immediately before each request. A `401` triggers one forced token refresh and one retry only. Client-supplied UIDs are ignored; rate limits use the UID from the verified token.

Routes return normalized errors:

```json
{
  "error": "rate_limited",
  "message": "You have reached the current usage limit. Try again later.",
  "details": null
}
```

Compatibility fields `ok` and `code` are also included for the current UI. Rate-limited responses include `Retry-After`. Provider requests have route-specific server timeouts and are aborted when the timeout expires or the client disconnects.

Protected success and error responses use `Cache-Control: private, no-store` and include an `X-Request-Id` header plus matching `requestId` response field. Unexpected server failures return a generic message; internal error details are logged only with the request ID and never include request bodies or credentials.

`vercel.json` keeps the public API URLs stable with rewrites while deploying three consolidated Node serverless routers for Vercel Hobby compatibility:

```text
api/ai.js: 240 seconds
  handles /api/interpret-goal and /api/generate-path

api/voice.js: 90 seconds
  handles /api/deepgram-token and /api/transcribe-voice
  exports bodyParser:false so raw audio uploads stay streamed

api/community.js: 15 seconds
  handles join, publish/unpublish, reactions, comments, reports, and path metrics
```

The live token route verifies Firebase Authentication, applies the voice transcription rate limit, calls Deepgram's temporary-token grant endpoint with the server-side `DEEPGRAM_API_KEY`, and returns only the temporary JWT, expiration metadata, and request ID. The permanent Deepgram key is never returned to the browser.

Voice fallback transcription accepts WebM, MP4, MP3, WAV, or OGG audio up to 4 MB. Inline browser recording stops at 120 seconds or near the safe byte threshold before upload.

Authentication, declared-size validation, and the per-user voice rate limit run before the audio body is buffered. The stream is still counted while reading and is terminated when it exceeds 4 MB, so a missing or inaccurate `Content-Length` cannot bypass the limit.

## AI brief integrity

Build with AI first creates one canonical brief. Clarification questions have stable IDs and target fields. Answers are merged into those fields in application code before Claude enriches the brief. User-entered and answered fields are recorded in `confirmedFields` and cannot be silently overwritten by the model.

Material uncertainty is represented as visible assumptions. Every material assumption must be accepted, edited, or removed before roadmap generation. Missing level remains unknown; intensity is normalized to the Phase 5.5 values `soft`, `balanced` or `intensive` and remains user-editable before generation. The generation route rejects unconfirmed briefs.

Roadmap generation accepts one canonical `confirmedBrief` plus `saveOptions.visibility`. Legacy duplicate content fields are ignored only when they exactly match the canonical brief; conflicting duplicates are rejected.

No route performs web research, verifies resource URLs, fetches external metadata, or creates citations.

## Firebase rules

Repository rules are the source of truth:

- `firestore.rules` protects users, paths, members, access requests, enrollments, day logs, submissions, and server-only rate-limit documents.
- `storage.rules` protects evidence uploads by authenticated user, MIME type, and size.
- `firebase.json` points the Emulator Suite and Firebase CLI at those files.

Run rules tests from a clean clone with:

```bash
npm install
npm run test:rules
```

Publish rules only after selecting the intended Firebase project:

```bash
firebase deploy --only firestore:rules,storage
```

Changing repository rules does not update live Firebase automatically. Keep deployed rules synchronized with the repository. Production rules and abuse controls should receive another hardening review before a broad public launch.

Evidence file deletion is not implemented in this version. The current Storage rules intentionally cover upload/read behavior only; do not add a client delete control until ownership checks, Firestore submission cleanup, and Storage deletion are designed and tested together.

The older minimal user-only rules are suitable only for the legacy private tracker mode. Platform paths, members, write-first enrollments, day logs, submissions, and protected operational data require the current repository rules.

## Vercel deployment

1. Import the GitHub repository into Vercel.
2. Keep the Vite build command as `npm run build` and output directory as `dist`.
3. Add the public `VITE_FIREBASE_*` variables.
4. Add Firebase Admin, Anthropic, Deepgram, and optional rate-limit variables as server variables.
5. Deploy and verify Authentication authorized domains in Firebase.
6. Publish the matching Firestore and Storage rules separately.

Do not expose Firebase Admin, Anthropic, or Deepgram credentials through `VITE_*`. Do not log ID tokens, provider keys, private goals, transcripts, or Admin private keys.

## Project structure

```text
api/
  _lib/
    diagnostics.js
    errors.js
    firebase-admin.js
    http.js
    path-trust-metrics.js
    progress-interactions.js
    provider.js
    rate-limit.js
    require-auth.js
  generate-path.js
  comment-progress.js
  hide-progress-comment.js
  interpret-goal.js
  join-path.js
  publish-progress.js
  react-progress.js
  sync-path-metrics.js
  transcribe-voice.js
  unpublish-progress.js
src/
  api.js
  ai-builder-model.js
  auth.js
  db.js
  firebase.js
  journey.js
  main.js
  public-progress.js
  shared-api-contracts.js
  shared-dtos.js
  design-tokens.js
  design-system-contracts.js
  ai-timeouts.js
  views.js
docs/
  api-contracts.md
  behavioral-ux-retention-redesign-spec.md
  design-system-foundation.md
  mobile-core-loop-and-architecture.md
tests/
  anthropic-streaming.test.js
  api-security.test.js
  firestore.rules.test.js
  generation-reliability.test.js
  join-path-api.test.js
  latency-logging.test.js
  phase5.model.test.js
  path-trust-metrics-api.test.js
  progress-interactions-api.test.js
  public-progress-api.test.js
  public-progress-db.test.js
  public-progress-model.test.js
  timeout-alignment.test.js
```

`api/analyze.js` was removed because it was an unused public diagnostic surface.

## Mobile architecture (Phase 6.5)

Phase 6.5 defines the mobile-native direction using a one-brain/two-skins architecture. The existing Firebase/Vercel/domain logic remains the shared brain. The current Vite web app remains the desktop/public web skin. A future React Native/Expo app will become the mobile-native skin centered on the daily habit loop: Today, Daily Focus, proof upload, completion result and Discover.

No mobile app was built in this phase. See [`docs/mobile-core-loop-and-architecture.md`](docs/mobile-core-loop-and-architecture.md) for the full mobile architecture, screen map, API contract map, auth strategy, offline strategy and push notification plan.

## Behavioral UX and retention strategy (Phase 6.6)

Phase 6.6 defines the behavioral UX, retention model, analytics event taxonomy, motion/interaction direction and redesign specification. No analytics SDK was added. No redesign was implemented. No mobile app was built. See [`docs/behavioral-ux-retention-redesign-spec.md`](docs/behavioral-ux-retention-redesign-spec.md) for the full specification.

## Shared API contracts and DTOs (Phase 6.7)

Phase 6.7 extracts shared API contracts and privacy-safe DTO helpers into pure data modules that both the web and future mobile skins can import without pulling in browser-specific code.

- [`src/shared-api-contracts.js`](src/shared-api-contracts.js) exports `API_ENDPOINTS` (13 public URLs), `API_ROUTE_GROUPS` (ai/voice/community), `API_CONTRACTS` (per-endpoint metadata), and `SHARED_PRIVACY_CONSTRAINTS`.
- [`src/shared-dtos.js`](src/shared-dtos.js) exports privacy-safe DTO helpers: `pathSummaryDTO`, `publicPathPreviewDTO`, `dailyFocusDTO`, `completionResultDTO`, `publicProgressDTO`, `trustMetricsDTO`, `discoveryCardDTO`, `moderationReportDTO`.
- `src/api.js` now uses `API_ENDPOINTS` constants instead of hardcoded URL strings for all community endpoints.
- [`docs/api-contracts.md`](docs/api-contracts.md) documents all 13 endpoints with router, purpose, auth, method, request/response, privacy, and mobile use case.

No public API URLs were changed. No request/response payloads were changed. No server route handler files were changed. No mobile app was built.

## Design system foundation (Phase 6.8)

Phase 6.8 defines the design system foundation: the repeatable interface language for proof-backed growth journeys. This phase establishes tokens, component contracts and screen composition models without implementing any production UI changes.

- [`src/design-tokens.js`](src/design-tokens.js) exports semantic tokens for color (surface/text/border/accent/state/tier), typography (system-ui stack, 10 roles), spacing (12-step scale), radius, elevation, motion (durations/easing/product moments/reduced-motion), interaction states and accessibility (tap targets, focus rings, contrast, ARIA).
- [`src/design-system-contracts.js`](src/design-system-contracts.js) exports 25 core component contracts (Button through RoadmapNode), a universal component state model, 13-screen composition model (landing-auth through profile-account) and a deferred work list.
- [`docs/design-system-foundation.md`](docs/design-system-foundation.md) covers the design system thesis, dark editorial aesthetic, token philosophy, color/typography/spacing/radius/elevation/motion/state/accessibility systems, mobile and desktop baselines, component inventory, screen composition model, and Figma implementation guidance.

No production UI redesign was implemented. No Figma file was committed. No font files were committed. No mobile app was built. No animation library was installed. No analytics SDK was added.

## Core web UI rollout (Phase 6.9)

Phase 6.9 begins the incremental production web redesign rollout by wiring design tokens into CSS custom properties and applying the new core layout to Today, Daily Focus and Completion Result.

- `src/design-token-css.js` and `scripts/generate-design-token-css.mjs` generate `src/generated/design-tokens.css` from the Phase 6.8 token source.
- `src/ui/` contains plain JavaScript core UI render helpers for the daily loop.
- The internal design-system gallery is available at `#/dev/design-system`.
- [`docs/phase-6.9-core-ui-rollout.md`](docs/phase-6.9-core-ui-rollout.md) documents the responsive contract and rollout boundary.

The native mobile app was not built. The full app was not redesigned. No design library, animation library or runtime analytics SDK was installed.

Phase 6.9.1 corrected the first UI rollout palette with the then-current warm editorial skin. The token generator remains intact and `src/generated/design-tokens.css` is regenerated from `src/design-tokens.js`.

Phase 6.9.2 establishes the Proof Studio visual direction: Today as the daily action center, roadmap as proof journey, public progress as proof-first cards, and trust metrics as real-data-only.

Phase 6.9.3 polishes the production UI rollout by fixing card overlap, improving spacing and radius consistency, simplifying Discovery search/filter controls, removing stray numbering, and refining the roadmap into a proof journey.

Phase 6.9.4 replaces the gold Proof Studio skin with the Aurora visual direction (indigo lead, green = proof, purple = peak, deep neutral-violet base), adds a consistent UX interaction/behavior system, and hardens the design system for radius, hierarchy, alignment and contrast. Proof Studio product integrity (real data only, no leaderboard, no following, no fake proof) is unchanged.

Phase 6.9.5 repairs the rendered Aurora UI by replacing the bulky Discovery toolbar markup, removing stray numeric artifacts, rebuilding path cards with non-overlap structure, normalizing radius through tokens, and rebuilding the roadmap as a clean vertical proof journey. Aurora indigo remains the primary action/progress color, while Proof Studio integrity rules remain unchanged.

The Proof Studio direction keeps proof-first product integrity while Aurora owns the visual skin: indigo is the primary action/progress color, green is proof-only, purple is peak-only, and filled accent labels use the mathematically verified on-fill text color rather than relying on token names.

## Mobile app foundation (Phase 6.10)

Phase 6.10 starts the second skin: an isolated Expo mobile foundation under
[`apps/mobile`](apps/mobile). It is a scaffold only — placeholder screens, the
Aurora mobile theme, a safe API client seam, and generated API contracts. No
mobile MVP, authentication, or real data wiring is built yet.

- Web remains the production app. Mobile foundation lives in `apps/mobile`.
- Run root tests and `npm run generate:mobile-contracts` from the repo root.
- Run mobile commands (`npm install`, `npm run check:foundation`, `npm start`) only from `apps/mobile`.
- Mobile dependencies (Expo, React, React Native) live only in `apps/mobile/package.json`, never in the root.
- The mobile foundation does not import any web DOM module (`src/views.js`, `src/styles.css`, `src/header.js`, `index.html`).
- No mobile secrets, env files, signing credentials, or `node_modules` are committed.

See [`docs/mobile-app-foundation.md`](docs/mobile-app-foundation.md). Remaining
web visual polish is parked in
[`docs/aurora-ui-feedback-backlog.md`](docs/aurora-ui-feedback-backlog.md) for a
later web-polish phase (6.9.12).

## Mobile core loop MVP (Phase 6.11)

Phase 6.11 turns the mobile foundation into a **local, functional core loop**:
Today → Daily Focus → Completion Result, running on in-memory React state only.

- Local-only: no Firebase Auth, no Firestore sync, no proof upload, no camera/file picker, no live API calls from screens.
- A local starter path (private, clearly labeled) provides a small proof-of-growth day to operate on.
- Pure scoring/tier model in `apps/mobile/src/core/`; tiers mirror the web balanced policy (parity-tested).
- Text proof/reflection only, stored locally and never logged; labeled "Proof submitted", never "verified".
- New Aurora mobile components under `apps/mobile/src/components/`.

See [`docs/mobile-core-loop-mvp.md`](docs/mobile-core-loop-mvp.md). Phase 6.12 will
handle mobile auth, data loading, path sync, and discovery — not this phase.

## Mobile auth, cloud paths and discovery (Phase 6.12)

Phase 6.12 connects the mobile app to the shared brain (read-only): Firebase
client auth gate, cloud path loading, a read-only roadmap view, public discovery,
and public path preview.

- Firebase **client** SDK only (env-driven via `EXPO_PUBLIC_*`); the Admin SDK never ships to mobile.
- Auth gate: signed-out users see a real sign-in/create-account screen; signed-in users reach the shell.
- Missing Firebase config shows a safe "not configured" state (local demo still available) — never a crash.
- Read-only path/roadmap/discovery repositories with dependency injection (tests use mocks, no live calls).
- Daily Focus stays local-only; a cloud-path day would be an unsynced local copy, clearly labeled.
- No proof upload, no Firestore day-log/proof writes, no public-progress publish, no mobile join yet.
- Mobile dependency added (in `apps/mobile` only): `firebase` (client SDK). Root deps unchanged.

See [`docs/mobile-auth-paths-discovery.md`](docs/mobile-auth-paths-discovery.md).
Proof capture and day sync are deferred to Phase 6.13.

## Mobile day sync, text/link proof and public progress (Phase 6.13)

Phase 6.13 adds the first real mobile write path: sync a finished local day to
the cloud, capture private text/link proof, and explicitly publish a sanitized
public progress summary.

- Day sync writes to the user's **private** space (`users/{uid}/mobileDayLogs`) — owner-only by existing rules, idempotent, finished-days-only.
- Text or **link** proof (validated http(s)); private by default; "submitted", never "verified". No camera/file/audio capture.
- Public progress publishes via the existing `/api/publish-progress` route with the ID token — explicit, post-sync only, sanitized (day result, never private proof/reflection). No new API route.
- Firestore rules unchanged (relies on `users/{uid}` owner writes + server-only public progress).
- No mobile comments/reactions/moderation/join, no notifications, no media upload, no fake metrics.

See [`docs/mobile-day-sync-proof-public-progress.md`](docs/mobile-day-sync-proof-public-progress.md).
Media proof upload and offline drafts are deferred to Phase 6.16; notifications to Phase 6.17.

## Mobile public progress server bridge (Phase 6.14)

Phase 6.14 lets the existing `/api/publish-progress` route publish from **either**
the web enrollment day log or the new mobile private day log — closing the server
gap from Phase 6.13. No new API route is added and web publishing is unchanged.

- Source resolver: web enrollment first; mobile private day log (`users/{uid}/mobileDayLogs`) only when no enrollment exists and the user owns the public/unlisted path.
- The server fetches the trusted private day log itself; the mobile client still sends only `{ pathId, dayNumber, publicCaption }`.
- Public entries are sanitized (day result only — never private proof/reflection/evidence URLs); "submitted", never "verified".
- Idempotent (same `uid_day_N` entry); `publicProgressCount`/`proofSubmissionCount` never double-count.
- Shared deterministic id (`src/mobile-day-log-ids.js`) with a parity test; Firestore/Storage rules unchanged; Vercel function count unchanged.

See [`docs/mobile-public-progress-server-bridge.md`](docs/mobile-public-progress-server-bridge.md).

## Account, profile and path personalization (Phase 6.15)

Phase 6.15 adds the shared identity/presentation layer: user profiles (display
name, unique username/handle, bio, avatar, cover) and owned-path personalization
(banner, accent color, public subtitle), with public-safe shaping.

- Profile doc `users/{uid}/profile/main` (owner-only); public-safe fields exclude email/tokens/storage paths.
- Username reservation `usernames/{usernameLower}` — uniqueness guaranteed by a create-when-absent Firestore rule + writeBatch (web); reserved terms blocked.
- Profile/banner images use narrow, image-only, size-limited Storage paths (avatar ≤2 MB, cover/banner ≤5 MB). No proof/evidence or generic upload paths added.
- Path personalization is owner-only and can never touch server-managed stats or identity fields.
- Web Profile page gains a profile editor; owner-only path personalization editor. Mobile shows/edit safe text fields and displays profile/path images (mobile image upload deferred).
- No followers/following/leaderboards/rankings, no proof media upload, no notifications. Firebase Admin unchanged; no new Vercel routes.

See [`docs/account-profile-path-personalization.md`](docs/account-profile-path-personalization.md).
Mobile media proof upload and offline drafts are deferred to Phase 6.16.

### Phase 6.15.1 — profile runtime repair

- **Web avatar/cover upload now works**: selecting an image uploads to
  `users/{uid}/profile/avatar|cover/{assetId}`, saves the download URL to the
  profile, and renders it in the profile preview and the side-nav user block
  (with an initials fallback).
- **Accurate username errors**: availability is checked first; permission-denied
  is reported as a rules/config issue, never a false "taken".
- Path banner upload is deferred (input disabled, "coming next") — avatar/cover
  upload is fully wired.

**Phase 6.15.2 — profile asset persistence:** a text-only profile save no longer
wipes uploaded images. `saveProfileText` writes only text/preference fields and
never `avatarURL`/`coverURL`/storage paths; images change only through the upload
helpers. Uploaded avatar/cover now persist across reloads and appear in the
profile preview and side-nav.

**Phase 6.15.3 — public proof timeline and evidence cards:** submitted proof is
now visible documentation, not just a count. Today shows a proof strip, the right
rail shows day proof, completed days show a card-based "Proof archive", Progress
has "Your Proof Archive", and public paths show a signed-out-safe "Public proof
timeline". Completed proof tasks read "Proof submitted". Public surfaces never
expose private notes/reflections, raw storage paths, or private evidence URLs. See
[`docs/proof-archive-evidence-visualization.md`](docs/proof-archive-evidence-visualization.md).

**Phase 6.15.4 — proof feed, daily documentation and gallery UX:** proof is now a
**daily documentation feed** (one activity-style card per day with metrics, task
summary, media preview and a "View gallery" action) instead of a raw grid of tiny
cards. The Progress page leads with the feed and demotes the raw grid into a
"View all proof" disclosure; Today and the right rail show a compact proof preview;
public paths show a public daily-documentation timeline. Private notes/reflections,
raw storage paths, and private evidence URLs are never exposed publicly. See
[`docs/proof-feed-gallery-ux.md`](docs/proof-feed-gallery-ux.md).

## Mobile media proof upload and offline drafts (Phase 6.16)

Phase 6.16 lets mobile users attach **image/PDF proof** (from the device library —
no camera/audio) to a day/task, upload it to the owner-only evidence Storage path
(`evidence/{uid}/{enrollmentId}/...`, ≤10 MB), and queue uploads as **offline
drafts** (AsyncStorage) that flush when back online.

- Mobile-only deps added in `apps/mobile/package.json`: `expo-image-picker`, `expo-file-system`, `@react-native-async-storage/async-storage` (never the root).
- Pure core (`mobileMediaProofMappers`, `mobileOfflineDrafts`, `mobileProofUploadState`) + DI services (`mobileProofStorageRepository`, `mobileMediaProofRepository`, `mobileOfflineDraftRepository`) + RN components.
- Proof is private by default and "submitted", never "verified". No camera/audio, no notifications, no new Storage path, no rules changes.

**Phase 6.16.1 — media proof runtime wiring:** the 6.16 foundation is now wired
into the live flow. Daily Focus offers **image proof** (library or camera via
`expo-image-picker`, permissions on tap), creates persisted offline drafts, and
uploads to the owner-scoped path `users/{uid}/proofMedia/{pathId}/day-N/{taskId}/...`.
Uploaded image proof satisfies proof-required tasks; draft-only local images never
sync. Day sync is **blocked while uploads are pending**; the day log carries
uploaded metadata only (no local URI/base64). Scope tightened to **images only**
(no PDF/file/video/audio).

See [`docs/mobile-media-proof-offline-drafts.md`](docs/mobile-media-proof-offline-drafts.md).

**Phase 6.17 — cross-platform notifications:** a behavior-supporting (not spammy)
notification system on web + mobile. Signed-in users get an in-app notification
center (unread/read, mark read, mark all, archive) and per-category preferences
(in-app, browser push, daily reminder + time, streak-risk, missed-day, proof
upload, public-progress interactions, moderation updates, quiet hours).
**Browser push is opt-in** (Web Push + service worker, never requested on signup)
and degrades gracefully when VAPID keys are absent. Mobile adds opt-in
**local** reminders via `expo-notifications`; remote mobile push is deferred.
Notifications live in owner-only `users/{uid}/notifications` and never expose
private proof, reflections, evidence URLs, Storage paths, tokens or emails. All
endpoints run through the existing `community` router (no new Vercel function).
See [`docs/cross-platform-notification-system.md`](docs/cross-platform-notification-system.md).

> **Deploy Firebase rules separately — Vercel does not.** After profile/
> personalization changes run:
> ```bash
> firebase deploy --only firestore:rules,storage
> ```
> If username save says it's "blocked by Firebase rules or configuration", the
> live rules are missing the `usernames` collection — deploy the rules.

## Deferred work

This phase does not add research APIs, notifications, followers, global feeds, payments, public media proof, Gemini evidence intelligence, citations or adaptive planning. It does not update Vercel variables, deploy live Firebase rules, or deploy production automatically. Those operational actions must be completed in the relevant dashboards or authenticated CLIs.
