# Gemini Vision Evidence Understanding (Phase 8.2)

Phase 8.2 adds the first vision-model layer using Gemini. It helps a user
understand **what their submitted proof image appears to show** and whether it
needs more context. It is carefully scoped: it **never verifies an activity,
never detects fraud, never identifies people, never performs biometric/identity
analysis, and never publishes anything automatically.**

> Vision insights describe what an image appears to show. They do not verify that
> an activity happened.

## Why Gemini Vision

Better documentation, not surveillance. Better context, not judgment. Evidence
understanding, not verification. Vision can suggest a caption or flag that an
image needs more context so the user can document better.

## Required env vars (server-only)

```
GEMINI_API_KEY                    # SERVER ONLY — never exposed to client/mobile
GEMINI_VISION_ENABLED             # 'true' to enable; default off
GEMINI_VISION_MODEL               # e.g. gemini-2.5-flash
GEMINI_VISION_MAX_IMAGE_MB        # default 10
GEMINI_VISION_RATE_LIMIT_PER_HOUR # optional per-user hourly cap
```

`GEMINI_API_KEY` is **server-only**. Never use `VITE_GEMINI_API_KEY` or
`EXPO_PUBLIC_GEMINI_API_KEY`. The browser and mobile app never hold the key and
never call Gemini directly — all analysis runs through the server route.

## Enable / disable

The feature is **off unless `GEMINI_VISION_ENABLED=true` AND `GEMINI_API_KEY` is
set**. When disabled or unkeyed, the UI shows "Vision analysis is not enabled
yet." and the API returns a safe `disabledReason`. Nothing fails hard.

## Consent model

Vision analysis is **opt-in and explicit**. It is never automatic after upload.
The "Analyze image with AI" action appears only for image proof; clicking it
shows consent copy:

> Analyze this proof image with AI? Vision insights are private by default and
> help describe what the image appears to show. They do not verify that the
> activity happened.

The server route requires `consentToVisionAnalysis: true` (400 otherwise).

## What image context is sent

Only safe, structured context about the **selected** image proof, alongside the
image bytes the server loads (owner-only): task title/type, day number, path
category, proof type, public/private flag, and a user-provided **public-safe
caption** when public. See `server/evidence-vision-sanitizer.js`.

## What is never sent

ID tokens, emails/passwords, private reflections, push subscriptions, raw user
state, unrelated path/proof data, other users' data, storage paths, localUri, or
private notes. `containsForbiddenVisionContent` is checked before any call.

## What Gemini is allowed to say

A structured JSON observation: `imageObservation` ("appears to show …"),
`evidenceSignals[]`, `needsMoreContext`, `suggestedCaption`, `taskAlignment`
(`clear_context | needs_caption | needs_better_evidence | unrelated_or_unclear |
unknown`), `uncertainty` (`low | medium | high`).

## What Gemini is forbidden to say

The prompt explicitly forbids — and the output sanitizer strips — identity claims,
names, sensitive-trait inferences, verification/completion claims, fraud/truth/
credibility claims, face recognition / biometric claims, and any leaked URLs or
tokens. Verification language is reframed to "appears to show".

## Private vision insight draft

A successful analysis is stored as a **private, owner-only** draft:

```
users/{uid}/evidenceVisionInsights/{pathId}/drafts/{visionInsightId}
```

`source ∈ gemini | manual | deterministic`; `status ∈ draft | reviewed |
dismissed | failed`. Drafts never contain raw image URLs/storage paths/localUri.

## Public-safe review

Vision insights reuse the Phase 8.1 review model: they require explicit review
before any sharing, are never auto-published, and never change proof visibility.
The public-safe view excludes uid/evidence ids/raw fields.

## Route

`POST /api/ai?route=analyze-evidence-image` (inside the consolidated AI router —
**no new Vercel function**). POST-only, auth-required, rate-limited
(`analyzeEvidenceImage`), requires explicit consent, returns the private draft
(or a `disabledReason`), and never returns raw image URL/storage path/localUri,
never publishes, never mutates proof, never changes visibility.

## Adaptive Planning boundary (deferred to 8.3)

8.2 defines safe signals (`needsMoreContext`, `taskAlignment`,
`suggestedCaptionAvailable`, `evidenceSignalCount`, `uncertainty`) that *may* feed
adaptive planning later. It does **not** integrate them yet, does not change
plans based on vision, and never raises/lowers scores from vision.

## Manual QA checklist

1. Set `GEMINI_API_KEY` + `GEMINI_VISION_ENABLED=true` + `GEMINI_VISION_MODEL` in
   Vercel; redeploy.
2. Sign in; open a path with image proof; open Progress.
3. "Analyze image with AI" appears only for image proof.
4. Click it → consent copy appears; nothing happens without confirm.
5. Confirm → loading → private vision insight ("appears to show …").
6. Suggested caption / needs-more-context appear when relevant.
7. No "verified/certified/truth/fraud", no people identified.
8. Mark reviewed / Dismiss work; nothing is published; the public timeline does
   not change. Mobile Evidence Insights shows the vision card safely.

## What remains deferred

- Downloading image bytes from owner-only Storage via the Admin SDK is a
  deployment follow-up; until wired the service returns a safe `missing_image`
  reason (the loader is injectable and unit-tested).
- Evidence-to-Adaptive-Planning integration is **Phase 8.3**.
- No video/audio/PDF/document analysis, no OCR product, no face/biometric, no
  Perplexity/Research Intelligence.

## Rollout after this phase

- **Phase 8.3 — Evidence-to-Adaptive Planning Integration**
- **Phase 9.0 — Perplexity-Powered Research and Resource Intelligence**
- **Phase 9.1 — Resource-to-Path Adaptation**
- **Phase 9.5 — Full Product UI/UX + Brand/Naming System Review**
- **Phase 10.0 — Launch, Growth, Beta Ops and Distribution**
- **Phase 11.0 — Community, Followers, Creator Marketplace and Monetization Layer**
