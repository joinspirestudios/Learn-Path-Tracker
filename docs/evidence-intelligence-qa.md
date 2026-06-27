# Evidence Intelligence QA + Public-Safe Review (Phase 8.1)

Phase 8.1 makes Evidence Intelligence more **useful, reviewable and safe** before
Phase 8.2 introduces vision. It adds a review workflow, public-safety primitives,
an insight-quality model, QA fixtures, and clearer disclaimers. It stays
**advisory** — it never verifies an activity, never scores truth/fraud/credibility,
and never reads image content.

> Evidence Intelligence helps you understand your documentation patterns. It does
> not verify that an activity happened.

## Review workflow

`src/evidence-review-model.js` derives a review status for each draft:

```
new | needs_review | reviewed | dismissed | archived
```

- A fresh draft with content is `needs_review`; an empty one is `new`.
- **Mark reviewed** updates status only — it never publishes.
- **Dismiss** resolves the draft — it never deletes the underlying proof.
- **Archive** resolves the draft — it never changes proof visibility.
- A draft can be publicly summarized only after review **and** only if it carries
  a non-empty public-safe summary (`evidenceDraftCanBePubliclySummarized`). Publishing
  itself remains a future explicit flow — nothing is auto-published.

Available actions per status come from `evidenceReviewActionsForDraft` (refresh /
mark-reviewed / dismiss / archive / copy-public-safe-summary).

## Public-safe summary rules

`src/evidence-public-safety.js`:

- `stripUnsafeEvidenceFields` removes private proof bodies, private reflections,
  raw evidence URLs, `downloadURL`, `storagePath`, `localUri`, `base64`, tokens,
  emails/passwords, push subscriptions, raw image bytes, transcripts, etc.
- `publicSafeEvidenceSummary` keeps only safe aggregates (day number, task title,
  proof type/status/count, coverage rate, `publicVisible`, and a caption **only**
  when explicitly public-safe). It never includes full URLs, storage paths or
  local device URIs.
- `evidenceSummarySafetyReport` returns
  `{ unsafeFieldsRemoved, publicSafe, reviewRequired, containsPrivateEvidence,
  containsExternalUrl, containsStorageReference }`. `reviewRequired` is always
  true: public sharing requires explicit review.
- `evidenceContainsUnsafePublicData` is the defensive gate used before any
  summary is surfaced.

## Private insight rules

Evidence insight drafts are **private, owner-only** (`users/{uid}/evidenceInsights/
{pathId}/drafts/{insightId}`). They are **not** public progress entries; the
public progress timeline never includes evidence insight summaries automatically.

## Insight quality model

`src/evidence-insight-quality.js` ranks recommendations by usefulness, assigns a
non-shaming **severity** (`info | suggestion | warning | needs_attention`) and a
**display group** (`Coverage | Anchor proof | Pending uploads | Weak context |
Public story | Consistency | Privacy`). It scores documentation usefulness for
ordering only — never the user, never a credibility/truth score, and missing
proof is never called "failure".

## Server safety report

`POST /api/ai?route=analyze-evidence` now returns
`{ ok, draft, safetyReport, publicSafeSummary, reviewRequired, source,
aiAvailable, aiUsed, published:false }`. It never returns raw state, raw evidence
URLs, storage paths or localUri; it never publishes or mutates proof, never
changes visibility, and never calls vision/OCR.

## Manual QA matrix

| Case | Expected |
| --- | --- |
| No proof | No fabricated insights; empty/`new` state |
| Text proof only | Counts as submitted; may suggest adding context |
| Very short proof text | `weak_text_proof` → improve tomorrow's proof |
| Link proof without context | `link_without_context` → add context to link |
| Image proof without caption | `image_without_caption` → add short caption |
| Image proof pending upload | `pending_upload` (stays pending) → resolve upload |
| Failed upload | `failed_upload` (stays failed) → resolve upload |
| Anchor task missing proof | `missing_anchor_proof` → document anchor first |
| Strong multimodal proof | `strong_multimodal_proof` (info) → keep the pattern |
| Public path, private proof | `private_only_evidence`; stays private |
| Public path, public-safe proof | `public_story_*`; review before sharing |
| Duplicate repeated link | `duplicate_link_pattern` (no fraud claim) |

Safe synthetic fixtures live in `src/views/evidence-qa-fixtures.js` — no real
user data, no production URLs, no private proof, no uploaded images.

## Examples of good vs weak recommendations

- Good: "Add one sentence explaining what this image shows." / "Document your
  anchor task first tomorrow." / "Finish uploading pending proof before syncing."
- Weak (avoided): anything implying the proof is "verified", a truth/credibility
  score, or shaming language about missing proof.

## Why it does not verify activities

Evidence Intelligence only organizes and explains *documentation patterns*. It has
no way to confirm an activity happened and deliberately makes no such claim — the
disclaimer is rendered on every surface.

## What remains deferred to Gemini Vision (Phase 8.2)

Reading image content, captioning images automatically, or any computer-vision
understanding of proof is **out of scope** here and deferred to Phase 8.2.

## Phase 8.1.1 note

The Today screen state/hierarchy repair (Phase 8.1.1) did not change Evidence
Intelligence or the public-safe review workflow; it only fixed Today-day state
coherence (CTAs, adaptive copy, Proof Journey rows, right-rail status, bell
placement). Evidence Intelligence panels/review surfaces are unchanged.

## Rollout after this phase

- **Phase 8.2 — Gemini Vision-Based Evidence Understanding**
- **Phase 8.3 — Evidence-to-Adaptive Planning Integration**
- **Phase 9.0 — Perplexity-Powered Research and Resource Intelligence**
- **Phase 9.1 — Resource-to-Path Adaptation**
- **Phase 9.5 — Full Product UI/UX + Brand/Naming System Review**
- **Phase 10.0 — Launch, Growth, Beta Ops and Distribution**
- **Phase 11.0 — Community, Followers, Creator Marketplace and Monetization Layer**
