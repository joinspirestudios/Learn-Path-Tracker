# Learn Path Tracker

A multi-skill deliberate-practice platform. The home screen is a catalog of
learning paths; opening one gives you a checkable plan, curated resources, and a
render-log catalogue. Built with Vite, Firebase Auth + Firestore, and Vercel
serverless functions for any server-only secret-key work.

The app runs in local mode out of the box with progress saved in the browser.
Add Firebase config to enable sign-in, cloud sync, platform paths, and
enrollments.

---

## Phase 3 journey + proof model

Platform paths now use an enrollment-backed daily journey engine with proof
submissions:

- Path definitions stay in `paths/{pathId}` with sections and tasks.
- User progress lives in `enrollments/{enrollmentId}`.
- Daily state lives in `enrollments/{enrollmentId}/dayLogs/{dayNumber}`.
- Proof submissions live in
  `enrollments/{enrollmentId}/submissions/{submissionId}`.
- Roadmap states are `active`, `completed`, `locked`, `missed`, and `frozen`.
- Future days are visible but locked until their calendar day.
- Current-day task completion is stored in `completedTaskIds` on the dayLog,
  with `verifiedTaskIds` for proof-backed tasks and `unverifiedTaskIds` for
  normal checkbox completions or legacy progress.
- Tasks marked `evidenceRequired` require URL or file proof before they count
  as verified. URL proof works in local mode. File uploads require Firebase
  Storage enabled, Storage rules published, and
  `VITE_FIREBASE_STORAGE_BUCKET` configured.
- Roadmap length uses `durationDays` when present. `durationLabel` is display
  text only, with safe inference for labels like `75 days`, `8 weeks`, or
  `1 year`.
- Tasks support scheduling:
  - `scheduleType: "once"` appears on `unlockDay` or `startDay`.
  - `scheduleType: "daily"` appears every day from `startDay` to `endDay`.
  - Legacy tasks without schedule fields still get a safe fallback day.
- Completing the active day updates `lastCompletedDay`, `lastActivityDate`,
  `currentDay`, and `streak`.
- New enrollments start with one freeze. A missed day can be changed to
  `frozen` to preserve the streak without counting as a completed day.

Comments, notifications, payments, and advanced catch-up modes are not
implemented in this phase.

---

## Phase 4 AI Path Generator

Signed-in users can choose **Build path with AI** from the catalog or the manual
create-path modal. The guided builder accepts rough goal notes, or a cleaner
goal, duration, level, current stage, desired end state, baseline, target
outcome, constraints, optional resources, preferred proof style, and daily
non-negotiables. It then creates an editable draft that the user must review
before saving.

Phase 4.4 adds a messy-goal interpreter before generation. Users can paste
scattered notes and choose **Clarify my goal**. The app calls
`api/interpret-goal.js` server-side, asks Claude to use the
`interpret_goal_brief` tool, and shows **Here's what I understood.** The user can
edit the structured brief, answer clarifying questions, and then generate the
path from the confirmed brief.

Phase 4.5 adds voice memo intake. Users can record a short voice idea in the AI
Builder, transcribe it with Deepgram through `api/transcribe-voice.js`, edit the
transcript, and then use that transcript as rough goal input. The transcript
still goes through the messy-goal interpreter before generation. Raw audio is
kept only in the current browser session and is not permanently saved by the app
in this version.

The generator is intentionally a starting-point tool:

- It saves generated paths as private by default.
- It uses Anthropic tool use / structured output through a
  `create_learning_path` tool, with defensive JSON parsing only as a fallback.
- It uses a separate `interpret_goal_brief` tool for messy goal interpretation
  and clarifying questions before path generation.
- It uses Deepgram only for recorded voice memo transcription. Anthropic still
  handles goal interpretation and path generation.
- It creates progressive growth paths, not static generic checklists.
- It uses `scheduleType: "daily"` tasks for recurring work and
  `scheduleType: "once"` tasks for milestones and reviews.
- It supports task modes:
  - `fixed_recurring`: a daily task that stays basically the same.
  - `progressive_recurring`: a daily task that grows toward a target, such as
    running distance, workout difficulty, deep-work time, or speaking
    complexity.
  - `sequential_learning`: ordered skill work where concepts build over time.
  - `one_off`: milestone checks, reviews, tests, recordings, deliverables, and
    projects.
- Progressive tasks can store `progressionMetric`, `progressionUnit`,
  `startValue`, `targetValue`, `progressionCurve`, and `progressionNotes`.
  The daily journey view displays a day-specific target when those fields are
  present.
- Clarified briefs can pass current stage, desired end state, progressive
  targets, fixed non-negotiables, constraints, resources, and labeled
  assumptions into the generator.
- It preserves `durationDays`, task schedules, and `evidenceRequired`.
- It does not publish generated paths publicly unless the user changes
  visibility.

AI calls use Anthropic Claude server-side through `api/generate-path.js` and
`api/interpret-goal.js`. Voice transcription uses Deepgram server-side through
`api/transcribe-voice.js`. The frontend never needs or receives AI or
transcription API keys.

Server-side AI configuration:

```bash
ANTHROPIC_API_KEY=your_server_side_key
# Optional:
ANTHROPIC_MODEL=claude-sonnet-4-6

# Required only for voice memo transcription:
DEEPGRAM_API_KEY=your_server_side_deepgram_key
```

If `ANTHROPIC_API_KEY` is missing, real AI generation is unavailable. The app can
still create a clearly labeled basic starter template from the prompt, but that
fallback is not labeled as AI-generated. If Claude does not return the required
tool output, returns invalid JSON fallback text, or returns a draft that cannot
be validated, the app shows an error and keeps the prompt open for retry.

`DEEPGRAM_API_KEY` must also be server-side only and must not be prefixed with
`VITE_`. If it is missing, users can still type or paste goals manually; only
voice transcription is unavailable.

Limitations:

- Generated output must be reviewed and edited by the user before saving.
- Clarified briefs depend on user confirmation; unclear or missing details can
  still produce bad plans if the user skips review.
- The generator does not perform real web research and must not be treated as
  deep research.
- It does not create fake citations or fake sources.
- The app recommends tasks/resources but does not teach full lessons internally.
- Voice memo audio is not stored permanently in this version. It is used to
  create an editable transcript, then the transcript feeds into clarification.
- Fitness/challenge plans are not medical advice; users should adapt intensity
  to their health, ability, and professional guidance.
- AI does not verify whether submitted evidence is truthful.

Comments, notifications, payments, social feeds, and evidence truth review are
not implemented in this phase.

---

## Project structure

The project uses real folders, not literal backslash filenames:

Current API routes include `api/analyze.js`, `api/generate-path.js`,
`api/interpret-goal.js`, and `api/transcribe-voice.js`.

```text
mastery-tracker/
├── index.html
├── src/
│   ├── main.js
│   ├── views.js
│   ├── db.js
│   ├── data.js
│   ├── firebase.js
│   └── styles.css
├── api/
│   └── analyze.js
├── vite.config.js
├── vercel.json
├── package.json
└── package-lock.json
```

---

## Run locally

```bash
npm install
npm run dev
```

Leave Firebase env vars unset to use local mode. `npm run build` outputs static
files to `dist`, and `npm run preview` serves the built app.

---

## Public config vs. real secrets

- Firebase web config values named `VITE_FIREBASE_*` are public client config.
  Security comes from Firestore rules and Firebase Auth.
- Real secrets such as Gemini, YouTube Data API, or Stripe keys must never use
  the `VITE_` prefix and must never be imported in `src/`. Keep them server-side
  in `api/*` functions. See `api/analyze.js`.

---

## Enable Google login + sync

1. Go to Firebase Console and create a project.
2. Enable Google sign-in under Authentication.
3. Create a Firestore database in production mode.
4. Enable Firebase Storage if you want file evidence uploads.
5. Publish the platform Firestore rules below.
6. If Storage is enabled, publish the Storage rules below.
7. Register a Web app and copy its config.
8. Add these values locally and in Vercel environment variables:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`,
   `VITE_FIREBASE_STORAGE_BUCKET`.
9. Add `localhost` and your Vercel domain under Authentication authorized
   domains.

File evidence uploads require Firebase Storage to be enabled, the Storage rules
below to be published, and `VITE_FIREBASE_STORAGE_BUCKET` to match your Firebase
bucket. Without that bucket config, users can still submit URL proof.

To enable AI path generation on Vercel, add `ANTHROPIC_API_KEY` as a server-side
environment variable. Optionally add `ANTHROPIC_MODEL`; if omitted, the server
uses `claude-sonnet-4-6`. Do not prefix Anthropic variables with `VITE_`.

### Cloud Firestore rules

[`firestore.rules`](firestore.rules) is the repository source of truth for
Cloud Firestore. Publish it under **Firebase Console -> Cloud Firestore ->
Rules**. Never paste `service firebase.storage` rules into Cloud Firestore.

```text
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function pathDoc(pathId) {
      return get(
        /databases/$(database)/documents/paths/$(pathId)
      );
    }

    function pathDocAfterWrite(pathId) {
      return getAfter(
        /databases/$(database)/documents/paths/$(pathId)
      );
    }

    function memberPath(pathId, uid) {
      return /databases/$(database)/documents/paths/$(pathId)/members/$(uid);
    }

    function isOwner(pathId) {
      return signedIn()
        && pathDoc(pathId).data.ownerId == request.auth.uid;
    }

    // Required when a new path and its child documents are created
    // together in one Firestore writeBatch.
    function isOwnerAfterWrite(pathId) {
      return signedIn()
        && pathDocAfterWrite(pathId).data.ownerId == request.auth.uid;
    }

    function isMember(pathId) {
      return signedIn()
        && exists(memberPath(pathId, request.auth.uid));
    }

    function memberRole(pathId) {
      return isMember(pathId)
        ? get(memberPath(pathId, request.auth.uid)).data.role
        : null;
    }

    function isEditor(pathId) {
      return memberRole(pathId) == "editor";
    }

    function canReadFullPath(pathId) {
      return pathDoc(pathId).data.visibility == "public"
        || isOwner(pathId)
        || isMember(pathId);
    }

    function ownsEnrollment(enrollmentId) {
      return signedIn()
        && get(
          /databases/$(database)/documents/enrollments/$(enrollmentId)
        ).data.userId == request.auth.uid
        && get(
          /databases/$(database)/documents/enrollments/$(enrollmentId)
        ).data.id == enrollmentId;
    }

    // Supports a parent enrollment and its child documents being
    // created together in a future transaction or batch.
    function ownsEnrollmentAfterWrite(enrollmentId) {
      return signedIn()
        && getAfter(
          /databases/$(database)/documents/enrollments/$(enrollmentId)
        ).data.userId == request.auth.uid
        && getAfter(
          /databases/$(database)/documents/enrollments/$(enrollmentId)
        ).data.id == enrollmentId;
    }

    // Lightweight public read used by the Firestore connection preflight.
    match /healthCheck/{documentId} {
      allow read: if true;
      allow write: if false;
    }

    // Private user state and render logs.
    // Current code writes under:
    // users/{uid}/state/main
    // users/{uid}/renders/{renderId}
    match /users/{uid}/{document=**} {
      allow read, write: if signedIn()
        && request.auth.uid == uid;
    }

    // Platform path metadata.
    match /paths/{pathId} {

      // Public paths are readable.
      // Preview-enabled paths expose only their main path document.
      // Owners and approved members can read their assigned paths.
      allow read: if resource.data.visibility == "public"
        || resource.data.previewEnabled == true
        || (
          signedIn()
          && resource.data.ownerId == request.auth.uid
        )
        || isMember(pathId);

      allow create: if signedIn()
        && request.resource.data.ownerId == request.auth.uid;

      // Owners can update all path metadata.
      // Editors may update content metadata but cannot alter ownership
      // or creator-controlled visibility settings.
      allow update: if
        isOwner(pathId)
        || (
          isEditor(pathId)
          && !request.resource.data
            .diff(resource.data)
            .affectedKeys()
            .hasAny([
              "ownerId",
              "visibility",
              "discoverable",
              "previewEnabled"
            ])
        );

      allow delete: if isOwner(pathId);

      match /sections/{sectionId} {
        allow read: if canReadFullPath(pathId);

        allow create, update, delete: if
          isOwner(pathId)
          || isOwnerAfterWrite(pathId)
          || isEditor(pathId);
      }

      match /tasks/{taskId} {
        allow read: if canReadFullPath(pathId);

        allow create, update, delete: if
          isOwner(pathId)
          || isOwnerAfterWrite(pathId)
          || isEditor(pathId);
      }

      match /members/{uid} {

        // Owners can inspect memberships.
        // A member can read their own membership document.
        allow read: if isOwner(pathId)
          || (
            signedIn()
            && request.auth.uid == uid
          );

        // Supports creating the owner's membership in the same batch
        // as the parent path.
        allow create, update: if
          (
            isOwner(pathId)
            || isOwnerAfterWrite(pathId)
          )
          && request.resource.data.uid == uid
          && request.resource.data.role in [
            "owner",
            "editor",
            "commenter",
            "viewer"
          ];

        // Delete rules must not depend on request.resource because a
        // deleted document has no post-write resource.
        allow delete: if isOwner(pathId);
      }

      match /accessRequests/{requestId} {

        allow read: if isOwner(pathId)
          || (
            signedIn()
            && requestId == request.auth.uid
          );

        allow create: if signedIn()
          && requestId == request.auth.uid
          && request.resource.data.requesterId == request.auth.uid
          && request.resource.data.status == "pending";

        // Owners may approve or deny.
        // Requesters may update only their own request while it remains pending.
        allow update: if
          (
            isOwner(pathId)
            && request.resource.data.requesterId
              == resource.data.requesterId
            && request.resource.data.status in [
              "pending",
              "approved",
              "denied"
            ]
          )
          || (
            signedIn()
            && requestId == request.auth.uid
            && resource.data.requesterId == request.auth.uid
            && request.resource.data.requesterId
              == request.auth.uid
            && request.resource.data.status == "pending"
          );

        allow delete: if isOwner(pathId)
          || (
            signedIn()
            && requestId == request.auth.uid
            && resource.data.requesterId == request.auth.uid
          );
      }
    }

    // User-specific journey enrollment and progress.
    match /enrollments/{enrollmentId} {

      allow get: if signedIn()
        && resource.data.userId == request.auth.uid
        && resource.data.id == enrollmentId;

      // The app does not currently need unrestricted top-level enrollment
      // collection listing.
      allow list: if false;

      allow create: if signedIn()
        && request.resource.data.id is string
        && request.resource.data.pathId is string
        && request.resource.data.userId is string
        && request.resource.data.id == enrollmentId
        && request.resource.data.userId == request.auth.uid;

      allow update: if signedIn()
        && resource.data.userId == request.auth.uid
        && request.resource.data.id is string
        && request.resource.data.pathId is string
        && request.resource.data.userId is string
        && request.resource.data.userId == resource.data.userId
        && request.resource.data.id == enrollmentId
        && (
          !("pathId" in resource.data)
          || request.resource.data.pathId == resource.data.pathId
        )
        && (
          !("id" in resource.data)
          || request.resource.data.id == resource.data.id
        );

      allow delete: if signedIn()
        && resource.data.userId == request.auth.uid
        && resource.data.id == enrollmentId;

      match /dayLogs/{dayNumber} {
        allow read: if ownsEnrollment(enrollmentId);

        allow create, update, delete: if
          ownsEnrollment(enrollmentId)
          || ownsEnrollmentAfterWrite(enrollmentId);
      }

      match /submissions/{submissionId} {
        allow read: if ownsEnrollment(enrollmentId);

        allow create, update, delete: if
          ownsEnrollment(enrollmentId)
          || ownsEnrollmentAfterWrite(enrollmentId);
      }
    }
  }
}
```

The enrollment ID is deterministic: `{authUid}_{sanitizedPathId}`. The client
first merges only `id`, `pathId`, and `userId`, then reads the existing
document and repairs missing safe defaults. Reads are permitted only after the
stored `id` and `userId` match the document and authenticated user. The rules
prohibit top-level enrollment listing and prevent `id`, `userId`, or `pathId`
from being transferred after creation.

Run the focused Firestore Rules tests with Java and the Firebase CLI installed:

```bash
npm run test:rules
```

If the emulator is unavailable, use **Firebase Console -> Cloud Firestore ->
Rules -> Rules Playground** with these manual checks:

1. Authenticate as `user-a`. Allow `create` at
   `enrollments/user-a_path-1` with `id: "user-a_path-1"`,
   `userId: "user-a"`, and `pathId: "path-1"`.
2. As `user-a`, allow `get`, a merge of the same identity fields, and an
   update that changes only `currentDay`.
3. As `user-a`, allow create/read for
   `enrollments/user-a_path-1/dayLogs/1` and
   `enrollments/user-a_path-1/submissions/proof-1` after the parent exists.
4. As `user-a`, allow one batch that creates `paths/path-1` plus its owner
   member, section, and task documents.
5. Deny `get` before the write-first bootstrap and deny enrollment creation
   while unauthenticated.
6. Deny `user-a` reading `enrollments/user-b_path-1`, creating an enrollment
   with `userId: "user-b"` or a mismatched `id`, or changing the created
   `id`, `userId`, or `pathId`.
7. Deny `user-a` reading `user-b` day logs/submissions and deny a list request
   against the top-level `enrollments` collection.

### Firebase Storage rules

[`storage.rules`](storage.rules) is the repository source of truth for evidence
file Storage. Publish it under **Firebase Console -> Storage -> Rules**. Never
paste `service cloud.firestore` rules into Storage.

The application uploads evidence to
`evidence/{userId}/{enrollmentId}/day-{dayNumber}/{taskId}/{timestamp}-{safeFileName}`.

```text
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() {
      return request.auth != null;
    }

    function validEvidenceFile() {
      return request.resource.size <= 10 * 1024 * 1024
        && request.resource.contentType in [
          "image/jpeg",
          "image/png",
          "image/webp",
          "application/pdf"
        ];
    }

    match /evidence/{userId}/{enrollmentId}/{allPaths=**} {
      allow read: if signedIn() && request.auth.uid == userId;
      allow write: if signedIn()
        && request.auth.uid == userId
        && validEvidenceFile();
    }
  }
}
```

Firebase CLI deployment can overwrite rules published in the Console, so the
repository and Console copies must stay synchronized. These are development and
startup rules. Add stricter field validation and abuse protection before a
public production launch.

Changing `firestore.rules` in this repository does not update the live Firebase
project. Publish it in **Firebase Console -> Cloud Firestore -> Rules**, or
authenticate the Firebase CLI, select the intended project, and run:

```bash
firebase deploy --only firestore:rules,storage
```

Because the enrollment bootstrap also changes `src/db.js`, rebuild and redeploy
the Vite application to Vercel after publishing the rules. Publishing rules
alone does not update the deployed frontend bundle.

### Obsolete legacy rules

The former minimal user-only/private-tracker rules are intentionally not
included as a publishable block. They do not support platform paths, members,
access requests, enrollments, or the atomic path-creation batch and must not be
published over `firestore.rules`.

---

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Import it in Vercel. Vercel auto-detects Vite with build command
   `npm run build` and output directory `dist`.
3. Add the `VITE_FIREBASE_*` environment variables, including
   `VITE_FIREBASE_STORAGE_BUCKET` if file evidence uploads are enabled.
4. Add `ANTHROPIC_API_KEY` if you want real Claude AI path generation. Optional:
   add `ANTHROPIC_MODEL`. Without an Anthropic key, the builder uses the basic
   starter fallback.
5. Deploy. Files in `api/` deploy as serverless functions.

---

## Troubleshooting Firestore connection

The `(default)` Firestore database for this project has been created. The app
checks `healthCheck/ping` before starting broad cloud synchronization. The
document may exist or be absent; either result confirms that Firestore answered.
The recommended rules above allow this diagnostic read while preventing client
writes to the health-check collection.

- Confirm `VITE_FIREBASE_PROJECT_ID` is exactly `learn-path-tracker` in local
  and Vercel environment variables.
- After publishing Firestore rules, allow several minutes for changes to
  propagate before testing again.
- If developer tools show `ERR_BLOCKED_BY_CLIENT`, test in an Incognito window
  and disable privacy or ad-blocking extensions for the deployed site.
- Redeploy Vercel when a `VITE_FIREBASE_*` environment variable changes because
  Vite embeds those public values at build time.
- Creating the Firestore database or adding `healthCheck/ping` does not require
  a Vercel redeploy when the environment variables are already correct.
- A permission-denied result means Firestore responded but the published rules
  blocked the read. It is not evidence that the database is missing.

When cloud preflight fails, the app keeps local/cache data usable and pauses
automatic Firestore reads and writes until **Retry cloud connection** is used.

---

## Troubleshooting Google sign-in

- `auth/operation-not-allowed`: enable Google under Authentication sign-in
  methods.
- `auth/unauthorized-domain`: add your local or deployed domain under
  Authentication authorized domains.
- Popup or cookie issues: the app falls back to redirect sign-in.

`vercel.json` includes same-origin auth proxy rewrites for stricter browser
privacy settings. To use them, set `VITE_FIREBASE_AUTH_DOMAIN` to your deployed
app domain and redeploy.
