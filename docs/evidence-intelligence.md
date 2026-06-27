# Evidence Intelligence (Phase 8.0)

Phase 8.0 makes the proof users already collect more useful. Evidence Intelligence
analyzes a user's submitted proof for a path and surfaces **coverage, gaps,
pending uploads, weak/strong documentation patterns and public-story readiness** —
and suggests how to document better.

## Philosophy & boundaries

It supports the proof-of-growth loop: declare → do the work → submit proof →
build a record → **understand the evidence** → improve the next proof.

It is **advisory only**. It explicitly:

- **does not verify** that an activity happened,
- makes **no truth/fraud/credibility scoring**,
- never reads image content (no OCR / image-content analysis),
- never judges the user.

Allowed language: evidence coverage, proof quality, documentation strength, proof
gap, needs more context, strong proof pattern, pending evidence, public-safe
summary, private evidence note. Forbidden language: "verified", "certified",
fraud, truth score, credibility score, rank/leaderboard.

> Evidence Intelligence helps you understand your documentation patterns. It does
> not verify that an activity happened.

## What it analyzes (deterministic, real data only)

`src/evidence-intelligence-model.js` builds a value-free context from the user's
proof submissions + day logs + path tasks and detects: `proof_gap`,
`pending_upload`, `failed_upload`, `missing_anchor_proof`, `weak_text_proof`,
`link_without_context`, `image_without_caption`, `strong_multimodal_proof`,
`duplicate_link_pattern`, `duplicate_text_pattern`, `stale_repeated_proof`,
`high_coverage_streak`, `public_story_ready`, `public_story_needs_context`,
`private_only_evidence`. **Pending/failed uploads never count as uploaded
evidence.** With no proof it produces no fabricated insights.

Recommendations (deterministic): `add_short_caption`, `attach_image_proof`,
`resolve_pending_upload`, `add_context_to_link`, `document_anchor_task_first`,
`mark_sensitive_proof_private`, `publish_public_safe_summary`, `keep_proof_private`,
`improve_tomorrow_proof_prompt`. Every recommendation carries a `reason` and
`source: 'deterministic'`.

## Optional AI-assisted insights

The endpoint is deterministic-first. If `ANTHROPIC_API_KEY` is configured and a
model function is wired, recommendations may be AI-augmented (`source:
'ai_assisted'`); otherwise it returns deterministic insights only and never
fails.

## Privacy sanitizer

`server/evidence-intelligence-sanitizer.js` guarantees only safe, aggregate,
structured context reaches a model: path title/category/visibility, day numbers,
task titles/labels, proof type/status/counts, completion scores/tiers,
publicVisible booleans, and a safe link **domain** (never a full URL). It strips
private proof bodies (unless explicitly allowed), reflections, raw evidence URLs,
download URLs, storage paths, localUri, transcripts, tokens, emails and passwords;
`containsForbiddenContent()` is checked before any send.

## Public-safe summary rules

A draft's `publicSafeSummary` is always scrubbed of private fields and never
contains the word "verified". An evidence artifact is public-safe only when it is
publicly visible on a public path **and** has a caption/description
(`evidenceIsPublicSafe`). Publishing requires explicit user review
(`canPublishEvidenceInsight`); Phase 8.0 never auto-publishes.

## Storage

Private, owner-only (covered by the existing `users/{uid}/**` rule):

```
users/{uid}/evidenceInsights/{pathId}/drafts/{insightId}
```

Draft `source`: `deterministic | ai_assisted | manual`.
Draft `status`: `draft | reviewed | dismissed | archived`.

## API

`POST /api/ai?route=analyze-evidence` (inside the existing consolidated AI router
— **no new Vercel function**). Requires auth, rate-limited (`analyzeEvidence`).
Loads the user's own proof, builds a deterministic insight draft (optionally
AI-assisted), persists it as a draft, and returns
`{ ok, draft, source, aiAvailable, aiUsed, published: false }`. It never mutates
proof, never publishes, and never changes visibility.

## Web UI

`src/views/evidence-intelligence-panel.js` (Progress page) shows coverage, gaps,
pending uploads, anchor coverage, strengths and recommendations with the required
disclaimer; `src/views/evidence-insight-review.js` is the review surface with
explicit review/dismiss. No private proof, raw URLs or storage paths are shown,
and nothing is ever called "verified".

## Mobile support

`apps/mobile/src/screens/EvidenceInsightsScreen.js` (Profile → Evidence
intelligence) shows a compact `MobileEvidenceInsightCard` with the coverage
summary + top recommendations + disclaimer. Mobile is **review/dismiss only**
(publishing is on web). Daily Focus is untouched.

## Adaptive planning integration

`evidenceSignalsForAdaptivePlanning()` exposes only safe aggregates
(`proofCoverageRate`, `pendingProofUploadCount`, `proofGapCount`,
`evidenceQualityTier`) — never proof bodies, reflections, raw URLs, storage paths
or localUri. Adaptive planning does not depend on Evidence Intelligence to
function.

## Notifications

Optional "evidence insight ready" in-app notifications can reuse the existing
system later; not wired in 8.0 to avoid noise.

## Phase 8.0.1 — runtime proof-source repair

Phase 8.0 read the web evidence cache incorrectly: proof is cached **nested by
enrollment** (`store.state.evidenceSubmissions[enrollmentId][submissionId]`), but
`refreshEvidenceInsight()` filtered the outer enrollment buckets
(`Object.values(...).filter(p => p.pathId === ...)`), so `p` was a bucket (no
`pathId`) and real submitted web proof was missed.

8.0.1 adds pure collectors in `src/evidence-intelligence-context.js`:

- `flattenEvidenceSubmissionBuckets(evidenceSubmissions)` — handles the **nested**
  `{ [enrollmentId]: { [submissionId]: submission } }`, **flat**
  `{ [submissionId]: submission }`, and **array** shapes; de-duplicates by id.
- `collectEvidenceSubmissionsForEnrollment({ evidenceSubmissions, enrollmentId })`.
- `collectEvidenceSubmissionsForPath({ evidenceSubmissions, enrollments, pathId })`
  — matches by the enrollment(s) targeting the path **and** any submission
  carrying the `pathId`; never returns another path's proof.

`refreshEvidenceInsight()` now uses `collectEvidenceSubmissionsForPath`, so
Evidence Intelligence sees real proof; pending stays pending, failed stays
failed, submitted counts as submitted, and nothing is fabricated. A small
**Refresh** affordance on the panel rebuilds the deterministic insight from the
current local proof state (no AI, no publish).

### Server proof-source order

`server/evidence-intelligence-service.js` now builds context from, in order:

1. the user's mobile day logs (`users/{uid}/mobileDayLogs`),
2. the user's web proof nested in `users/{uid}/state/main`
   (`evidenceSubmissions` + `enrollments`, via the shared collector),
3. sanitized client context as a fallback.

It reads **only the authenticated user's** own state, extracts **only** the
active path's submissions, and **never returns raw state**, raw evidence URLs,
download URLs, storage paths or localUri.

## What remains deferred

- AI augmentation is conservative/optional.
- Notification triggers for new insight drafts.
- Mobile publish (review-on-web only).
- Any image-content analysis / OCR (explicitly out of scope).

## Rollout after this phase

- **Phase 8.1 — Evidence Intelligence QA + Public-Safe Evidence Review**
- **Phase 8.2 — Vision-Based Evidence Understanding**
- **Phase 8.3 — Evidence-to-Adaptive Planning Integration**
- **Phase 9.0 — Research and Resource Intelligence**
- **Phase 9.5 — Full Product UI/UX + Brand/Naming System Review**
- **Phase 10.0 — Launch, Growth, Beta Ops and Distribution**
