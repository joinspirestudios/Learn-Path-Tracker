import commentProgressHandler from '../server/api-handlers/comment-progress.js';
import hideProgressCommentHandler from '../server/api-handlers/hide-progress-comment.js';
import joinPathHandler from '../server/api-handlers/join-path.js';
import publishProgressHandler from '../server/api-handlers/publish-progress.js';
import reactProgressHandler from '../server/api-handlers/react-progress.js';
import reportPathHandler from '../server/api-handlers/report-path.js';
import reportProgressCommentHandler from '../server/api-handlers/report-progress-comment.js';
import syncPathMetricsHandler from '../server/api-handlers/sync-path-metrics.js';
import unpublishProgressHandler from '../server/api-handlers/unpublish-progress.js';
import {
  listNotificationsHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
  notificationPreferencesHandler,
  savePushSubscriptionHandler,
  deletePushSubscriptionHandler,
  sendTestNotificationHandler,
  runNotificationSchedulerHandler,
} from '../server/api-handlers/notifications.js';
import { apiError, createRequestId, sendApiError, setPrivateNoStore } from './_lib/errors.js';

const handlers = {
  'join-path':joinPathHandler,
  'publish-progress':publishProgressHandler,
  'unpublish-progress':unpublishProgressHandler,
  'react-progress':reactProgressHandler,
  'comment-progress':commentProgressHandler,
  'hide-progress-comment':hideProgressCommentHandler,
  'report-path':reportPathHandler,
  'report-progress-comment':reportProgressCommentHandler,
  'sync-path-metrics':syncPathMetricsHandler,
  // Phase 6.17 — notifications (mounted here; no new Vercel function file).
  'list-notifications':listNotificationsHandler,
  'mark-notification-read':markNotificationReadHandler,
  'mark-all-notifications-read':markAllNotificationsReadHandler,
  'notification-preferences':notificationPreferencesHandler,
  'save-push-subscription':savePushSubscriptionHandler,
  'delete-push-subscription':deletePushSubscriptionHandler,
  'send-test-notification':sendTestNotificationHandler,
  'run-notification-scheduler':runNotificationSchedulerHandler,
};

function routeNameFromRequest(req){
  const queryRoute = Array.isArray(req?.query?.route) ? req.query.route[0] : req?.query?.route;
  if(queryRoute) return String(queryRoute);
  try{
    const url = new URL(req?.url || '', 'https://learn-path-tracker.local');
    return url.searchParams.get('route') || url.pathname.split('/').filter(Boolean).pop() || '';
  } catch(error){
    return '';
  }
}

export default async function handler(req, res){
  const selected = handlers[routeNameFromRequest(req)];
  if(selected) return selected(req, res);
  const requestId = createRequestId();
  setPrivateNoStore(res, requestId);
  return sendApiError(res, apiError('not_found', 'API route not found.', 404), requestId);
}
