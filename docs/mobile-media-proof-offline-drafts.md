# Mobile Media Proof Upload and Offline Drafts (Phase 6.16)

Phase 6.16 lets mobile users attach **image/file proof** to a day/task, upload it
to the owner-only evidence Storage path, and queue uploads as **offline drafts**
when the device is offline (flushing them when back online). It builds on the
local core loop (6.11), day sync (6.13), and the proof archive (6.15.3/6.15.4).

## Scope

- Pick an image or PDF from the device **library** (no camera, no audio capture).
- Validate type/size (JPEG/PNG/WebP/PDF, ≤ 10 MB — matching the web Storage rule).
- Upload to `evidence/{uid}/{enrollmentId}/{assetId}` (owner-only by existing
  Storage rules; no new path added).
- Produce a private proof record ("submitted", never "verified").
- Queue drafts locally (AsyncStorage) and retry/flush; offline-aware status.

## Dependencies (mobile-only)

Added to `apps/mobile/package.json` only — never the root:

- `expo-image-picker` — library selection (no camera).
- `expo-file-system` — local file access for upload.
- `@react-native-async-storage/async-storage` — offline draft queue persistence.

Camera (`expo-camera`), audio (`expo-av`), document picker, media library, and
notifications remain **not** added.

## Architecture

| Module | Role |
| --- | --- |
| `core/mobileMediaProofMappers.js` | pure: validate type/size, build evidence Storage path, normalize asset, build private proof record |
| `core/mobileOfflineDrafts.js` | pure: immutable draft-queue helpers (add/remove/status/pending) |
| `core/mobileProofUploadState.js` | pure: upload status states + transitions (idle/queued/offline_queued/uploading/uploaded/failed) |
| `services/mobileProofStorageRepository.js` | DI: uploads a file to Storage via the firebaseClient storage gateway + `fetchBlob(uri)` |
| `services/mobileMediaProofRepository.js` | DI: orchestrates validate → upload → record |
| `services/mobileOfflineDraftRepository.js` | DI: persists the draft queue via an AsyncStorage adapter |
| `components/MobileMediaProofPicker.js` | library-only picker (validates before handing off) |
| `components/MobileProofThumbnail.js` | image thumbnail / file·url tile |
| `components/MobileProofDraftCard.js` | a queued/offline draft with retry/remove |
| `components/MobileUploadStatusBanner.js` | overall upload / offline-queue status |

`firebaseClient` gained a lazy `createStorageGateway()` (dynamic `firebase/storage`
import) used only for the signed-in user's own evidence uploads.

## Privacy and safety

- Media proof is **selected from the library only** — no camera/audio.
- Uploads go to the **owner-only** evidence path; downloads URLs are owner-private
  and are not exposed publicly by default (public surfaces still use the sanitized
  public progress / proof timeline from 6.15.3/6.15.4).
- Proof is private by default and labeled **"submitted"**, never "verified".
- Offline drafts persist only a **local file URI** + target task/day — never file
  bytes, tokens, email, or private notes. Nothing is logged.

## Offline drafts

A picked asset becomes a draft (`QUEUED`). When offline it shows
`OFFLINE_QUEUED`; the queue is persisted via AsyncStorage and flushed when online
(retry per draft on failure). `nextPendingDraft` / `pendingDrafts` drive flushing.

## Firestore / Storage rules

No rule changes. Mobile media proof reuses the existing owner-only
`evidence/{userId}/{enrollmentId}/{allPaths=**}` Storage rule (image/PDF, ≤ 10 MB).
The emulator rules suite continues to pass.

## Testing strategy

`tests/phase-6.16-mobile-media-proof-offline-drafts.test.js` uses pure modules +
dependency-injected gateways/adapters (fake storage gateway, fake `fetchBlob`,
in-memory AsyncStorage) and source-level checks for the RN components — no live
Expo/Firebase/Storage/network calls, and the test never imports the Expo-backed
picker component.

## What remains deferred

Camera/audio capture, video proof, background upload, and per-artifact public
media projection remain deferred. Notifications are Phase 6.17; store readiness is
Phase 6.18.
