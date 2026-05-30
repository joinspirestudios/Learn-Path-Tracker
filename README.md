# The Mastery Tracker — Cinematic Storytelling × 3D

A 12-month deliberate-practice tracker: a daily checkable schedule, all 48 weeks
mapped to courses, a drill library, two always-on craft ladders (Composition in
AE + Blender, and Sound Design), and a render-log catalogue. Built with **Vite**,
data synced with **Firebase** (Google sign-in + Firestore), and deployable to
**Vercel** with serverless functions for any secret-key work.

It runs in **local mode** out of the box (progress saved in the browser). Add a
Firebase config to turn on Google login + cross-device sync.

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

## Where this goes next (Ideate)

When you wire up Ideate's video analysis, add `GEMINI_API_KEY` / `YOUTUBE_API_KEY`
as **server-only** env vars in Vercel and call them from `/api/*` functions
(pattern shown in `api/analyze.js`). The browser calls your function; your
function calls Google with the secret key. The key never reaches the client.
