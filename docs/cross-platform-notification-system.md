# Cross-Platform Notification System (Phase 6.17)

Phase 6.17 adds a behavior-supporting notification system across web and mobile,
with strict per-user preference controls. It supports the proof-of-growth loop
(start/finish a day, upload pending proof, streak risk, public-progress
interactions, path milestones) — **not** social spam. No followers/following,
leaderboards, rankings, hearts/gems, shop economy, DMs, email or SMS providers,
analytics SDKs, or app-store work are added.

## Scope

- **In-app notification center** (web + mobile): unread/read, mark read, mark all
  read, archive/clear, empty state.
- **Notification preferences** (web + mobile): in-app, browser push, daily
  reminder + time, streak-risk, missed-day, proof-upload, public-progress
  interaction, moderation updates, and **quiet hours**.
- **Browser push** (web): opt-in only, via the Web Push API + a service worker,
  sent through the existing consolidated community router. Degrades gracefully
  when VAPID keys are not configured.
- **Mobile local notifications**: opt-in on-device daily reminders via
  `expo-notifications`. **Remote mobile push is deferred** (no store credentials,
  no Expo push token).

## Notification types

```
daily_reminder            proof_upload_pending     public_progress_reaction
streak_risk               proof_upload_failed      public_progress_comment
missed_day                day_synced               moderation_update
freeze_available          public_progress_published path_milestone
system
```

Unknown types are rejected (`isAllowedNotificationType`) and collapse to `system`
on normalization.

## Data model + locations

Notifications and preferences live in the **owner-only** user space:

```
users/{uid}/notifications/{notificationId}
users/{uid}/notificationPreferences/main
users/{uid}/pushSubscriptions/{subscriptionId}
```

`src/notification-model.js` normalizes and **sanitizes** every notification:
titles/bodies are scrubbed of emails, `file://`/`gs://`/proof-media paths,
inline base64, and JWT-looking tokens; forbidden fields (proof body, reflection,
evidence URL, Storage path, download URL, token, password, email, …) are dropped.
`notificationPublicSafeView` is the only projection any UI renders — it excludes
`uid`, entity ids and source ids.

Preferences (`src/notification-preferences-model.js`) default to **in-app on,
browser push off, mobile local off, daily reminders off**, streak-risk/missed-day/
proof/public-progress/moderation on. Reminder times are validated (`HH:MM`),
timezone is sanitized.

## In-app notification center

- Web: a bell (with unread badge) in the signed-in shell opens an overlay panel
  (`src/views/notification-center.js`); preferences render in Profile
  (`src/views/notification-preferences.js`). Wiring lives in `src/main.js`
  (load on sign-in, mark read/all/archive, enable push, save preferences) over
  `src/notification-db.js`.
- Mobile: `NotificationsScreen` (reached from Profile) renders
  `MobileNotificationCenter` + `MobileNotificationPreferences`, backed by
  `mobileNotificationRepository` (owner-only Firestore reads/writes).

## Browser push setup (VAPID)

Browser push is **off by default** and only requested after an explicit user
action (Settings toggle / "Enable browser push") — never on signup or import.

Server env (never commit secrets):

```
WEB_PUSH_PUBLIC_VAPID_KEY    # safe to expose to the browser
WEB_PUSH_PRIVATE_VAPID_KEY   # server-only secret — never client-side
WEB_PUSH_SUBJECT             # mailto: or https: contact
```

The browser reads the public key from `VITE_WEB_PUSH_PUBLIC_VAPID_KEY`. If keys
are missing, the optional `web-push` package is not installed, or the browser
lacks support, push is **disabled gracefully** and in-app notifications keep
working. To enable real sending: `npm install web-push` and set the env vars.

Subscriptions are stored under `users/{uid}/pushSubscriptions/{id}` (endpoint +
public keys only — never a token or password). On a gone/expired endpoint
(404/410) the server reports the subscription for pruning.

### Service worker

`public/learn-path-service-worker.js` renders `title/body/icon/badge/actionUrl`
and opens the in-app `actionUrl` on click. It only ever shows the public-safe
fields the server sends and performs no app-asset caching in this phase.

## Server creation + triggers

`server/notification-service.js` is the trusted path (Firebase Admin) that
creates event notifications with **idempotent** ids, so a repeated event updates
rather than spams. `server/notification-triggers.js` builds safe notifications
for public-progress reactions/comments, moderation updates and publish
confirmations (never the comment body, never self-notify); the existing
`react-progress` / `comment-progress` handlers fire them best-effort.

## Scheduler / cron limitation

`src/notification-scheduler.js` holds the **pure** logic
(`shouldSendDailyReminder`, `shouldSendStreakRiskAlert`,
`reminderFallsInQuietHours`, `nextReminderWindow`). Vercel/serverless does not run
continuously, so **daily reminders are not delivered automatically** by this
phase. A secured cron entry point exists at
`/api/community?route=run-notification-scheduler` (requires `CRON_SECRET`, exposes
no user data). Wiring real fan-out delivery requires a Vercel Cron trigger and a
user index — documented here as the deployment step, not claimed as automatic.

## Quiet hours

When enabled, quiet hours (with wrap-past-midnight support) suppress push and
mobile reminders. In-app notifications may still be stored so nothing is lost.

## Privacy constraints

- Notifications never include private proof bodies, private reflections, raw
  evidence URLs, Storage paths, download URLs, tokens, passwords or emails.
- No raw Storage paths are rendered publicly; no proof is called "verified".
- Browser push and daily reminders are opt-in; permission is never requested on
  signup or import.
- The private VAPID key and `CRON_SECRET` are never client-side.

## What remains deferred

- Remote mobile push (Expo push tokens, FCM/APNs credentials) — **deferred**.
- Automatic cron delivery of reminders (needs Vercel Cron + user index).
- App-asset caching in the service worker.

Next: **Phase 6.18 — Mobile Store Readiness and Beta QA** (documented, not
implemented here). Later: Phase 6.9.12 (Aurora/Proof Ledger web UI), Phase 7.0
(Rolling Adaptive Planning), Phase 8.0 (Evidence Intelligence), Phase 9.0
(Research and Resource Intelligence), Phase 10.0 (Launch, Growth, Beta Ops).
