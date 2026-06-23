# Mobile Auth, Cloud Paths, Roadmap and Discovery (Phase 6.12)

Phase 6.12 introduces the first real mobile connection to the shared platform
brain: Firebase client auth, read-only cloud path loading, a read-only roadmap
view, public discovery, and public path preview. It stays **read-only** for path
data — no proof upload, no day-log writes, no public-progress publish.

> **Phase 6.13 update:** The first mobile write path now exists — finished-day
> sync to the user's private cloud record, private text/link proof, and explicit
> sanitized public progress publishing. See
> [mobile-day-sync-proof-public-progress.md](mobile-day-sync-proof-public-progress.md).
>
> **Phase 6.14 update:** The server bridge lets `/api/publish-progress` accept
> mobile-origin publishes from the private mobile day log. See
> [mobile-public-progress-server-bridge.md](mobile-public-progress-server-bridge.md).

## Scope

- An auth gate: signed-out users see a real `AuthWelcome`; signed-in users reach
  the mobile tab shell.
- Firebase **client** config from `EXPO_PUBLIC_*` env vars (never Admin SDK).
- Read the authenticated user; load owned cloud paths; load public discoverable
  paths; open a public path preview; open a read-only roadmap; select a cloud
  path as the active mobile context.
- Daily Focus stays **local-only**. Starting a day from a cloud path would create
  an unsynced local session copy, clearly labeled "not synced".

## One brain, two skins

Mobile reuses the shared backend: Firebase Auth, Firestore path data (collection
`paths` with `sections`/`tasks` subcollections), path visibility rules, and proof
privacy rules. The mobile UI remains a separate React Native presentation layer.

## Firebase client configuration

`apps/mobile/src/services/firebaseConfig.js` + `firebaseClient.js` initialize the
Firebase **client** SDK lazily (via dynamic `import()`), so importing the module
performs no network and works in tests. The SDK loader is dependency-injectable,
so tests run against mocks and never contact Firebase. The Admin SDK is never
imported into mobile.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_LEARN_PATH_API_BASE_URL` | Public Vercel API base URL |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Public Firebase client API key |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project id |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender id |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase app id |

These are **public client config values**, not secrets. Never commit `.env`
files, Firebase service-account JSON, or any provider keys. Copy `.env.example`
to `.env.local`.

If required Firebase config is missing, mobile shows a clear "Mobile cloud
connection is not configured" state and offers the local demo — it never crashes.

## Auth behavior

`authService.js` (`createMobileAuthService`) supports `subscribeAuthState`,
`signIn`, `createAccount`, `signOut`, and `getIdToken` (for future protected API
calls). Errors map to safe, user-facing messages; Firebase error codes, tokens,
email, and password are never logged. Only email/password auth is supported in
this phase (no OAuth, no password reset).

**Auth session persistence note:** this phase uses the default in-memory auth
instance (`getAuth`). Durable, AsyncStorage-backed session persistence is
intentionally deferred to a later mobile phase, so `@react-native-async-storage/
async-storage` is **not** a dependency yet. Sessions may not survive a full app
restart until then.

## Path loading behavior

`pathRepository.js` is read-only. `listUserPaths({ uid })` loads **owned** paths
(`paths` where `ownerId == uid`) and normalizes them through `mobilePathMappers`.
Joined/enrolled membership loading is **pending** (documented here) and will land
with cloud day sync. Empty/loading/error states are honest. Private paths are not
shown to signed-out users; private evidence URLs are never exposed.

## Discovery behavior

`discoveryRepository.js` loads only public + discoverable paths (`visibility ==
'public'` and `discoverable !== false`). Search/filter is applied locally to the
loaded set. No private/unlisted paths, no vanity counts, no social-graph
features, no public-progress feed, and no joining. If Firebase config is missing,
Discover shows "Cloud discovery is not configured yet."

## Roadmap behavior

`roadmapRepository.js` + `mapRoadmap` load a path plus its `sections` and `tasks`
and produce a safe, read-only roadmap. Sections become roadmap blocks; tasks are
grouped by `sectionId` (falling back to a single block). No dates, progress, or
completion are invented, and raw evidence URLs are never exposed.

## Local session copy rule

Daily Focus remains the Phase 6.11 local loop. Selecting a cloud path sets the
mobile context, but starting a day there would only create an **unsynced local
session copy**, labeled "Local session copy — not synced yet." Cloud daily
sessions arrive in Phase 6.13.

## What remains local-only

The Today → Daily Focus → Completion Result loop, including text proof and
reflections, stays on-device. Nothing is written to Firestore in this phase.

## Intentionally deferred (Phase 6.13+)

Proof capture/upload, camera, file picker, audio/voice, day-log writes, public
progress publish, comments/reactions, moderation writes, mobile join/enrollment,
push notifications, analytics, and durable auth persistence. No leaderboards,
followers, rankings, or hearts/gems/shop economy. The product is not renamed.

## Testing strategy

`tests/phase-6.12-mobile-auth-paths-discovery.test.js` uses dependency injection
and mocked SDK/gateway objects — no live Firebase/Vercel/Anthropic/Deepgram/Expo
calls. It verifies env helpers, lazy client setup, the auth service surface and
safe error mapping, read-only repositories, mapper privacy (evidence stripped),
screen states (source-level), and the absence of forbidden behavior.

## Privacy rules

See `apps/mobile/src/shared/privacyRules.js`: client SDK only; no Admin SDK in
mobile; ID tokens, email, and password are never logged; private evidence URLs,
reflections, raw audio, and transcripts are never rendered; discovery shows only
public metadata; this phase is read-only for path data.
