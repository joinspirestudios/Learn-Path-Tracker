// Platform path model, permissions, and converters.
// The app still edits paths through the existing local `weeks` shape; these
// helpers translate that shape to the top-level Firestore path model.

import { normalizeDurationDays } from './journey.js';
import {
  normalizeConfirmedBrief, normalizeCoreCommitments, normalizeDomainProfile,
  normalizeFitnessContext, normalizeIntensity, normalizeStructuredResources,
} from './ai-builder-model.js';
import { safeExternalUrl } from './urls.js';

export const PATH_VISIBILITIES = ['private', 'unlisted', 'public'];

export function nowStamp(){ return new Date(); }

export function creatorName(user){
  return (user && (user.displayName || (user.email || '').split('@')[0])) || 'Creator';
}

export function resolveCreatorName(path = {}, currentUser = null){
  const explicit = String(path.creatorName || '').trim();
  if(explicit && explicit.toLowerCase() !== 'public path') return explicit;
  if(currentUser && path.ownerId === currentUser.uid && currentUser.displayName) return currentUser.displayName;
  const email = String(path.creatorEmail || path.ownerEmail || (currentUser && path.ownerId === currentUser.uid ? currentUser.email : '') || '');
  const username = email.split('@')[0].trim();
  return username || 'Creator';
}

export function cleanVisibility(v){
  return PATH_VISIBILITIES.includes(v) ? v : 'private';
}

function phase55Meta(data = {}){
  const confirmed = data.aiBrief || data.confirmedBrief || null;
  const aiBrief = confirmed && typeof confirmed === 'object' ? normalizeConfirmedBrief(confirmed) : null;
  const domainText = [data.goal, data.description, aiBrief?.goal, aiBrief?.summary].filter(Boolean).join(' ');
  return {
    intensity:normalizeIntensity(data.intensity || aiBrief?.intensity),
    aiBrief,
    domainProfile:normalizeDomainProfile(data.domainProfile || aiBrief?.domainProfile, domainText),
    structuredResources:normalizeStructuredResources(data.structuredResources || aiBrief?.structuredResources || {}),
    fitnessContext:normalizeFitnessContext(data.fitnessContext || aiBrief?.fitnessContext || {}),
  };
}

export function normalizePathDoc(id, data = {}){
  const visibility = cleanVisibility(data.visibility);
  const meta = phase55Meta(data);
  return {
    id,
    ownerId: data.ownerId || '',
    creatorId: data.creatorId || data.ownerId || '',
    title: data.title || 'Untitled path',
    description: data.description || data.goal || '',
    goal: data.goal || data.description || '',
    category: data.category || '',
    durationLabel: data.durationLabel || '',
    durationDays: normalizeDurationDays(data.durationDays, data.durationLabel),
    coverImage: safeExternalUrl(data.coverImage),
    profileImage: safeExternalUrl(data.profileImage),
    creatorName: data.creatorName || '',
    creatorEmail: data.creatorEmail || data.ownerEmail || '',
    sectionCount:Number.isFinite(Number(data.sectionCount)) ? Number(data.sectionCount) : null,
    taskCount:Number.isFinite(Number(data.taskCount)) ? Number(data.taskCount) : null,
    coreCommitments:normalizeCoreCommitments(data.coreCommitments, data.nonNegotiables || data.dailyNonNegotiables),
    intensity:meta.intensity,
    aiBrief:meta.aiBrief,
    domainProfile:meta.domainProfile,
    structuredResources:meta.structuredResources,
    fitnessContext:meta.fitnessContext,
    visibility,
    previewEnabled: data.previewEnabled !== false,
    previewTitle: data.previewTitle || data.title || 'Path preview',
    previewDescription: data.previewDescription || data.description || data.goal || '',
    previewIncludesScheme: !!data.previewIncludesScheme,
    discoverable: visibility === 'public' ? data.discoverable !== false : !!data.discoverable,
    migratedFromLocal: !!data.migratedFromLocal,
    clientSaveId: data.clientSaveId || null,
    intentionallyEmpty: data.intentionallyEmpty === true,
    createdAt: data.createdAt || nowStamp(),
    updatedAt: data.updatedAt || nowStamp(),
  };
}

export function membershipRole(membership, currentUser){
  if(!currentUser || !membership) return null;
  return membership.role || null;
}

export function isOwner(path, currentUser){
  return !!(path && currentUser && path.ownerId === currentUser.uid);
}

export function canViewPath(path, membership, currentUser){
  if(!path) return false;
  if(isOwner(path, currentUser)) return true;
  if(membershipRole(membership, currentUser)) return true;
  return path.visibility === 'public';
}

export function canPreviewPath(path, currentUser){
  if(!path) return false;
  if(path.visibility === 'public') return true;
  return !!path.previewEnabled || isOwner(path, currentUser);
}

export function canEditPath(path, membership, currentUser){
  if(isOwner(path, currentUser)) return true;
  return membershipRole(membership, currentUser) === 'editor';
}

export function canManageMembers(path, membership, currentUser){
  return isOwner(path, currentUser);
}

export function canRequestAccess(path, membership, currentUser){
  return !!(
    path &&
    currentUser &&
    !canViewPath(path, membership, currentUser) &&
    path.visibility !== 'public' &&
    path.previewEnabled
  );
}

export function localPathDefaults(localPath = {}, user){
  const weeks = localPath.weeks || [];
  const title = localPath.title || 'Untitled path';
  const goal = localPath.goal || localPath.description || '';
  const visibility = cleanVisibility(localPath.visibility);
  const meta = phase55Meta(localPath);
  return {
    title,
    description: localPath.description || goal,
    goal,
    category: localPath.category || '',
    durationLabel: localPath.durationLabel || (weeks.length ? `${weeks.length} weeks` : ''),
    durationDays: normalizeDurationDays(localPath.durationDays, localPath.durationLabel || (weeks.length ? `${weeks.length} weeks` : '')),
    coverImage: safeExternalUrl(localPath.coverImage),
    profileImage: safeExternalUrl(localPath.profileImage),
    creatorName: localPath.creatorName || creatorName(user),
    creatorId: localPath.creatorId || user?.uid || '',
    creatorEmail: localPath.creatorEmail || user?.email || '',
    sectionCount:Number.isFinite(Number(localPath.sectionCount)) ? Number(localPath.sectionCount) : weeks.length,
    taskCount:Number.isFinite(Number(localPath.taskCount))
      ? Number(localPath.taskCount)
      : weeks.reduce((total, week) => total + (week.tasks || []).length, 0),
    coreCommitments:normalizeCoreCommitments(localPath.coreCommitments, localPath.nonNegotiables || localPath.dailyNonNegotiables),
    intensity:meta.intensity,
    aiBrief:meta.aiBrief,
    domainProfile:meta.domainProfile,
    structuredResources:meta.structuredResources,
    fitnessContext:meta.fitnessContext,
    visibility,
    previewEnabled: localPath.previewEnabled !== false,
    previewTitle: localPath.previewTitle || title,
    previewDescription: localPath.previewDescription || goal,
    previewIncludesScheme: !!localPath.previewIncludesScheme,
    discoverable: visibility === 'public' ? localPath.discoverable !== false : !!localPath.discoverable,
    migratedFromLocal: !!localPath.migratedFromLocal,
    clientSaveId: localPath.clientSaveId || null,
    intentionallyEmpty: localPath.intentionallyEmpty === true,
  };
}

export function localToPlatformParts(id, localPath, user, ownerId){
  const base = localPathDefaults(localPath, user);
  const path = normalizePathDoc(id, {
    ...base,
    ownerId,
    creatorId:localPath.creatorId || ownerId,
    createdAt: localPath.createdAt || localPath.created || nowStamp(),
    updatedAt: nowStamp(),
  });
  const sections = [];
  const tasks = [];
  (localPath.weeks || []).forEach((week, wi) => {
    const sectionId = `s_${wi}`;
    sections.push({
      id: sectionId,
      title: week.title || `Week ${wi + 1}`,
      description: week.description || '',
      order: wi,
    });
    (week.tasks || []).forEach((task, ti) => {
      tasks.push({
        id: task.id || `t_${wi}_${ti}`,
        sectionId,
        title: task.title || task.text || '',
        description: task.description || '',
        resourceUrl: safeExternalUrl(task.resourceUrl),
        evidenceRequired: !!task.evidenceRequired,
        order: ti,
        unlockDay: task.unlockDay == null ? null : Number(task.unlockDay),
        scheduleType: task.scheduleType || (task.unlockDay == null && task.startDay == null ? null : 'once'),
        taskMode: task.taskMode || null,
        startDay: task.startDay == null ? null : Number(task.startDay),
        endDay: task.endDay == null ? null : Number(task.endDay),
        progressionMetric: task.progressionMetric || null,
        progressionUnit: task.progressionUnit || null,
        startValue: task.startValue == null ? null : Number(task.startValue),
        targetValue: task.targetValue == null ? null : Number(task.targetValue),
        progressionCurve: task.progressionCurve || null,
        progressionNotes: task.progressionNotes || null,
        daysOfWeek:Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [],
        timesPerWeek:task.timesPerWeek == null ? null : Number(task.timesPerWeek),
        intervalDays:task.intervalDays == null ? null : Number(task.intervalDays),
        scheduledDay:task.scheduledDay == null ? null : Number(task.scheduledDay),
        kind: 'task',
      });
    });
    (week.resources || []).forEach((resource, ri) => {
      tasks.push({
        id: `r_${wi}_${ri}`,
        sectionId,
        title: resource.label || resource.title || resource.url || 'Resource',
        description: resource.description || '',
        resourceUrl: safeExternalUrl(resource.url || resource.resourceUrl),
        evidenceRequired: false,
        order: 1000 + ri,
        unlockDay: null,
        scheduleType: 'once',
        taskMode: 'one_off',
        startDay: null,
        endDay: null,
        progressionMetric: null,
        progressionUnit: null,
        startValue: null,
        targetValue: null,
        progressionCurve: null,
        progressionNotes: null,
        daysOfWeek:[],
        timesPerWeek:null,
        intervalDays:null,
        scheduledDay:null,
        kind: 'resource',
      });
    });
  });
  return { path, sections, tasks };
}

export function platformToLocalPath(record){
  const path = normalizePathDoc(record.id, record.path || record);
  const sections = [...(record.sections || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const bySection = {};
  sections.forEach(section => { bySection[section.id] = { title: section.title || '', description: section.description || '', tasks: [], resources: [] }; });
  [...(record.tasks || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).forEach(task => {
    const week = bySection[task.sectionId];
    if(!week) return;
    if(task.kind === 'resource'){
      week.resources.push({ label: task.title || task.resourceUrl || 'Resource', url: safeExternalUrl(task.resourceUrl) || '' });
    } else {
      week.tasks.push({
        id: task.id,
        text: task.title || '',
        description: task.description || '',
        resourceUrl: safeExternalUrl(task.resourceUrl),
        evidenceRequired: !!task.evidenceRequired,
        unlockDay: task.unlockDay == null ? null : task.unlockDay,
        scheduleType: task.scheduleType || (task.unlockDay == null && task.startDay == null ? null : 'once'),
        taskMode: task.taskMode || null,
        startDay: task.startDay == null ? null : task.startDay,
        endDay: task.endDay == null ? null : task.endDay,
        progressionMetric: task.progressionMetric || null,
        progressionUnit: task.progressionUnit || null,
        startValue: task.startValue == null ? null : task.startValue,
        targetValue: task.targetValue == null ? null : task.targetValue,
        progressionCurve: task.progressionCurve || null,
        progressionNotes: task.progressionNotes || null,
        daysOfWeek:Array.isArray(task.daysOfWeek) ? task.daysOfWeek : [],
        timesPerWeek:task.timesPerWeek == null ? null : task.timesPerWeek,
        intervalDays:task.intervalDays == null ? null : task.intervalDays,
        scheduledDay:task.scheduledDay == null ? null : task.scheduledDay,
        order: task.order || 0,
      });
    }
  });
  return {
    ...localPathDefaults(path),
    id: record.id,
    title: path.title,
    goal: path.goal,
    description: path.description,
    durationDays: path.durationDays,
    weeks: sections.map(section => bySection[section.id]),
    platform: true,
    ownerId: path.ownerId,
    creatorId:path.creatorId,
    creatorName:path.creatorName,
    creatorEmail:path.creatorEmail,
    sectionCount:path.sectionCount == null ? sections.length : path.sectionCount,
    taskCount:path.taskCount == null ? (record.tasks || []).filter(task => task.kind !== 'resource').length : path.taskCount,
    coreCommitments:path.coreCommitments,
    membership: record.membership || null,
    platformData: path,
    childrenLoaded: !!record.childrenLoaded || !!((record.sections || []).length || (record.tasks || []).length),
  };
}
