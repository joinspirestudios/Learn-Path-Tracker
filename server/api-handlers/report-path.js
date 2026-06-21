import { createRouteLogger } from '../../api/_lib/diagnostics.js';
import { apiError, createRequestId, sendApiError, sendPrivateJson, setPrivateNoStore } from '../../api/_lib/errors.js';
import { requireJsonBody } from '../../api/_lib/http.js';
import { getAdminFirestore } from '../../api/_lib/firebase-admin.js';
import { enforceRateLimit } from '../../api/_lib/rate-limit.js';
import { requireAuth } from '../../api/_lib/require-auth.js';
import { cleanPathId, visiblePublicPath } from '../../api/_lib/progress-interactions.js';
import {
  cleanPublicTitle,
  cleanReportNote,
  cleanReportReason,
  cleanReportUid,
  reportIdFor,
  upsertModerationReport,
} from '../../api/_lib/moderation-reports.js';

export function createReportPathHandler({
  authenticate = requireAuth,
  rateLimit = enforceRateLimit,
  db = null,
  now = () => new Date(),
  logger = console,
} = {}){
  return async function handler(req, res){
    const requestId = createRequestId();
    const log = createRouteLogger('report-path', requestId, { logger });
    setPrivateNoStore(res, requestId);
    try{
      log.event('report_path_started');
      if(req.method !== 'POST'){
        res.setHeader('Allow', 'POST');
        throw apiError('method_not_allowed', 'POST only.', 405);
      }
      const auth = await authenticate(req);
      const body = requireJsonBody(req, 8 * 1024);
      const pathId = cleanPathId(body.pathId);
      const reason = cleanReportReason(body.reason);
      const note = cleanReportNote(body.note);
      const reporterUid = cleanReportUid(auth);
      await rateLimit(reporterUid, 'reportPath');

      const firestore = db || getAdminFirestore();
      const reportId = reportIdFor({ targetType:'path', pathId, reporterUid, reason });
      const pathRef = firestore.collection('paths').doc(pathId);
      const reportRef = firestore.collection('moderationReports').doc(reportId);
      const report = await firestore.runTransaction(async transaction => {
        const pathSnap = await transaction.get(pathRef);
        if(!pathSnap.exists) throw apiError('path_not_found', 'This path could not be found.', 404);
        const path = pathSnap.data() || {};
        if(!visiblePublicPath(path)) throw apiError('path_not_public', 'This path is not available for reporting.', 403);
        return upsertModerationReport(transaction, reportRef, {
          targetType:'path',
          pathId,
          reporterUid,
          ownerId:path.ownerId || '',
          reason,
          note,
          contentSnapshot:{ publicTitle:cleanPublicTitle(path) },
          now:now(),
        });
      });

      log.event('report_path_response_sent', {
        status:200,
        result:'ok',
        pathId,
        targetType:'path',
        reason,
      });
      return sendPrivateJson(res, 200, { ok:true, reportId:report.id, status:report.status }, requestId);
    }catch(error){
      log.event('report_path_response_sent', {
        status:Number(error?.status) || 500,
        code:error?.code || 'internal_error',
        result:'error',
      }, error?.code === 'rate_limited' ? 'warn' : 'info');
      return sendApiError(res, error, requestId);
    }
  };
}

export default createReportPathHandler();
