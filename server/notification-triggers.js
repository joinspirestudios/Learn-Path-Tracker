// ── server/notification-triggers.js ─────────────────────────────────────────
// Builders that turn server events into safe notifications, plus thin wiring
// helpers that persist them via notification-service. Builders are pure and
// return null when no notification should be sent (e.g. acting on your own
// progress), so callers stay simple and spam-free.
//
// Copy is generic and sanitized: never the comment body, never private proof,
// never raw evidence. Uses neutral verbs like "respected" / "commented" and
// avoids any social-status or game-economy vocabulary.

import { createUserNotification, buildNotificationId, deliverUserPushNotifications } from './notification-service.js';

function cleanName(value) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  // No emails or token-looking strings as a display name.
  if (/[@]|eyJ[a-zA-Z0-9_-]{8,}/.test(text)) return '';
  return text.slice(0, 60);
}

// public_progress_reaction → notify the progress owner (not the actor).
export function buildReactionNotification({ ownerUid, actorUid, actorDisplayName = '', pathId = '', entryId = '' } = {}) {
  if (!ownerUid || !actorUid || ownerUid === actorUid) return null;
  return {
    uid: ownerUid,
    notification: {
      type: 'public_progress_reaction',
      title: 'Someone respected your progress',
      body: 'A learner respected your public progress.',
      entityType: 'publicProgress',
      entityId: entryId,
      pathId,
      sourceUserId: actorUid,
      sourceDisplayName: cleanName(actorDisplayName),
      scopeId: entryId,
      // Idempotent per (entry, actor) so repeated reactions don't spam.
      id: buildNotificationId({ type: 'public_progress_reaction', scopeId: entryId, sourceUserId: actorUid }),
    },
  };
}

// public_progress_comment → notify the progress owner. Never includes the
// comment text; uses a generic, safe summary.
export function buildCommentNotification({ ownerUid, actorUid, actorDisplayName = '', pathId = '', entryId = '', commentId = '' } = {}) {
  if (!ownerUid || !actorUid || ownerUid === actorUid) return null;
  return {
    uid: ownerUid,
    notification: {
      type: 'public_progress_comment',
      title: 'Someone commented on your public progress',
      body: 'A learner left a comment on your public progress.',
      entityType: 'publicProgress',
      entityId: entryId,
      pathId,
      sourceUserId: actorUid,
      sourceDisplayName: cleanName(actorDisplayName),
      scopeId: commentId || entryId,
      id: buildNotificationId({ type: 'public_progress_comment', scopeId: commentId || entryId }),
    },
  };
}

// public_progress_published → optional in-app confirmation for the owner.
export function buildPublishedNotification({ ownerUid, pathId = '', entryId = '' } = {}) {
  if (!ownerUid) return null;
  return {
    uid: ownerUid,
    notification: {
      type: 'public_progress_published',
      title: 'Your progress was published',
      body: 'Your day is now visible on your public progress timeline.',
      entityType: 'publicProgress',
      entityId: entryId,
      pathId,
      scopeId: entryId,
      id: buildNotificationId({ type: 'public_progress_published', scopeId: entryId }),
    },
  };
}

// moderation_update → notify the affected owner. `kind` selects safe copy.
export function buildModerationNotification({ ownerUid, kind = 'received', pathId = '', entryId = '' } = {}) {
  if (!ownerUid) return null;
  const copy = kind === 'comment_hidden'
    ? { title: 'A comment was hidden from your progress', body: 'A comment on your public progress was hidden after review.' }
    : kind === 'report_received'
      ? { title: 'Your report was received', body: 'Thanks — your report was received and will be reviewed.' }
      : { title: 'Moderation update', body: 'There is a moderation update on your public progress.' };
  return {
    uid: ownerUid,
    notification: {
      type: 'moderation_update',
      title: copy.title,
      body: copy.body,
      entityType: 'moderation',
      entityId: entryId,
      pathId,
      scopeId: entryId,
      uniqueSuffix: kind,
      id: buildNotificationId({ type: 'moderation_update', scopeId: entryId, uniqueSuffix: kind }),
    },
  };
}

// Thin async wiring: persist a built notification, then best-effort browser push
// to the owner. Safe to call from existing handlers; swallows errors so a
// notification/push failure never breaks the underlying event.
export async function deliverBuiltNotification({ adminDb, built, env = process.env, webpush = null, logger = null } = {}) {
  if (!adminDb || !built || !built.uid || !built.notification) return null;
  let stored = null;
  try {
    stored = await createUserNotification({ adminDb, uid: built.uid, notification: built.notification });
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('notification_trigger_failed', { type: built.notification.type });
    }
    return null;
  }
  // Best-effort push (honors preferences + quiet hours + config; never throws).
  try {
    await deliverUserPushNotifications({ adminDb, uid: built.uid, notification: stored, env, webpush });
  } catch { /* push is best-effort */ }
  return stored;
}

function forward(args) {
  return { adminDb: args.adminDb, env: args.env, webpush: args.webpush, logger: args.logger };
}
export async function notifyProgressReaction(args = {}) {
  return deliverBuiltNotification({ ...forward(args), built: buildReactionNotification(args) });
}
export async function notifyProgressComment(args = {}) {
  return deliverBuiltNotification({ ...forward(args), built: buildCommentNotification(args) });
}
export async function notifyProgressPublished(args = {}) {
  return deliverBuiltNotification({ ...forward(args), built: buildPublishedNotification(args) });
}
export async function notifyModerationUpdate(args = {}) {
  return deliverBuiltNotification({ ...forward(args), built: buildModerationNotification(args) });
}

export default {
  buildReactionNotification,
  buildCommentNotification,
  buildPublishedNotification,
  buildModerationNotification,
  deliverBuiltNotification,
  notifyProgressReaction,
  notifyProgressComment,
  notifyProgressPublished,
  notifyModerationUpdate,
};
