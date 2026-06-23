// Pure mappers: turn raw Firestore path records ({ id, data }) into safe,
// minimal mobile shapes. No React, no Firebase, no network, no side effects.
//
// Privacy: these mappers must NEVER surface private evidence URLs, private
// reflections, raw audio, transcripts, provider logs, secrets, or Firebase
// internal metadata. Only fields the mobile UI needs are passed through.

function str(v, fallback = '') {
  if (typeof v === 'string') return v.trim();
  if (v == null) return fallback;
  return String(v).trim();
}
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function cap(v) {
  const s = str(v);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function durationLabel(data) {
  const label = str(data.durationLabel);
  if (label) return label;
  const days = num(data.durationDays);
  return days > 0 ? days + ' days' : '';
}

export function isPublicDiscoverable(record) {
  const data = (record && record.data) || {};
  return str(data.visibility) === 'public' && data.discoverable !== false;
}

// Safe task shape — only what the UI shows. Never includes evidence URLs etc.
export function mapTask(record) {
  const data = (record && record.data) || {};
  return {
    id: str(record && record.id) || str(data.id),
    title: str(data.title) || str(data.text) || 'Task',
    description: str(data.description) || str(data.detail),
    requiresProof: !!data.evidenceRequired,
    optional: data.required === false || data.optional === true,
    sectionId: str(data.sectionId),
  };
}

export function mapPathCard(record, extra = {}) {
  const data = (record && record.data) || {};
  return {
    id: str(record && record.id) || str(data.id),
    title: str(data.title) || 'Untitled path',
    description: str(data.description) || str(data.goal),
    visibility: str(data.visibility, 'private'),
    creatorName: str(data.creatorName),
    durationLabel: durationLabel(data),
    categoryLabel: str(data.category),
    intensityLabel: cap(data.intensity) || 'Balanced',
    taskCount: num(data.taskCount, num(extra.taskCount, 0)),
    sectionCount: num(data.sectionCount, num(extra.sectionCount, 0)),
    progressSummary: str(extra.progressSummary),
    isLocal: false,
    isCloud: true,
  };
}

export function mapPublicPreview(record) {
  const data = (record && record.data) || {};
  return {
    id: str(record && record.id) || str(data.id),
    title: str(data.previewTitle) || str(data.title) || 'Path preview',
    description: str(data.previewDescription) || str(data.description) || str(data.goal),
    creatorName: str(data.creatorName),
    visibility: str(data.visibility, 'public'),
    durationLabel: durationLabel(data),
    categoryLabel: str(data.category),
    intensityLabel: cap(data.intensity) || 'Balanced',
    taskCount: num(data.taskCount),
    sectionCount: num(data.sectionCount),
    isLocal: false,
    isCloud: true,
  };
}

// Build a read-only roadmap from a path record + its sections/tasks records.
// Status reflects only real loaded data — never invented dates or progress.
export function mapRoadmap(pathRecord, sectionRecords = [], taskRecords = []) {
  const data = (pathRecord && pathRecord.data) || {};
  const tasks = (taskRecords || []).map(mapTask);
  const sections = (sectionRecords || []).map(s => {
    const sData = (s && s.data) || {};
    const id = str(s && s.id) || str(sData.id);
    return {
      id,
      label: str(sData.label) || str(sData.title) || 'Section',
      title: str(sData.title) || str(sData.label) || 'Section',
      status: 'available', // read-only; no progress/locking invented
      tasks: tasks.filter(t => t.sectionId && t.sectionId === id),
    };
  });
  // If sections exist but no tasks mapped to them, fall back to a single block.
  const grouped = sections.length
    ? sections
    : [{ id: 'all', label: 'Tasks', title: 'Tasks', status: 'available', tasks }];
  return {
    pathId: str(pathRecord && pathRecord.id) || str(data.id),
    title: str(data.title) || 'Path',
    description: str(data.description) || str(data.goal),
    daysOrSections: grouped,
    tasks,
  };
}

export default {
  isPublicDiscoverable,
  mapTask,
  mapPathCard,
  mapPublicPreview,
  mapRoadmap,
};
