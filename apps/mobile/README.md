# Learn Path Tracker — Mobile (Expo Foundation)

This is the **second skin** of Learn Path Tracker. The web app (repo root) is the
production app and the first skin. This mobile app is a React Native + Expo
**foundation only** — it is intentionally not a full MVP yet.

**One brain, two skins:** shared backend, data contracts, business rules and
privacy rules; separate web and mobile presentation layers. This foundation
reuses the shared API contract (generated from the root) and the Aurora visual
direction, but does **not** import any web DOM module (`src/views.js`,
`src/styles.css`, `src/header.js`, `index.html`).

## Status

- Placeholder screens for the planned mobile MVP (no real data).
- Aurora mobile theme (indigo = action/progress, green = proof, purple = peak).
- A safe API client seam pointing at the existing Vercel API contract.
- Generated API contract constants synced from `src/shared-api-contracts.js`.
- No Firebase, auth, real API calls, proof capture, or native modules yet.

## Structure

```
apps/mobile/
  App.js                      Expo entry point
  app.json                    Expo config (name: Learn Path Tracker)
  package.json                Mobile-only dependencies (Expo, React, RN)
  scripts/check-foundation.mjs  Offline foundation sanity check
  src/
    app/MobileApp.js          Tab-state shell (header + content + bottom tabs)
    theme/auroraTheme.js      Aurora colors/spacing/radius/layout tokens
    navigation/mobileTabs.js  Today / Paths / Discover / Progress / Profile
    screens/                  Placeholder screens
    services/env.js           Reads EXPO_PUBLIC_LEARN_PATH_API_BASE_URL
    services/apiClient.js     createApiClient transport seam
    shared/api-contracts.generated.js  Generated from the web brain
    shared/privacyRules.js    Mobile privacy rules
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_LEARN_PATH_API_BASE_URL` | Public base URL of the existing Vercel API. |

Copy `.env.example` to `.env.local` and adjust as needed. **Never commit `.env`
files, provider keys, Firebase service accounts, or signing credentials.**

## Generated API contracts

`src/shared/api-contracts.generated.js` is generated from the root and must not
be edited by hand. Regenerate from the **repo root**:

```bash
npm run generate:mobile-contracts
```

## Run locally

From the **repo root**, run the web tests and the contract generator. From this
directory, run mobile commands:

```bash
# from apps/mobile
npm install            # installs Expo/React Native (not committed)
npm run check:foundation   # offline sanity check, no services called
npm start              # start Expo dev server
```

If `npm install` cannot run due to network/environment constraints, the
`check:foundation` script still works because it has no dependencies.

## Verify without secrets

`npm run check:foundation` verifies the foundation file layout and the generated
contract header without touching Firebase, Vercel, Anthropic, Deepgram, or Expo
services.

## Deferred to later mobile phases

Firebase Auth, real sign-in, path loading, daily session sync, proof upload,
camera/photo/file pickers, offline drafts, push notifications, public progress
interactions, comments/reactions, moderation, AI builder, voice transcription,
EAS build config, native credentials, analytics, and store submission.

There are no leaderboards, followers, global feeds, or hearts/gems/shop economy.
The product is **not** renamed.
