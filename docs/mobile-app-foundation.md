# Mobile App Foundation (Phase 6.10)

Phase 6.10 starts the **second skin** of Learn Path Tracker: a React Native +
Expo mobile foundation under [`apps/mobile`](../apps/mobile). It is intentionally
**not** a full mobile MVP — it is a safe, isolated scaffold that later mobile
phases (6.11–6.14) build on.

## One brain, two skins

The product follows **one brain, two skins**:

- **Shared brain:** backend, data contracts, business rules, scoring, schema
  versioning, and privacy rules.
- **Two skins:** the web presentation layer (repo root) and the mobile
  presentation layer (`apps/mobile`).

The web app remains the production app. Mobile reuses the shared API contract
(generated, not duplicated) and the Aurora visual direction, but is a fully
separate presentation layer.

## Why mobile is separate from the web DOM views

Web views (`src/views.js`, `src/styles.css`, `src/header.js`, `index.html`) are
DOM/CSS specific and cannot run in React Native. The mobile foundation therefore
**must not import** any of them. Shared logic and contracts are reused only
through pure, platform-agnostic modules (e.g. `src/shared-api-contracts.js` via
generation).

## apps/mobile structure

```
apps/mobile/
  App.js                          Expo entry → renders MobileApp
  app.json                        Expo config (name: Learn Path Tracker)
  package.json                    Mobile-only deps (expo, react, react-native)
  .env.example                    Documents EXPO_PUBLIC_LEARN_PATH_API_BASE_URL
  .gitignore                      Ignores node_modules, env, credentials
  scripts/check-foundation.mjs    Offline foundation sanity check
  src/
    app/MobileApp.js              Tab-state shell: header + content + bottom tabs
    theme/auroraTheme.js          Aurora colors / spacing / radius / layout
    navigation/mobileTabs.js      Today / Paths / Discover / Progress / Profile
    screens/                      11 placeholder screens + shared scaffold
    services/env.js               Reads the public API base URL env var
    services/apiClient.js         createApiClient transport seam
    shared/api-contracts.generated.js  Generated from the web brain
    shared/privacyRules.js        Mobile privacy rules
```

## Expo foundation status

- Expo + React + React Native only. No React Navigation, Expo Router, Firebase,
  camera, file picker, notifications, analytics, or native modules.
- A simple internal tab-state shell drives navigation (no routing library yet).
- Placeholder screens render honest "not connected yet" copy — no real data and
  no fake metrics.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_LEARN_PATH_API_BASE_URL` | Public base URL of the existing Vercel API. |

No secrets live in source. `.env` files, provider keys, Firebase service
accounts, and signing credentials are never committed. Copy `.env.example` to
`.env.local` for local development.

## API client seam

`src/services/apiClient.js` exposes `createApiClient({ baseUrl, getIdToken, fetchImpl })`:

- Joins `baseUrl + endpoint` safely (no double slashes).
- Sends/receives JSON.
- Attaches `Authorization: Bearer <token>` **only** when `getIdToken` is
  provided; tokens are never stored in the module.
- Never logs tokens or request bodies (which may carry private proof/reflection
  text).
- Throws structured, message-only errors.

Placeholder screens do not call it yet. No test calls live services.

## Generated mobile contracts

`scripts/generate-mobile-contracts.mjs` imports `src/shared-api-contracts.js`
and writes `apps/mobile/src/shared/api-contracts.generated.js` with
`API_ENDPOINTS`, `API_ROUTE_GROUPS`, `API_CONTRACTS`, and
`SHARED_PRIVACY_CONSTRAINTS`, plus a "do not edit by hand" header. The Phase 6.10
test suite asserts the generated contracts match the root source of truth and
that endpoint paths are unchanged.

Regenerate from the repo root:

```bash
npm run generate:mobile-contracts
```

## Aurora mobile theme

`src/theme/auroraTheme.js` is a React Native-safe object (no CSS imports):

- Indigo `#6D5DF6` — primary action / progress
- Green `#2ED06E` — proof / success / Strong tier
- Purple `#B15CF6` — peak / Perfect tier
- Coral `#FB5B5B` — danger / report
- Deep neutral-violet surfaces, high-contrast near-white text
- Gold is **not** a primary accent
- Spacing, radius, and layout token scales for mobile

## Screens created

`AuthWelcomeScreen`, `TodayScreen`, `DailyFocusScreen`, `CompletionResultScreen`,
`PathsScreen`, `PathRoadmapScreen`, `DiscoverScreen`, `PublicPathPreviewScreen`,
`ProgressScreen`, `ProfileScreen`, `SettingsScreen` (plus a shared
`PlaceholderScreen` scaffold).

## Intentionally deferred

Firebase Auth, real sign-in, path loading, daily session sync, proof upload,
camera/photo/file pickers, offline drafts, push/streak notifications, mobile
public progress interactions, comments/reactions, moderation flows, AI builder,
voice transcription, adaptive planning, evidence intelligence, EAS build config,
native credentials, analytics, and store submission. There are no leaderboards,
followers, global feeds, or hearts/gems/shop economy. The product is not renamed.

These map to the future mobile phases:

- **Phase 6.11 — Mobile Core Loop MVP**
- **Phase 6.12 — Mobile Paths, Roadmap and Discovery**
- **Phase 6.13 — Mobile Proof, Public Progress and Community**
- **Phase 6.14 — Mobile Retention, Offline Drafts and Store Readiness**

Remaining web visual polish is parked in
[aurora-ui-feedback-backlog.md](aurora-ui-feedback-backlog.md) for a dedicated
web-polish phase (6.9.12), not handled here.

## How to run mobile locally

```bash
# from apps/mobile
npm install              # installs Expo/React Native (not committed)
npm run check:foundation # offline sanity check (no services called)
npm start                # Expo dev server
```

## How to verify without secrets

`npm run check:foundation` (from `apps/mobile`) verifies the foundation file
layout and the generated-contract header without touching Firebase, Vercel,
Anthropic, Deepgram, or Expo services. From the repo root,
`npm run generate:mobile-contracts` and `npm test` exercise contract sync and the
foundation tests.
