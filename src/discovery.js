import {
  activeThisWeekIsCurrent, displayableActiveThisWeek, normalizePathStats,
} from './platform.js';

export const DEFAULT_DISCOVERY_STATE = {
  query: '',
  category: 'all',
  duration: 'all',
  intensity: 'all',
  proof: 'all',
  sort: 'recommended',
};

export const DISCOVERY_DURATION_BUCKETS = [
  { id:'all', label:'Any duration' },
  { id:'short', label:'7 days or less' },
  { id:'month', label:'8-30 days' },
  { id:'quarter', label:'31-90 days' },
  { id:'long', label:'90+ days' },
];

export const DISCOVERY_INTENSITIES = [
  { id:'all', label:'Any intensity' },
  { id:'soft', label:'Soft' },
  { id:'balanced', label:'Balanced' },
  { id:'intensive', label:'Intensive' },
];

export const DISCOVERY_PROOF_FILTERS = [
  { id:'all', label:'Any proof/activity' },
  { id:'proof_backed', label:'Proof-backed' },
  { id:'active_this_week', label:'Active this week' },
  { id:'completed', label:'Learners completed' },
  { id:'new', label:'New paths' },
];

export const DISCOVERY_SORTS = [
  { id:'recommended', label:'Recommended' },
  { id:'newest', label:'Newest' },
  { id:'most_joined', label:'Most joined' },
  { id:'most_proof', label:'Most proof-backed' },
  { id:'recently_active', label:'Recently active' },
  { id:'most_completed', label:'Most completed' },
  { id:'shortest', label:'Shortest first' },
  { id:'longest', label:'Longest first' },
];

const sortIds = new Set(DISCOVERY_SORTS.map(item => item.id));
const intensityIds = new Set(DISCOVERY_INTENSITIES.map(item => item.id));
const proofIds = new Set(DISCOVERY_PROOF_FILTERS.map(item => item.id));
const durationIds = new Set(DISCOVERY_DURATION_BUCKETS.map(item => item.id));

function cleanText(value){
  return String(value || '').trim();
}

function lower(value){
  return cleanText(value).toLowerCase();
}

export function normalizeDiscoveryState(value = {}){
  const state = value && typeof value === 'object' ? value : {};
  return {
    query: cleanText(state.query).slice(0, 160),
    category: cleanText(state.category) || 'all',
    duration: durationIds.has(state.duration) ? state.duration : 'all',
    intensity: intensityIds.has(state.intensity) ? state.intensity : 'all',
    proof: proofIds.has(state.proof) ? state.proof : 'all',
    sort: sortIds.has(state.sort) ? state.sort : 'recommended',
  };
}

export function clearDiscoveryState(){
  return { ...DEFAULT_DISCOVERY_STATE };
}

export function isDiscoveryDefault(state = {}){
  const normalized = normalizeDiscoveryState(state);
  return Object.keys(DEFAULT_DISCOVERY_STATE).every(key => normalized[key] === DEFAULT_DISCOVERY_STATE[key]);
}

export function pathTimestampMs(path = {}){
  const candidates = [path.publishedAt, path.createdAt, path.created, path.updatedAt];
  for(const value of candidates){
    let ms = 0;
    if(value && typeof value.toDate === 'function') ms = value.toDate().getTime();
    else if(value instanceof Date) ms = value.getTime();
    else if(typeof value === 'number') ms = value;
    else ms = Date.parse(value || '');
    if(Number.isFinite(ms) && ms > 0) return ms;
  }
  return 0;
}

export function discoveryCategory(path = {}){
  const domain = path.domainProfile || {};
  return cleanText(path.category || domain.label || domain.type || domain.primary || path.goalType || '');
}

export function discoveryCategoryKey(path = {}){
  return lower(discoveryCategory(path)) || 'uncategorized';
}

export function discoveryCategoryOptions(paths = []){
  const labels = new Map();
  paths.forEach(path => {
    const label = discoveryCategory(path) || 'Uncategorized';
    const key = label.toLowerCase();
    if(!labels.has(key)) labels.set(key, label);
  });
  return [...labels.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]))
    .map(([id, label]) => ({ id, label }));
}

export function durationBucket(path = {}){
  const days = Number(path.durationDays || 0);
  if(!Number.isFinite(days) || days <= 0) return 'unknown';
  if(days <= 7) return 'short';
  if(days <= 30) return 'month';
  if(days <= 90) return 'quarter';
  return 'long';
}

export function proofSignals(path = {}, date = new Date()){
  const stats = normalizePathStats(path.stats, path);
  const active = displayableActiveThisWeek(stats, date);
  const newestMs = pathTimestampMs(path);
  const recentMs = date instanceof Date ? date.getTime() : new Date(date).getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  return {
    proofBacked: stats.publicProgressCount > 0 || stats.proofSubmissionCount > 0,
    activeThisWeek: active != null && active > 0 && activeThisWeekIsCurrent(stats, date),
    completed: stats.completedCount > 0,
    newlyAdded: newestMs > 0 && Number.isFinite(recentMs) && recentMs - newestMs >= 0 && recentMs - newestMs <= thirtyDaysMs,
  };
}

export function isDiscoverablePublicPath(path = {}){
  return !!(path && path.platform && path.visibility === 'public' && path.discoverable !== false);
}

function searchText(path = {}){
  const domain = path.domainProfile || {};
  const tags = Array.isArray(path.tags) ? path.tags : [];
  const curationTags = Array.isArray(path.curationTags) ? path.curationTags : [];
  return [
    path.title,
    path.previewTitle,
    path.description,
    path.previewDescription,
    path.goal,
    path.category,
    path.creatorName,
    path.intensity,
    domain.label,
    domain.type,
    domain.primary,
    ...(domain.detected || []),
    ...tags,
    ...curationTags,
  ].map(lower).filter(Boolean).join(' ');
}

function matchesQuery(path, query){
  const terms = lower(query).split(/\s+/).filter(Boolean);
  if(!terms.length) return true;
  const haystack = searchText(path);
  return terms.every(term => haystack.includes(term));
}

function matchesCategory(path, category){
  if(!category || category === 'all') return true;
  return discoveryCategoryKey(path) === category;
}

function matchesDuration(path, duration){
  if(!duration || duration === 'all') return true;
  return durationBucket(path) === duration;
}

function matchesIntensity(path, intensity){
  if(!intensity || intensity === 'all') return true;
  return lower(path.intensity) === intensity;
}

function matchesProof(path, proof, date){
  if(!proof || proof === 'all') return true;
  const signals = proofSignals(path, date);
  return ({
    proof_backed:signals.proofBacked,
    active_this_week:signals.activeThisWeek,
    completed:signals.completed,
    new:signals.newlyAdded,
  })[proof] || false;
}

function tieBreak(a, b){
  return cleanText(a.title).localeCompare(cleanText(b.title))
    || cleanText(a.id).localeCompare(cleanText(b.id));
}

function safeDuration(path){
  const n = Number(path.durationDays || 0);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

function recommendedScore(path, date){
  const stats = normalizePathStats(path.stats, path);
  const signals = proofSignals(path, date);
  const newest = pathTimestampMs(path);
  return (
    (signals.proofBacked ? 1000000 : 0) +
    (signals.activeThisWeek ? 500000 : 0) +
    (stats.joinedCount * 1000) +
    (stats.proofSubmissionCount * 200) +
    (stats.publicProgressCount * 100) +
    (stats.completedCount * 50) +
    Math.min(999, Math.floor(newest / 86400000))
  );
}

export function sortDiscoveryPaths(paths = [], sort = 'recommended', date = new Date()){
  const mode = sortIds.has(sort) ? sort : 'recommended';
  return [...paths].sort((a, b) => {
    const statsA = normalizePathStats(a.stats, a);
    const statsB = normalizePathStats(b.stats, b);
    if(mode === 'newest') return (pathTimestampMs(b) - pathTimestampMs(a)) || tieBreak(a, b);
    if(mode === 'most_joined') return (statsB.joinedCount - statsA.joinedCount) || tieBreak(a, b);
    if(mode === 'most_proof'){
      return ((statsB.proofSubmissionCount + statsB.publicProgressCount) - (statsA.proofSubmissionCount + statsA.publicProgressCount)) || tieBreak(a, b);
    }
    if(mode === 'recently_active'){
      const activeA = proofSignals(a, date).activeThisWeek ? statsA.activeThisWeek : 0;
      const activeB = proofSignals(b, date).activeThisWeek ? statsB.activeThisWeek : 0;
      return (activeB - activeA) || tieBreak(a, b);
    }
    if(mode === 'most_completed') return (statsB.completedCount - statsA.completedCount) || tieBreak(a, b);
    if(mode === 'shortest') return (safeDuration(a) - safeDuration(b)) || tieBreak(a, b);
    if(mode === 'longest'){
      const durA = safeDuration(a) === Number.POSITIVE_INFINITY ? -1 : safeDuration(a);
      const durB = safeDuration(b) === Number.POSITIVE_INFINITY ? -1 : safeDuration(b);
      return (durB - durA) || tieBreak(a, b);
    }
    return (recommendedScore(b, date) - recommendedScore(a, date)) || tieBreak(a, b);
  });
}

export function filterDiscoveryPaths(paths = [], state = {}, date = new Date()){
  const normalized = normalizeDiscoveryState(state);
  return paths.filter(path =>
    isDiscoverablePublicPath(path) &&
    matchesQuery(path, normalized.query) &&
    matchesCategory(path, normalized.category) &&
    matchesDuration(path, normalized.duration) &&
    matchesIntensity(path, normalized.intensity) &&
    matchesProof(path, normalized.proof, date)
  );
}

export function discoverPaths(paths = [], state = {}, date = new Date()){
  const normalized = normalizeDiscoveryState(state);
  return sortDiscoveryPaths(filterDiscoveryPaths(paths, normalized, date), normalized.sort, date);
}

function limitSection(paths, limit){
  return paths.slice(0, limit || 4);
}

export function curatedDiscoverySections(paths = [], date = new Date(), limit = 4){
  const publicPaths = paths.filter(isDiscoverablePublicPath);
  const sections = [
    {
      id:'proof-backed',
      title:'Proof-backed paths',
      paths:sortDiscoveryPaths(publicPaths.filter(path => proofSignals(path, date).proofBacked), 'most_proof', date),
    },
    {
      id:'recently-active',
      title:'Recently active',
      paths:sortDiscoveryPaths(publicPaths.filter(path => proofSignals(path, date).activeThisWeek), 'recently_active', date),
    },
    {
      id:'popular',
      title:'Popular paths',
      paths:sortDiscoveryPaths(publicPaths.filter(path => normalizePathStats(path.stats, path).joinedCount > 0), 'most_joined', date),
    },
    {
      id:'beginner-friendly',
      title:'Beginner-friendly',
      paths:sortDiscoveryPaths(publicPaths.filter(path => {
        const intensity = lower(path.intensity);
        return intensity === 'soft' || (intensity === 'balanced' && Number(path.durationDays || 0) > 0 && Number(path.durationDays || 0) <= 30);
      }), 'recommended', date),
    },
    {
      id:'newly-added',
      title:'Newly added',
      paths:sortDiscoveryPaths(publicPaths.filter(path => proofSignals(path, date).newlyAdded), 'newest', date),
    },
  ];
  return sections
    .map(section => ({ ...section, paths:limitSection(section.paths, limit) }))
    .filter(section => section.paths.length);
}
