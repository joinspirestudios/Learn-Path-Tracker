# Proof Feed, Daily Documentation and Gallery UX (Phase 6.15.4)

Phase 6.15.3 made proof visible but rendered it mostly as a dense grid of small
cards — loose thumbnails, not documented progress. Phase 6.15.4 reorganizes proof
into a **daily documentation feed** (one meaningful card per day) with a
**secondary proof gallery**, so the experience reads like a proof-of-growth
activity journal rather than a file dump.

## Why the raw grid is not the primary experience

A proof-of-growth platform should answer "what did this person do today, which
tasks did they complete, what did they document, how consistent are they
becoming, and what is the visual record over time?" — not just "what proof files
exist?". A grid of tiny cards answers only the last question. The daily
documentation feed answers the rest.

## Daily documentation feed

`src/daily-documentation-model.js` (pure) builds one **documented day** entry per
path/day from proof submissions plus an optional day log and public progress
entry:

```
{ id, pathId, pathTitle, dayNumber, dateLabel, status, completionTier,
  completionScore, completedTaskCount, totalTaskCount, proofSubmittedCount,
  proofItems, taskSummary, milestone, authorName, authorAvatarURL, visibility,
  ownerView }
```

`src/views/daily-documentation-feed.js` renders each entry as an activity-style
card: header (author/path/day/date, real milestone), metrics, task summary (max
~5, then "View all tasks"), a media block (large primary image + supporting
artifact tiles), and a footer with a private/public label and a **View gallery**
action.

Milestones are only shown when backed by real data (a `perfect` tier or a real
streak ≥ 2). Fake streaks/PBs are never invented.

## Proof gallery

The day proof gallery (`dayProofGalleryHTML`) shows **all** proof for a day,
grouped by task, with distinct image/file/url/note cards. On the Progress page it
expands inline under the entry (toggle "View gallery" / "Hide gallery"). On Today
and the right rail, "View gallery" navigates to the Progress page where the full
gallery lives. The compact preview (`compactDayProofPreviewHTML`) shows up to 3
thumbnails + count + View gallery (with "+N" when there are more).

## Where proof appears

- **Progress page** (`renderProgress`): the **Daily Documentation Feed** is the
  primary view; the raw "All proof" grid is demoted into a `<details>` disclosure
  ("View all proof"); public proof updates remain below.
- **Today** (`platformDailyFocusHTML`): a compact proof preview (≤3 thumbnails +
  View gallery), not a long grid. Completed proof tasks read "Proof submitted";
  incomplete read "Proof required".
- **Right rail Day Detail** (`selectedDayDetailRailCardHTML`): a compact proof
  preview + View gallery, never a long card dump (empty state otherwise).
- **Public path page** (`publicPathProofTimelineHTML`): a **Public proof
  timeline** of public daily-documentation entries (public paths only).
- **Mobile**: unchanged display-only proof summary from 6.15.3 (no capture/upload).

## Private proof archive vs public proof timeline

The private daily documentation feed (owner-only) may include owner-viewable
proof URLs and private notes. The public timeline / public entry view models
never expose private notes/reflections, raw private storage paths, or private
evidence URLs — file/image proof without an explicit public asset renders a safe
"Proof submitted" placeholder. Private/unlisted paths never render a public proof
timeline.

## What remains deferred

Mobile media proof capture/upload, camera/image/file pickers (Phase 6.16), a
server-side public proof artifact projection, filter/search in the gallery, and
the full Proof Ledger visual redesign (Phase 6.9.12). No new collection, no new
Vercel route, no Firestore/Storage rule changes were made this phase.
