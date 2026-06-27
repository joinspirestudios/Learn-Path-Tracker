# Rolling Adaptive Planning (Phase 7.0)

Phase 7.0 introduces the **foundation** for rolling adaptive planning: the app
observes a user's recent path activity, detects patterns from real data, and
suggests safe, explainable adjustments for **upcoming** days. The user reviews
and approves; nothing is applied automatically, and the past is never rewritten.

## Philosophy

Preserve the proof-of-growth loop — declare a path, do the work, submit proof,
build a record, **adapt based on evidence**. Adaptive planning supports the user;
it never shames. Copy uses supportive language ("Try a lighter version", "Keep
the anchor task", "Make tomorrow easier to complete") and avoids
failure/punishment/rank/leaderboard language entirely.

## Deterministic insights (no AI required)

`src/adaptive-planning-model.js` is pure and AI-free. It builds a value-free
context from structured day-log metadata only (scores, tiers, required/optional
counts, anchor satisfaction, proof counts) and detects:

- `missed_day_pattern`, `low_completion_pattern`, `anchor_task_failure`,
  `proof_gap`, `overload_risk`, `streak_risk`, `repeated_skipped_task`,
  `strong_consistency`, `perfect_day_pattern`, `recovery_opportunity`.

It then produces deterministic, explainable recommendations
(`reduce_task_load`, `split_task`, `convert_to_smaller_version`,
`protect_anchor_task`, `add_recovery_day`, `lower_intensity_temporarily`,
`resolve_pending_uploads`, `keep_plan_unchanged`, …). Every recommendation
carries a `reason` and `source: 'deterministic'`. With no data, the only output
is `keep_plan_unchanged` — the model never invents struggle or PBs.

## AI-assisted recommendations (optional, conservative)

The endpoint is **deterministic-first**. If `ANTHROPIC_API_KEY` is configured and
a model function is wired, the server may augment recommendations and tag them
`source: 'ai_assisted'`. The UI distinguishes deterministic from AI-assisted
suggestions. If the key is missing, the feature returns deterministic
recommendations only — it never fails.

## Privacy sanitizer

`server/adaptive-planning-sanitizer.js` guarantees that **only** safe, aggregate,
structured context can ever reach a model: path title/category, day numbers, task
titles/labels, required/optional/anchor flags, completion statuses/scores/tiers,
proof counts, intensity. It strips private proof bodies, reflections, raw
evidence URLs, Storage/download paths, transcripts, tokens, emails and passwords,
and `containsForbiddenContent()` is checked before any send.

## User-approval model

`src/adaptive-planning-policy.js` enforces the safety boundaries:

- Past days are immutable; completed/missed days are never rewritten.
- Only **future** days may receive proposed changes (`canAdaptDay`).
- Anchor/required tasks are protected (`protectAnchorTasks`).
- `adaptationRequiresUserApproval()` is always true — recommendations are drafts.

## Future-day-only + public-path overlay rule

A joined participant never mutates the canonical/public path template. Applying a
draft writes a **user-specific overlay** of future-day adjustments
(`adaptationMutationPlan` → overlay), stored privately. Only an owner of a
**private** path may directly edit future tasks (after confirmation); that direct
template mutation is otherwise deferred.

## Storage

Private, owner-only (covered by the existing `users/{uid}/**` rule):

```
users/{uid}/adaptivePlans/{pathId}/drafts/{draftId}      # draft (source/status)
users/{uid}/adaptivePlans/{pathId}/activeOverlay/main     # applied overlay
```

Draft `source`: `deterministic | ai_assisted | manual`.
Draft `status`: `draft | reviewed | applied | dismissed | expired`.

## API

`POST /api/ai?route=adapt-path` (inside the existing consolidated AI router — **no
new Vercel function**). Requires auth, rate-limited (`adaptPath`). It loads the
user's own progress context, builds a deterministic draft (optionally
AI-assisted), persists it as a draft, and returns it. It **never applies** the
draft and never mutates day logs or the canonical path. Returns
`{ ok, draft, source, aiAvailable, aiUsed, applied: false }`.

## Web UI

`src/views/adaptive-planning-panel.js` (Today/Roadmap card) shows a summary, top
recommendations and reasons, with **Review draft** / **Dismiss**.
`src/views/adaptive-planning-review.js` shows "Why this was suggested" and an
explicit **Apply changes to upcoming days** action. No private proof is ever
rendered, and nothing applies without the explicit click.

## Mobile support

`apps/mobile/src/screens/AdaptivePlanningScreen.js` (Profile → Adaptive planning)
displays the draft summary + recommendations + reasons via
`MobileAdaptivePlanningCard`. Mobile in 7.0 is **review/dismiss only** — applying
is done on web ("Review on web"). Daily Focus is untouched.

## Notifications

Optional in-app "adaptation draft ready" notifications can reuse the existing
notification system later; not wired in 7.0 to avoid noise.

## What remains deferred

- AI augmentation is conservative/optional; richer AI planning is later.
- Direct canonical-path editing (even for owners) beyond overlays.
- Mobile apply (currently review-on-web).
- Notification triggers for new drafts.
- Evidence Intelligence (Phase 8.0) and Research/Resource Intelligence (9.0).

## Preserved through Phase 6.18.1

The web notifications/sign-out repair (Phase 6.18.1) did not change adaptive
planning: `api/ai.js?route=adapt-path`, the sanitizer, the deterministic model,
draft-not-auto-applied behavior, immutable past days, and the user-specific
overlay all remain intact, and `tests/phase-7.0-rolling-adaptive-planning.test.js`
still passes. Sign-out additionally clears adaptive transient state
(`adaptivePlanDraft`, `adaptivePlanReviewOpen`, `adaptivePlanKey`).

## Rollout after this phase

- **Phase 8.0 — Evidence Intelligence**
- **Phase 9.0 — Research and Resource Intelligence**
- **Phase 9.5 — Full Product UI/UX + Brand/Naming System Review**
- **Phase 10.0 — Launch, Growth, Beta Ops and Distribution**
