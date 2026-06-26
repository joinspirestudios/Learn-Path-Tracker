// ── notification-model.js ───────────────────────────────────────────────────
// Pure notification model: allowed types, normalization, sanitization and
// public-safe projection. No DOM, no Firebase, no side effects — safe to import
// from web views, the mobile skin, the server, and tests.
//
// A notification supports the proof-of-growth loop (start/finish a day, upload
// pending proof, streak risk, public-progress interactions, path milestones).
// It MUST NEVER carry private proof bodies, private reflections, raw evidence
// URLs, Storage paths, tokens, emails or passwords.

export const NOTIFICATION_SCHEMA_VERSION = 1;

// Allowed notification categories. Anything outside this list is rejected.
export const NOTIFICATION_TYPES = [
  'daily_reminder',
  'streak_risk',
  'missed_day',
  'freeze_available',
  'proof_upload_pending',
  'proof_upload_failed',
  'day_synced',
  'public_progress_published',
  'public_progress_reaction',
  'public_progress_comment',
  'moderation_update',
  'path_milestone',
  'system',
];

export const NOTIFICATION_PRIORITIES = ['low', 'normal', 'high'];

// Field names that must never appear in a notification document. These are the
// private surfaces the platform protects across every phase.
const FORBIDDEN_FIELDS = [
  'proofBody', 'proofText', 'reflection', 'reflectionText', 'privateNote',
  'evidenceUrl', 'evidenceUrls', 'rawEvidenceUrl', 'storagePath', 'downloadURL',
  'downloadUrl', 'localUri', 'fileUri', 'token', 'idToken', 'accessToken',
  'authToken', 'password', 'email', 'apiKey', 'secret', 'base64', 'dataUrl',
];

// Substrings that, if found inside a free-text title/body, indicate leaked
// private data and are stripped defensively.
const LEAK_PATTERNS = [
  /\bgs:\/\/\S+/gi, // Storage bucket URIs
  /\bfile:\/\/\/\S+/gi, // local file URIs
  /\busers\/[^\s]*\/proofMedia\/\S+/gi, // owner-scoped proof media paths
  /\bevidence\/[^\s]+/gi, // evidence storage paths
  /\bdata:image\/[^\s)]+/gi, // inline base64 image data
  /\beyJ[a-zA-Z0-9_-]{8,}\b/g, // JWT-looking tokens
  /[\w.+-]+@[\w-]+\.[\w.-]+/g, // email addresses
];

const DEFAULT_TITLES = {
  daily_reminder: 'Time for today',
  streak_risk: 'Your streak is at risk',
  missed_day: 'You missed a day',
  freeze_available: 'A streak freeze is available',
  proof_upload_pending: 'Proof upload pending',
  proof_upload_failed: 'Proof upload failed',
  day_synced: 'Your day was saved',
  public_progress_published: 'Your progress was published',
  public_progress_reaction: 'Someone respected your progress',
  public_progress_comment: 'Someone commented on your public progress',
  moderation_update: 'Moderation update',
  path_milestone: 'Path milestone reached',
  system: 'Update',
};

const DEFAULT_ACTIONS = {
  daily_reminder: { actionLabel: 'Start today', actionUrl: '#/today' },
  streak_risk: { actionLabel: 'Keep your streak', actionUrl: '#/today' },
  missed_day: { actionLabel: 'Get back on track', actionUrl: '#/today' },
  freeze_available: { actionLabel: 'Review your streak', actionUrl: '#/today' },
  proof_upload_pending: { actionLabel: 'Finish upload', actionUrl: '#/today' },
  proof_upload_failed: { actionLabel: 'Retry upload', actionUrl: '#/today' },
  day_synced: { actionLabel: 'View progress', actionUrl: '#/progress' },
  public_progress_published: { actionLabel: 'View progress', actionUrl: '#/progress' },
  public_progress_reaction: { actionLabel: 'View progress', actionUrl: '#/progress' },
  public_progress_comment: { actionLabel: 'View comments', actionUrl: '#/progress' },
  moderation_update: { actionLabel: 'Review', actionUrl: '#/progress' },
  path_milestone: { actionLabel: 'View path', actionUrl: '#/paths' },
  system: { actionLabel: '', actionUrl: '' },
};

export function isAllowedNotificationType(type) {
  return NOTIFICATION_TYPES.includes(String(type || ''));
}

function cleanPriority(value) {
  return NOTIFICATION_PRIORITIES.includes(String(value || '')) ? String(value) : 'normal';
}

function cleanText(value, max = 280) {
  let text = String(value == null ? '' : value);
  for (const pattern of LEAK_PATTERNS) text = text.replace(pattern, '');
  // Collapse whitespace introduced by stripping and trim to a safe length.
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanIdLike(value, max = 200) {
  const text = String(value == null ? '' : value).trim();
  // Allow only path/id-safe characters; never a URL or file path.
  if (/^https?:|^gs:|^file:|^data:/i.test(text)) return '';
  return text.slice(0, max);
}

function cleanActionUrl(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  // Only allow in-app hash routes or same-origin relative paths. Never an
  // external URL, Storage path, or token-bearing link.
  if (/^#\//.test(text)) return text.slice(0, 300);
  if (/^\/(?!\/)[\w\-/?=&.%]*$/.test(text)) return text.slice(0, 300);
  return '';
}

function cleanTimestamp(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Remove every forbidden field from an arbitrary input object. Returns a new
// shallow object that only carries allowed keys.
export function sanitizeNotificationPayload(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const out = {};
  for (const [key, value] of Object.entries(source)) {
    if (FORBIDDEN_FIELDS.includes(key)) continue;
    out[key] = value;
  }
  // Title/body are free text and are additionally scrubbed of leak patterns.
  if ('title' in out) out.title = cleanText(out.title, 140);
  if ('body' in out) out.body = cleanText(out.body, 280);
  if ('sourceDisplayName' in out) out.sourceDisplayName = cleanText(out.sourceDisplayName, 80);
  return out;
}

export function notificationTitleFor(input = {}) {
  const type = isAllowedNotificationType(input.type) ? input.type : 'system';
  const explicit = cleanText(input.title, 140);
  return explicit || DEFAULT_TITLES[type] || DEFAULT_TITLES.system;
}

export function notificationActionFor(input = {}) {
  const type = isAllowedNotificationType(input.type) ? input.type : 'system';
  const fallback = DEFAULT_ACTIONS[type] || DEFAULT_ACTIONS.system;
  const actionLabel = cleanText(input.actionLabel, 60) || fallback.actionLabel || '';
  const actionUrl = cleanActionUrl(input.actionUrl) || fallback.actionUrl || '';
  return { actionLabel, actionUrl };
}

// Normalize an arbitrary input into a safe, complete notification document.
// Unknown types collapse to 'system'. All private fields are dropped.
export function normalizeNotification(input = {}) {
  const safe = sanitizeNotificationPayload(input);
  const type = isAllowedNotificationType(safe.type) ? safe.type : 'system';
  const now = cleanTimestamp(safe.createdAt, Date.now());
  const { actionLabel, actionUrl } = notificationActionFor({ ...safe, type });
  return {
    id: cleanIdLike(safe.id, 200) || '',
    uid: cleanIdLike(safe.uid, 128),
    type,
    title: notificationTitleFor({ ...safe, type }),
    body: cleanText(safe.body, 280),
    actionLabel,
    actionUrl,
    entityType: cleanIdLike(safe.entityType, 40),
    entityId: cleanIdLike(safe.entityId, 200),
    pathId: cleanIdLike(safe.pathId, 200),
    dayNumber: Number.isFinite(Number(safe.dayNumber)) && safe.dayNumber != null
      ? Math.max(0, Math.floor(Number(safe.dayNumber))) : null,
    sourceUserId: cleanIdLike(safe.sourceUserId, 128),
    sourceDisplayName: cleanText(safe.sourceDisplayName, 80),
    sourceAvatarURL: cleanActionUrlOrHttpsImage(safe.sourceAvatarURL),
    priority: cleanPriority(safe.priority),
    read: !!safe.read,
    archived: !!safe.archived,
    createdAt: now,
    updatedAt: cleanTimestamp(safe.updatedAt, now),
    schemaVersion: Number(safe.schemaVersion) || NOTIFICATION_SCHEMA_VERSION,
  };
}

// Avatars are public profile images served over https. They are not private
// evidence; allow an https image URL but nothing else (no Storage/file/token).
function cleanActionUrlOrHttpsImage(value) {
  const text = String(value == null ? '' : value).trim();
  if (/^https:\/\/[^\s]+$/i.test(text) && !/token=|Authorization|\.firebasestorage\.app\/.*proofMedia/i.test(text)) {
    return text.slice(0, 500);
  }
  return '';
}

export function notificationIsUnread(notification) {
  if (!notification || typeof notification !== 'object') return false;
  return !notification.read && !notification.archived;
}

// Public-safe projection: only the fields that may ever be shown in any UI.
// Explicitly omits uid, entity ids, source ids and any potential private field.
export function notificationPublicSafeView(notification) {
  const n = normalizeNotification(notification || {});
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    actionLabel: n.actionLabel,
    actionUrl: n.actionUrl,
    priority: n.priority,
    read: n.read,
    archived: n.archived,
    createdAt: n.createdAt,
  };
}

export default {
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_SCHEMA_VERSION,
  isAllowedNotificationType,
  sanitizeNotificationPayload,
  notificationTitleFor,
  notificationActionFor,
  normalizeNotification,
  notificationIsUnread,
  notificationPublicSafeView,
};
