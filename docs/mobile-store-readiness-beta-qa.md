# Mobile Store Readiness & Beta QA (Phase 6.18)

This phase makes the Expo mobile app **ready for real beta testing** — production
-minded config, permission copy, deep linking, in-app diagnostics, an error
boundary, store-readiness gates, and this manual QA matrix. It does **not** build,
sign, or submit to any store, and adds no store credentials.

> **Do not proceed to store submission until this checklist is manually run.**

See also [`apps/mobile/eas-readiness.md`](../apps/mobile/eas-readiness.md) for the
EAS build steps and [`apps/mobile/.env.example`](../apps/mobile/.env.example) for
environment setup.

## 1. Environment setup

- Install root deps and `cd apps/mobile && npm install`.
- Copy `apps/mobile/.env.example` → `apps/mobile/.env` and fill **public**
  `EXPO_PUBLIC_*` values only (no secrets, no service-account fields).
- Confirm `EXPO_PUBLIC_LEARN_PATH_API_BASE_URL` points at the deployed web API.

## 2. Expo Go test

- `cd apps/mobile && npm start`, open in Expo Go.
- App name shows "Learn Path Tracker"; app boots to the Today tab.

## 3. Android emulator test

- Launch an Android emulator (API 34+), press `a` in the Expo CLI.
- Verify layout, tab bar, and back navigation.

## 4. Physical Android test

- Scan the QR with Expo Go on a real device; verify camera/photo permission
  prompts appear only when used.

## 5. Physical iPhone test

- Open in Expo Go (or a dev build); verify permission prompts use the product
  copy from `app.json` (camera/photo library).

## 6. Auth QA

- Sign up, sign out, sign in. Invalid credentials show a safe error.
- ID token is never displayed anywhere.

## 7. Path loading QA

- Joined/owned paths load; discovery shows public paths; roadmap opens.

## 8. Daily Focus QA

- Start today, advance/return through tasks, finish the day.

## 9. Text/link proof QA

- Add text proof and a link proof; both stay private by default.

## 10. Image proof library QA

- Choose a photo from the library; the picker permission is requested on tap.

## 11. Image proof camera QA

- Take a photo; the camera permission is requested on tap; image-only types.

## 12. Offline draft / retry QA

- Toggle airplane mode mid-upload; the draft queues; retry succeeds when online.

## 13. Day sync QA

- Sync a finished day; sync is blocked while a required upload is still pending.

## 14. Public progress publish QA

- Publish a completed day; only sanitized metadata is published (no private proof).

## 15. Public proof timeline QA

- The public timeline shows sanitized entries only; no evidence URLs/paths.

## 16. Profile / avatar / cover QA

- Edit display name/username/bio; avatar/cover changes persist (web upload path).

## 17. Notifications QA

- Open Profile → notifications; mark read / mark all / clear; preferences save.

## 18. Browser push (web) QA

- On the web app: Profile → Notifications → Enable browser push (HTTPS), accept
  permission, **Save preferences** (confirm "Preferences saved."), then **Send
  test notification** and read the result (sent, or a safe disabled reason). Push
  is never requested automatically. The signed-in shell shows a visible **Sign
  out** (sidebar + Account card). See
  [cross-platform-notification-system.md](cross-platform-notification-system.md)
  (Phase 6.18.1 web repair).

## 19. Mobile local notification QA

- Enable mobile reminders → OS permission requested only then; set a reminder
  time; disable cancels it. Quiet hours suppress reminders.

## 20. Permission denial QA

- Deny camera/photos/notifications; the app degrades safely with clear copy and
  never crashes or loops the prompt.

## 21. Slow network QA

- Throttle the network; loading/empty/error states render; no hangs.

## 22. Signed-out state QA

- Signed out: no diagnostics/readiness UI is exposed; auth screen is shown.

## 23. Privacy / security QA

- App diagnostics show **status labels only** — no API keys, ID tokens, Storage
  paths, or private proof. Logs contain no secrets or proof/reflection text.

## 24. Regression checklist

- Re-run sections 6–19 after any change. Confirm web `npm test`, `npm run build`,
  `npm run test:rules`, and the mobile foundation check all pass.

## 25. Known limitations

- Remote **mobile** push is deferred (no Expo push token, no store credentials).
- Automatic cron reminder delivery is deferred (web scheduler is a stub).
- Store icons/splash/screenshots are not committed as binaries in this phase.
- No store submission is performed; credentials are EAS-managed, never committed.

## Preliminary data-safety inventory

What the app handles (used only to provide the product experience):

| Category | Examples | Notes |
| --- | --- | --- |
| Account info | email, display name, username, profile image | email never shown publicly |
| User-generated content | paths, proof notes, images, comments | private by default |
| Photos / media | proof images, profile/cover/banner images | chosen by the user only |
| Notifications | push subscriptions, preferences | used only for notifications |
| Usage / progress | day logs, proof counts, streaks | drives the proof-of-growth loop |

Disclosures:

- Data is used to provide the product experience.
- Private proof is **not** sold.
- Private proof is **not** exposed publicly unless the user's/path's visibility
  allows it.
- Push subscriptions are used **only** for notifications.
- Camera/photo library are accessed **only** when the user chooses proof images.

## Store-readiness gates

The pure model `apps/mobile/src/core/mobileStoreReadinessGates.js` tracks gate
status (checklist only — it never auto-submits):

- **Internal beta** requires: manual mobile QA completed, production env
  configured, Firestore + Storage rules deployed, crash/error handling present,
  notification opt-in reviewed, image proof tested on device, no secrets committed.
- **Store submission** requires all beta gates **plus**: privacy policy available,
  terms available, app icon/splash reviewed, permission copy reviewed.

## Rollout after this phase

- **Phase 6.9.12 — Full Web UI/UX Review: Aurora / Proof Ledger Final System** (next)
- **Phase 7.0 — Rolling Adaptive Planning**
- **Phase 8.0 — Evidence Intelligence**
- **Phase 9.0 — Research and Resource Intelligence**
- **Phase 10.0 — Launch, Growth, Beta Ops and Distribution**
