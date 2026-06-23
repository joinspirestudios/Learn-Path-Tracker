function safeString(value, fallback = ''){
  if(typeof value === 'string') return value.trim();
  if(value == null) return fallback;
  return String(value).trim();
}

function safeNumber(value, fallback = 0){
  if(typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeNonNegative(value, fallback = 0){
  const n = safeNumber(value, fallback);
  return n >= 0 ? n : fallback;
}

function safeArray(value){
  return Array.isArray(value) ? value : [];
}

export function pathSummaryDTO(path){
  if(!path || typeof path !== 'object') return null;
  return {
    id: safeString(path.id),
    title: safeString(path.title),
    goal: safeString(path.goal),
    description: safeString(path.description),
    visibility: safeString(path.visibility, 'private'),
    intensity: safeString(path.intensity, 'balanced'),
    durationDays: safeNonNegative(path.durationDays),
    category: safeString(path.category),
    creatorDisplayName: safeString(path.creatorDisplayName),
    createdAt: path.createdAt || null,
  };
}

export function publicPathPreviewDTO(path){
  if(!path || typeof path !== 'object') return null;
  return {
    id: safeString(path.id),
    title: safeString(path.title),
    goal: safeString(path.goal),
    description: safeString(path.description),
    previewCopy: safeString(path.previewCopy),
    visibility: safeString(path.visibility, 'public'),
    intensity: safeString(path.intensity, 'balanced'),
    durationDays: safeNonNegative(path.durationDays),
    category: safeString(path.category),
    creatorDisplayName: safeString(path.creatorDisplayName),
    stats: trustMetricsDTO(path.stats),
  };
}

export function dailyFocusDTO(dayLog){
  if(!dayLog || typeof dayLog !== 'object') return null;
  return {
    dayNumber: safeNonNegative(dayLog.dayNumber),
    status: safeString(dayLog.status, 'active'),
    score: safeNumber(dayLog.score, 0),
    tier: safeString(dayLog.tier),
    requiredTotal: safeNonNegative(dayLog.requiredTotal),
    requiredDone: safeNonNegative(dayLog.requiredDone),
    optionalTotal: safeNonNegative(dayLog.optionalTotal),
    optionalDone: safeNonNegative(dayLog.optionalDone),
    optionalSkipped: safeNonNegative(dayLog.optionalSkipped),
    evidenceCount: safeNonNegative(dayLog.evidenceCount),
    completedAt: dayLog.completedAt || null,
  };
}

export function completionResultDTO(result){
  if(!result || typeof result !== 'object') return null;
  return {
    dayNumber: safeNonNegative(result.dayNumber),
    score: safeNumber(result.score, 0),
    tier: safeString(result.tier),
    passed: result.passed === true,
    requiredTotal: safeNonNegative(result.requiredTotal),
    requiredDone: safeNonNegative(result.requiredDone),
    optionalTotal: safeNonNegative(result.optionalTotal),
    optionalDone: safeNonNegative(result.optionalDone),
    optionalSkipped: safeNonNegative(result.optionalSkipped),
    evidenceCount: safeNonNegative(result.evidenceCount),
    streakLength: safeNonNegative(result.streakLength),
    completedAt: result.completedAt || null,
  };
}

export function publicProgressDTO(entry){
  if(!entry || typeof entry !== 'object') return null;
  return {
    id: safeString(entry.id),
    pathId: safeString(entry.pathId),
    dayNumber: safeNonNegative(entry.dayNumber),
    authorDisplayName: safeString(entry.authorDisplayName),
    authorUid: safeString(entry.authorUid),
    publicCaption: safeString(entry.publicCaption),
    completedTaskCount: safeNonNegative(entry.completedTaskCount),
    totalTaskCount: safeNonNegative(entry.totalTaskCount),
    evidenceCount: safeNonNegative(entry.evidenceCount),
    evidenceTypeLabels: safeArray(entry.evidenceTypeLabels).map(l => safeString(l)).filter(Boolean),
    score: safeNumber(entry.score, 0),
    tier: safeString(entry.tier),
    reactionCounts: entry.reactionCounts && typeof entry.reactionCounts === 'object'
      ? { ...entry.reactionCounts }
      : {},
    visibleCommentCount: safeNonNegative(entry.visibleCommentCount),
    publishedAt: entry.publishedAt || null,
    visibility: safeString(entry.visibility, 'public'),
  };
}

export function trustMetricsDTO(stats){
  if(!stats || typeof stats !== 'object') return {
    joinedCount: 0,
    day1StartedCount: 0,
    day7ReachedCount: 0,
    halfwayReachedCount: 0,
    completedCount: 0,
    publicProgressCount: 0,
    proofSubmissionCount: 0,
  };
  return {
    joinedCount: safeNonNegative(stats.joinedCount),
    day1StartedCount: safeNonNegative(stats.day1StartedCount),
    day7ReachedCount: safeNonNegative(stats.day7ReachedCount),
    halfwayReachedCount: safeNonNegative(stats.halfwayReachedCount),
    completedCount: safeNonNegative(stats.completedCount),
    publicProgressCount: safeNonNegative(stats.publicProgressCount),
    proofSubmissionCount: safeNonNegative(stats.proofSubmissionCount),
  };
}

export function discoveryCardDTO(path){
  if(!path || typeof path !== 'object') return null;
  return {
    id: safeString(path.id),
    title: safeString(path.title),
    goal: safeString(path.goal),
    previewCopy: safeString(path.previewCopy),
    visibility: safeString(path.visibility, 'public'),
    intensity: safeString(path.intensity, 'balanced'),
    durationDays: safeNonNegative(path.durationDays),
    category: safeString(path.category),
    creatorDisplayName: safeString(path.creatorDisplayName),
    stats: trustMetricsDTO(path.stats),
  };
}

export function publicProfileDTO(profile){
  if(!profile || typeof profile !== 'object') return null;
  const publicEnabled = profile.publicProfileEnabled !== false;
  return {
    uid: safeString(profile.uid),
    displayName: safeString(profile.displayName),
    username: safeString(profile.username || profile.usernameLower),
    bio: publicEnabled ? safeString(profile.bio) : '',
    avatarURL: safeString(profile.avatarURL),
    coverURL: publicEnabled ? safeString(profile.coverURL) : '',
    publicProfileEnabled: publicEnabled,
  };
}

export function pathPersonalizationDTO(personalization){
  if(!personalization || typeof personalization !== 'object') return null;
  return {
    bannerURL: safeString(personalization.bannerURL),
    accentColor: safeString(personalization.accentColor),
    coverTitle: safeString(personalization.coverTitle),
    publicSubtitle: safeString(personalization.publicSubtitle),
  };
}

export function moderationReportDTO(report){
  if(!report || typeof report !== 'object') return null;
  return {
    id: safeString(report.id),
    targetType: safeString(report.targetType),
    targetId: safeString(report.targetId),
    pathId: safeString(report.pathId),
    reason: safeString(report.reason),
    status: safeString(report.status, 'pending'),
    createdAt: report.createdAt || null,
  };
}
