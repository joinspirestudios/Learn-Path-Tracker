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
create-path modal. The guided builder asks for a goal, duration, level, current
stage, desired end state, baseline, target outcome, constraints, optional
resources, preferred proof style, and daily non-negotiables. It then creates an
editable draft that the user must review before saving.

The generator is intentionally a starting-point tool:

- It saves generated paths as private by default.
- It uses Anthropic tool use / structured output through a
  `create_learning_path` tool, with defensive JSON parsing only as a fallback.
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
- It preserves `durationDays`, task schedules, and `evidenceRequired`.
- It does not publish generated paths publicly unless the user changes
  visibility.

AI calls use Anthropic Claude server-side through `api/generate-path.js`. The
frontend never needs or receives an AI API key.

Server-side AI configuration:

```bash
ANTHROPIC_API_KEY=your_server_side_key
# Optional:
ANTHROPIC_MODEL=claude-sonnet-4-6
```

If `ANTHROPIC_API_KEY` is missing, real AI generation is unavailable. The app can
still create a clearly labeled basic starter template from the prompt, but that
fallback is not labeled as AI-generated. If Claude does not return the required
tool output, returns invalid JSON fallback text, or returns a draft that cannot
be validated, the app shows an error and keeps the prompt open for retry.

Limitations:

- Generated output must be reviewed and edited by the user before saving.
- The generator does not perform real web research and must not be treated as
  deep research.
- It does not create fake citations or fake sources.
- The app recommends tasks/resources but does not teach full lessons internally.
- Fitness/challenge plans are not medical advice; users should adapt intensity
  to their health, ability, and professional guidance.
- AI does not verify whether submitted evidence is truthful.

Comments, notifications, payments, social feeds, and evidence truth review are
not implemented in this phase.

---

## Project structure

The project uses real folders, not literal backslash filenames:

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

### Recommended platform Firestore rules

Use these starter rules for this version. Platform path definitions live in
`paths/{pathId}`. User progress lives separately in
`enrollments/{enrollmentId}`, `dayLogs`, and `submissions`, not inside path
definitions. These rules allow the owner of an enrollment to read/write their
daily journey logs and private proof submissions.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }
    function path(pathId) {
      return get(/databases/$(database)/documents/paths/$(pathId)).data;
    }
    function isOwner(pathId) {
      return signedIn() && path(pathId).ownerId == request.auth.uid;
    }
    function memberRole(pathId) {
      return signedIn()
        && exists(/databases/$(database)/documents/paths/$(pathId)/members/$(request.auth.uid))
        ? get(/databases/$(database)/documents/paths/$(pathId)/members/$(request.auth.uid)).data.role
        : null;
    }
    function canReadPath(pathId) {
      let p = path(pathId);
      return p.visibility == "public"
        || p.previewEnabled == true
        || isOwner(pathId)
        || memberRole(pathId) in ["editor", "commenter", "viewer", "owner"];
    }
    function canReadFullPath(pathId) {
      let p = path(pathId);
      return p.visibility == "public"
        || isOwner(pathId)
        || memberRole(pathId) in ["editor", "commenter", "viewer", "owner"];
    }
    function canEditContent(pathId) {
      return isOwner(pathId) || memberRole(pathId) == "editor";
    }
    function ownsEnrollment(enrollmentId) {
      return signedIn()
        && get(/databases/$(database)/documents/enrollments/$(enrollmentId)).data.userId == request.auth.uid;
    }

    match /users/{uid}/{document=**} {
      allow read, write: if signedIn() && request.auth.uid == uid;
    }

    match /paths/{pathId} {
      allow read: if canReadPath(pathId);
      allow create: if signedIn() && request.resource.data.ownerId == request.auth.uid;
      allow update: if canEditContent(pathId)
        && (!request.resource.data.diff(resource.data).affectedKeys().hasAny([
          "ownerId", "visibility", "discoverable", "previewEnabled"
        ]) || isOwner(pathId));
      allow delete: if isOwner(pathId);

      match /sections/{sectionId} {
        allow read: if canReadFullPath(pathId);
        allow write: if canEditContent(pathId);
      }

      match /tasks/{taskId} {
        allow read: if canReadFullPath(pathId);
        allow write: if canEditContent(pathId);
      }

      match /members/{uid} {
        allow read: if canReadFullPath(pathId);
        allow create, update, delete: if isOwner(pathId)
          && request.resource.data.uid == uid;
      }

      match /accessRequests/{requestId} {
        allow read: if isOwner(pathId)
          || (signedIn() && requestId == request.auth.uid);
        allow create, update: if signedIn()
          && requestId == request.auth.uid
          && request.resource.data.requesterId == request.auth.uid
          && request.resource.data.status == "pending";
        allow delete: if isOwner(pathId);
      }
    }

    match /enrollments/{enrollmentId} {
      allow create: if signedIn()
        && request.resource.data.userId == request.auth.uid;
      allow read, update, delete: if signedIn()
        && resource.data.userId == request.auth.uid;

      match /dayLogs/{dayNumber} {
        allow read, write: if ownsEnrollment(enrollmentId);
      }

      match /submissions/{submissionId} {
        allow read, write: if ownsEnrollment(enrollmentId);
      }
    }
  }
}
```

### Recommended Storage rules for evidence files

File evidence is stored under
`evidence/{userId}/{enrollmentId}/day-{dayNumber}/{taskId}/{timestamp}-{safeFileName}`.
These starter rules keep uploads scoped to the signed-in owner folder and limit
files to images or PDFs up to 10MB.

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

These rules are development starter rules. Production rules still need hardening
before launch, especially field validation and abuse controls before comments,
uploads, payments, notifications, analytics, or AI features.

### Legacy private-tracker rules

The minimal user-only rules are only for older/private-tracker mode. They do
not support platform paths, members, access requests, or enrollments.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

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

## Troubleshooting Google sign-in

- `auth/operation-not-allowed`: enable Google under Authentication sign-in
  methods.
- `auth/unauthorized-domain`: add your local or deployed domain under
  Authentication authorized domains.
- Popup or cookie issues: the app falls back to redirect sign-in.

`vercel.json` includes same-origin auth proxy rewrites for stricter browser
privacy settings. To use them, set `VITE_FIREBASE_AUTH_DOMAIN` to your deployed
app domain and redeploy.
