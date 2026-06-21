import { withSchemaVersion } from './schema-versioning.js';

export const REPORT_REASONS = ['spam', 'harassment', 'unsafe', 'misleading', 'other'];
export const REPORT_NOTE_MAX = 500;
export const REPORT_SNAPSHOT_MAX = 120;
export const REPORT_TARGET_TYPES = ['path', 'publicProgress', 'publicProgressComment'];

function plainText(value){
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function safeIdPart(value){
  return String(value == null ? '' : value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'none';
}

export function normalizeReportReason(value){
  const reason = String(value == null ? '' : value).trim().toLowerCase();
  return REPORT_REASONS.includes(reason) ? reason : 'other';
}

export function isSupportedReportReason(value){
  return REPORT_REASONS.includes(String(value == null ? '' : value).trim().toLowerCase());
}

export function normalizeReportNote(value){
  return plainText(value).slice(0, REPORT_NOTE_MAX);
}

export function reportTargetLabel(targetType){
  return ({
    path: 'Path',
    publicProgress: 'Public progress',
    publicProgressComment: 'Comment',
  })[targetType] || 'Content';
}

export function normalizeReportTargetType(value){
  return REPORT_TARGET_TYPES.includes(value) ? value : 'path';
}

export function cleanReportSnippet(value, max = REPORT_SNAPSHOT_MAX){
  return plainText(value).slice(0, max);
}

export function moderationReportId({ targetType, pathId, entryId = '', commentId = '', reporterUid, reason } = {}){
  const type = normalizeReportTargetType(targetType);
  const parts = [
    type,
    safeIdPart(pathId),
    safeIdPart(entryId),
    safeIdPart(commentId),
    safeIdPart(reporterUid),
    normalizeReportReason(reason),
  ];
  return parts.join('_').slice(0, 720);
}

export function makeModerationReport({
  targetType,
  pathId,
  entryId = null,
  commentId = null,
  reporterUid,
  ownerId = '',
  reason,
  note = '',
  contentSnapshot = {},
  existing = null,
  now = new Date(),
} = {}){
  const safeType = normalizeReportTargetType(targetType);
  const safeReason = normalizeReportReason(reason);
  const createdAt = existing?.createdAt || now;
  const reportCount = Math.max(1, Number(existing?.reportCount || 0) + 1);
  const targetPath = safeType === 'publicProgressComment'
    ? `paths/${pathId}/publicProgress/${entryId}/comments/${commentId}`
    : safeType === 'publicProgress'
      ? `paths/${pathId}/publicProgress/${entryId}`
      : `paths/${pathId}`;
  const id = existing?.id || moderationReportId({
    targetType:safeType,
    pathId,
    entryId,
    commentId,
    reporterUid,
    reason:safeReason,
  });

  return withSchemaVersion('moderationReport', {
    id,
    targetType:safeType,
    targetPath,
    pathId:String(pathId || ''),
    entryId:entryId || null,
    commentId:commentId || null,
    reporterUid:String(reporterUid || ''),
    ownerId:String(ownerId || ''),
    reason:safeReason,
    note:normalizeReportNote(note),
    status:existing?.status || 'open',
    reportCount,
    contentSnapshot:{
      publicTitle:cleanReportSnippet(contentSnapshot.publicTitle || ''),
      publicSnippet:cleanReportSnippet(contentSnapshot.publicSnippet || ''),
    },
    createdAt,
    updatedAt:now,
    schemaVersion:existing?.schemaVersion,
  });
}
