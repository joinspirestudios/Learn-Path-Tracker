# Mobile Core Loop MVP (Phase 6.11)

Phase 6.11 turns the Phase 6.10 mobile foundation from static placeholders into a
**local, functional core-loop MVP**. It remains local-first and safe: no Firebase
Auth, no Firestore sync, no proof file upload, no camera/file picker, and no live
service calls.

## Scope

The mobile core loop is:

```
Today  ->  Daily Focus  ->  Completion Result
```

Everything runs on local React state only. There is no backend sync and no
persistence dependency — state lives in memory for the session.

## One brain, two skins

The scoring principle matches the web brain:

- **streak** = meaningful participation
- **score** = performance quality
- **proof** = trust layer

The mobile scoring thresholds mirror the web "balanced" intensity policy in
[`src/intensity-policy.js`](../src/intensity-policy.js). A parity test
(`tests/phase-6.11-mobile-core-loop.test.js`) asserts `mobileTierForScore` agrees
with the web `completionTierForScore` across the full 0–100 range. The mobile
scoring stays self-contained in `apps/mobile/src/core/mobileScoring.js` so the
Metro bundle never reaches outside `apps/mobile`.

## Why Firebase Auth is deferred

Authentication, identity, and per-user data belong to mobile data wiring
(Phase 6.12). Adding auth now would require Firebase client modules, secure token
handling, and real network calls — out of scope for a local core-loop MVP.

## Why proof upload is deferred

File/photo/audio proof needs camera, file pickers, storage rules, and upload
endpoints. Phase 6.11 supports **text proof/reflection only**, stored locally.
Text proof is labeled **"Proof submitted"**, never "Proof verified".

## How the loop works

1. **Today** (`TodayScreen`) shows the local path title, day number, session
   status, tasks-completed count, and a proof-needed summary. The primary CTA is
   derived from `todayCta(state)`:
   - not started → **Start today**
   - in progress → **Continue day**
   - finished → **View result**
2. **Daily Focus** (`DailyFocusScreen`) shows **one task at a time** with a
   progress bar, the task card, a text proof/reflection input where required, and
   Previous / Mark done / Next / Finish day actions. A proof task cannot be marked
   done until non-empty text proof is entered.
3. **Completion Result** (`CompletionResultScreen`) shows the score, tier, tasks
   completed, and proof-submitted count, with Back to Today / Review path actions.

## Local starter path

The MVP operates on a clearly labeled **local mobile starter path**
(`apps/mobile/src/core/mobileSessionState.js`). It is private/local-only and
contains a small, generic proof-of-growth day:

1. Read or review one resource (required)
2. Complete one focused work block (required)
3. Submit short text proof or reflection (required, needs proof)
4. Self-check the day (optional)

It never claims public proof-backed metrics, joined counts, verification, or
community data. It is local starter state until real mobile sync arrives.

## Mobile scoring / tier rules

Weighted score: required tasks weigh 1, optional tasks weigh 0.5 (mirrors the web
`dailyCompletionScore`). Tiers:

| Tier | Meaning |
| --- | --- |
| `not_started` | No work done (score 0) |
| `in_progress` | Some work, below participation threshold (40%) |
| `attempted` | At/above participation, below pass (65%) |
| `passed` | At/above pass (65%), below strong (85%) |
| `strong` | At/above strong (85%), below perfect |
| `perfect` | Score 100 **and** all required proofs submitted |

You do not need 100% to complete a day. "Pass mark" is never shown as primary
copy. The **perfect** tier additionally requires every required proof to be
submitted — a mobile-local trust rule layered on top of the score mapping.

## Privacy rules for local proof/reflections

See `apps/mobile/src/shared/privacyRules.js`:

- Text proof and reflections are local-only in Phase 6.11.
- Proof/reflection text is never logged.
- Proof/reflection text is never sent to any API yet.
- No public-progress API is called from mobile in Phase 6.11.

## Intentionally deferred

Firebase Auth, real sign-in, Firestore sync, path loading, proof file upload,
camera, photo library, file picker, audio/voice transcription, offline drafts,
push notifications, public progress posting, comments/reactions, moderation, AI
builder, discovery data, EAS build config, native credentials, analytics. No
leaderboards, followers, global feeds, or hearts/gems/shop economy. The product is
not renamed.

**Phase 6.12** added mobile auth, read-only cloud path loading, a read-only
roadmap, and public discovery (see
[`mobile-auth-paths-discovery.md`](mobile-auth-paths-discovery.md)).
**Phase 6.13** added finished-day cloud sync, private text/link proof, and
explicit sanitized public progress publishing (see
[`mobile-day-sync-proof-public-progress.md`](mobile-day-sync-proof-public-progress.md)).
Media proof upload and offline drafts are deferred to **Phase 6.14**. Remaining
web visual polish stays parked in
[`aurora-ui-feedback-backlog.md`](aurora-ui-feedback-backlog.md) for
**Phase 6.9.12 — Aurora Web UI Final Polish**.
