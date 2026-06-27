# Aurora Web UI Feedback Backlog

This backlog parks remaining **web** visual polish so it is not mixed into the
mobile work. These items are intentionally deferred and will be handled later
under a dedicated web-polish phase before public launch:

> **Phase 6.9.12 — Aurora Web UI Final Polish**

## Deferred web UI feedback

- Remaining Aurora layout fine tuning
- Remaining spacing and radius refinements
- Remaining dashboard / content balance feedback
- Remaining Daily Focus visual refinement
- Remaining roadmap polish
- Remaining Discover search polish
- Remaining visual QA from screenshots

## Notes

- These are presentation-only refinements. They do not change product behavior,
  scoring, data models, APIs, Firebase rules, authentication, or privacy rules.
- Do not address these inside mobile phases (6.10–6.14). Mobile is a separate
  skin with its own visual baseline. Phases 6.11 (mobile core loop MVP), 6.12
  (mobile auth, cloud paths and discovery), 6.13 (mobile day sync, proof and
  public progress), 6.14 (public progress server bridge), 6.15 (account/
  profile/path personalization), 6.15.1 (profile runtime repair), 6.15.2
  (profile asset persistence), 6.15.3 (public proof timeline + evidence cards) and
  6.15.4 (proof feed / daily documentation / gallery UX) explicitly left this web
  polish deferred, as did 6.16/6.16.1 (mobile media proof) and 6.17/6.17.1
  (cross-platform notifications + browser push delivery), 6.18 (mobile store
  readiness + beta QA), 7.0 (rolling adaptive planning foundation) and 6.18.1
  (web notifications + sign-out repair: visible sign-out, save status, test
  notification, push diagnostics), 8.0 (evidence intelligence panel/review
  surfaces), 8.0.1 (evidence proof-source repair + Refresh affordance), 8.1
  (evidence review panel + public-safe summary surfaces), 8.2 (Gemini Vision
  consent/insight panel surfaces) and 8.1.1 (Today state hierarchy + recovery copy
  + anchored notification bell). The full Proof Ledger visual redesign remains
  parked for Phase 6.9.12.

> **Phase 8.1.1 note:** the Today screen now uses `src/today-state-model.js` for a
> single coherent state. Missed days no longer show "Start day"; missed/
> recoverable/completed days route to read-only review; adaptive copy is
> missed-aware; the Proof Journey is state-aware (no repeated placeholders); the
> right rail shows current status/proof/next-step; and the notification bell is
> anchored in the shell header. This is a targeted state/hierarchy repair, **not**
> the full UI/UX review still parked for Phase 6.9.12 / 9.5.
- When the web-polish phase begins, convert each item above into concrete,
  testable changes with before/after references.
