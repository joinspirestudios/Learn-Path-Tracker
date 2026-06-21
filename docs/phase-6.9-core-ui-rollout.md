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

Phase 6.9.1 corrects the first UI rollout palette by restoring the warm dark editorial color system, improving contrast, and making gold the primary progress/action accent again.

The token generator remains the source of truth. The hotfix updates `src/design-tokens.js`, regenerates `src/generated/design-tokens.css`, strengthens the legacy aliases in `src/styles.css`, and adds pure contrast tests without changing app behavior.

## Phase 6.9.2 Proof Studio Direction

Phase 6.9.2 establishes the Proof Studio visual direction: Today as the daily action center, roadmap as proof journey, public progress as proof-first cards, and trust metrics as real-data-only.

This direction rejects the supplied HTML sample palette, keeps blue out of primary action/progress roles, keeps gold as the primary progress/action accent, and avoids fake leaderboards, fake social proof, followers, gems, hearts and shop economy. Public progress uses Respect as the visible reaction label while the stored reaction model remains unchanged.

## Phase 6.9.3 UI Polish

Phase 6.9.3 polishes the production UI rollout by fixing card overlap, improving spacing and radius consistency, simplifying Discovery search/filter controls, removing stray numbering, and refining the roadmap into a proof journey.

The polish pass keeps existing Discovery behavior, public path access, roadmap state logic, and proof-first copy discipline intact while making long titles, creator metadata, tags, completed proof markers, missed or frozen days, and consistency empty states easier to scan.

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

## Deferred

This phase does not build the native mobile app, redesign the whole app, add a design library, add analytics tracking, add adaptive planning, add Gemini/evidence intelligence, add notifications, rename the product, or add game economy features.
