// Daily documentation model — pure. Turns proof submissions (+ optional day log
// and public progress entry) into one "documented day" entry per path/day, the
// unit of the daily documentation feed.
//
// No DOM, no Firebase, no side effects. Public view models never expose private
// notes/reflections, raw private storage paths, or private evidence URLs.

import {
  normalizeProofSubmissions, proofKind, proofIsImage,
  privateProofCardViewModel, publicProofCardViewModel, publicProofSummary,
} from './proof-archive-model.js';

function str(v, fallback = '') { return v == null ? fallback : String(v); }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback; }

function dateLabelFor(value) {
  if (!value) return '';
  if (typeof value.toDate === 'function') { try { return value.toDate().toLocaleDateString(); } catch { return ''; } }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}

// Build one normalized documentation entry for a single path/day.
export function buildDailyDocumentationEntry({
  path = {}, dayNumber, submissions = [], dayLog = null, publicProgressEntry = null,
  author = null, ownerView = false,
} = {}) {
  const pathDoc = path || {};
  const pathId = str(pathDoc.id || (dayLog && dayLog.pathId) || (publicProgressEntry && publicProgressEntry.pathId));
  const day = num(dayNumber || (dayLog && dayLog.dayNumber) || (publicProgressEntry && publicProgressEntry.dayNumber), 1) || 1;
  const proofItems = normalizeProofSubmissions(submissions);

  // Task summary: prefer day-log task titles via submissions; else public entry summary.
  const taskTitles = [];
  const seen = new Set();
  for (const s of proofItems) {
    const t = str(s.taskTitle).trim();
    if (t && !seen.has(t)) { seen.add(t); taskTitles.push(t); }
  }
  if (!taskTitles.length && publicProgressEntry && Array.isArray(publicProgressEntry.taskSummary)) {
    for (const item of publicProgressEntry.taskSummary) {
      const t = str(item && item.title).trim();
      if (t && !seen.has(t)) { seen.add(t); taskTitles.push(t); }
    }
  }

  const completionScore = dayLog ? num(dayLog.completionScore) : (publicProgressEntry ? num(publicProgressEntry.completionScore) : 0);
  const completionTier = dayLog ? str(dayLog.completionTier) : (publicProgressEntry ? str(publicProgressEntry.completionTier) : '');
  const status = dayLog ? str(dayLog.status, '') : (publicProgressEntry ? 'completed' : (proofItems.length ? 'in_progress' : ''));
  const completedTaskCount = dayLog
    ? num((dayLog.completedTaskIds || []).length || dayLog.completedTaskCount)
    : (publicProgressEntry ? num(publicProgressEntry.requiredCompletedCount) : 0);
  const totalTaskCount = dayLog
    ? num(dayLog.totalTaskCount)
    : (publicProgressEntry ? num(publicProgressEntry.requiredTotalCount) : 0);
  const dateValue = (dayLog && (dayLog.completedAt || dayLog.updatedAt))
    || (publicProgressEntry && (publicProgressEntry.publishedAt || publicProgressEntry.completedAt))
    || (proofItems[0] && proofItems[0].createdAt) || null;

  const visibility = str(pathDoc.visibility, publicProgressEntry ? 'public' : 'private') || 'private';

  return {
    id: (pathId || 'path') + '__day_' + day,
    pathId,
    pathTitle: str(pathDoc.title || pathDoc.previewTitle, 'Path'),
    dayNumber: day,
    dateLabel: dateLabelFor(dateValue),
    status,
    completionTier,
    completionScore,
    completedTaskCount,
    totalTaskCount,
    proofSubmittedCount: proofItems.length,
    proofItems,
    taskSummary: taskTitles,
    milestone: realMilestone({ dayLog, publicProgressEntry }),
    authorName: str(author && (author.name || author.displayName)),
    authorAvatarURL: str(author && (author.avatarURL || author.photoURL)),
    visibility,
    ownerView: !!ownerView,
  };
}

// Only return a milestone string when it is backed by real data. Never fake
// streaks/PBs.
function realMilestone({ dayLog, publicProgressEntry } = {}) {
  const streak = num(dayLog && (dayLog.streak || dayLog.streakLength));
  if (streak >= 2) return streak + ' day streak';
  const tier = str((dayLog && dayLog.completionTier) || (publicProgressEntry && publicProgressEntry.completionTier));
  if (tier === 'perfect') return 'Perfect day';
  return null;
}

// Build entries grouped by path/day from a flat set of submissions.
export function buildDailyDocumentationEntries({
  submissions = [], paths = {}, dayLogs = {}, publicProgress = {},
  author = null, ownerView = false,
} = {}) {
  const groups = new Map();
  for (const s of normalizeProofSubmissions(submissions)) {
    const key = (s.pathId || 'path') + '__day_' + (s.dayNumber || 1);
    if (!groups.has(key)) groups.set(key, { pathId: s.pathId, dayNumber: s.dayNumber || 1, items: [] });
    groups.get(key).items.push(s);
  }
  const entries = [];
  for (const group of groups.values()) {
    const path = paths[group.pathId] || { id: group.pathId };
    const dayLog = dayLogs[group.pathId + '__day_' + group.dayNumber]
      || dayLogs[group.pathId + '|' + group.dayNumber] || null;
    const ppList = publicProgress[group.pathId] || [];
    const publicProgressEntry = (Array.isArray(ppList) ? ppList : [])
      .find(e => Number(e.dayNumber) === Number(group.dayNumber)) || null;
    entries.push(buildDailyDocumentationEntry({
      path, dayNumber: group.dayNumber, submissions: group.items, dayLog, publicProgressEntry, author, ownerView,
    }));
  }
  // Newest day first per path, then by path.
  return entries.sort((a, b) => (b.dayNumber - a.dayNumber) || a.pathTitle.localeCompare(b.pathTitle));
}

export function dailyDocumentationStats(entry = {}) {
  return {
    completedTaskCount: num(entry.completedTaskCount),
    totalTaskCount: num(entry.totalTaskCount),
    proofSubmittedCount: num(entry.proofSubmittedCount),
    completionScore: num(entry.completionScore),
    completionTier: str(entry.completionTier),
    status: str(entry.status),
  };
}

export function dailyDocumentationMediaPreview(entry = {}, { max = 5 } = {}) {
  const items = normalizeProofSubmissions(entry.proofItems || []);
  const images = items.filter(proofIsImage);
  const nonImages = items.filter(s => !proofIsImage(s));
  return {
    primary: images[0] || null,
    thumbs: images.slice(1, max),
    tiles: nonImages.slice(0, max),
    total: items.length,
  };
}

export function dailyDocumentationTaskSummary(entry = {}, { max = 5 } = {}) {
  const titles = Array.isArray(entry.taskSummary) ? entry.taskSummary : [];
  return { titles: titles.slice(0, max), hasMore: titles.length > max, total: titles.length };
}

export function dailyDocumentationMilestone(entry = {}) {
  return entry.milestone || null;
}

export function isPublicDocumentationEntry(entry = {}) {
  return str(entry.visibility) === 'public';
}

export function privateDocumentationEntryViewModel(entry = {}) {
  return {
    ...dailyDocumentationStats(entry),
    id: entry.id,
    pathTitle: str(entry.pathTitle, 'Path'),
    dayNumber: num(entry.dayNumber, 1),
    dateLabel: str(entry.dateLabel),
    milestone: dailyDocumentationMilestone(entry),
    taskSummary: dailyDocumentationTaskSummary(entry),
    media: dailyDocumentationMediaPreview(entry),
    proofCards: normalizeProofSubmissions(entry.proofItems || []).map(s => privateProofCardViewModel(s)),
    visibility: str(entry.visibility, 'private'),
    label: 'Private proof',
  };
}

export function publicDocumentationEntryViewModel(entry = {}) {
  const items = normalizeProofSubmissions(entry.proofItems || []);
  return {
    ...dailyDocumentationStats(entry),
    id: entry.id,
    pathTitle: str(entry.pathTitle, 'Path'),
    dayNumber: num(entry.dayNumber, 1),
    dateLabel: str(entry.dateLabel),
    milestone: dailyDocumentationMilestone(entry),
    taskSummary: dailyDocumentationTaskSummary(entry),
    summary: publicProofSummary(items),
    proofCards: items.map(s => publicProofCardViewModel(s)),
    authorName: str(entry.authorName),
    authorAvatarURL: str(entry.authorAvatarURL),
    visibility: 'public',
    label: 'Public proof',
  };
}

export { proofKind };
export default {
  buildDailyDocumentationEntries, buildDailyDocumentationEntry, dailyDocumentationStats,
  dailyDocumentationMediaPreview, dailyDocumentationTaskSummary, dailyDocumentationMilestone,
  isPublicDocumentationEntry, privateDocumentationEntryViewModel, publicDocumentationEntryViewModel,
};
