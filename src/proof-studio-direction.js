export const PROOF_STUDIO_PRINCIPLES = [
  'proof is the hero',
  'one primary daily action',
  'journey before dashboard',
  'public trust must be real',
  'respect over likes',
  'visible continuity',
  'clear locked / active / complete progression',
  'no fake metrics',
  'one lead color (indigo) for action, progress and active state',
  'green means proof only; purple means peak only',
  'no mascot/gems/hearts/shop economy',
];

export const PROOF_STUDIO_SCREEN_PATTERNS = {
  today:{
    role:'daily action center',
    required:['active path context', 'day number / date context', 'daily focus title', 'task preview', 'proof requirement summary', 'one Start today / Continue day CTA'],
    emptyState:'Create or join a path to start today.',
    secondary:['roadmap preview', 'journey continuation', 'real consistency data only'],
  },
  dailyFocus:{
    role:'work session',
    required:['one task at a time', 'proof preparation when required', 'completion result after scoring'],
  },
  roadmap:{
    role:'visible proof journey',
    states:['completed', 'active', 'locked', 'missed', 'frozen', 'passed', 'strong', 'perfect'],
    required:['active node is obvious', 'locked nodes are unavailable', 'completed nodes can show tier labels', 'proof markers never expose raw evidence URLs'],
  },
  publicProgress:{
    role:'evidence-first public progress',
    required:['person / day / path context', 'proof title', 'proof summary or specimen as main content', 'Proof submitted or Proof verified badge', 'tier chip', 'proof metadata', 'Respect / Comment / Report actions'],
  },
  rightRail:{
    role:'secondary real-data summary',
    allow:['real streak/continuity data', 'real path trust metrics', 'real proof counts', 'real joined counts', 'real completed-day counts'],
    emptyState:'Not enough data yet',
  },
};

export const PROOF_STUDIO_INTERACTION_PATTERNS = {
  primaryCta:'Use one clear indigo primary action per screen section with visible hover, active, focus-visible, disabled and loading states.',
  buttons:'Primary buttons use indigo fill with a passing on-fill label; secondary buttons are outlined; ghost buttons are quiet text; destructive buttons use danger.',
  cards:'Interactive cards may lift gently on hover/focus with an indigo border; static cards do not imply clickability.',
  proofCards:'Proof cards may reveal gently and rise on hover/focus, while preserving reduced-motion fallbacks.',
  reactions:'Respect buttons can use small press feedback without changing the data model or fabricating counts.',
  roadmap:'Completed, active, locked, missed and frozen states must be text-readable, not color-only; active uses indigo, proof uses green, peak uses purple.',
  inputs:'Inputs, search and inline errors must show visible focus/error states with text, not color-only feedback.',
  motion:['button press feedback', 'card hover/focus', 'proof card reveal', 'progress meter transition', 'completion result reveal preparation'],
  reducedMotion:'Disable non-essential animation under prefers-reduced-motion.',
  mobile:'Hide desktop right rail and keep the daily action first.',
};

export const PROOF_STUDIO_REJECTED_PATTERNS = [
  'fake metrics',
  'leaderboard',
  'following system',
  'more than one competing primary accent',
  'cold slate base',
  'hearts/gems/shop economy',
  'mascot-driven progress',
  'raw evidence URLs in public progress',
  'Pass mark as upfront primary copy',
  'Prova product renaming',
];

export const PROOF_STUDIO_COPY_RULES = {
  prefer:[
    "Today's proof",
    'Continue day',
    'Start today',
    "Open today's session",
    'Proof needed',
    'Proof saved',
    'Proof submitted',
    'Proof verified',
    'Respect',
    'Comment',
    'Report',
    'Path trust',
    'Your consistency',
    'Every number here is proof-backed',
    'Not enough data yet',
  ],
  avoid:[
    'Like',
    'Kudos',
    'XP',
    'Gems',
    'Lives',
    'Leaderboard',
    'Pass mark',
    '65% needed',
    'fake verified claims',
  ],
  proofStatus:{
    submitted:'Use Proof submitted when evidence was shared but not independently validated.',
    verified:'Use Proof verified only when the system has an actual verified evidence state.',
  },
  publicReaction:'Respect is the preferred public reaction label; the stored reaction type may remain cheer.',
};
