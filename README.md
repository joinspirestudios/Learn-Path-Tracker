# Learn Path Tracker

Learn Path Tracker is a Vite + Firebase proof-of-growth app for creating learning paths, habits, challenges, and personal-development roadmaps. It supports local mode, platform paths, creator attribution, enrollments, day logs, streaks, freezes, evidence, templates, and an optional Anthropic-powered AI path builder.

Phase 5.3 adds a guided daily evidence session on top of responsive guided path creation and the protected Phase 5 AI and transcription routes. The web app guides users through goal entry, adaptive clarification, path creation, daily agenda review, evidence preparation, one-task-at-a-time completion, pending tasks, and day completion. Live web research is not part of this phase.

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

Voice transcription, goal interpretation, and roadmap generation use independent request tokens and abort controllers, but paid operations cannot run concurrently. Starting one disables conflicting paid actions and duplicate submission controls. Closing the builder aborts all active requests, invalidates their tokens, clears loading state, and prevents stale responses from mutating or reopening the modal.

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

## Unified voice input

Eligible path-creation text fields include an inline microphone button. Tap the microphone, speak naturally, tap Stop, and transcription starts automatically. The resulting text is inserted directly into the active field at the saved cursor or selection, then the normal field remains editable. Multiple clips can be added to the same field without replacing existing text unless text was deliberately selected.

Voice input is available for useful natural-language fields in goal entry, clarification text answers, resource title and note fields, rhythm adjustments, brief review, and high-level roadmap review fields. It is intentionally excluded from URLs, dates, numbers, selectors, booleans, authentication fields, and repeated generated task rows so the interface stays calm.

Only one microphone session can run at a time. Recording, stopping, and transcribing states are shown inline with a timer, compact waveform, Stop/Cancel controls, retry where possible, and polite status messages. Interpretation, generation, and saving remain deliberate user actions and are blocked while voice recording or transcription is active.

### Voice limits and privacy

Maximum recording duration: 120 seconds. Maximum upload payload: 4 MB. Recordings may stop automatically at the safe duration or byte threshold.

Raw voice audio is temporary. It is sent only to the authenticated transcription route and its configured transcription provider. It is not stored in the user's path, Firestore, Firebase Storage or local browser persistence. Transcription requires authentication and a network connection; users can always continue by typing.

Phase 5.4 does not add live streaming transcription, evidence analysis, adaptive planning, animated goal suggestions, domain-specific clarification or path intensity.

## Guided Daily Session

Opening an active journey day now starts with Today's Agenda instead of the old long-scroll task and proof form. The agenda shows required task count, optional task count, evidence-required count, estimated effort when task durations exist, a concise task preview, and saved progress when the session is being resumed.

If any task requires proof, the next step is an evidence preparation summary. It lists the tasks that need proof and the supported proof style already stored on the task model. Users can start the session without gathering every proof item first.

The active session shows one task at a time with progress, title, description, criteria, estimate when available, required/optional status, resource link, evidence state, and focused actions. Required tasks without evidence can be marked done or left as `Not done yet`. Required tasks with evidence must use the existing evidence submission system before they become complete. Optional tasks can be marked done, skipped, or left for later.

`Not done yet` keeps a task unresolved and pending; it does not count toward progress and pending required tasks block day completion. `Skip optional task` resolves an optional task as skipped, does not count as completed work, and does not block day completion.

Every meaningful session action saves immediately through the existing local-first day-log path and Firestore sync path: session start, task completion, evidence submission, reflection, optional skip, pending mark, agenda/review navigation, and completion. Refreshing or reopening the day derives the session from canonical day-log fields plus the additive session fields, so legacy logs still open without migration.

### Completion semantics

Required progress is calculated as resolved required tasks divided by total required tasks. Optional tasks are displayed separately and never inflate the required progress percentage. Evidence-required tasks count only when the canonical verified task state exists; evidence records alone do not fake completion.

Day completion still uses the existing journey completion flow for status, streak, missed-day recovery, freeze handling, and next-day availability. The guided session only prepares the day log for that canonical completion write.

Completed days open as a concise summary with required task count, optional completion/skips, evidence count, and existing evidence history. Phase 5.3 does not analyse evidence or adapt future roadmap days. It creates the structured daily-session and evidence foundation for later adaptive-planning phases.

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

Override them with positive integers:

```text
RATE_LIMIT_INTERPRET_PER_HOUR
RATE_LIMIT_GENERATE_PER_HOUR
RATE_LIMIT_TRANSCRIBE_PER_HOUR
RATE_LIMIT_INTERPRET_BURST_PER_10_MINUTES
RATE_LIMIT_GENERATE_BURST_PER_10_MINUTES
RATE_LIMIT_TRANSCRIBE_BURST_PER_10_MINUTES
```

Counters are stored by Firebase Admin in `_internalRateLimits`. Each user/route uses one rolling document with `expiresAt`, so document growth is bounded. Client Firestore rules explicitly deny all access. For automatic cleanup, enable a Firestore TTL policy on the `expiresAt` field for the `_internalRateLimits` collection group.

## Protected API routes

These routes require `Authorization: Bearer <firebase-id-token>`:

- `POST /api/interpret-goal`
- `POST /api/generate-path`
- `POST /api/transcribe-voice`

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

`vercel.json` sets Node serverless maximum durations for the protected API routes:

```text
api/interpret-goal.js: 120 seconds
api/generate-path.js: 240 seconds
api/transcribe-voice.js: 90 seconds
```

Voice transcription accepts WebM, MP4, MP3, WAV, or OGG audio up to 4 MB. Inline browser recording stops at 120 seconds or near the safe byte threshold before upload.

Authentication, declared-size validation, and the per-user voice rate limit run before the audio body is buffered. The stream is still counted while reading and is terminated when it exceeds 4 MB, so a missing or inaccurate `Content-Length` cannot bypass the limit.

## AI brief integrity

Build with AI first creates one canonical brief. Clarification questions have stable IDs and target fields. Answers are merged into those fields in application code before Claude enriches the brief. User-entered and answered fields are recorded in `confirmedFields` and cannot be silently overwritten by the model.

Material uncertainty is represented as visible assumptions. Every material assumption must be accepted, edited, or removed before roadmap generation. Missing level or intensity remains unknown; the server no longer inserts hidden `beginner` or `moderate` defaults. The generation route rejects unconfirmed briefs.

Roadmap generation accepts one canonical `confirmedBrief` plus `saveOptions.visibility`. Legacy duplicate content fields are ignored only when they exactly match the canonical brief; conflicting duplicates are rejected.

No route performs web research, verifies resource URLs, or creates citations.

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
    provider.js
    rate-limit.js
    require-auth.js
  generate-path.js
  interpret-goal.js
  transcribe-voice.js
src/
  api.js
  ai-builder-model.js
  auth.js
  db.js
  firebase.js
  journey.js
  main.js
  ai-timeouts.js
  views.js
tests/
  anthropic-streaming.test.js
  api-security.test.js
  firestore.rules.test.js
  generation-reliability.test.js
  latency-logging.test.js
  phase5.model.test.js
  timeout-alignment.test.js
```

`api/analyze.js` was removed because it was an unused public diagnostic surface.

## Deferred work

This phase does not add research APIs, comments, notifications, payments, or a social feed. It does not update Vercel variables, deploy live Firebase rules, or deploy production automatically. Those operational actions must be completed in the relevant dashboards or authenticated CLIs.
