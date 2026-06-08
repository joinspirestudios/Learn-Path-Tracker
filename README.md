# Learn Path Tracker

A multi-skill deliberate-practice platform. The home screen is a **catalog of
skill paths**; opening one gives you a daily checkable weekly plan, always-on
craft ladders, a drill library, curated resources, and a render-log catalogue —
with progress tracked separately per path. Built with **Vite**, data synced with
**Firebase** (Google sign-in + Firestore), deployable to **Vercel** with
serverless functions for any secret-key work.

The first published path is **Cinematic Storytelling × 3D** (a 12-month program).
Add more paths by appending an object to the `SKILLS` array in `src/data.js`.

It runs in **local mode** out of the box (progress saved in the browser). Add a
Firebase config to turn on Google login + cross-device sync. When signed in, the
header greets each user by their own Google name — no names are shown by default.

---

## Project structure

```
mastery-tracker/
├─ index.html            # app shell (markup + fonts)
├─ src/
│  ├─ main.js            # app logic, storage + DB layer, all rendering
│  ├─ data.js            # the 48-week plan, ladders, drills, resources
│  ├─ firebase.js        # Firebase init from env vars
│  └─ styles.css         # the full cinematic theme
├─ api/
│  └─ analyze.js         # EXAMPLE serverless fn — where SECRET keys go
├─ .env.example          # copy to .env for local dev
├─ vite.config.js
└─ package.json
```

---

## Run locally

```bash
npm install
cp .env.example .env     # optional — leave blank to run in local mode
npm run dev              # http://localhost:5173
```

`npm run build` outputs static files to `/dist`. `npm run preview` serves the build.

---

## Public config vs. real secrets (important)

- **Firebase web config** (`VITE_FIREBASE_*`) is **public**. The `apiKey` is a
  project identifier, not a credential — it is meant to ship in the client
  bundle. Security comes from your **Firestore rules + Auth**, below. Putting it
  in env vars is just good hygiene (clean repo, easy dev/prod swap).
- **Real secrets** (Gemini, YouTube Data API, Stripe…) must **never** use the
  `VITE_` prefix and must **never** be imported in `/src`. Keep them server-side,
  read via `process.env` inside `/api/*` functions only. See `api/analyze.js`.

---

## Enable Google login + sync (Firebase, free)

1. **console.firebase.google.com → Add project** (free Spark plan is enough).
2. **Build → Authentication → Get started → Sign-in method →** enable **Google**.
3. **Build → Firestore Database → Create database** → production mode → pick a region.
4. **Firestore → Rules**, paste and **Publish**:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
5. **Project settings (⚙) → Your apps → Web (`</>`)** → register → copy the config.
6. Put the four values in `.env` (local) and in **Vercel env vars** (prod):
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`.
7. **Authentication → Settings → Authorized domains** → add `localhost` (for dev)
   and your Vercel domain (e.g. `yourapp.vercel.app`).

---

## Deploy to Vercel

1. Push this folder to a GitHub repo.
2. Vercel → **New Project** → import the repo. It auto-detects **Vite**
   (build `npm run build`, output `dist`). No `vercel.json` needed.
3. **Project Settings → Environment Variables** → add the four `VITE_FIREBASE_*`
   values (and any server-only secrets later, no `VITE_` prefix).
4. Deploy. Files in `/api` are automatically deployed as serverless functions
   (e.g. `https://yourapp.vercel.app/api/analyze`).

That's it — sign in with Google and your progress follows you across devices.

---

## Troubleshooting Google sign-in

Sign-in now shows the exact reason in the popup if it fails, and automatically
falls back from a popup to a full-page redirect when the browser blocks popups
or third-party storage. Order to check:

1. **`auth/operation-not-allowed`** → enable Google: Authentication → Sign-in method.
2. **`auth/unauthorized-domain`** → add your domain: Authentication → Settings → Authorized domains.
3. **Popup/cookie errors** → the app auto-retries with a redirect. If that also
   fails, it's Chrome blocking third-party storage for the cross-domain auth
   handler. Use the same-origin proxy below.

### Same-origin auth proxy (definitive fix for cookie/storage blocking)

`vercel.json` already proxies `/__/auth/*` and `/__/firebase/*` to your Firebase
auth handler. To activate it, make the auth handler run on YOUR domain:

1. In Vercel → Environment Variables, change **`VITE_FIREBASE_AUTH_DOMAIN`** from
   `learn-path-tracker.firebaseapp.com` to your app domain `learn-path-tracker.vercel.app`.
2. Redeploy.

Now the OAuth handler is same-origin, so no third-party cookies are involved and
sign-in works even with strict browser privacy settings. (If you change your
Vercel domain later, update both the `vercel.json` destinations and that env var.)

## Where this goes next (later)

If you ever need server-side API calls with a secret key, add it as a
**server-only** env var in Vercel (no `VITE_` prefix) and call it from an
`/api/*` function (pattern shown in `api/analyze.js`). The browser calls your
function; your function calls the third-party API with the secret key. The key
never reaches the client.

---

## Firestore rules for platform paths

The original minimal rules only cover private user state. For the platform path
model, use starter rules like these. They support public discoverable paths,
private/unlisted owner and member reads, editor content edits, owner-only
member/visibility management, and self-service access requests.

```
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
  }
}
```

Production hardening note: these rules intentionally allow reading a
preview-enabled path document so signed-out visitors can see preview metadata.
Keep full path content in `sections` and `tasks`, and review field-level update
constraints before adding comments, uploads, payments, or analytics.
