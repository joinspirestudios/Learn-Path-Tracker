import { apiError } from './errors.js';
import { boundedText } from './http.js';
import { normalizeDurationDays } from '../../src/journey.js';

export const PARTICIPANT_STATS_SCHEMA_VERSION = 1;

export const METRIC_EVENTS = new Set(['day_started', 'day_completed', 'path_completed']);

export function cleanPathId(value, field = 'pathId'){
  const id = boundedText(value, field, 180, { required:true });
  if(!/^[a-zA-Z0-9_-]+$/.test(id)) throw apiError('invalid_request', `${field} is invalid.`, 400);
  return id;
}

export function cleanDayNumber(value, { required = false } = {}){
  if(value == null || value === ''){
    if(required) throw apiError('invalid_request', 'dayNumber is required.', 400);
    return null;
  }
  const day = Number(value);
  if(!Number.isInteger(day) || day < 1 || day > 5000){
    throw apiError('invalid_request', 'dayNumber is invalid.', 400);
  }
  return day;
}

export function cleanMetricEvent(value){
  const event = boundedText(value, 'event', 40, { required:true });
  if(!METRIC_EVENTS.has(event)) throw apiError('invalid_event', 'This metrics event is not supported.', 400);
  return event;
}

export function numericStat(value){
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function currentUtcWeekKey(date = new Date()){
  const d = date instanceof Date ? new Date(date.getTime()) : new Date(date);
  if(Number.isNaN(d.getTime())) return '';
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return utc.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

export function normalizeServerPathStats(path = {}){
  const source = path.stats && typeof path.stats === 'object' ? path.stats : {};
  return {
    joinedCount:numericStat(source.joinedCount ?? path.joinedCount),
    activeThisWeek:numericStat(source.activeThisWeek ?? path.activeThisWeek),
    activeWeekKey:String(source.activeWeekKey ?? path.activeWeekKey ?? ''),
    day1StartedCount:numericStat(source.day1StartedCount ?? path.day1StartedCount),
    day7ReachedCount:numericStat(source.day7ReachedCount ?? path.day7ReachedCount),
    halfwayReachedCount:numericStat(source.halfwayReachedCount ?? path.halfwayReachedCount),
    completedCount:numericStat(source.completedCount ?? path.completedCount),
    publicProgressCount:numericStat(source.publicProgressCount ?? path.publicProgressCount),
    proofSubmissionCount:numericStat(source.proofSubmissionCount ?? path.proofSubmissionCount),
    updatedAt:source.updatedAt || path.statsUpdatedAt || null,
    schemaVersion:numericStat(source.schemaVersion ?? path.statsSchemaVersion) || 1,
  };
}

export function publicProofCount(entry = {}){
  return numericStat(entry.evidenceCount);
}

export function makeParticipantStats(pathId, uid, now, existing = {}){
  return {
    uid,
    pathId,
    joinedAt:existing.joinedAt || now,
    lastActiveAt:existing.lastActiveAt || null,
    activeWeekKey:String(existing.activeWeekKey || ''),
    day1StartedAt:existing.day1StartedAt || null,
    day7ReachedAt:existing.day7ReachedAt || null,
    halfwayReachedAt:existing.halfwayReachedAt || null,
    completedAt:existing.completedAt || null,
    highestDayReached:numericStat(existing.highestDayReached),
    highestCompletedDay:numericStat(existing.highestCompletedDay),
    publicProgressCount:numericStat(existing.publicProgressCount),
    proofSubmissionCount:numericStat(existing.proofSubmissionCount),
    updatedAt:existing.updatedAt || now,
    schemaVersion:PARTICIPANT_STATS_SCHEMA_VERSION,
  };
}

export function applyActiveThisWeek(stats, participant, weekKey){
  const nextStats = { ...stats };
  const nextParticipant = { ...participant };
  if(nextStats.activeWeekKey !== weekKey){
    nextStats.activeWeekKey = weekKey;
    nextStats.activeThisWeek = 0;
  }
  let incremented = false;
  if(nextParticipant.activeWeekKey !== weekKey){
    nextParticipant.activeWeekKey = weekKey;
    nextStats.activeThisWeek += 1;
    incremented = true;
  }
  return { stats:nextStats, participant:nextParticipant, incremented };
}

export function pathDurationDays(path = {}){
  return normalizeDurationDays(path.durationDays, path.durationLabel) || null;
}

export function milestoneThresholds(path = {}){
  const duration = pathDurationDays(path);
  return {
    duration,
    halfway:duration ? Math.max(1, Math.ceil(duration / 2)) : null,
  };
}

function dayLogIsStarted(dayLog = {}){
  return ['active', 'completed', 'missed', 'frozen'].includes(dayLog.status);
}

function dayLogIsCompleted(dayLog = {}){
  return dayLog.status === 'completed';
}

export function verifiedMilestones({ event, dayNumber, path, enrollment = {}, dayLog = null }){
  const day = numericStat(dayNumber);
  const currentDay = numericStat(enrollment.currentDay);
  const lastCompletedDay = numericStat(enrollment.lastCompletedDay);
  const highestReached = Math.max(day, currentDay, lastCompletedDay);
  const highestCompleted = dayLogIsCompleted(dayLog) ? Math.max(day, lastCompletedDay) : lastCompletedDay;
  const thresholds = milestoneThresholds(path);
  const started = dayLog ? dayLogIsStarted(dayLog) : !!enrollment.startDate;
  const completed = dayLog ? dayLogIsCompleted(dayLog) : false;
  const milestones = {
    day1Started:false,
    day7Reached:false,
    halfwayReached:false,
    completed:false,
    highestDayReached:highestReached,
    highestCompletedDay:highestCompleted,
  };

  if(event === 'day_started'){
    if(!started) throw apiError('milestone_not_verified', 'This day has not been started yet.', 409);
    milestones.day1Started = day <= 1 || currentDay >= 1 || !!enrollment.startDate;
    milestones.day7Reached = highestReached >= 7;
    milestones.halfwayReached = !!(thresholds.halfway && highestReached >= thresholds.halfway);
    return milestones;
  }

  if(event === 'day_completed'){
    if(!completed) throw apiError('milestone_not_verified', 'This day is not completed yet.', 409);
    milestones.day1Started = day >= 1;
    milestones.day7Reached = day >= 7;
    milestones.halfwayReached = !!(thresholds.halfway && day >= thresholds.halfway);
    milestones.completed = !!(thresholds.duration && day >= thresholds.duration);
    return milestones;
  }

  if(event === 'path_completed'){
    const completedPath = enrollment.status === 'completed'
      || !!(thresholds.duration && completed && day >= thresholds.duration);
    if(!completedPath) throw apiError('milestone_not_verified', 'This path is not completed yet.', 409);
    milestones.day1Started = true;
    milestones.day7Reached = highestReached >= 7 || (thresholds.duration != null && thresholds.duration >= 7);
    milestones.halfwayReached = !!thresholds.halfway;
    milestones.completed = true;
    return milestones;
  }

  throw apiError('invalid_event', 'This metrics event is not supported.', 400);
}

export function applyMilestones(stats, participant, milestones, now){
  const nextStats = { ...stats };
  const nextParticipant = { ...participant };
  const updated = [];

  nextParticipant.highestDayReached = Math.max(numericStat(nextParticipant.highestDayReached), numericStat(milestones.highestDayReached));
  nextParticipant.highestCompletedDay = Math.max(numericStat(nextParticipant.highestCompletedDay), numericStat(milestones.highestCompletedDay));

  const once = [
    ['day1Started', 'day1StartedAt', 'day1StartedCount'],
    ['day7Reached', 'day7ReachedAt', 'day7ReachedCount'],
    ['halfwayReached', 'halfwayReachedAt', 'halfwayReachedCount'],
    ['completed', 'completedAt', 'completedCount'],
  ];
  once.forEach(([flag, participantField, statsField]) => {
    if(!milestones[flag] || nextParticipant[participantField]) return;
    nextParticipant[participantField] = now;
    nextStats[statsField] = numericStat(nextStats[statsField]) + 1;
    updated.push(statsField);
  });
  return { stats:nextStats, participant:nextParticipant, updated };
}

export function statsWrite(stats, now){
  return {
    joinedCount:numericStat(stats.joinedCount),
    activeThisWeek:numericStat(stats.activeThisWeek),
    activeWeekKey:String(stats.activeWeekKey || ''),
    day1StartedCount:numericStat(stats.day1StartedCount),
    day7ReachedCount:numericStat(stats.day7ReachedCount),
    halfwayReachedCount:numericStat(stats.halfwayReachedCount),
    completedCount:numericStat(stats.completedCount),
    publicProgressCount:numericStat(stats.publicProgressCount),
    proofSubmissionCount:numericStat(stats.proofSubmissionCount),
    updatedAt:now,
    schemaVersion:1,
  };
}

export function participantWrite(participant, now){
  return {
    uid:participant.uid,
    pathId:participant.pathId,
    joinedAt:participant.joinedAt || now,
    lastActiveAt:participant.lastActiveAt || now,
    activeWeekKey:String(participant.activeWeekKey || ''),
    day1StartedAt:participant.day1StartedAt || null,
    day7ReachedAt:participant.day7ReachedAt || null,
    halfwayReachedAt:participant.halfwayReachedAt || null,
    completedAt:participant.completedAt || null,
    highestDayReached:numericStat(participant.highestDayReached),
    highestCompletedDay:numericStat(participant.highestCompletedDay),
    publicProgressCount:numericStat(participant.publicProgressCount),
    proofSubmissionCount:numericStat(participant.proofSubmissionCount),
    updatedAt:now,
    schemaVersion:PARTICIPANT_STATS_SCHEMA_VERSION,
  };
}
