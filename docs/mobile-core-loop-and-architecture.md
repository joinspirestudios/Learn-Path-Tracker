# Mobile Core Loop and Architecture

Phase 6.5 planning document. No mobile app is built yet.

> **Phase 6.10 update:** The isolated Expo mobile *foundation* now exists under
> [`apps/mobile`](../apps/mobile). It is a scaffold only — placeholder screens,
> the Aurora mobile theme, a safe API client seam, and generated API contracts.
> No full mobile MVP, authentication, or real data wiring is built yet. See
> [docs/mobile-app-foundation.md](mobile-app-foundation.md).
>
> **Phase 6.11 update:** The local **Mobile Core Loop MVP** is now implemented
> (Today → Daily Focus → Completion Result) on in-memory state, with a pure
> scoring/tier model that mirrors the web policy. See
> [docs/mobile-core-loop-mvp.md](mobile-core-loop-mvp.md).
>
> **Phase 6.12 update:** Mobile **auth, read-only cloud paths, roadmap, and
> discovery** are implemented with the Firebase client SDK (env-driven, no Admin
> SDK). Path data is read-only; no proof upload or day-log writes. See
> [docs/mobile-auth-paths-discovery.md](mobile-auth-paths-discovery.md).
>
> **Phase 6.13 update:** Mobile **day sync, text/link proof, and public progress
> publishing** are implemented. Finished days sync to the user's private cloud
> record; public progress publishes via the existing API, sanitized and explicit.
> See [docs/mobile-day-sync-proof-public-progress.md](mobile-day-sync-proof-public-progress.md).
>
> **Phase 6.14 update:** The server **public progress bridge** lets
> `/api/publish-progress` accept mobile-origin publishes (web enrollment first,
> then the mobile private day log for owned public/unlisted paths). See
> [docs/mobile-public-progress-server-bridge.md](mobile-public-progress-server-bridge.md).
>
> **Phase 6.15 update:** Shared **account/profile and path personalization** now
> exists — profiles (display name, username, bio, avatar, cover), owned-path
> banners, and public-safe shaping, with narrow profile-image Storage rules. See
> [docs/account-profile-path-personalization.md](account-profile-path-personalization.md).
>
> **Phase 6.16 update:** Mobile **media proof upload** (library image/PDF →
> owner-only evidence Storage) and **offline drafts** (AsyncStorage queue) are
> implemented. No camera/audio. See
> [docs/mobile-media-proof-offline-drafts.md](mobile-media-proof-offline-drafts.md).
> Next: **Phase 6.17 — Cross-Platform Notification System**.

## Product intent

A Duolingo/Strava-quality mobile app for proof-backed growth journeys. The native mobile experience should make the daily habit loop feel fast, focused and rewarding on a phone.

## One-brain/two-skins architecture

**One brain.** The existing Firebase project, Firestore data model, Firestore security rules, Firebase Authentication, Vercel API endpoints, AI path generation, Deepgram voice/transcription routes, daily-session scoring model, intensity policy model, schema versioning, public progress model, comments/reactions model, trust metrics model, moderation report model, discovery model and join-before-start access model remain the shared brain. Both skins call the same backend and Firebase project.

**Two skins.**

| Skin | Technology | Purpose |
| --- | --- | --- |
| Web | Vite + vanilla JS | Desktop/public web experience, Discover pages, owner/path management, daily focus web UI |
| Mobile (future) | React Native + Expo | Native daily habit loop, proof capture, mobile Discover, joined paths, mobile profile |

The future mobile app calls the same backend and Firebase project. It does not duplicate business logic in an incompatible way. It does not depend on `src/views.js` or any web presentation module.

### Shared brain modules

These modules contain pure domain logic with no DOM dependency and can transfer to the mobile app:

- `src/daily-session-model.js` — session phases, task scoring, completion checks, weighted progress
- `src/intensity-policy.js` — intensity levels, pass/strong/perfect thresholds, completion tiers
- `src/schema-versioning.js` — document schema versions, normalization, legacy detection
- `src/shared-api-contracts.js` — API endpoint constants, route groups, per-endpoint contracts, shared privacy constraints
- `src/shared-dtos.js` — privacy-safe DTO helpers for paths, progress, metrics, discovery, moderation
- `src/public-progress.js` — public progress entry sanitization and validation
- `src/discovery.js` — discovery state normalization, filter/sort defaults
- `src/discovery-pagination.js` — pagination state, cursor management
- `src/moderation.js` — moderation report structure and validation
- `src/journey.js` — enrollment, day log, streak, freeze, missed-day handling
- `src/store.js` — canonical state shape and accessors
- `src/routes.js` — route parsing and hash generation
- `src/helpers.js` — date helpers, safe URL validation, text utilities
- `src/urls.js` — URL protocol allowlist and sanitization
- `src/templates.js` — path template structure
- `src/ai-builder-model.js` — AI brief structure and normalization
- `src/ai-response.js` — AI response parsing and validation

See also [`docs/api-contracts.md`](api-contracts.md) for the full API contract reference with per-endpoint privacy, router, and mobile use case metadata.

### Web-only skin (must be rebuilt for mobile)

These modules are web presentation and cannot transfer:

- `src/views.js` — main web view coordinator, DOM rendering, event wiring
- `src/views/daily-session.js` — daily session HTML rendering
- `src/views/daily-session-evidence.js` — evidence form HTML
- `src/views/catalog/` — catalog/discovery HTML rendering and events
- `src/views/ai-builder/` — AI builder web UI modules
- `src/views/voice-input.js` — web voice input UI
- `src/header.js` — web header/navigation HTML
- `src/styles.css` — web CSS
- `index.html` — web entry point

## Mobile MVP scope

The first mobile MVP prioritizes the daily habit loop, not the full web dashboard.

### First mobile MVP includes

- Today screen — current day, daily focus entry, streak/continuity, score/tier state
- Daily Focus Session — one-task-at-a-time flow with the existing scoring engine
- Proof Upload — camera/photo library capture, file evidence submission
- Completion Result — score, tier, feedback after day completion
- Joined Paths — active enrollments, path detail, roadmap orientation
- Discover Preview — public paths, search/filter, trust metrics, join
- Basic Profile/Account — sign in/out, settings, notification preferences

### Deferred from first mobile MVP

- Full owner management and path editing
- Advanced public moderation dashboard
- Full AI builder redesign for mobile
- Large analytics dashboard
- Complex resource library
- Full 12-month map editor
- Craft ladder editor
- Deep desktop editing surfaces
- Push notifications (documented as future work)
- Adaptive planning
- Gemini/evidence intelligence

## Mobile core loop

```text
Open app
→ see Today
→ enter Daily Focus
→ complete one task at a time
→ upload proof when needed
→ see score/tier feedback
→ complete day when eligible
→ view result
→ optionally publish sanitized progress
→ return tomorrow
```

This is the center of the future native app.

## Mobile navigation model

### Bottom tabs

| Tab | Purpose |
| --- | --- |
| Today | Current day, daily focus entry, streak/continuity, score/tier state, resume session |
| Paths | Joined paths, owned paths, active path detail, roadmap orientation |
| Discover | Public paths, search/filter lightweight, public preview, join path, trust metrics |
| Progress | Personal completed days, proof timeline, streak history, public/private distinction |
| Profile | Account, settings, notification preferences, privacy controls, sign out |

## Mobile screen map

### AuthWelcomeScreen

- **Purpose**: Landing screen for unauthenticated users
- **Primary action**: Navigate to sign-in
- **Data required**: None
- **API calls**: None
- **Local state**: Auth state listener
- **Empty/error states**: Network unavailable message
- **Privacy**: No private data displayed

### SignInScreen

- **Purpose**: Firebase Authentication sign-in
- **Primary action**: Sign in with email/provider
- **Data required**: None
- **API calls**: Firebase Auth client SDK
- **Local state**: Loading/error state
- **Empty/error states**: Invalid credentials, network error
- **Privacy**: Credentials handled by Firebase SDK, never stored locally

### TodayScreen

- **Purpose**: Show current day status, streak, active session
- **Primary action**: Enter daily focus
- **Data required**: Active enrollment, current day log, streak count
- **API calls**: Firestore reads for enrollment/day log
- **Local state**: Selected path, day number
- **Empty/error states**: No active path (show join CTA), offline (show cached state)
- **Privacy**: Only the user's own enrollment data

### DailyFocusScreen

- **Purpose**: One-task-at-a-time daily practice
- **Primary action**: Mark task done, skip optional, upload proof
- **Data required**: Day tasks, day log, evidence submissions, intensity policy
- **API calls**: Firestore writes for task completion, `POST /api/sync-path-metrics`
- **Local state**: Current task index, session phase, save state, focus state
- **Empty/error states**: No tasks loaded (retry), save failure (retry with local draft)
- **Privacy**: Task details are private; only sanitized completion metadata can be published

### ProofCaptureScreen

- **Purpose**: Capture or select proof for evidence-required tasks
- **Primary action**: Take photo, select from library, or enter URL
- **Data required**: Task evidence requirements, proof type, accepted formats
- **API calls**: Firebase Storage upload, Firestore evidence submission write
- **Local state**: Capture mode, upload progress, proof preview
- **Empty/error states**: Permission denied (camera/library), upload failure (queue for retry)
- **Privacy**: Raw proof files are private; never exposed publicly without explicit publish

### CompletionResultScreen

- **Purpose**: Show day completion result, score, tier, feedback
- **Primary action**: View result, optionally publish progress
- **Data required**: Completed day log, score, tier, task summary, evidence count
- **API calls**: `POST /api/publish-progress` (optional)
- **Local state**: Publish state, animation state
- **Empty/error states**: Publish failure (retry option)
- **Privacy**: Only sanitized completion metadata is publishable; private reflections stay private

### JoinedPathsScreen

- **Purpose**: List joined and owned paths
- **Primary action**: Open path detail
- **Data required**: Enrollments, path metadata, progress summaries
- **API calls**: Firestore reads
- **Local state**: Selected path filter
- **Empty/error states**: No paths (show Discover CTA), offline (show cached paths)
- **Privacy**: Only the user's own paths and enrollments

### PathRoadmapScreen

- **Purpose**: Show path roadmap with day-by-day progress
- **Primary action**: Open a day's focus session
- **Data required**: Path definition, enrollment, all day logs
- **API calls**: Firestore reads
- **Local state**: Selected day, scroll position
- **Empty/error states**: Path not loaded (retry), day locked (show unlock criteria)
- **Privacy**: Full roadmap visible only to owner/joined member

### PublicPathPreviewScreen

- **Purpose**: Show public path preview for non-members
- **Primary action**: Join path
- **Data required**: Public path metadata, trust metrics, preview description
- **API calls**: Firestore read (public path), `POST /api/join-path`
- **Local state**: Join loading state
- **Empty/error states**: Path not found, private path rejection, rate limited
- **Privacy**: Only public metadata shown; no private enrollments, logs, or evidence

### DiscoverScreen

- **Purpose**: Browse and search public paths
- **Primary action**: Open path preview, join
- **Data required**: Public discoverable paths, discovery filters
- **API calls**: Firestore queries (public visibility), `POST /api/join-path`
- **Local state**: Search query, active filters, sort, pagination cursor
- **Empty/error states**: No paths found (adjust filters), offline (show cached)
- **Privacy**: Only public path metadata and aggregate trust metrics

### PublicProgressEntryScreen

- **Purpose**: View a public progress timeline entry
- **Primary action**: React, comment
- **Data required**: Public progress entry, reactions, visible comments
- **API calls**: `POST /api/react-progress`, `POST /api/comment-progress`
- **Local state**: Reaction state, comment draft
- **Empty/error states**: Entry not found, comment rate limited
- **Privacy**: Only sanitized public entry data; no private evidence URLs or reflections

### ProfileScreen

- **Purpose**: Account settings, preferences
- **Primary action**: Edit display name, manage notifications, sign out
- **Data required**: Firebase Auth user profile
- **API calls**: Firebase Auth profile update
- **Local state**: Edit state
- **Empty/error states**: Not signed in (redirect to auth)
- **Privacy**: User controls what is public via display name settings

### SettingsScreen

- **Purpose**: App settings, notification preferences, privacy controls
- **Primary action**: Toggle settings
- **Data required**: Current settings
- **API calls**: Firestore user preferences write
- **Local state**: Setting values
- **Empty/error states**: Save failure (retry)
- **Privacy**: Settings are private to the user

## API endpoint contract map

All endpoints use `POST` and require `Authorization: Bearer <firebase-id-token>` except where noted.

### POST /api/generate-path

- **Mobile use**: AI-powered path creation (deferred from first MVP)
- **Auth**: Required
- **Request**: `{ confirmedBrief, saveOptions: { visibility } }`
- **Response**: `{ ok, path, requestId }` or error
- **Privacy**: Brief content is not logged; only safe diagnostics
- **Offline**: Not available offline; requires network
- **Retry**: Safe to retry on timeout; server is idempotent for generation

### POST /api/interpret-goal

- **Mobile use**: AI goal interpretation (deferred from first MVP)
- **Auth**: Required
- **Request**: `{ goal, context }`
- **Response**: `{ ok, interpretation, requestId }` or error
- **Privacy**: Goal text is not logged server-side
- **Offline**: Not available offline
- **Retry**: Safe to retry on timeout

### POST /api/deepgram-token

- **Mobile use**: Obtain temporary Deepgram JWT for live voice transcription
- **Auth**: Required
- **Request**: `{}`
- **Response**: `{ ok, token, expiresAt, requestId }`
- **Privacy**: Permanent Deepgram key never returned; only temporary JWT
- **Offline**: Not available offline
- **Retry**: Safe to retry; tokens are short-lived

### POST /api/transcribe-voice

- **Mobile use**: Fallback audio transcription when live streaming is unavailable
- **Auth**: Required
- **Request**: Raw audio body (WebM/MP4/MP3/WAV/OGG, max 4 MB)
- **Response**: `{ ok, transcript, requestId }`
- **Privacy**: Audio is not stored server-side after transcription
- **Offline**: Not available offline; audio can be queued locally
- **Retry**: Safe to retry with same audio

### POST /api/join-path

- **Mobile use**: Join a public/unlisted path
- **Auth**: Required
- **Request**: `{ pathId }`
- **Response**: `{ ok, enrollmentId, requestId }` or error
- **Privacy**: Does not expose other members' data
- **Offline**: Not available offline; queue join intent locally
- **Retry**: Idempotent; re-joining returns existing enrollment

### POST /api/publish-progress

- **Mobile use**: Publish a sanitized completed-day entry to the public timeline
- **Auth**: Required
- **Request**: `{ pathId, dayNumber, caption }`
- **Response**: `{ ok, entryId, requestId }` or error
- **Privacy**: Only sanitized metadata published; no private evidence URLs
- **Offline**: Not available offline; queue publish intent locally
- **Retry**: Idempotent; re-publishing updates the existing entry

### POST /api/unpublish-progress

- **Mobile use**: Remove a published progress entry
- **Auth**: Required
- **Request**: `{ pathId, entryId }`
- **Response**: `{ ok, requestId }`
- **Privacy**: Deletes public mirror only; private day log stays intact
- **Offline**: Not available offline
- **Retry**: Idempotent

### POST /api/react-progress

- **Mobile use**: React to a public progress entry
- **Auth**: Required
- **Request**: `{ pathId, entryId, reaction }`
- **Response**: `{ ok, requestId }`
- **Privacy**: Reaction is public; linked to user display name
- **Offline**: Not available offline; queue locally
- **Retry**: Idempotent; repeated reactions are safe

### POST /api/comment-progress

- **Mobile use**: Comment on a public progress entry
- **Auth**: Required
- **Request**: `{ pathId, entryId, text }`
- **Response**: `{ ok, commentId, requestId }`
- **Privacy**: Comment text is bounded plain text; visible publicly
- **Offline**: Not available offline; queue locally
- **Retry**: Not idempotent; guard against duplicate submission

### POST /api/hide-progress-comment

- **Mobile use**: Hide a comment (own comment or path owner moderation)
- **Auth**: Required
- **Request**: `{ pathId, entryId, commentId }`
- **Response**: `{ ok, requestId }`
- **Privacy**: Hidden comments are no longer visible; not permanently deleted
- **Offline**: Not available offline
- **Retry**: Idempotent

### POST /api/report-path

- **Mobile use**: Report a public path for moderation
- **Auth**: Required
- **Request**: `{ pathId, reason, note }`
- **Response**: `{ ok, reportId, requestId }`
- **Privacy**: Report is private; only safe public snapshot stored
- **Offline**: Not available offline
- **Retry**: Rate limited; do not retry rapidly

### POST /api/report-progress-comment

- **Mobile use**: Report a public progress comment
- **Auth**: Required
- **Request**: `{ pathId, entryId, commentId, reason, note }`
- **Response**: `{ ok, reportId, requestId }`
- **Privacy**: Report is private; only short visible comment snippet stored
- **Offline**: Not available offline
- **Retry**: Rate limited

### POST /api/sync-path-metrics

- **Mobile use**: Sync path trust metrics after day completion or milestone
- **Auth**: Required
- **Request**: `{ pathId, event, dayNumber }`
- **Response**: `{ ok, requestId }`
- **Privacy**: Only aggregate counts updated; no private data exposed
- **Offline**: Not available offline; queue metric sync locally
- **Retry**: Idempotent; safe to retry

## Firebase/Auth mobile strategy

The mobile app uses the Firebase Auth client SDK for React Native (or `@react-native-firebase/auth`). After sign-in, the mobile app obtains a Firebase ID token and sends it as `Authorization: Bearer <token>` to all Vercel API routes. The server verifies tokens with Firebase Admin exactly as it does today.

Requirements:

- Mobile does not store Firebase Admin credentials
- Mobile does not store provider secrets (Anthropic, Deepgram)
- Mobile uses the same join-before-start rules
- Signed-out mobile users remain read-only for public previews
- Mobile does not bypass Firestore security rules
- Mobile uses the same rate limits enforced server-side
- Token refresh follows the same pattern: 401 triggers one forced refresh and one retry

### Mobile secret-handling rules

The mobile app must not commit:

- Firebase service account JSON or private keys
- Apple signing certificates or provisioning profiles
- Google Play signing keystores or credentials
- EAS tokens or build secrets
- Deepgram API keys
- Anthropic API keys
- Production `.env` files
- Real user data, day logs, evidence, or transcripts

## Mobile file and asset handling

### App assets (future)

- App icons: platform-specific sizes, generated from a single source
- Splash screen: simple branded loading screen
- Store screenshots: generated during release process, not committed as source
- Mobile-specific image assets stored in the Expo/RN asset pipeline

### User files

- Proof upload: images from camera/photo library, video, audio clips
- Temporary files: cleaned up after upload or session end
- Cache: managed by the OS and Expo file system
- Permission prompts: camera, photo library, microphone (for voice input)

### Rules

- Do not commit raw proof files or private user uploads
- Do not commit mobile signing credentials or EAS credentials
- Proof uploads use Firebase Storage with the same `storage.rules` access control
- Temporary recording files are discarded after transcription or cancellation

## Offline strategy (future work)

Not implemented in this phase. Planned approach:

- Daily session draft can be local-first; save task completion state to local storage
- Proof upload may queue until online; track pending uploads
- Completion should sync safely when connectivity returns
- Avoid duplicate metrics by using idempotent server endpoints
- Avoid duplicate public progress entries by checking existing entries before publish
- `schemaVersion` must protect legacy local state during migrations
- Enrollment and day log changes use the same local-first pattern as the web app

## Push notification strategy (future work)

Not implemented in this phase. Planned approach:

- Daily reminder: configurable time, nudge to start daily focus
- Streak reminder: warn before streak breaks
- Proof reminder: remind about pending evidence tasks
- Joined path activity: notify about public progress on joined paths (later)
- Comment/reaction notifications: notify when someone interacts with published progress (later)
- User-controlled notification settings in Profile/Settings screen
- Use Expo Notifications for cross-platform push
- Server-side push via Firebase Cloud Messaging or equivalent

## Future phase sequence

1. **Phase 6.6**: Expo project scaffold, navigation shell, auth flow
2. **Phase 6.7**: Today screen, daily focus session, proof capture
3. **Phase 6.8**: Joined paths, path roadmap, completion result
4. **Phase 6.9**: Discover, public preview, join flow
5. **Phase 6.10**: Progress timeline, reactions, comments
6. **Phase 6.11**: Profile, settings, notification preferences
7. **Phase 7.x**: Push notifications, offline session drafts, adaptive planning

## Design system foundation

Phase 6.8 defines the design system foundation that the future mobile skin will consume. The design tokens are platform-agnostic and can generate React Native StyleSheet values. Component contracts and screen composition models cover both mobile and desktop behavior. See:

- [`src/design-tokens.js`](../src/design-tokens.js) — semantic tokens for color, typography, spacing, radius, elevation, motion, state and accessibility
- [`src/design-system-contracts.js`](../src/design-system-contracts.js) — component contracts with mobile notes, screen composition model with mobile behavior
- [`docs/design-system-foundation.md`](design-system-foundation.md) — full design system thesis, mobile interaction baseline, Figma guidance

## What not to build yet

As of **Phase 6.10**, the Expo scaffold, an internal tab shell, placeholder
React Native screens, and the Aurora mobile theme now exist under `apps/mobile`.
The following are still intentionally deferred to later mobile phases:

- No native navigation library (Phase 6.11 evaluates this)
- No Android/iOS native project files
- No mobile build secrets or signing credentials
- No EAS build config
- No real authentication or data wiring
- No proof capture, camera, or file pickers
- No push notifications
- No adaptive planning
- No Gemini/evidence intelligence
- No full UI redesign
- No product renaming
