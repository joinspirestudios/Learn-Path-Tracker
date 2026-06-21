import { apiError } from './errors.js';
import { boundedText } from './http.js';
import {
  cleanReportSnippet,
  isSupportedReportReason,
  makeModerationReport,
  moderationReportId,
  normalizeReportNote,
  normalizeReportReason,
} from '../../src/moderation.js';

export function cleanReportReason(value){
  if(!isSupportedReportReason(value)){
    throw apiError('invalid_report_reason', 'Choose a supported report reason.', 400);
  }
  return normalizeReportReason(value);
}

export function cleanReportNote(value){
  return normalizeReportNote(value);
}

export function cleanPublicTitle(path = {}){
  return cleanReportSnippet(path.previewTitle || path.title || path.goal || 'Public path');
}

export function cleanReportUid(auth){
  return boundedText(auth?.uid, 'uid', 180, { required:true });
}

export function reportIdFor(payload){
  return moderationReportId(payload);
}

export async function upsertModerationReport(transaction, reportRef, payload){
  const snap = await transaction.get(reportRef);
  const existing = snap.exists ? (snap.data() || {}) : null;
  const report = makeModerationReport({ ...payload, existing });
  transaction.set(reportRef, report, { merge:false });
  return report;
}
