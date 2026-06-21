# Behavioral UX, Retention and Redesign Specification

Phase 6.6 planning document. No analytics SDK was implemented. No UI redesign was implemented. No mobile app was built.

## Product experience thesis

Learn Path Tracker is not a tracker, a to-do list, a habit checklist, or an AI roadmap generator. It is a **proof-backed growth journey system**.

The core promise:

1. Show up.
2. Do meaningful work.
3. Prove it.
4. Keep the journey alive.
5. Build public proof over time.

### UX principles derived from the thesis

- **Reward participation** — completing work, not just opening the app, earns progress.
- **Celebrate proof** — uploading evidence is the anchor action, not an afterthought.
- **Separate passing from perfection** — passed, strong and perfect are distinct tiers that all feel like wins.
- **Make progress visible** — streaks, scores, completion tiers and proof timelines show real momentum.
- **Make next action obvious** — every screen has one primary action; secondary actions stay reachable but quiet.
- **Make public trust measurable** — joined count, proof count, completion count are honest aggregate metrics.
- **Avoid fake vanity metrics** — no inflated numbers, no fake activity badges, no stale weekly counts.
- **Avoid shame-heavy motivation** — missed days have gentle recovery, not punishment. Loss aversion through streaks/freezes, not shame.

## Behavioral design principles

Phase 6.9.2 establishes the Proof Studio visual direction: Today as the daily action center, roadmap as proof journey, public progress as proof-first cards, and trust metrics as real-data-only.

Proof Studio copy prefers Today's proof, Continue day, Start today, Proof needed, Proof submitted, Proof verified, Respect, Comment, Report, Path trust, Your consistency, Every number here is proof-backed and Not enough data yet. It avoids Like, Kudos, XP, Gems, Lives, Leaderboard, Pass mark, 65% needed and fake verified claims.

### Cue → Routine → Reward model

| Principle | Product mechanic | Status |
| --- | --- | --- |
| **Cue** | Today screen, unfinished daily session, streak at risk, future push reminders | Today screen exists; push reminders deferred |
| **Routine** | Daily Focus one-task-at-a-time flow, proof upload, evidence submission | Implemented in Phase 6.4 |
| **Reward** | Completion result (passed/strong/perfect), streak continuation, proof timeline entry | Implemented in Phase 6.4 |
| **Streak continuity** | Consecutive-day tracking, freeze protection, missed-day recovery | Implemented |
| **Loss aversion without shame** | Streak/freeze system with gentle recovery instead of punishment or guilt copy | Implemented |
| **Daily commitment** | One focused session per day, unlocked sequentially | Implemented |
| **Visible progress** | Score meter, completion tier, task progress, day count | Implemented |
| **Near-term feedback** | Immediate task completion confirmation, score update after each action | Implemented in Daily Focus |
| **Completion tiers** | Attempted → in_progress → passed → strong → perfect, each meaningful | Implemented in Phase 6.1 |
| **Proof-backed accountability** | Evidence-required tasks count only when proof is verified | Implemented |
| **Social validation** | Public progress, joined count, trust metrics, reactions, comments | Implemented across Phases 5.8–5.10 |

### Identity formation

The target identity is: *"I am someone who shows proof of growth."*

This is not about gamification points. It is about building a visible record of real work. The product should reinforce this identity through proof timelines, completion results, and honest public metrics — not through badges, levels, or fake streaks.

## Core flow teardown framework

Use this framework to evaluate Learn Path Tracker's own flows and compare against reference apps. Future manual product-teardown work should fill one instance per flow studied.

| Field | Description |
| --- | --- |
| Flow name | Short identifier |
| User intent | What the user is trying to accomplish |
| Entry point | Where the user starts (tab, notification, deep link) |
| First screen promise | What the first screen communicates within 2 seconds |
| Primary action | The single most important action on each screen |
| Cue | What triggers the user to enter this flow |
| Routine | The sequence of actions the user performs |
| Reward | What the user receives at the end |
| Friction points | Where the user may hesitate, abandon or get confused |
| Feedback moments | Where the app confirms progress or state change |
| Motion opportunities | Where animation/transition would improve comprehension |
| Retention mechanic | What brings the user back tomorrow |
| Proof/accountability mechanic | How the flow connects to evidence or public proof |
| Privacy risk | What private data could leak if the flow is implemented poorly |
| Success metric | How to measure this flow is working |
| Failure state | What happens when the flow fails or the user gives up |
| What to copy conceptually | Behavioral patterns worth borrowing from reference apps |
| What not to copy visually | Specific visual/interaction patterns to avoid |

### Reference app notes

**Duolingo-style daily practice flow** — conceptually useful for: cue/routine/reward loop, streak continuity, session brevity, immediate feedback. Do not copy: mascot, hearts/lives, gems/shop economy, childish UI, league leaderboards.

**Strava-style activity proof flow** — conceptually useful for: proof capture as core action, activity feed as social proof, honest metrics. Do not copy: social pressure mechanics, premium feature gating of basic analytics.

Supplied HTML screen samples may be used structurally only. Do not copy their cold blue palette, do not rename the product, and do not add fake metrics.

## Core flow audit

### Today / Daily Focus

- **Current strength**: One-task-at-a-time focus mode, weighted scoring, completion tiers, streak tracking
- **Current weakness**: Entry from roadmap feels nested; Today surface is not prominent enough; no cue beyond opening the app
- **Desired emotional state**: Focused, ready, slightly urgent but not stressed
- **Desired primary action**: Enter Daily Focus and complete the next task
- **Behavioral mechanic**: Cue (Today screen) → Routine (focused task completion) → Reward (score/tier/streak)
- **Motion opportunity**: Task transition animation, score meter increase, threshold-reached moment, completion celebration
- **Analytics success metric**: `daily_focus_started` → `day_passed` conversion rate
- **Redesign priority**: High — this is the core habit loop

### AI Path Builder

- **Current strength**: Guided flow with clarification, voice input, structured brief, preview before save
- **Current weakness**: Multi-step flow can feel form-heavy; no clear emotional payoff at the end; the builder is a creation tool, not a habit tool
- **Desired emotional state**: Excited, confident, committed
- **Desired primary action**: Complete the builder and start Day 1
- **Behavioral mechanic**: Investment (effort to build) → Commitment (starting the journey) → Anticipation (first daily session)
- **Motion opportunity**: Step transitions, brief card assembly, roadmap preview reveal, path-ready celebration
- **Analytics success metric**: `ai_builder_started` → `ai_builder_completed` → `daily_focus_started` funnel
- **Redesign priority**: Medium — important for activation but not the daily loop

### Discover / Public Path Preview

- **Current strength**: Search, filters, sort, curated sections, trust metrics, preview-first access
- **Current weakness**: Cards could communicate proof/trust more clearly; join action could feel more significant; no social proof beyond numbers
- **Desired emotional state**: Curious, trusting, ready to commit
- **Desired primary action**: Preview a path and join it
- **Behavioral mechanic**: Social proof (trust metrics, joined count) → Confidence (preview content) → Commitment (join)
- **Motion opportunity**: Card hover/tap expansion, trust metric emphasis, join confirmation animation
- **Analytics success metric**: `discover_search_used` → `public_path_viewed` → `path_joined` funnel
- **Redesign priority**: Medium — critical for growth but not the daily retention loop

### Completion Result / Public Progress Publish

- **Current strength**: Score, tier, task summary, evidence count, optional publish
- **Current weakness**: Result screen is functional but not celebratory enough; publish action could feel more meaningful; passed/strong/perfect tiers could feel more visually distinct
- **Desired emotional state**: Accomplished, proud, motivated to share
- **Desired primary action**: See the result and optionally publish
- **Behavioral mechanic**: Reward (tier feedback) → Social validation (publish) → Anticipation (next day)
- **Motion opportunity**: Score reveal animation, tier badge appearance, publish confirmation, streak increment
- **Analytics success metric**: `day_passed` → `progress_published` conversion rate
- **Redesign priority**: High — this is the reward that closes the daily loop

## Retention and activation model

### Activation

A user is **activated** when they:
1. Create or join a path
2. Start Day 1
3. Complete or pass one Daily Focus session

A user is **strongly activated** when they:
1. Pass Day 1
2. Upload proof
3. Return for Day 2

### D1 retention

User returns the next calendar day and opens Today or starts a Daily Focus session.

### D7 retention

User has at least one meaningful session (day attempted, day passed, or proof uploaded) in the first 7 days after activation.

### D30 retention

User still has an active path with meaningful session activity (not just app opens) around the 30-day mark.

### Habit formation signal

User completes or attempts daily sessions across 3+ distinct weeks. This indicates the daily loop has become habitual rather than experimental.

### Power user signal

User has:
- Completed 14+ days across one or more paths
- Uploaded proof on 5+ days
- Published public progress at least once

### Metrics summary

| Metric | Why it matters | Events needed | Privacy constraint |
| --- | --- | --- | --- |
| Activation rate | Measures whether new users reach the core loop | `signup_completed`, `path_joined`, `daily_focus_started`, `day_passed` | No private goals or task content |
| Day 1 completion/pass rate | Measures first-session quality | `daily_focus_started`, `day_passed` | No private task details |
| D1 retention | Measures immediate return | `app_opened` on day after activation | No location or device fingerprinting |
| D7 retention | Measures first-week stickiness | Any meaningful session event in days 2–7 | Same privacy constraints |
| D30 retention | Measures habit formation | Active session events around day 30 | Same privacy constraints |
| Daily Focus start rate | Measures daily engagement | `daily_focus_started` / active users | No private content |
| Daily Focus completion rate | Measures session quality | `day_passed` / `daily_focus_started` | No private content |
| Proof upload rate | Measures accountability depth | `proof_uploaded` / `day_passed` | No evidence URLs or filenames |
| Publish progress rate | Measures social engagement | `progress_published` / `day_passed` | No private reflections |
| Join-to-start rate | Measures commitment after join | `daily_focus_started` / `path_joined` | No private content |
| Preview-to-join rate | Measures discovery effectiveness | `path_joined` / `public_path_viewed` | No private content |
| AI builder completion rate | Measures builder funnel | `ai_builder_completed` / `ai_builder_started` | No goal text or brief content |
| Streak survival | Measures continuity | Streak length distribution | No private day log content |
| Missed-day recovery | Measures resilience | Recovery events / missed events | No private content |

## Analytics event taxonomy

Detailed in `src/product-analytics-plan.js`. No analytics SDK is installed. No events are tracked at runtime. The taxonomy is a planning contract for future implementation.

### Privacy constraints for all events

Events must never include:
- Private task text or descriptions
- Private evidence URLs or filenames
- Raw evidence file content
- Comment bodies or report notes
- User email addresses
- Firebase ID tokens or provider tokens
- Deepgram or Anthropic API keys
- Voice transcripts or raw audio
- Private reflections or day log summaries
- Personal goals, fitness limitations, or course data

Events may include:
- Anonymous counts (task count, evidence count, day number)
- Aggregate scores and tiers (passed/strong/perfect)
- Flow identifiers (screen name, action type)
- Timing (session duration in seconds, not timestamps with timezone)
- Path visibility level (public/unlisted/private)

## Motion and interaction direction

### Motion principles

1. **Motion communicates state change** — transitions show what changed and where the user is going.
2. **Motion makes progress feel alive** — score increases, tier reveals and streak counts should animate meaningfully.
3. **Motion is fast and interruptible** — no animation should block the user from completing their next action. Target: 200–400ms for transitions, 600–1000ms for celebrations.
4. **Motion does not block task completion** — the user can always tap through or skip a celebration.
5. **Motion supports proof, streak and completion feedback** — these are the moments that deserve the most attention.
6. **Motion is not cinematic decoration** — no gratuitous particle effects, no mascot animations, no entrance sequences.

### Motion opportunities

| Moment | Description | Priority |
| --- | --- | --- |
| Daily Focus task transition | Smooth transition between tasks in the one-at-a-time flow | High |
| Proof saved confirmation | Brief success state after evidence upload completes | High |
| Score meter increase | Animated fill of the score progress indicator | High |
| Threshold reached moment | Emphasis when the score crosses the pass threshold | High |
| Completion result reveal | Staggered reveal of score, tier and summary | High |
| Perfect day celebration | Distinct but brief celebration for 100% completion | Medium |
| Streak continuation | Counter increment animation when streak extends | Medium |
| Public progress published | Confirmation with a brief "shared" state | Medium |
| Join path confirmation | Transition from preview to owned/joined state | Medium |
| Filter/sort response | Smooth list reflow when discovery filters change | Low |

### Motion constraints

- Respect `prefers-reduced-motion` — disable or minimize all non-essential animation.
- Avoid long blocking animations — user should never wait more than 1 second for a celebration to finish.
- Avoid excessive confetti or particle effects.
- Do not copy Duolingo visual style, owl mascot, or league animations.
- Do not use childish game economy effects (coin drops, gem sparkles, heart breaks).

## Mobile interaction principles

Reference: `docs/mobile-core-loop-and-architecture.md` (Phase 6.5).

1. **One primary action per screen** — every mobile screen has one clear thing the user should do.
2. **Bottom tabs for main navigation** — Today, Paths, Discover, Progress, Profile.
3. **Large tap targets** — minimum 44×44pt for interactive elements.
4. **Thumb-safe primary actions** — primary buttons in the bottom half of the screen.
5. **Gesture-friendly back navigation** — swipe-back support on iOS, system back on Android.
6. **Focused session flow** — Daily Focus is a full-screen immersive flow, not a card inside a scrollable page.
7. **Instant tap feedback** — every interactive element responds within 100ms.
8. **Clear loading states** — skeleton screens, not spinners, for content loading.
9. **Offline-friendly drafts later** — task completion can be saved locally when offline (future work).
10. **No desktop dashboard squeezed into mobile** — mobile screens are designed for mobile, not responsive adaptations of desktop layouts.

Do not add React Native or Expo in this phase.

## Web redesign direction

The future redesign should be:

- **Premium** — high craft, editorial quality, confident typography.
- **Focused** — each screen has one primary job; secondary content stays quiet.
- **Proof-oriented** — evidence and completion are celebrated, not buried.
- **Calm but alive** — motion reinforces state change; stillness communicates stability.
- **Dark editorial** — dark mode as the primary aesthetic; light mode available.
- **Mobile-aware** — responsive design that doesn't just shrink desktop; mobile web gets its own optimized layouts.
- **Trustworthy** — honest metrics, real proof, no fake social signals.
- **Not childish** — no cartoon mascots, no bubble-letter headings, no neon accent overload.
- **Not gamified in a cheap way** — no hearts, gems, shop, leagues, or loot boxes.

### Redesign screen inventory

#### Core screens

| Screen | Primary job | Emotional goal | Key components | Behavioral mechanic |
| --- | --- | --- | --- | --- |
| Landing / Auth | Sign in or sign up | Welcome, trust | Auth form, value proposition, social proof | First impression → commitment |
| Discover | Browse public paths | Curiosity, trust | Search bar, filter chips, path cards, trust metrics | Social proof → exploration |
| Public Path Preview | Evaluate a specific path | Confidence, readiness | Path details, trust metrics, join CTA | Confidence → commitment |
| Join Flow | Commit to a path | Commitment, anticipation | Confirmation, immediate next step | Commitment → first session |
| AI Path Builder | Create a custom path | Excitement, ownership | Goal input, clarification, brief, preview | Investment → commitment |
| Today | See current day status | Focused, ready | Current day card, streak, score preview, enter focus CTA | Cue → routine |
| Daily Focus | Complete today's tasks | Flow, determination | Single task view, progress, score, evidence actions | Routine (core habit loop) |
| Proof Capture | Upload evidence | Accountability, pride | Camera/upload, preview, submit | Proof → verification |
| Completion Result | See day outcome | Achievement, pride | Score, tier, summary, publish option | Reward → social sharing |
| Public Progress | View published entries | Connection, validation | Timeline, reactions, comments | Social validation |
| Comments/Reactions | Interact with progress | Community, support | Comment input, reaction buttons | Social engagement |
| Owner Path Management | Edit and manage paths | Control, ownership | Path editor, settings, visibility | Creator investment |
| Profile / Account | Manage account | Security, control | Settings, preferences, sign out | Trust |

#### State variations

Each core screen needs designs for:
- Desktop web (1440px+, 1280px, 1024px)
- Mobile web (430px, 390px, 360px)
- Future native mobile
- Signed-out / unauthenticated
- Signed-in / no paths
- Signed-in / active path
- Joined member
- Owner
- Loading / skeleton
- Empty state
- Error state

### Redesign component inventory

| Component | States | Notes |
| --- | --- | --- |
| Button | default, hover, focus, pressed, disabled, loading | Primary, secondary, ghost, danger variants |
| Input | default, focus, filled, disabled, error, success | Text, password, multiline |
| Select | default, open, selected, disabled | Native and custom dropdown |
| Search bar | default, focus, filled, clearing | With clear and filter toggle |
| Filter chip | default, selected, disabled | Toggle and radio variants |
| Tab bar | default, selected, disabled | Horizontal tabs for content sections |
| Bottom nav | default, selected, badge | 5-tab mobile navigation |
| Path card | default, hover, loading, empty | Public and workspace variants |
| Public path card | default, hover | With trust metrics |
| Trust metric card | default, loading | Joined, proof, completed counts |
| Daily score card | default, progress, complete | With score meter and tier |
| Daily task card | default, active, done, skipped, blocked, evidence-pending | Required and optional variants |
| Proof upload card | default, capturing, uploading, success, error | Camera, file and URL modes |
| Progress meter | empty, partial, passed, strong, perfect | Animated fill |
| Completion result panel | calculating, passed, strong, perfect | With score reveal |
| Public progress entry | default, with-reactions, with-comments | Timeline item |
| Comment item | default, own-comment, hidden, reporting | With hide/report actions |
| Reaction button | default, reacted, loading | Grouped reaction display |
| Report action | default, confirming, submitted | Path and comment report |
| Modal | default, loading, error | Confirmation and form variants |
| Toast / banner | info, success, warning, error | Auto-dismiss and persistent |
| Empty state | no-content, signed-out, error | With CTA |
| Skeleton / loading | content, card, list | Placeholder shimmer |
| Session header | default, progress, complete | With back navigation |
| Roadmap node | locked, active, complete, skipped | With day number and status |

## Design system foundation

Phase 6.8 defines the design system foundation that connects this behavioral UX specification to future UI implementation. The design system tokens, component contracts and screen composition model live in:

- [`src/design-tokens.js`](../src/design-tokens.js) — semantic color, typography, spacing, radius, elevation, motion, state and accessibility tokens
- [`src/design-system-contracts.js`](../src/design-system-contracts.js) — 25 core component contracts, component state model, 13-screen composition model, deferred work list
- [`docs/design-system-foundation.md`](design-system-foundation.md) — full design system thesis, token philosophy, Figma guidance and implementation boundaries

The design system thesis, dark editorial aesthetic, semantic token philosophy, motion rules and accessibility baseline defined in the design-system-foundation document are direct continuations of the behavioral UX principles established here.

## What to implement later

In order of priority:

1. Design system and component library (Figma + code)
2. Motion system implementation (CSS transitions, reduced-motion support)
3. Today screen redesign
4. Daily Focus redesign
5. Completion Result redesign
6. Discover redesign
7. AI Path Builder redesign
8. Profile/Account redesign
9. Analytics SDK integration
10. Push notification system

## What not to build yet

- No analytics SDK installation
- No runtime analytics tracking
- No push notifications
- No adaptive planning
- No Gemini/evidence intelligence
- No native mobile app
- No design system component library
- No Figma file creation (this doc is Figma-ready input)
- No production UI changes
- No product renaming
- No leaderboards, hearts, gems, shop, leagues or follower system
