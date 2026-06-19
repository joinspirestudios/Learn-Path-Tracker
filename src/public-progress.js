import { getTasksForDay } from './journey.js';
import { sessionProgress, sessionTaskStates, taskTitle } from './daily-session-model.js';
import { safeExternalUrl } from './urls.js';

export const PUBLIC_PROGRESS_SCHEMA_VERSION = 1;
export const PUBLIC_PROGRESS_CAPTION_MAX = 500;

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

export function publicProgressEntryId(userId, dayNumber){
  const uid = String(userId || 'learner').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120) || 'learner';
  const day = Math.max(1, cleanNumber(dayNumber, 1));
  return `${uid}_day_${day}`;
}

export function cleanPublicCaption(value){
  return cleanText(value, PUBLIC_PROGRESS_CAPTION_MAX);
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
    evidenceTypes,
    hasEvidence:evidence.length > 0,
    taskSummary:completedTaskSummary(dayTasks, dayLog || {}, evidence),
    source:'day-log',
    schemaVersion:PUBLIC_PROGRESS_SCHEMA_VERSION,
  };
}

export function normalizePublicProgressEntry(raw = {}){
  const day = Math.max(1, cleanNumber(raw.dayNumber, 1));
  const evidenceTypes = Array.isArray(raw.evidenceTypes)
    ? raw.evidenceTypes.map(cleanEvidenceType).filter(Boolean).slice(0, 2)
    : [];
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
    evidenceTypes,
    hasEvidence:!!raw.hasEvidence || cleanNumber(raw.evidenceCount) > 0,
    taskSummary:Array.isArray(raw.taskSummary)
      ? raw.taskSummary.slice(0, 3).map(item => ({
          title:cleanText(item?.title || 'Task', 90),
          status:item?.status === 'completed' ? 'completed' : 'completed',
          evidenceRequired:!!item?.evidenceRequired,
        }))
      : [],
    source:raw.source === 'day-log' ? 'day-log' : 'day-log',
    schemaVersion:cleanNumber(raw.schemaVersion, PUBLIC_PROGRESS_SCHEMA_VERSION),
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
