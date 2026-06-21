# Design System Foundation

Phase 6.8 planning document. No production UI redesign was implemented. No Figma file was committed. No font files were committed. No mobile app was built. No animation library was installed.

## Design system thesis

The Learn Path Tracker design system is **the repeatable interface language for proof-backed growth journeys**.

It exists to make every screen feel like part of the same product: focused, trustworthy, premium and alive without being loud. The system expresses:

- **Proof** — evidence is the anchor action, not an afterthought
- **Progress** — visible momentum through scores, tiers and streaks
- **Continuity** — sequential days, streaks, proof timelines
- **Focus** — one primary action per screen, secondary actions stay quiet
- **Trust** — honest aggregate metrics, no fake vanity numbers
- **Calm achievement** — wins feel real, not cheap
- **Premium utility** — useful first, beautiful second

### What the system avoids

- Childish gamification (badges, levels, XP counters)
- Cheap confetti on every action
- Generic SaaS dashboard layouts
- Dashboard clutter with competing widgets
- Overly technical tracker UI
- Visual copying of Duolingo, Strava or other products
- Fake luxury (marble textures, gold gradients)
- Shame-heavy motivation copy

The goal is not to look like Duolingo. The goal is to match the intentionality and behavioral clarity of Duolingo while feeling like Learn Path Tracker.

## Token philosophy

Tokens are semantic, not decorative. A color is not a raw palette swatch; it is `accent.progress`. A spacing value is not `16`; it is `spacing.xl`. This means:

- Tokens describe purpose, not appearance
- Swapping a token value updates the entire product
- Tokens are platform-agnostic (web CSS, React Native styles, Figma variables)
- Tokens are the single source of truth for visual decisions

All tokens live in [`src/design-tokens.js`](../src/design-tokens.js) as a pure data module with no DOM, Firebase or runtime dependencies. Phase 6.9 adds [`src/design-token-css.js`](../src/design-token-css.js) and `scripts/generate-design-token-css.mjs` to generate token-backed CSS custom properties for the web rollout.

Phase 6.9.1 corrects the first UI rollout palette by restoring the warm dark editorial color system, improving contrast, and making gold the primary progress/action accent again.

Phase 6.9.2 establishes the Proof Studio visual direction: Today as the daily action center, roadmap as proof journey, public progress as proof-first cards, and trust metrics as real-data-only.

Phase 6.9.3 polishes the production UI rollout by fixing card overlap, improving spacing and radius consistency, simplifying Discovery search/filter controls, removing stray numbering, and refining the roadmap into a proof journey.

## Color system

### Dark editorial base

The default surface is dark — not pitch black, but a deep warm-neutral field that feels editorial and premium. Text is high-contrast cream with a warm sand hierarchy. Gold is the primary progress/action accent; proof and success use green, danger uses oxblood/red, and trust stays restrained.

### Semantic color groups

| Group | Purpose | Example tokens |
| --- | --- | --- |
| **Surface** | Background hierarchy | `canvas`, `panel`, `raised`, `input`, `overlay` |
| **Text** | Readable content hierarchy | `primary`, `secondary`, `muted`, `inverse` |
| **Border** | Structural separation | `subtle`, `strong`, `focus` |
| **Accent** | Meaningful state colors | `progress`, `proof`, `warning`, `success`, `danger`, `trust` |
| **State** | Interactive element states | `focus`, `disabled`, `loading`, `hover`, `pressed` |
| **Tier** | Completion tier distinction | `passed`, `strong`, `perfect` |

### Color usage rules

1. Accent colors are reserved for meaningful state, never decoration
2. Tier colors always pair with a text label — never color alone
3. Success/warning/danger always pair with an icon or text label
4. Focus ring color must be visible on all surface tones
5. Disabled state uses reduced opacity, not a separate gray palette
6. Do not copy the supplied HTML sample palette; blue must not become the primary action or progress color
7. Gold remains the primary progress/action accent; green marks proof, oxblood marks report/danger, and trust stays restrained

### Proof Studio rules

- Today is the daily action center with one Start today or Continue day action.
- Roadmap is the visible proof journey with completed, active and locked states.
- Public Progress is proof-first and uses Respect, Comment and Report as visible action labels.
- Trust metrics must be real-data-only; use "Not enough data yet" instead of fake leaderboards or fake social proof.
- Cards, Discovery controls and proof journey nodes use token-backed spacing and radius values so long content wraps without overlap.

### Accessibility notes

- `text.primary` on `surface.canvas`: above 18:1
- `text.secondary` on `surface.canvas`: above 11:1
- `text.muted` on `surface.canvas`: above 7:1
- Primary progress/action gold remains readable on the warm canvas and supports inverse button text
- Color is never the only means of conveying information

## Typography system

### System-safe font stacks

The design system uses `system-ui, -apple-system, sans-serif` for all roles. This provides:

- Native feel on every platform (San Francisco on Apple, Segoe UI on Windows, Roboto on Android)
- Zero font loading delay
- No licensing concerns
- Consistent rendering across web and future native

No font files should be committed. No licensed fonts should be referenced. Future brand fonts can be introduced as a token value change.

### Type scale

| Role | Size | Weight | Line height | Letter spacing | Usage |
| --- | ---: | ---: | ---: | --- | --- |
| Display | 2rem | 700 | 1.2 | -0.02em | Hero text, large celebrations |
| Page title | 1.5rem | 600 | 1.3 | -0.01em | Today, Discover, Daily Focus headings |
| Section title | 1.125rem | 600 | 1.4 | normal | Card section headers |
| Card title | 1rem | 600 | 1.4 | normal | Path card title, task card title |
| Body | 0.9375rem | 400 | 1.6 | normal | Descriptions, instructions |
| Body small | 0.8125rem | 400 | 1.5 | normal | Helper text, timestamps |
| Label | 0.8125rem | 500 | 1.4 | 0.01em | Input labels, chips, navigation |
| Metadata | 0.75rem | 400 | 1.4 | 0.02em | Dates, counts, IDs |
| Button | 0.875rem | 600 | 1.0 | 0.01em | Button labels |
| Numeric | 1.25rem | 700 | 1.2 | -0.02em | Scores, streak counts, metrics |

## Spacing system

A consistent spacing scale ensures visual rhythm across all components and screens.

| Token | Value (px) | Usage |
| --- | ---: | --- |
| `xxs` | 2 | Hairline gaps, icon–text micro-spacing |
| `xs` | 4 | Tight padding, badge internal spacing |
| `sm` | 6 | Chip padding, small gaps |
| `md` | 8 | Default internal padding, input padding |
| `lg` | 12 | Card internal padding, button padding |
| `xl` | 16 | Section spacing, card gaps |
| `2xl` | 20 | Content block spacing |
| `3xl` | 24 | Page section gaps |
| `4xl` | 32 | Major section spacing |
| `5xl` | 40 | Page-level vertical spacing |
| `6xl` | 48 | Hero spacing, large gaps |
| `7xl` | 64 | Top-level page padding |

## Radius system

| Token | Value | Usage |
| --- | --- | --- |
| `small` | 4px | Chips, badges, small controls |
| `medium` | 8px | Buttons, inputs, selects |
| `large` | 12px | Cards, panels |
| `xl` | 16px | Modals, large panels |
| `pill` | 9999px | Fully rounded elements |
| `card` | 12px | Standard card corners |
| `modal` | 16px | Modal dialog corners |

## Elevation / shadow system

Elevation communicates surface hierarchy without heavy visual effects.

| Token | Usage |
| --- | --- |
| `flat` | Inline elements, no elevation |
| `raised` | Cards, panels above canvas |
| `floating` | Dropdowns, popovers, floating actions |
| `overlay` | Modals, dialogs |
| `focusRing` | Keyboard focus indicator |

Rules:
- Avoid heavy glassmorphism or blur effects that hurt readability
- Elevation steps are additive: canvas → panel → raised → floating → overlay
- Focus ring elevation is independent and additive

## Motion system

Motion communicates state changes. It is not decoration.

### Duration tokens

| Token | Value | Usage |
| --- | --- | --- |
| `fast` | 120ms | Button press, checkbox toggle, micro-interactions |
| `base` | 200ms | Card hover, input focus, standard transitions |
| `slow` | 350ms | Modal enter, panel slide, larger transitions |

### Easing tokens

| Token | Value | Usage |
| --- | --- | --- |
| `standard` | cubic-bezier(0.4, 0, 0.2, 1) | General-purpose easing |
| `enter` | cubic-bezier(0, 0, 0.2, 1) | Elements entering view |
| `exit` | cubic-bezier(0.4, 0, 1, 1) | Elements leaving view |

### Product motion moments

| Moment | Duration | Easing | Purpose |
| --- | --- | --- | --- |
| Task transition | 200ms | standard | Moving between tasks in Daily Focus |
| Proof saved | 350ms | enter | Proof submission confirmation |
| Score increase | 350ms | standard | Score meter filling |
| Completion result | 350ms | enter | Result reveal and tier badge |
| Perfect day celebration | 500ms | enter | Perfect tier celebration |

### Motion rules

1. Motion must communicate state change, not decorate
2. Motion must be fast and interruptible
3. Motion must not block task completion
4. Motion must respect `prefers-reduced-motion: reduce`
5. Motion must not copy Duolingo or Strava visual language
6. Motion must not become decorative noise
7. All motion must have a reduced-motion fallback (instant state change)

No animations are implemented in this phase. No animation libraries are installed.

## Interaction state system

Every interactive component follows the same state progression:

| State | Trigger | Visual treatment |
| --- | --- | --- |
| Default | Resting | Base appearance |
| Hover | Pointer hover (desktop only) | Subtle overlay, not applicable on touch |
| Focus | Keyboard/programmatic focus | Focus ring (2px, offset 2px, `border.focus` color) |
| Pressed | Active click/tap | Darker overlay, brief |
| Disabled | Programmatically disabled | 50% opacity, `not-allowed` cursor |
| Loading | Waiting for async action | Spinner or skeleton, `aria-busy` |
| Success | Action completed | `accent.success` indicator |
| Warning | Attention needed | `accent.warning` indicator |
| Error | Action failed | `accent.danger` indicator with inline message |

## Accessibility baseline

### Minimum standards

- **Tap target**: 44px minimum on mobile and desktop (WCAG 2.1 SC 2.5.5)
- **Focus ring**: 2px solid, 2px offset, visible on all surfaces (WCAG 2.1 SC 2.4.7)
- **Contrast**: 4.5:1 for normal text, 3:1 for large text (WCAG 2.1 SC 1.4.3)
- **Color independence**: Never use color as the only means of conveying information (WCAG 2.1 SC 1.4.1)
- **Reduced motion**: Respect `prefers-reduced-motion: reduce` for all non-essential animation (WCAG 2.1 SC 2.3.3)
- **Screen reader feedback**: Use `aria-live` polite for score changes, task completion, loading state; assertive for errors
- **Error messaging**: Inline error adjacent to field, not toast-only
- **Loading state**: `aria-busy` on container, skeleton or spinner with `aria-label`
- **Disabled state**: Prefer `aria-disabled` over `disabled` for keyboard discoverability
- **Keyboard navigation**: All interactive elements reachable and operable via keyboard

### Platform-specific notes

- **Desktop web**: Full keyboard support, hover states, wide layouts
- **Mobile web**: Touch targets, swipe where appropriate, responsive layouts
- **Future native mobile**: Native accessibility APIs (VoiceOver, TalkBack), haptic feedback

Full WCAG 2.1 AA compliance is not claimed until a dedicated audit is completed. This baseline establishes the target.

## Mobile interaction baseline

- 44px minimum tap targets for all interactive elements
- Bottom navigation for primary app navigation (5 tabs max)
- Safe area insets for notch/home indicator
- Bottom sheet for contextual actions (reports, confirmations)
- Full-screen for focused flows (Daily Focus, Proof Capture, Completion Result)
- Horizontal scroll for chip rows and tab overflow
- Pull-to-refresh where data refresh is meaningful
- No hover-dependent interactions

## Desktop / web layout baseline

- Maximum content width: ~800px for reading, ~1200px for dashboards
- Centered content with canvas background extending to edges
- Sidebar possible for desktop navigation (deferred)
- Grid layout for card collections (2–3 columns on wide screens)
- Single-column on narrow viewports (< 640px)
- Sticky headers and CTAs where appropriate
- Hover states for interactive elements

## Component inventory

All component contracts live in [`src/design-system-contracts.js`](../src/design-system-contracts.js).

### Core components

| Component | Purpose | Key screens |
| --- | --- | --- |
| Button | Primary interactive control | All |
| Input | Text entry | AI Builder, Profile, Comments |
| Select | Single-choice selection | AI Builder, Discover, Profile |
| SearchBar | Discovery search | Discover |
| FilterChip | Toggle filter | Discover |
| TabBar | Section navigation | Today, Path detail |
| BottomNav | App-level mobile navigation | All (mobile) |
| PathCard | Path summary display | Today, Paths |
| PublicPathCard | Public path in discovery | Discover |
| TrustMetricCard | Aggregate trust metrics | Preview, Discover |
| DailyScoreCard | Day score and tier progress | Daily Focus, Result |
| DailyTaskCard | Single task in focus flow | Daily Focus |
| ProofUploadCard | Evidence capture/upload | Daily Focus, Proof Capture |
| ProgressMeter | Visual progress indicator | Daily Focus, Today, Result |
| CompletionResultPanel | Day completion outcome | Completion Result |
| PublicProgressEntry | Public timeline entry | Public Progress |
| CommentItem | Comment on progress | Public Progress |
| ReactionButton | React to progress | Public Progress |
| ReportAction | Report for moderation | Public Progress, Preview |
| Modal | Overlay dialog | AI Builder, Report |
| ToastBanner | Transient feedback | All |
| EmptyState | No content placeholder | Discover, Today, Paths |
| SkeletonLoader | Loading placeholder | All |
| SessionHeader | Daily Focus status bar | Daily Focus |
| RoadmapNode | Day node in roadmap | Roadmap, Today |

### Component state coverage

Each component defines its relevant states from the universal state model:

- **Interactive**: default, hover, focus, pressed, disabled, loading
- **Feedback**: success, warning, error
- **Content**: empty, loading, loaded
- **Access**: signed-out, non-member, member, owner
- **Tier**: passed, strong, perfect

Not every component uses every state. See `COMPONENT_CONTRACTS` for per-component state lists.

## Screen composition model

Screen-level contracts connect Phase 6.6 behavioral strategy to the future Phase 6.9 redesign. Each screen defines:

- **Primary job** — one sentence, the main user task
- **Emotional goal** — how the user should feel
- **Main components** — which design system components appear
- **Primary CTA** — the one action the screen optimizes for
- **Empty/loading/error states** — how the screen handles edge cases
- **Motion opportunity** — where motion can reinforce the behavioral loop
- **Accessibility risk** — what could go wrong for assistive technology users
- **Privacy risk** — what data must stay private
- **Mobile behavior** — how the screen adapts on mobile
- **Desktop behavior** — how the screen uses wider layouts

See `SCREEN_COMPOSITION_MODEL` in [`src/design-system-contracts.js`](../src/design-system-contracts.js) for the full model covering all 13 key screens.

## Figma implementation guidance

No Figma file is committed or created in this phase. This section guides future Figma setup.

### Suggested Figma page structure

```text
00 — Product Principles
01 — Foundations
02 — Components
03 — Patterns
04 — Web Screens
05 — Mobile Screens
06 — Prototype / Motion Notes
```

### 00 — Product Principles

- Design system thesis
- Brand personality (proof-backed, premium, calm, focused, trustworthy)
- What the system avoids
- Identity target: "I am someone who shows proof of growth"

### 01 — Foundations

- Color palette with semantic names matching `COLOR_TOKENS`
- Typography scale matching `TYPOGRAPHY_TOKENS`
- Spacing scale matching `SPACING_TOKENS`
- Radius tokens
- Elevation/shadow tokens
- State system diagram
- Accessibility reference (contrast ratios, tap targets, focus rings)

### 02 — Components

- One frame per component from `CORE_COMPONENTS`
- Each frame shows all states and variants
- Use auto-layout for responsive behavior
- Name layers to match token names

### 03 — Patterns

- Card collections (grid, list, single-column)
- Form patterns (input + label + error)
- Navigation patterns (tab bar, bottom nav)
- Loading patterns (skeleton variants)
- Empty state patterns
- Modal / bottom sheet patterns

### 04 — Web Screens

- One frame per screen from `SCREEN_COMPOSITION_MODEL`
- Desktop (1280px) and mobile (390px) variants
- Show default, empty, loading and error states

### 05 — Mobile Screens

- One frame per mobile MVP screen from Phase 6.5
- Bottom navigation visible
- Safe area insets applied
- 390px and 430px widths

### 06 — Prototype / Motion Notes

- Motion moment annotations (no actual Figma animations required)
- Reduced-motion alternatives noted
- Transition flow diagrams for multi-step flows (AI Builder, Daily Focus)

### Naming conventions

- **Tokens**: `color/surface/canvas`, `typography/body`, `spacing/xl`
- **Components**: `Component/Button/Primary/Default`
- **Variants**: property names match contract variants
- **States**: suffix with state name: `/Default`, `/Hover`, `/Focus`, `/Disabled`
- **Responsive**: suffix with breakpoint: `/Desktop`, `/Mobile`

### Auto-layout guidance

- Use auto-layout for all component internals
- Spacing values must match `SPACING_TOKENS`
- Padding values must match `SPACING_TOKENS`
- Use fill container for responsive width
- Use hug contents for intrinsic sizing

### Responsive frame guidance

- Desktop artboard: 1280 × 800
- Tablet artboard: 768 × 1024
- Mobile artboard: 390 × 844
- Use constraints and auto-layout for responsive behavior

## Phase 6.9 web rollout note

Phase 6.9 begins production use of the design system on the web core loop only. The generated token CSS lives at [`src/generated/design-tokens.css`](../src/generated/design-tokens.css), and the internal visual QA gallery is reachable at `#/dev/design-system`. This is not a full app redesign, not a native mobile build and not a Figma artifact.

## What to implement later

- Phase 6.9: web redesign using these tokens and contracts
- CSS custom property generation from `DESIGN_TOKENS`
- Component library build (HTML/CSS or framework components)
- Figma design file with all foundations, components and screens
- Animation implementation using motion tokens
- Icon library selection
- Dark/light theme toggle
- Visual regression testing
- Full WCAG 2.1 AA audit
- Native mobile component implementation

## What not to build yet

- Production UI redesign
- Native mobile app
- Animation library integration
- Figma binary file in repo
- Font files in repo
- Runtime analytics tracking
- Push notifications UI
- Adaptive planning UI
- Leaderboards, followers, global feed
- Hearts/gems/shop economy
- Product renaming
- Design system component playground (Storybook)
