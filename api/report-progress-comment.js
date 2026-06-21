import { createRouteLogger } from './_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from './_lib/errors.js';
import { requireJsonBody } from './_lib/http.js';
import { getAdminFirestore } from './_lib/firebase-admin.js';
import { enforceRateLimit } from './_lib/rate-limit.js';
import { requireAuth } from './_lib/require-auth.js';
import {
  cleanCommentId,
  cleanEntryId,
  cleanPathId,
  ensureInteractable,
} from './_lib/progress-interactions.js';
import {
  cleanPublicTitle,
  cleanReportNote,
  cleanReportReason,
  cleanReportUid,
  reportIdFor,
  upsertModerationReport,
} from './_lib/moderation-reports.js';
import { cleanReportSnippet } from '../src/moderation.js';

export function createReportProgressCommentHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  now = () => new Date(),
  logger = console,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('report-progress-comment', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try{
      log.event('report_progress_comment_started');
      if(req.method !== 'POST'){
        res.setHeader('Allow', 'POST');
        throw apiError('method_not_allowed', 'POST only.', 405);
      }
      const auth = await authenticate(req);
      const body = requireJsonBody(req, 8 * 1024);
      const pathId = cleanPathId(body.pathId);
      const entryId = cleanEntryId(body.entryId);
      const commentId = cleanCommentId(body.commentId);
      const reason = cleanReportReason(body.reason);
      const note = cleanReportNote(body.note);
      const reporterUid = cleanReportUid(auth);
      await rateLimit(reporterUid, 'reportProgressComment');

      const firestore = db || getAdminFirestore();
      const reportId = reportIdFor({ targetType:'publicProgressComment', pathId, entryId, commentId, reporterUid, reason });
      const pathRef = firestore.collection('paths').doc(pathId);
      const entryRef = pathRef.collection('publicProgress').doc(entryId);
      const commentRef = entryRef.collection('comments').doc(commentId);
      const reportRef = firestore.collection('moderationReports').doc(reportId);
      const report = await firestore.runTransaction(async transaction => {
        const [pathSnap, entrySnap, commentSnap] = await Promise.all([
          transaction.get(pathRef),
          transaction.get(entryRef),
          transaction.get(commentRef),
        ]);
        const { path } = ensureInteractable(pathSnap, entrySnap, pathId, entryId);
        if(!commentSnap.exists) throw apiError('comment_not_found', 'This comment could not be found.', 404);
        const comment = commentSnap.data() || {};
        if(comment.visibility !== 'public' || comment.status !== 'visible'){
          throw apiError('comment_not_found', 'This comment could not be found.', 404);
        }
        return upsertModerationReport(transaction, reportRef, {
          targetType:'publicProgressComment',
          pathId,
          entryId,
          commentId,
          reporterUid,
          ownerId:path.ownerId || '',
          reason,
          note,
          contentSnapshot:{
            publicTitle:cleanPublicTitle(path),
            publicSnippet:cleanReportSnippet(comment.body || ''),
          },
          now:now(),
        });
      });

      log.event('report_progress_comment_response_sent', {
        status:200,
        result:'ok',
        pathId,
        entryId,
        commentId,
        targetType:'publicProgressComment',
        reason,
      });
      return sendPrivateJson(res, 200, { ok:true, reportId:report.id, status:report.status }, requestId);
    }catch(error){
      log.event('report_progress_comment_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createReportProgressCommentHandler();
