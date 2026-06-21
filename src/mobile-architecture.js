export const MOBILE_ARCHITECTURE_PRINCIPLES = [
  'One brain, two skins: shared Firebase/Vercel backend with separate web and mobile presentation layers',
  'Mobile app calls the same API endpoints and Firebase project as the web app',
  'Mobile does not duplicate business logic; it imports shared pure-logic modules',
  'Mobile does not depend on src/views.js or any web DOM rendering module',
  'Mobile uses React Native + Expo for native iOS and Android',
  'Daily habit loop is the center of the mobile experience',
  'Proof upload is native: camera, photo library, file picker',
  'Signed-out users remain read-only for public previews on mobile',
  'Mobile secrets are never committed to the repository',
];

export const MOBILE_TABS = [
  { id: 'today', label: 'Today', purpose: 'Current day, daily focus entry, streak/continuity, score/tier state, resume session' },
  { id: 'paths', label: 'Paths', purpose: 'Joined paths, owned paths, active path detail, roadmap orientation' },
  { id: 'discover', label: 'Discover', purpose: 'Public paths, search/filter, public preview, join path, trust metrics' },
  { id: 'progress', label: 'Progress', purpose: 'Personal completed days, proof timeline, streak history, public/private distinction' },
  { id: 'profile', label: 'Profile', purpose: 'Account, settings, notification preferences, privacy controls, sign out' },
];

export const MOBILE_MVP_SCREENS = [
  { id: 'AuthWelcomeScreen', purpose: 'Landing screen for unauthenticated users' },
  { id: 'SignInScreen', purpose: 'Firebase Authentication sign-in' },
  { id: 'TodayScreen', purpose: 'Show current day status, streak, active session' },
  { id: 'DailyFocusScreen', purpose: 'One-task-at-a-time daily practice' },
  { id: 'ProofCaptureScreen', purpose: 'Capture or select proof for evidence-required tasks' },
  { id: 'CompletionResultScreen', purpose: 'Show day completion result, score, tier, feedback' },
  { id: 'JoinedPathsScreen', purpose: 'List joined and owned paths' },
  { id: 'PathRoadmapScreen', purpose: 'Show path roadmap with day-by-day progress' },
  { id: 'PublicPathPreviewScreen', purpose: 'Show public path preview for non-members' },
  { id: 'DiscoverScreen', purpose: 'Browse and search public paths' },
  { id: 'PublicProgressEntryScreen', purpose: 'View a public progress timeline entry' },
  { id: 'ProfileScreen', purpose: 'Account settings, preferences' },
  { id: 'SettingsScreen', purpose: 'App settings, notification preferences, privacy controls' },
];

export const MOBILE_API_CONTRACTS = {
  '/api/generate-path': { method: 'POST', auth: true, mobileUse: 'AI path creation (deferred from first MVP)', idempotent: true },
  '/api/interpret-goal': { method: 'POST', auth: true, mobileUse: 'AI goal interpretation (deferred from first MVP)', idempotent: true },
  '/api/deepgram-token': { method: 'POST', auth: true, mobileUse: 'Obtain temporary Deepgram JWT for live voice', idempotent: true },
  '/api/transcribe-voice': { method: 'POST', auth: true, mobileUse: 'Fallback audio transcription', idempotent: true },
  '/api/join-path': { method: 'POST', auth: true, mobileUse: 'Join a public/unlisted path', idempotent: true },
  '/api/publish-progress': { method: 'POST', auth: true, mobileUse: 'Publish sanitized completed-day entry', idempotent: true },
  '/api/unpublish-progress': { method: 'POST', auth: true, mobileUse: 'Remove published progress entry', idempotent: true },
  '/api/react-progress': { method: 'POST', auth: true, mobileUse: 'React to public progress entry', idempotent: true },
  '/api/comment-progress': { method: 'POST', auth: true, mobileUse: 'Comment on public progress entry', idempotent: false },
  '/api/hide-progress-comment': { method: 'POST', auth: true, mobileUse: 'Hide a comment', idempotent: true },
  '/api/report-path': { method: 'POST', auth: true, mobileUse: 'Report a public path', idempotent: false },
  '/api/report-progress-comment': { method: 'POST', auth: true, mobileUse: 'Report a public comment', idempotent: false },
  '/api/sync-path-metrics': { method: 'POST', auth: true, mobileUse: 'Sync path trust metrics', idempotent: true },
};

export const MOBILE_SHARED_BRAIN_MODULES = [
  'src/daily-session-model.js',
  'src/intensity-policy.js',
  'src/schema-versioning.js',
  'src/public-progress.js',
  'src/discovery.js',
  'src/discovery-pagination.js',
  'src/moderation.js',
  'src/journey.js',
  'src/store.js',
  'src/routes.js',
  'src/helpers.js',
  'src/urls.js',
  'src/templates.js',
  'src/ai-builder-model.js',
  'src/ai-response.js',
];

export const MOBILE_REBUILT_SKIN_AREAS = [
  'src/views.js',
  'src/views/daily-session.js',
  'src/views/daily-session-evidence.js',
  'src/views/catalog/',
  'src/views/ai-builder/',
  'src/views/voice-input.js',
  'src/header.js',
  'src/styles.css',
  'index.html',
];

export const MOBILE_DEFERRED_FEATURES = [
  'Push notifications',
  'Adaptive planning',
  'Gemini/evidence intelligence',
  'Full UI redesign',
  'Product renaming',
  'Leaderboards',
  'Hearts/gems/shop economy',
  'Followers',
  'Global feed',
  'Full owner management on mobile',
  'Advanced moderation dashboard',
  'Full AI builder redesign for mobile',
  'Offline session drafts',
];

export const MOBILE_SECRET_HANDLING_RULES = [
  'Never commit Firebase service account JSON or private keys',
  'Never commit Apple signing certificates or provisioning profiles',
  'Never commit Google Play signing keystores or credentials',
  'Never commit EAS tokens or build secrets',
  'Never commit Deepgram API keys',
  'Never commit Anthropic API keys',
  'Never commit production .env files',
  'Never commit real user data, day logs, evidence, or transcripts',
  'Never commit raw proof files or private user uploads',
  'Never commit keystores or provisioning profiles',
];
