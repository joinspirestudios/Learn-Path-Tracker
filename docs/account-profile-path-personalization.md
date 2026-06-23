# Account, Profile and Path Personalization Foundation (Phase 6.15)

Phase 6.15 adds the identity and presentation layer shared by web and mobile:
user profiles (display name, username/handle, bio, avatar, cover), owned-path
personalization (banner, accent color, public subtitle), and the privacy rules
that keep private fields out of public surfaces. This is identity and
presentation — **not** a social network.

## Scope

- Profile document with display name, username, bio, avatar/cover.
- Unique username/handle reservation.
- Owned-path personalization (banner image, accent color, public subtitle).
- Public-safe profile/author/path shaping for cards and previews.
- Web profile editor + owner-only path personalization editor.
- Mobile profile display + safe text editing; mobile path-banner display.
- Narrow Storage rules for profile/banner images only (no proof media upload).

## Profile schema

Private profile doc: `users/{uid}/profile/main` (owner-only by existing rules).

```
uid, displayName, username, usernameLower, bio,
avatarURL, avatarStoragePath, coverURL, coverStoragePath,
locationLabel, websiteURL, publicProfileEnabled,
createdAt, updatedAt, schemaVersion
```

Public-safe fields (`safePublicProfile`): `uid, displayName, username, bio,
avatarURL, coverURL, publicProfileEnabled`. Email, tokens, auth metadata, and
storage paths are never public. When `publicProfileEnabled` is false, bio and
cover are hidden; the display name may still appear where it is already part of
public content.

## Username / handle system

- Reservation collection: `usernames/{usernameLower}`.
- 3–24 chars; lowercase letters, numbers, underscore, period; reserved terms
  blocked (`admin`, `root`, `support`, …).
- **Uniqueness strategy:** a Firestore rule allows `create` on
  `usernames/{usernameLower}` only when the document does **not** already exist
  and `uid === auth.uid`; `update` is denied; only the owner may `delete`. The
  web client claims/changes a username with a `writeBatch` (create new
  reservation + set profile + delete old reservation); a taken username makes the
  batch fail, so uniqueness is guaranteed by rules, not by client checks. Mobile
  edits display name/bio/website/visibility; username changes are performed on
  web (where the transactional reservation lives).

## Profile picture / cover storage

- Avatar: `users/{uid}/profile/avatar/{assetId}` (≤ 2 MB, image/jpeg|png|webp).
- Cover: `users/{uid}/profile/cover/{assetId}` (≤ 5 MB, image only).
- Storage rules: owner-only writes, image content types only, size limits;
  public reads (these are public-safe display assets). The stored profile may
  only reference the user's own asset paths (foreign paths are stripped by the
  model). Old-asset cleanup is deferred (documented).

## Path banner model

Path personalization (owner-editable, stored on the path doc under
`personalization`): `bannerURL, bannerStoragePath, accentColor, coverTitle,
publicSubtitle, updatedAt, schemaVersion`. Banner images use a **user-owned**
Storage path `users/{uid}/pathBanners/{pathId}/{assetId}` (≤ 5 MB, image only) so
Storage rules validate by uid; path ownership is enforced in Firestore on save.

## Path personalization ownership rules

Only `ownerId`/`creatorId`/`creatorUid === uid` may edit. The sanitizer strips
any server-managed stats and identity fields, so personalization can never change
`stats`, counts, `ownerId`, `creatorUid`, or `visibility`. The existing
`paths/{pathId}` update rule already blocks server-managed stat writes and
restricts updates to owner/editor, so the new `personalization` map is covered
without loosening rules.

## Public author / card behavior

Public surfaces use `safeAuthorProfile`/`publicProfileDTO`/`safePathPersonalization`
(display name falls back to legacy `creatorName`; avatar only from public-safe
URLs). Email and private fields are never shown.

## Web profile editing

The Profile page renders a preview card + editor (display name, username, bio,
website, avatar/cover file inputs, public-profile toggle). It never renders ID
tokens or private auth metadata, and does not claim a username is saved until the
reservation/profile write succeeds.

## Mobile profile behavior

The mobile Profile screen shows a safe account summary (no token), a public
profile card, and an editor for display name/bio/website/visibility. Avatar/cover
upload is performed on web for now (no mobile image picker added). Mobile path
screens can display a path banner image by URL.

## Firestore / Storage rules changes

- Firestore: added `usernames/{usernameLower}` (create-when-absent + owner
  delete). Profile docs and the `personalization` map are already owner-gated by
  existing rules. `participantStats`/path stats stay client-deny; `publicProgress`
  client writes stay denied.
- Storage: added owner-only, image-only, size-limited matches for profile avatar,
  profile cover, and path banner. No proof/evidence upload path and no generic
  catch-all upload path were added.

## What remains deferred

Mobile image upload (mobile avatar/cover/banner upload), proof media upload,
camera/audio/file pickers, offline drafts, notifications, followers/following/
leaderboards/rankings, public profile feed, and old-asset cleanup. Those arrive
in later phases:

- **Phase 6.16 — Mobile Media Proof Upload and Offline Drafts**
- **Phase 6.17 — Cross-Platform Notification System**
- **Phase 6.18 — Mobile Store Readiness and Beta QA**

## Phase 6.15.1 runtime repair

Two production bugs were fixed:

- **Image upload now works on web.** `uploadProfileAvatar` / `uploadProfileCover`
  (in `src/user-profile-db.js`) validate the file (`validateAsset`), upload to the
  user-owned Storage path (`users/{uid}/profile/avatar|cover/{assetId}`) via
  `fb.uploadBytes`, read the download URL (`fb.getDownloadURL`), and save
  `avatarURL`/`avatarStoragePath` (or cover equivalents) to `users/{uid}/profile/main`.
  The Profile page shows a local preview on selection, uploads on Save, and
  re-renders with the stored image. The avatar/name/handle also appear in the
  left side-nav user block (with an initials fallback).
- **Accurate username errors.** `checkUsernameAvailability` distinguishes
  `available`, `owned_by_current_user`, `taken`, `reserved`, `invalid`, and
  `username_system_unavailable` (permission-denied / rules-not-deployed).
  `claimUsername` reuses an existing same-user reservation instead of recreating
  it, and a permission-denied is reported as a rules/config problem — **never** as
  "taken". "That username is taken" appears only when another user actually owns
  the reservation.

### Deploying rules (required)

> **Vercel does not deploy Firebase rules.** After any profile/personalization
> rule change — including the Phase 6.15 `usernames` collection and the profile/
> banner Storage paths — deploy them separately:
>
> ```bash
> firebase deploy --only firestore:rules,storage
> ```
>
> If username save reports *"Username saving is blocked by Firebase rules or
> configuration"*, the live rules are missing the `usernames` collection — run the
> deploy above.

### Phase 6.15.2 — profile asset persistence

Earlier, a text-only profile save wiped uploaded images: `saveProfileText` built a
full profile document (defaulting `avatarURL`/`coverURL` to `""`) and merged it,
overwriting the uploaded URLs. Fixed by a strict rule:

> **A text-only profile save must never write image fields.** `saveProfileText`
> now writes only `displayName, bio, websiteURL, locationLabel,
> publicProfileEnabled, updatedAt, schemaVersion` (via `buildProfileTextUpdate`).
> It never writes `avatarURL`, `avatarStoragePath`, `coverURL`, or
> `coverStoragePath`. Those change only through `uploadProfileAvatar` /
> `uploadProfileCover` (or an explicit remove operation, which is not yet
> implemented).

Save order: validate → save text → claim username → **upload images last** so the
stored avatar/cover URLs are final. After save, the profile reloads and the
preview + side-nav avatar re-render. The avatar appears in the profile preview
card and the left side-nav user block; the cover appears at the top of the
preview card.

**How to verify persistence:** in Firestore, `users/{uid}/profile/main` should
keep non-empty `avatarURL`/`coverURL` (and `avatarStoragePath`/`coverStoragePath`)
after a text save; in Storage, files should exist under
`users/{uid}/profile/avatar|cover/{assetId}`. Remember to deploy rules
(`firebase deploy --only firestore:rules,storage`) — Vercel does not.

### Path banner status

Path banner metadata and the owner-only editor exist, but **web banner upload
wiring is deferred** to a follow-up; the banner image input should be treated as
coming-soon rather than a working upload. Profile avatar/cover upload is fully
wired.

## Privacy / security constraints

Email, ID tokens, and auth metadata are never public. Private bio/cover are
hidden when the public profile is disabled. Profile/banner uploads are confined
to narrow image-only Storage paths. Proof/reflection data and raw evidence URLs
are never exposed by profile surfaces.
