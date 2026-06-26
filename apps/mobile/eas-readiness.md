# EAS / Build Readiness — Learn Path Tracker Mobile

This documents how to take the Expo app from "runs in Expo Go" to internal beta
builds. **Phase 6.18 does not build, sign, or submit anything** — it prepares the
configuration and documents the steps. No credentials are committed.

## Prerequisites

- Node 22.x, the repo installed at the root, and `apps/mobile` dependencies
  installed (`cd apps/mobile && npm install`).
- An Expo account (free) for EAS builds.

## 1. Install the EAS CLI

```bash
npm install -g eas-cli
eas --version    # expect >= 13.0.0 (see apps/mobile/eas.json)
```

## 2. Log in to Expo

```bash
eas login
eas whoami
```

## 3. Configure the project

```bash
cd apps/mobile
eas init        # links this app to an Expo project; writes extra.eas.projectId
```

`apps/mobile/eas.json` already defines safe, credential-free build profiles:
`development` (dev client, internal), `preview` (internal), and `production`
(empty placeholder). Do **not** commit credentials into it.

## 4. Run a development build

```bash
cd apps/mobile
eas build --profile development --platform android
# or: --platform ios   (requires an Apple account at build time, not committed)
```

Install the resulting dev client on a device/emulator and run `npm start` to load
the JS bundle.

## 5. Run a preview / internal build

```bash
cd apps/mobile
eas build --profile preview --platform android   # internal distribution APK/AAB
```

Share the internal build link with beta testers (Android internal testing or an
ad-hoc/TestFlight iOS build).

## Credentials needed later (never committed)

- **Android:** an upload keystore (managed by EAS credentials, stored on Expo's
  servers — never in this repo) and, for Play, a Google Play service-account JSON
  configured in EAS submit (not committed here).
- **iOS:** an Apple Developer account, distribution certificate and provisioning
  profile (managed by EAS credentials), and an App Store Connect API key for
  submission (not committed here).

## What must NEVER be committed

`credentials.json`, keystores (`*.keystore`, `*.jks`), `*.p8`/`*.p12`,
certificates, provisioning profiles, `google-services.json`,
`GoogleService-Info.plist`, Google Play service-account JSON, Apple credentials,
Expo access tokens, or any `.env`/secret. These belong in EAS-managed credentials
or CI secrets, not in git.

## Android internal testing requirements

- A Play Console account and an app entry.
- A signed AAB (via `eas build --profile preview`/`production`).
- Internal testing track set up in the Play Console with tester emails.
- Data safety form completed (see the data-safety inventory in
  [`docs/mobile-store-readiness-beta-qa.md`](../../docs/mobile-store-readiness-beta-qa.md)).

## iOS TestFlight requirements

- An Apple Developer Program membership.
- A build uploaded to App Store Connect (via `eas submit` later, with credentials
  configured outside the repo).
- App privacy details completed in App Store Connect.

## Store listing assets needed (later)

App icon and adaptive icon, splash screen, feature graphic (Android), screenshots
per device class, short/long description, privacy policy URL, and support contact.
None of these are committed as binaries in this phase.

## Privacy policy / data safety

A published privacy policy URL and completed data-safety/app-privacy disclosures
are required before submission. The preliminary inventory is in
[`docs/mobile-store-readiness-beta-qa.md`](../../docs/mobile-store-readiness-beta-qa.md).
