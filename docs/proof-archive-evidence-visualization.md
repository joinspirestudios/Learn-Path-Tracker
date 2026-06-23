# Proof Archive and Evidence Visualization (Phase 6.15.3)

Learn Path Tracker is a proof-of-growth platform, but proof was being **counted**
(e.g. "14 proof submitted") without being **shown**. This phase makes submitted
proof visible as evidence cards across the app, and adds a public proof timeline
to public path pages.

## Why the proof archive exists

Proof must be visible documentation, not just validation logic:

- Proof shows what was done.
- Proof creates a durable record (an archive).
- Proof becomes a public archive when the path is public.
- Proof makes progress tangible.

## Private proof archive vs public proof timeline

**Private proof archive** (owner-only — signed-in user's own surfaces): Today
proof strip, right-rail Day Detail proof, completed day detail proof archive, and
the Progress page "Your Proof Archive". It may show task title, day number, proof
type, file name, an image thumbnail (owner-viewable URL), a URL link card, the
private note, and the submitted date.

**Public proof timeline** (public path pages — signed-out safe): day-by-day
public proof cards derived from published public progress entries. It shows path/
day/task summary, proof type, public caption, completion tier/score, and proof
counts.

## Public path proof visibility rule

```
If path.visibility === "public", submitted proof for that path is public-visible
by default as public proof artifacts — unless a specific proof item is explicitly
marked private/unsafe (visibility:"private" or publicVisible:false).
```

Private/unlisted path proof remains owner-only unless explicitly published through
the existing public progress flow. `isProofPublicVisible(submission,
{ pathVisibility, ownerView })` encodes this policy.

## What public surfaces never expose

Private note/reflection bodies, raw private evidence URLs, private file download
URLs, raw storage paths, audio, transcripts, ID tokens, email/password, or
Firebase internal metadata. The public view model only surfaces user-attached URL
proof and explicitly public assets; otherwise it renders a safe "Proof submitted"
placeholder card.

## Where proof appears

- **Today** (`platformDailyFocusHTML`): a compact "Today's proof" strip (latest 3,
  "+N more") when evidence exists; completed proof tasks now read **"Proof
  submitted"** (not a struck-through "Proof required"), incomplete ones read
  "Proof required".
- **Right rail Day Detail** (`selectedDayDetailRailCardHTML`): a compact "Day
  proof" strip for the selected/current day.
- **Completed day detail** (`evidenceListHTML` → `proofArchiveHTML`): a card-based
  "Proof archive" instead of a plain count/list.
- **Progress page** (`renderProgress`): a private "Your Proof Archive" (owner-only)
  plus the public proof updates feed.
- **Public path page** (`renderPathPreview`): a "Public proof timeline" for public
  paths, visible to signed-out visitors.
- **Mobile**: display-only `MobileProofSummaryCard` (count + types) on the
  Completion Result screen, plus a reusable `MobileProofArchiveStrip`. No capture/
  upload.

## What proof cards show

URL proof → domain/link card. Image proof → thumbnail (owner-safe / explicit
public asset). File proof → file tile (private) or placeholder (public). Note →
private note (owner) / public caption (public). Unknown → still a "Proof
submitted" card.

## What public progress excludes

Public progress cards remain sanitized: proof submitted count, safe type labels,
completion tier, task summary, and public caption only — never private notes,
private URLs, or storage paths.

## Data model

This phase adds **no new collection** and **no new API route**. The public proof
timeline reuses published `publicProgress` entries. Raw evidence stays in private
owner/enrollment paths and is never made publicly readable. Optional public
projection fields (`visibility`, `publicVisible`, `publicCaption`,
`publicAssetURL`, `publicAssetType`, `publicFileName`) are supported by the model
for a future server-side sanitized projection, but are not required.

## What remains deferred

Mobile media proof capture/upload, camera/image/file pickers (Phase 6.16), a
server-side public proof artifact projection collection, cross-path cloud proof
loading beyond cached submissions, and the full Proof Ledger visual redesign
(Phase 6.9.12). Firestore/Storage rules are unchanged this phase.

## Phase 6.15.4 update

The proof archive is reorganized into a **daily documentation feed** (one
activity-style card per day) with a secondary proof gallery. The raw card grid is
no longer the primary experience. See
[proof-feed-gallery-ux.md](proof-feed-gallery-ux.md).

## Rules deployment reminder

Vercel does not deploy Firebase rules. After any rule change, run
`firebase deploy --only firestore:rules,storage`. (No rule changes were made in
this phase.)
