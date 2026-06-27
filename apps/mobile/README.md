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

**Phase 6.15.1 — profile runtime repair.** Web avatar/cover upload now works and
renders in the profile + side-nav; username errors are accurate (no false
"taken"). Mobile displays saved `avatarURL`/`coverURL` by URL and edits text only
(image upload is performed on web). Remember to deploy Firebase rules separately
(`firebase deploy --only firestore:rules,storage`) — Vercel does not.

**Phase 6.15 — account, profile and path personalization.** The Profile screen
shows a safe account summary (no token), a public profile card, and an editor for
display name / bio / website / public-profile visibility (username changes happen
on web). Path screens can display path banner images. No mobile image upload,
proof media, camera/audio/file pickers, or notifications were added. See
[docs/account-profile-path-personalization.md](../../docs/account-profile-path-personalization.md).

**Phase 6.14 — public progress server bridge.** The existing
`/api/publish-progress` route now accepts mobile-origin publishes: when there is
no web enrollment, the server reads the user's private mobile day log
(`users/{uid}/mobileDayLogs`) for an owned public/unlisted path and writes a
sanitized public entry. The mobile client still sends only
`{ pathId, dayNumber, publicCaption }`. See
[docs/mobile-public-progress-server-bridge.md](../../docs/mobile-public-progress-server-bridge.md).

**Phase 6.13 — day sync, text/link proof and public progress.** Signed-in users
can finish a local day, add private text/link proof, **sync** the finished day to
their private cloud record (`users/{uid}/mobileDayLogs`, idempotent), and
**explicitly publish** a sanitized public progress summary via the existing
`/api/publish-progress` route. Proof is private and "submitted" (never
"verified"). No media/file/camera/audio upload, no offline drafts, no
notifications, no comments/reactions, no mobile join. See
[docs/mobile-day-sync-proof-public-progress.md](../../docs/mobile-day-sync-proof-public-progress.md).

**Phase 6.12 — auth, cloud paths and discovery (read-only).** Firebase client
auth gate, owned cloud path loading, read-only roadmap, public discovery +
preview. See [docs/mobile-auth-paths-discovery.md](../../docs/mobile-auth-paths-discovery.md).

**Phase 6.11 — local core loop MVP.** The app runs a local, functional core loop
(Today → Daily Focus → Completion Result) on in-memory React state.

- Local-only core loop: start a day, do one task at a time, add text proof/reflection where required, finish the day, see a score/tier result.
- Pure model in `src/core/` (`mobileCoreLoop.js`, `mobileScoring.js`, `mobileSessionState.js`); tiers mirror the web balanced policy.
- Aurora mobile components in `src/components/`.
- Aurora mobile theme (indigo = action/progress, green = proof, purple = peak).
- A safe API client seam pointing at the existing Vercel API contract (not called by screens yet).
- Generated API contract constants synced from `src/shared-api-contracts.js`.
- No Firebase, auth, real API calls, proof file upload, camera/file picker, or native modules yet.

## Structure

```
apps/mobile/
  App.js                      Expo entry point
  app.json                    Expo config (name: Learn Path Tracker)
  package.json                Mobile-only dependencies (Expo, React, RN)
  scripts/check-foundation.mjs  Offline foundation sanity check
  src/
    app/MobileApp.js          Tab-state shell + local core-loop wiring
    core/mobileCoreLoop.js    Pure local Today->Focus->Completion model
    core/mobileScoring.js     Pure score/tier logic (web-parity)
    core/mobileSessionState.js  Local starter path + session constants
    components/                Aurora RN components (card/button/progress/etc.)
    theme/auroraTheme.js      Aurora colors/spacing/radius/layout tokens
    navigation/mobileTabs.js  Today / Paths / Discover / Progress / Profile
    screens/                  Core-loop + placeholder screens
    services/env.js           Reads EXPO_PUBLIC_LEARN_PATH_API_BASE_URL
    services/apiClient.js     createApiClient transport seam (not called yet)
    shared/api-contracts.generated.js  Generated from the web brain
    shared/privacyRules.js    Mobile privacy rules
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_LEARN_PATH_API_BASE_URL` | Public base URL of the existing Vercel API. |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Public Firebase client API key. |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain. |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project id. |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket. |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender id. |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | Firebase app id. |

These `EXPO_PUBLIC_FIREBASE_*` values are **public Firebase client config**, not
Admin secrets. Copy `.env.example` to `.env.local` and adjust as needed. **Never
commit `.env` files, provider keys, Firebase service accounts, or signing
credentials.** If Firebase config is absent, the app shows a safe
"cloud not configured" state and still offers the local demo.

Auth session persistence is limited in this phase (in-memory); durable
AsyncStorage-backed persistence is deferred to a later phase.

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

## Notifications (Phase 6.17)

In-app notification center + preferences (reached from Profile): mark read/all,
clear, and per-category toggles (in-app, daily reminder + time, streak-risk,
proof upload, public-progress interactions, quiet hours). Local reminders use
`expo-notifications` and are **opt-in** — the OS permission prompt only appears
when the user enables mobile reminders. **Remote mobile push is deferred** (no
Expo push token, no store credentials). Notifications live in owner-only
`users/{uid}/notifications` and never include private proof, reflections,
evidence URLs, Storage paths or tokens. See
[`docs/cross-platform-notification-system.md`](../../docs/cross-platform-notification-system.md).

Phase 6.17.1 added **web** browser-push delivery (`web-push` on the server) — it
does not touch the mobile app. Remote **mobile** push remains deferred.

## Adaptive planning (Phase 7.0)

Profile → Adaptive planning shows a deterministic, explainable adaptation draft
(`MobileAdaptivePlanningCard` / `AdaptivePlanningScreen`) for the active path:
why it was suggested + the suggested adjustments. Mobile is **review/dismiss
only** — applying is done on web ("Review on web"). Nothing is applied
automatically, completed/missed days are never rewritten, and the request sends
only structured, non-private context. See
[`docs/rolling-adaptive-planning.md`](../../docs/rolling-adaptive-planning.md).

## Evidence intelligence (Phase 8.0)

Profile → Evidence intelligence shows a compact `MobileEvidenceInsightCard`
(`EvidenceInsightsScreen`): proof coverage summary + top documentation
suggestions + the disclaimer. It is **advisory only** — it never claims proof is
"verified", never scores truth/fraud, and never reads image content. Mobile is
**review/dismiss only** (publishing/review is on web), Daily Focus is untouched,
and the request sends only structured, non-private context. Phase 8.0.1 repaired
the web/server proof source so real submitted proof is reflected; mobile context
remains safe-fields-only. See
[`docs/evidence-intelligence.md`](../../docs/evidence-intelligence.md).

## Store readiness & beta QA (Phase 6.18)

Production-minded Expo config (stable name/slug, `learnpathtracker` scheme, iOS
bundle id `com.joinspirestudios.learnpathtracker`, matching Android package,
camera/photo/notification permission copy, no location/contacts/microphone). New
modules: a safe deep-link parser (`mobileDeepLinks`), environment/readiness checks
+ runtime diagnostics, an **App diagnostics** screen (Profile → App diagnostics;
status labels only), an app-level **error boundary**, and a store-readiness gate
model. A credential-free `eas.json` and [`eas-readiness.md`](eas-readiness.md)
document EAS builds; the manual matrix lives in
[`docs/mobile-store-readiness-beta-qa.md`](../../docs/mobile-store-readiness-beta-qa.md).
**No store submission and no credentials are committed.** Copy
[`.env.example`](.env.example) → `.env` (public `EXPO_PUBLIC_*` values only).

## Deferred to later mobile phases

Remote push notifications and Expo push tokens, AI builder, voice transcription,
EAS build config, native credentials, analytics, and store submission.

There are no leaderboards, followers, global feeds, or hearts/gems/shop economy.
The product is **not** renamed.
