import { getTasksForDay } from './journey.js';
import { sessionProgress, sessionTaskStates, taskTitle } from './daily-session-model.js';
import { currentSchemaVersion, normalizeDocumentSchemaVersion } from './schema-versioning.js';
import { safeExternalUrl } from './urls.js';

export const PUBLIC_PROGRESS_SCHEMA_VERSION = currentSchemaVersion('publicProgress');
export const PUBLIC_PROGRESS_CAPTION_MAX = 500;
export const PUBLIC_COMMENT_SCHEMA_VERSION = currentSchemaVersion('publicProgressComment');
export const PUBLIC_COMMENT_MAX = 500;
export const PUBLIC_REACTION_TYPES = ['cheer', 'keep_going', 'inspired'];

function cleanNumber(value, fallback = 0){
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function cleanText(value, max = 120){
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function cleanCompletionTier(value){
  return ['not_started', 'in_progress', 'attempted', 'passed', 'strong', 'perfect', 'blocked_anchor']
    .includes(value) ? value : '';
}

export function normalizeReactionType(value){
  const type = String(value == null ? '' : value).trim().toLowerCase();
  return PUBLIC_REACTION_TYPES.includes(type) ? type : null;
}

export function normalizePublicProgressReaction(raw = {}){
  const type = normalizeReactionType(raw.type);
  return {
    userId:cleanText(raw.userId, 160),
    type,
    createdAt:raw.createdAt || null,
    updatedAt:raw.updatedAt || raw.createdAt || null,
    schemaVersion:normalizeDocumentSchemaVersion('publicProgressReaction', raw),
  };
}

export function emptyReactionCounts(){
  return Object.fromEntries(PUBLIC_REACTION_TYPES.map(type => [type, 0]));
}

export function normalizeReactionCounts(value = {}){
  const source = value && typeof value === 'object' ? value : {};
  const counts = emptyReactionCounts();
  PUBLIC_REACTION_TYPES.forEach(type => {
    const count = Number(source[type] || 0);
    counts[type] = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  });
  return counts;
}

export function totalReactionCount(value = {}){
  return Object.values(normalizeReactionCounts(value)).reduce((sum, count) => sum + count, 0);
}

export function publicProgressEntryId(userId, dayNumber){
  const uid = String(userId || 'learner').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'learner';
  const day = Math.max(1, cleanNumber(dayNumber, 1));
  return `${uid}_day_${day}`;
}

export function cleanPublicCaption(value){
  return cleanText(value, PUBLIC_PROGRESS_CAPTION_MAX);
}

export function cleanPublicCommentBody(value){
  if(typeof value !== 'string') return '';
  return cleanText(value, PUBLIC_COMMENT_MAX);
}

export function cleanAuthorName(value){
  const name = cleanText(value, 80);
  return name || 'A learner';
}

export function cleanEvidenceType(value){
  return value === 'file' ? 'file' : 'url';
}

export function evidenceTypeLabel(type){
  return cleanEvidenceType(type) === 'file' ? 'File' : 'URL';
}

export function normalizeEvidenceTypes(submissions = []){
  const seen = new Set();
  (Array.isArray(submissions) ? submissions : []).forEach(item => {
    seen.add(cleanEvidenceType(item?.evidenceType));
  });
  return Array.from(seen);
}

function safeDate(value, fallback){
  if(value && typeof value.toDate === 'function') return value;
  if(value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if(value){
    const date = new Date(value);
    if(!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
}

function dateMs(value){
  const safe = safeDate(value, new Date(0));
  if(safe && typeof safe.toDate === 'function') return safe.toDate().getTime();
  return safe instanceof Date ? safe.getTime() : 0;
}

function safeTaskTitle(task){
  return cleanText(taskTitle(task), 90) || 'Task';
}

function completedTaskSummary(tasks, dayLog, evidenceSubmissions){
  return sessionTaskStates(tasks, dayLog, evidenceSubmissions)
    .filter(item => item.state.completed)
    .slice(0, 3)
    .map(item => ({
      title:safeTaskTitle(item.task),
      status:'completed',
      evidenceRequired:!!item.task?.evidenceRequired,
    }));
}

export function createSanitizedPublicProgressEntry({
  pathId,
  user,
  dayNumber,
  dayLog,
  tasks = [],
  evidenceSubmissions = [],
  caption = '',
  now = new Date(),
} = {}){
  const day = Math.max(1, cleanNumber(dayNumber || dayLog?.dayNumber, 1));
  const dayTasks = getTasksForDay(tasks, day);
  const progress = sessionProgress(dayTasks, dayLog || {}, evidenceSubmissions || []);
  const evidence = Array.isArray(evidenceSubmissions) ? evidenceSubmissions : [];
  const evidenceTypes = normalizeEvidenceTypes(evidence);
  const completedAt = safeDate(dayLog?.completedAt || dayLog?.sessionCompletedAt, now);
  const publishedAt = safeDate(now, new Date());
  const id = publicProgressEntryId(user?.uid, day);
  return {
    id,
    pathId:String(pathId || ''),
    userId:String(user?.uid || ''),
    authorName:cleanAuthorName(user?.name || user?.displayName),
    authorPhotoURL:safeExternalUrl(user?.photoURL || user?.picture) || '',
    dayNumber:day,
    status:'completed',
    visibility:'public',
    title:`Day ${day} completed`,
    publicCaption:cleanPublicCaption(caption),
    completedAt,
    publishedAt,
    updatedAt:publishedAt,
    requiredCompletedCount:progress.requiredResolved,
    requiredTotalCount:progress.requiredTotal,
    optionalCompletedCount:progress.optionalCompleted,
    optionalTotalCount:progress.optionalTotal,
    evidenceCount:evidence.length,
    completionScore:cleanNumber(dayLog?.completionScore),
    completionTier:cleanCompletionTier(dayLog?.completionTier),
    evidenceTypes,
    hasEvidence:evidence.length > 0,
    taskSummary:completedTaskSummary(dayTasks, dayLog || {}, evidence),
    reactionCounts:emptyReactionCounts(),
    totalReactionCount:0,
    visibleCommentCount:0,
    interactionUpdatedAt:null,
    source:'day-log',
    schemaVersion:PUBLIC_PROGRESS_SCHEMA_VERSION,
  };
}

export function normalizePublicComment(raw = {}){
  const body = cleanPublicCommentBody(raw.body);
  return {
    id:cleanText(raw.id, 160),
    pathId:cleanText(raw.pathId, 180),
    entryId:cleanText(raw.entryId, 180),
    userId:cleanText(raw.userId, 160),
    authorName:cleanAuthorName(raw.authorName),
    authorPhotoURL:safeExternalUrl(raw.authorPhotoURL) || '',
    body,
    visibility:raw.visibility === 'public' ? 'public' : 'hidden',
    status:raw.status === 'visible' ? 'visible' : 'hidden',
    createdAt:raw.createdAt || null,
    updatedAt:raw.updatedAt || raw.createdAt || null,
    hiddenAt:raw.hiddenAt || null,
    hiddenBy:cleanText(raw.hiddenBy, 160),
    hiddenReason:cleanText(raw.hiddenReason, 80),
    schemaVersion:normalizeDocumentSchemaVersion('publicProgressComment', raw),
  };
}

export function visiblePublicComments(comments = []){
  return (Array.isArray(comments) ? comments : [])
    .map(normalizePublicComment)
    .filter(comment => comment.visibility === 'public' && comment.status === 'visible' && comment.body)
    .sort((a, b) => dateMs(a.createdAt) - dateMs(b.createdAt));
}

export function normalizePublicProgressEntry(raw = {}){
  const day = Math.max(1, cleanNumber(raw.dayNumber, 1));
  const evidenceTypes = Array.isArray(raw.evidenceTypes)
    ? raw.evidenceTypes.map(cleanEvidenceType).filter(Boolean).slice(0, 2)
    : [];
  const reactionCounts = normalizeReactionCounts(raw.reactionCounts);
  const comments = visiblePublicComments(raw.comments).slice(0, 5);
  const visibleCommentCount = cleanNumber(raw.visibleCommentCount, comments.length);
  return {
    id:cleanText(raw.id || publicProgressEntryId(raw.userId, day), 160),
    pathId:cleanText(raw.pathId, 180),
    userId:cleanText(raw.userId, 160),
    authorName:cleanAuthorName(raw.authorName),
    authorPhotoURL:safeExternalUrl(raw.authorPhotoURL) || '',
    dayNumber:day,
    status:raw.status === 'completed' ? 'completed' : 'completed',
    visibility:raw.visibility === 'public' ? 'public' : 'hidden',
    title:cleanText(raw.title || `Day ${day} completed`, 120),
    publicCaption:cleanPublicCaption(raw.publicCaption),
    completedAt:raw.completedAt || null,
    publishedAt:raw.publishedAt || raw.updatedAt || raw.completedAt || null,
    updatedAt:raw.updatedAt || raw.publishedAt || null,
    requiredCompletedCount:cleanNumber(raw.requiredCompletedCount),
    requiredTotalCount:cleanNumber(raw.requiredTotalCount),
    optionalCompletedCount:cleanNumber(raw.optionalCompletedCount),
    optionalTotalCount:cleanNumber(raw.optionalTotalCount),
    evidenceCount:cleanNumber(raw.evidenceCount),
    completionScore:Math.min(100, cleanNumber(raw.completionScore)),
    completionTier:cleanCompletionTier(raw.completionTier),
    evidenceTypes,
    hasEvidence:!!raw.hasEvidence || cleanNumber(raw.evidenceCount) > 0,
    reactionCounts,
    totalReactionCount:cleanNumber(raw.totalReactionCount, totalReactionCount(reactionCounts)),
    visibleCommentCount,
    interactionUpdatedAt:raw.interactionUpdatedAt || null,
    comments,
    currentUserReaction:normalizeReactionType(raw.currentUserReaction),
    taskSummary:Array.isArray(raw.taskSummary)
      ? raw.taskSummary.slice(0, 3).map(item => ({
          title:cleanText(item?.title || 'Task', 90),
          status:item?.status === 'completed' ? 'completed' : 'completed',
          evidenceRequired:!!item?.evidenceRequired,
        }))
      : [],
    source:raw.source === 'day-log' ? 'day-log' : 'day-log',
    schemaVersion:normalizeDocumentSchemaVersion('publicProgress', raw),
  };
}

export function isPublishablePath(path = {}){
  return path.visibility === 'public' || path.visibility === 'unlisted';
}

export function canPublishCompletedDay({ path, enrollment, dayLog, currentUser } = {}){
  return !!(
    isPublishablePath(path) &&
    currentUser &&
    enrollment &&
    enrollment.userId === currentUser.uid &&
    dayLog &&
    dayLog.status === 'completed'
  );
}
