export const COLOR_TOKENS = {
  surface: {
    canvas: { value: '#15131C', purpose: 'App background, deepest layer', usage: 'html/body background', a11y: 'Deep neutral-violet Aurora base, warm-tinted and not cold slate' },
    panel: { value: '#1E1B26', purpose: 'Card and section backgrounds', usage: 'Cards, sidebars, content panels', a11y: 'Must maintain 4.5:1 contrast with readable text tokens' },
    raised: { value: '#27232F', purpose: 'Elevated surface above panel', usage: 'Modals, dropdowns, floating panels', a11y: 'Must maintain visible separation from canvas and readable muted labels' },
    input: { value: '#221E2B', purpose: 'Input field background', usage: 'Text inputs, selects, search bars', a11y: 'Must maintain 4.5:1 contrast with readable text tokens' },
    overlay: { value: 'rgba(0, 0, 0, 0.72)', purpose: 'Modal/overlay backdrop', usage: 'Behind modals and dialogs', a11y: 'Dims content to focus attention on foreground' },
  },
  text: {
    primary: { value: '#F2EFF7', purpose: 'Primary readable text', usage: 'Body copy, headings, labels on dark surfaces', a11y: 'High contrast on Aurora canvas and panel; not assumed safe on every accent fill' },
    secondary: { value: '#ABA3B8', purpose: 'Supporting text, descriptions', usage: 'Metadata, helper text, timestamps', a11y: 'Readable on Aurora canvas, panel and raised surfaces' },
    muted: { value: '#958CA5', purpose: 'De-emphasized but readable text', usage: 'Placeholders, disabled labels, footnotes, compact metadata', a11y: 'Raised from the initial Aurora muted value so small labels remain above 4.5:1 on raised surfaces' },
    inverse: { value: '#11140E', purpose: 'Dark text on green and purple accent backgrounds', usage: 'Labels on proof, success and peak fills', a11y: 'Passes contrast on green proof and purple peak fills' },
  },
  border: {
    subtle: { value: 'rgba(242, 239, 247, 0.10)', purpose: 'Gentle dividers between sections', usage: 'Card borders, horizontal rules', a11y: 'Decorative, not sole differentiator' },
    strong: { value: 'rgba(109, 93, 246, 0.42)', purpose: 'Prominent borders for active elements', usage: 'Selected cards, active inputs', a11y: 'Visible indigo separation against Aurora surfaces' },
    focus: { value: '#9485FF', purpose: 'Focus indicator border', usage: 'Keyboard focus rings', a11y: 'Must be visible on all Aurora surface tones' },
  },
  accent: {
    progress: { value: '#6D5DF6', purpose: 'Lead Aurora action, progress, continuity and active journey', usage: 'Progress bars, primary actions, active states, streaks', a11y: 'Use pure white labels on filled indigo for normal text contrast' },
    proof: { value: '#2ED06E', purpose: 'Proof submitted, evidence verified and Strong tier only', usage: 'Proof badges, verified indicators, Strong tier', a11y: 'Use text.inverse on green fills; do not rely on color alone' },
    warning: { value: '#F0B84A', purpose: 'Caution, streak at risk, attention', usage: 'Streak warnings, approaching limits', a11y: 'Pair with icon or text' },
    success: { value: '#2ED06E', purpose: 'Completion and positive proof-family success', usage: 'Day passed, task done, publish success', a11y: 'Use text.inverse on green fills' },
    danger: { value: '#FB5B5B', purpose: 'Error, destructive action, report', usage: 'Delete, report, error messages', a11y: 'Pair with text/icon; readable on Aurora surfaces' },
    trust: { value: '#B15CF6', purpose: 'Peak, Perfect tier and rare public trust emphasis', usage: 'Perfect tier, peak chips, trust punctuation', a11y: 'Use text.inverse on purple fills for normal text contrast' },
  },
  state: {
    focus: { value: '#9485FF', purpose: 'Focus ring color', usage: 'Keyboard and programmatic focus', a11y: 'Indigo ring visible against all Aurora surfaces' },
    disabled: { value: '#958CA5', purpose: 'Disabled elements', usage: 'Disabled buttons, locked controls', a11y: 'Dim but readable on Aurora surfaces' },
    loading: { value: '#958CA5', purpose: 'Loading/skeleton state', usage: 'Skeleton loaders, loading indicators', a11y: 'Animated elements must respect reduced-motion' },
    hover: { value: 'rgba(109, 93, 246, 0.12)', purpose: 'Hover highlight overlay', usage: 'Card hover, button hover', a11y: 'Indigo but subtle; do not rely on hover for essential state' },
    pressed: { value: 'rgba(109, 93, 246, 0.20)', purpose: 'Active press feedback', usage: 'Button pressed, tap feedback', a11y: 'Brief visual feedback only' },
  },
  tier: {
    passed: { value: '#ABA3B8', purpose: 'Passed completion tier', usage: 'Score display, neutral tier badge', a11y: 'Pair with text label' },
    strong: { value: '#2ED06E', purpose: 'Strong completion tier', usage: 'Score display, proof-family tier badge', a11y: 'Pair with text label; use text.inverse on filled chips' },
    perfect: { value: '#B15CF6', purpose: 'Perfect completion tier', usage: 'Score display, purple peak tier badge', a11y: 'Pair with text label; use text.inverse on filled chips' },
  },
};

export const TYPOGRAPHY_TOKENS = {
  display: { role: 'Hero text, splash, onboarding', family: 'system-ui, -apple-system, sans-serif', size: '2rem', lineHeight: 1.2, weight: 700, letterSpacing: '-0.02em', usage: 'Landing page hero, large completion celebrations' },
  pageTitle: { role: 'Top-level page headings', family: 'system-ui, -apple-system, sans-serif', size: '1.5rem', lineHeight: 1.3, weight: 600, letterSpacing: '-0.01em', usage: 'Page titles: Today, Discover, Daily Focus' },
  sectionTitle: { role: 'Section headings within pages', family: 'system-ui, -apple-system, sans-serif', size: '1.125rem', lineHeight: 1.4, weight: 600, letterSpacing: 'normal', usage: 'Card section headers, filter group labels' },
  cardTitle: { role: 'Card-level headings', family: 'system-ui, -apple-system, sans-serif', size: '1rem', lineHeight: 1.4, weight: 600, letterSpacing: 'normal', usage: 'Path card title, task card title' },
  body: { role: 'Primary readable text', family: 'system-ui, -apple-system, sans-serif', size: '0.9375rem', lineHeight: 1.6, weight: 400, letterSpacing: 'normal', usage: 'Descriptions, instructions, explanations' },
  bodySmall: { role: 'Secondary readable text', family: 'system-ui, -apple-system, sans-serif', size: '0.8125rem', lineHeight: 1.5, weight: 400, letterSpacing: 'normal', usage: 'Helper text, metadata, timestamps, captions' },
  label: { role: 'Form labels, chip text, navigation', family: 'system-ui, -apple-system, sans-serif', size: '0.8125rem', lineHeight: 1.4, weight: 500, letterSpacing: '0.01em', usage: 'Input labels, filter chips, tab labels, nav items' },
  metadata: { role: 'Tertiary information', family: 'system-ui, -apple-system, sans-serif', size: '0.75rem', lineHeight: 1.4, weight: 400, letterSpacing: '0.02em', usage: 'Dates, counts, schema versions, request IDs' },
  button: { role: 'Button labels', family: 'system-ui, -apple-system, sans-serif', size: '0.875rem', lineHeight: 1, weight: 600, letterSpacing: '0.01em', usage: 'Primary/secondary/ghost button text' },
  numeric: { role: 'Scores, counts, stats, metrics', family: 'system-ui, -apple-system, sans-serif', size: '1.25rem', lineHeight: 1.2, weight: 700, letterSpacing: '-0.02em', usage: 'Score display, streak count, trust metrics, day number' },
};

export const SPACING_TOKENS = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  '4xl': 32,
  '5xl': 40,
  '6xl': 48,
  '7xl': 64,
};

export const RADIUS_TOKENS = {
  small: { value: '4px', usage: 'Chips, badges, small controls' },
  medium: { value: '8px', usage: 'Buttons, inputs, selects' },
  large: { value: '12px', usage: 'Cards, panels' },
  xl: { value: '16px', usage: 'Modals, large panels' },
  pill: { value: '9999px', usage: 'Pills, fully rounded elements' },
  card: { value: '16px', usage: 'Cards, panels, daily focus, rail cards (matches xl)' },
  modal: { value: '16px', usage: 'Modal dialog corners' },
};

export const ELEVATION_TOKENS = {
  flat: { value: 'none', usage: 'Inline elements, no elevation' },
  raised: { value: '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)', usage: 'Cards, panels above canvas' },
  floating: { value: '0 4px 12px rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.3)', usage: 'Dropdowns, popovers, floating actions' },
  overlay: { value: '0 8px 24px rgba(0, 0, 0, 0.5)', usage: 'Modals, dialogs, overlays' },
  focusRing: { value: '0 0 0 2px #9485FF', usage: 'Keyboard focus indicator, outset ring' },
};

export const EFFECT_TOKENS = {
  leadGlow: { value: '0 8px 24px rgba(109, 93, 246, 0.42)', usage: 'Primary CTA, active roadmap node, brand mark' },
  ambient: { value: 'radial-gradient(circle at 16% 12%, rgba(109, 93, 246, 0.18), transparent 30%), radial-gradient(circle at 86% 4%, rgba(177, 92, 246, 0.12), transparent 28%)', usage: 'Optional shell background so the Aurora dark surface feels alive without decoration overload' },
};

export const MOTION_TOKENS = {
  duration: {
    fast: { value: '120ms', usage: 'Micro-interactions: button press, checkbox toggle' },
    base: { value: '200ms', usage: 'Standard transitions: card hover, input focus' },
    slow: { value: '350ms', usage: 'Larger transitions: modal enter, panel slide' },
  },
  easing: {
    standard: { value: 'cubic-bezier(0.4, 0, 0.2, 1)', usage: 'General-purpose easing' },
    enter: { value: 'cubic-bezier(0, 0, 0.2, 1)', usage: 'Elements entering view' },
    exit: { value: 'cubic-bezier(0.4, 0, 1, 1)', usage: 'Elements leaving view' },
  },
  taskTransition: { duration: '200ms', easing: 'standard', purpose: 'Moving between tasks in Daily Focus' },
  proofSaved: { duration: '350ms', easing: 'enter', purpose: 'Proof submission confirmation feedback' },
  scoreIncrease: { duration: '350ms', easing: 'standard', purpose: 'Score meter filling animation' },
  completionResult: { duration: '350ms', easing: 'enter', purpose: 'Completion result reveal and tier badge' },
  perfectDayCelebration: { duration: '500ms', easing: 'enter', purpose: 'Perfect day tier celebration moment' },
  reducedMotion: { fallback: 'instant', rule: 'prefers-reduced-motion: reduce', purpose: 'Disable all non-essential animation for users who prefer reduced motion' },
};

export const STATE_TOKENS = {
  default: { description: 'Normal resting state' },
  hover: { description: 'Pointer hover, not applicable on touch', overlay: 'state.hover' },
  focus: { description: 'Keyboard or programmatic focus', ring: 'elevation.focusRing', border: 'border.focus' },
  pressed: { description: 'Active press/tap', overlay: 'state.pressed' },
  disabled: { description: 'Non-interactive, locked', opacity: 0.5, cursor: 'not-allowed' },
  loading: { description: 'Waiting for data or action', showSkeleton: true },
  success: { description: 'Action completed successfully', accent: 'accent.success' },
  warning: { description: 'Attention needed, not blocking', accent: 'accent.warning' },
  error: { description: 'Action failed or invalid', accent: 'accent.danger' },
  empty: { description: 'No content available', showEmptyState: true },
};

export const ACCESSIBILITY_TOKENS = {
  tapTarget: { minSize: '44px', purpose: 'Minimum touch target for mobile and accessibility', wcag: 'WCAG 2.1 SC 2.5.5' },
  focusRing: { width: '2px', color: 'border.focus', offset: '2px', purpose: 'Visible keyboard focus indicator', wcag: 'WCAG 2.1 SC 2.4.7' },
  contrastTarget: { normal: '4.5:1', large: '3:1', purpose: 'Minimum contrast ratios for text', wcag: 'WCAG 2.1 SC 1.4.3' },
  reducedMotion: { mediaQuery: 'prefers-reduced-motion: reduce', behavior: 'Disable non-essential animation, preserve state changes', wcag: 'WCAG 2.1 SC 2.3.3' },
  ariaLive: { feedback: 'polite', urgent: 'assertive', purpose: 'Screen reader announcements for dynamic updates', usage: 'Score changes, task completion, error messages, loading state' },
  errorMessaging: { pattern: 'Inline error adjacent to field, not toast-only', purpose: 'Errors must be perceivable without relying solely on color', wcag: 'WCAG 2.1 SC 1.4.1' },
  loadingState: { pattern: 'aria-busy on container, skeleton or spinner with aria-label', purpose: 'Loading must be announced to assistive technology' },
  disabledState: { pattern: 'aria-disabled preferred over disabled attribute for focusability', purpose: 'Disabled controls should remain discoverable by keyboard' },
  colorIndependence: { rule: 'Never use color as the only means of conveying status', purpose: 'Pair colors with icons, text labels or patterns', wcag: 'WCAG 2.1 SC 1.4.1' },
};

export const DESIGN_TOKENS = {
  color: COLOR_TOKENS,
  typography: TYPOGRAPHY_TOKENS,
  spacing: SPACING_TOKENS,
  radius: RADIUS_TOKENS,
  elevation: ELEVATION_TOKENS,
  effect: EFFECT_TOKENS,
  motion: MOTION_TOKENS,
  state: STATE_TOKENS,
  accessibility: ACCESSIBILITY_TOKENS,
};
