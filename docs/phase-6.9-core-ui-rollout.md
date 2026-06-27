# Phase 6.9 Core UI Rollout

Phase 6.9 begins the production web redesign rollout for the core daily habit loop only: Today, Daily Focus and Completion Result.

## Layout Principle

The core loop uses a mobile-first centered column:

- Desktop: optional shell/chrome around a centered core column.
- Tablet: centered core column with reduced side padding.
- Mobile: full-width core column with thumb-reachable primary actions.

The redesign does not turn the daily loop into a dashboard. One task, one action and one clear next step remain the primary pattern.

## Token-To-CSS Wiring

`src/design-token-css.js` converts `src/design-tokens.js` into readable CSS custom properties such as:

- `--lpt-color-surface-canvas`
- `--lpt-color-text-primary`
- `--lpt-color-accent-progress`
- `--lpt-space-xl`
- `--lpt-radius-card`
- `--lpt-motion-duration-base`

`scripts/generate-design-token-css.mjs` writes the deterministic output to `src/generated/design-tokens.css`. `src/styles.css` imports that generated file first, then maps legacy aliases such as `--ink`, `--panel`, `--cream`, `--sand` and `--gold` to token variables so unreworked screens continue to render during the rollout.

## Phase 6.9.1 Contrast Hotfix

Phase 6.9.1 corrected the first UI rollout palette with the then-current warm editorial skin and stronger contrast.

The token generator remains the source of truth. The hotfix updates `src/design-tokens.js`, regenerates `src/generated/design-tokens.css`, strengthens the legacy aliases in `src/styles.css`, and adds pure contrast tests without changing app behavior.

## Phase 6.9.2 Proof Studio Direction

Phase 6.9.2 establishes the Proof Studio visual direction: Today as the daily action center, roadmap as proof journey, public progress as proof-first cards, and trust metrics as real-data-only.

This direction rejected the supplied HTML sample palette and avoided fake leaderboards, fake social proof, followers, gems, hearts and shop economy. Phase 6.9.4 superseded the old warm accent with Aurora indigo as the primary action/progress color. Public progress uses Respect as the visible reaction label while the stored reaction model remains unchanged.

## Phase 6.9.3 UI Polish

Phase 6.9.3 polishes the production UI rollout by fixing card overlap, improving spacing and radius consistency, simplifying Discovery search/filter controls, removing stray numbering, and refining the roadmap into a proof journey.

The polish pass keeps existing Discovery behavior, public path access, roadmap state logic, and proof-first copy discipline intact while making long titles, creator metadata, tags, completed proof markers, missed or frozen days, and consistency empty states easier to scan.

## Phase 6.9.4 Aurora Direction

Phase 6.9.4 replaces the gold Proof Studio skin with the Aurora visual direction (indigo lead, green = proof, purple = peak, deep neutral-violet base), adds a consistent UX interaction/behavior system, and hardens the design system for radius, hierarchy, alignment and contrast. Proof Studio product integrity (real data only, no leaderboard, no following, no fake proof) is unchanged.

Aurora uses indigo for primary actions, progress, active roadmap state and streak continuity. Green is reserved for proof states and Strong tier. Purple is reserved for Perfect tier and peak moments. Filled accent labels use the color that passes contrast: white on indigo, dark inverse text on green and purple.

## Phase 6.9.5 Rendered Aurora UI Repair

Phase 6.9.5 repairs the rendered Aurora UI by replacing the bulky Discovery toolbar markup, removing stray numeric artifacts, rebuilding path cards with non-overlap structure, normalizing radius through tokens, and rebuilding the roadmap as a clean vertical proof journey. Aurora indigo remains the primary action/progress color, while Proof Studio integrity rules remain unchanged.

## Core UI Helpers

The new pure render helpers live under `src/ui/`:

- `core-layout.js`: shell, core column and session header.
- `core-components.js`: buttons, progress meter, score card, task card, proof card, completion panel, empty state, toast and metric pill.
- `design-gallery.js`: static internal gallery surface.
- `core.js`: public re-export.

These helpers are plain JavaScript string renderers. They do not import Firebase, analytics, server modules or environment variables.

## Today

Today is organized as the Proof Studio daily action center. It keeps the existing local path behavior and streak/progress mechanics while adding active path context, day/date context, Today's proof, a proof requirement summary, a single primary "Continue day" action and a secondary roadmap action.

## Daily Focus

Daily Focus keeps the dedicated route and existing session wiring. The screen now uses the core column, session header, one active task card, token-backed progress meter classes, a stable feedback strip, a primary action area and secondary previous/next/overview controls.

The screen still preserves:

- Back to roadmap.
- Overview mode.
- Phase 6.1 scoring.
- Evidence-required task behavior.
- Anchor/core task blocking.
- Public progress compatibility after completion.

The pre-completion UI still does not present "Pass mark" as primary copy.

## Completion Result

Completion Result now uses the completion panel class and stable `data-motion-*` containers for future score reveal/count-up work. It distinguishes passed, strong and perfect states through text and token-backed tier styling, without confetti, mascots, hearts, gems, shop economy or copied game visuals.

## Design Gallery

The internal gallery route is:

```text
#/dev/design-system
```

`#/design-system` also renders the same internal QA surface. The gallery is static, unauthenticated, does not call APIs and does not mutate state.

## Responsive Contract

- Desktop: centered core column can sit beside existing chrome.
- Tablet: the centered column remains primary with compact spacing.
- Mobile 430px: actions become full-width and the core column spans the viewport.
- Mobile 390px: headers and completion scores reduce slightly.
- Mobile 360px: badges and compact rows stack to avoid overflow.
- Reduced motion: transitions and animations collapse to instant state changes.

## Phase 6.9.9 — Aurora Shell Layout and Frame System

Phase 6.9.9 repairs the Aurora app display system by making the shell span the viewport, anchoring navigation and right rail regions correctly, introducing a formal radius and frame-inset system, and stabilizing daily task row/proof-required chip alignment across responsive breakpoints.

- App shell spans full viewport width (no max-width / margin auto on shell)
- Side nav anchors to the left viewport edge with full-height sticky positioning
- Right/context rail aligns to the right side of the content system
- Layout tokens: `shellNavWidth`, `shellRailWidth`, `contentGutter`, `topGutter`, `bottomGutter`
- Extended radius ladder: small (4) → medium (8) → large (12) → xl (16) → panel (20) → hero (24)
- Frame-inset tokens: `panelInset` (24px), `cardInset` (20px), `rowPaddingY/X` (14/16px)
- Daily task rows use CSS grid with reserved status column for proof-chip alignment
- Proof-required chips are non-interactive status indicators
- Responsive breakpoints: mobile (≤767), tablet (768-1023), laptop (1024-1279), desktop (1280+)

## Phase 6.9.10 — Aurora Shell Host Fix

Phase 6.9.10 fixes the root cause of the Aurora shell layout problem: the legacy `.wrap` container was constraining `#content` (and therefore `.aurora-app-shell`) to `max-width:1100px;margin:0 auto`.

- `body.aurora-shell-mode` class added/removed when rendering Aurora vs legacy screens
- `.wrap` constraints removed only when `aurora-shell-mode` is active
- `header.top` and `#tabs` hidden in Aurora shell mode
- `renderAuroraShell` now renders `aurora-shell-content-inner` wrapper
- Side nav restructured: `aurora-side-nav-links` holds nav items, `aurora-side-nav-user` is the only bottom-anchored block
- Profile remains a normal nav item, not pushed to bottom by CSS hack
- Today and path detail pages use shell `rightRail` slot instead of embedding rail inside content body
- Daily task rows use explicit `aurora-daily-task-title` and `aurora-daily-task-status` markup
- Proof-required chips use dedicated status column with consistent alignment

## Phase 6.9.11 — Aurora Content Centering and Search Frame System

Phase 6.9.11 addresses five remaining visual issues after the 6.9.10 shell host fix.

- Content centering: `.aurora-shell-content` uses `display:flex; justify-content:center`, `.aurora-shell-content-inner` uses `margin-inline:auto`
- Rail divider removed: `border-left` on `.aurora-shell-rail` deleted
- Day detail rail card: `selectedDayDetailRailCardHTML` renders selected day tasks in the right rail below consistency/path trust cards
- Focus screen centering: `.daily-focus-screen` uses 3-zone CSS grid (`auto 1fr auto`) for vertical centering
- Search frame system: `.aurora-search-frame` wraps discovery controls with panel radius (20px), inner controls use large radius (12px), filter row separated by border-top

## Deferred

This phase does not build the native mobile app, redesign the whole app, add a design library, add analytics tracking, add adaptive planning, add Gemini/evidence intelligence, add notifications, rename the product, or add game economy features.

## Rollout after the Aurora web series

The Phase 6.9.x Aurora web work is followed by the mobile series and remaining
pre-launch web polish:

- **Phase 6.10 — Expo Mobile App Foundation**: isolated `apps/mobile` scaffold.
- **Phase 6.11 — Mobile Core Loop MVP**: local Today → Daily Focus → Completion.
- **Phase 6.12 — Mobile Auth, Cloud Paths, Roadmap and Discovery**: read-only cloud connection.
- **Phase 6.13 — Mobile Day Sync, Text/Link Proof and Public Progress**: first mobile write path.
- **Phase 6.14 — Mobile Public Progress Server Bridge and Day-Log Compatibility**: publish from web or mobile day logs.
- **Phase 6.15 — Account, Profile and Path Personalization Foundation**: shared identity + path personalization.
- **Phase 6.15.1 — Profile Runtime Repair**: working web avatar/cover upload + accurate username reservation.
- **Phase 6.15.2 — Profile Asset Persistence**: text saves no longer wipe uploaded images.
- **Phase 6.15.3 — Public Proof Timeline and Evidence Cards**: proof shown as evidence cards + public proof timeline.
- **Phase 6.15.4 — Proof Feed, Daily Documentation and Gallery UX**: proof as a daily documentation feed + gallery.
- **Phase 6.16 — Mobile Media Proof Upload and Offline Drafts**: library image/PDF proof upload + offline draft queue.
- **Phase 6.17 — Cross-Platform Notification System**
- **Phase 6.17.1 — Browser Push Delivery and Notification Permission QA Repair**: real opt-in browser push delivery (`web-push`), send-test + interaction-trigger push, expired-subscription pruning.
- **Phase 6.18 — Mobile Store Readiness and Beta QA**: production Expo config, permission copy, deep links, in-app diagnostics, error boundary, store-readiness gates, EAS readiness docs + beta QA matrix (no store submission). See [mobile-store-readiness-beta-qa.md](mobile-store-readiness-beta-qa.md).
- **Phase 7.0 — Rolling Adaptive Planning** (foundation): deterministic, explainable adaptive insights + drafts; review/approve only; future-day overlays; AI optional + sanitized. See [rolling-adaptive-planning.md](rolling-adaptive-planning.md).
- **Phase 8.0 — Evidence Intelligence** — **next**
- **Phase 9.0 — Research and Resource Intelligence**
- **Phase 9.5 — Full Product UI/UX + Brand/Naming System Review**
- **Phase 6.9.12 — Aurora / Proof Ledger Visual System Decision and Web UI Final Polish** (parked web visual feedback; see [aurora-ui-feedback-backlog.md](aurora-ui-feedback-backlog.md))
- **Phase 10.0 — Launch, Growth, Beta Ops and Distribution**

Remaining web UI feedback is parked in the web-polish backlog, not mixed into the mobile foundation.
