# Learn Path Tracker

A multi-skill deliberate-practice platform. The home screen is a catalog of
learning paths; opening one gives you a checkable plan, curated resources, and a
render-log catalogue. Built with Vite, Firebase Auth + Firestore, and Vercel
serverless functions for any server-only secret-key work.

The app runs in local mode out of the box with progress saved in the browser.
Add Firebase config to enable sign-in, cloud sync, platform paths, and
enrollments.

---

## Phase 2 journey model

Platform paths now use an enrollment-backed daily journey engine:

- Path definitions stay in `paths/{pathId}` with sections and tasks.
- User progress lives in `enrollments/{enrollmentId}`.
- Daily state lives in `enrollments/{enrollmentId}/dayLogs/{dayNumber}`.
- Roadmap states are `active`, `completed`, `locked`, `missed`, and `frozen`.
- Future days are visible but locked until their calendar day.
- Current-day task completion is stored in `completedTaskIds` on the dayLog.
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

Evidence uploads are still a future Phase 3 feature. Tasks that require evidence
can be completed for now, but they are shown as unverified and `evidenceCount`
stays `0` until real uploads exist.

AI generation, comments, notifications, payments, and advanced catch-up modes are
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
4. Publish the platform rules below.
5. Register a Web app and copy its config.
6. Add these values locally and in Vercel environment variables:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
7. Add `localhost` and your Vercel domain under Authentication authorized
   domains.

### Recommended platform Firestore rules

Use these starter rules for this version. Platform path definitions live in
`paths/{pathId}`. User progress lives separately in
`enrollments/{enrollmentId}` and `dayLogs`, not inside path definitions. These
rules allow the owner of an enrollment to read/write their daily journey logs.

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
3. Add the `VITE_FIREBASE_*` environment variables.
4. Deploy. Files in `api/` deploy as serverless functions.

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
