// ── views/evidence-qa-fixtures.js ───────────────────────────────────────────
// Safe synthetic Evidence Intelligence QA fixtures. NO real user data, NO real
// production URLs, NO private proof, NO uploaded images. Each fixture is a
// { name, path, enrollment, proofSubmissions } scenario used by tests/docs/QA to
// exercise the deterministic evidence model without touching live data.

const PATH = {
  id: 'qa-path', title: 'QA Writing Path', category: 'creative', visibility: 'public',
  weeks: [{ tasks: [
    { id: 'write', title: 'Write 300 words', required: true, anchor: true, evidenceRequired: true },
    { id: 'edit', title: 'Edit draft', required: false },
  ] }],
};
const PRIVATE_PATH = { ...PATH, visibility: 'private' };

function dayLog(dayNumber, extra = {}) {
  return { dayNumber, completionScore: 70, requiredCompleted: 1, requiredTotal: 1, anchorSatisfied: true, evidenceRequired: 1, ...extra };
}
function enrollment(days = [1, 2, 3]) {
  const dayLogs = {};
  for (const d of days) dayLogs[d] = dayLog(d);
  return { id: 'qa-enr', pathId: 'qa-path', dayLogs };
}

// Each proof object uses only structured, non-private fields.
export const EVIDENCE_QA_FIXTURES = [
  { name: 'No proof', path: PATH, enrollment: enrollment(), proofSubmissions: [] },
  { name: 'Text proof only', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'write', note: 'Wrote the opening scene with three beats.', status: 'submitted' },
  ] },
  { name: 'Very short proof text', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'write', note: 'did it', status: 'submitted' },
  ] },
  { name: 'Link proof without context', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'edit', evidenceType: 'url', evidenceUrl: 'https://example.test/doc', status: 'submitted' },
  ] },
  { name: 'Image proof without caption', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'edit', evidenceType: 'file', fileType: 'image/png', storagePath: 'qa/sample', status: 'submitted' },
  ] },
  { name: 'Image proof pending upload', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 2, taskId: 'write', evidenceType: 'file', fileType: 'image/png', status: 'pending' },
  ] },
  { name: 'Failed upload', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 2, taskId: 'write', evidenceType: 'file', fileType: 'image/png', status: 'failed' },
  ] },
  { name: 'Anchor task with missing proof', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'edit', evidenceType: 'file', fileType: 'image/png', storagePath: 'qa/s', note: 'edited', status: 'submitted' },
    { id: 'p2', pathId: 'qa-path', dayNumber: 2, taskId: 'edit', evidenceType: 'file', fileType: 'image/png', storagePath: 'qa/s2', note: 'edited again', status: 'submitted' },
  ] },
  { name: 'Strong multimodal proof', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'write', evidenceType: 'file', fileType: 'image/png', storagePath: 'qa/s', publicCaption: 'First draft page', publicVisible: true, status: 'submitted' },
    { id: 'p2', pathId: 'qa-path', dayNumber: 1, taskId: 'write', note: 'Drafted 320 words this morning.', status: 'submitted' },
  ] },
  { name: 'Public path with private proof', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'write', evidenceType: 'file', fileType: 'image/png', storagePath: 'qa/s', visibility: 'private', status: 'submitted' },
  ] },
  { name: 'Public path with public-safe proof', path: PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'write', evidenceType: 'file', fileType: 'image/png', publicAssetURL: '', publicCaption: 'Morning pages photo', publicVisible: true, status: 'submitted' },
  ] },
  { name: 'Duplicate repeated text proof', path: PRIVATE_PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'write', note: 'same note', status: 'submitted' },
    { id: 'p2', pathId: 'qa-path', dayNumber: 2, taskId: 'write', note: 'same note', status: 'submitted' },
  ] },
  { name: 'Duplicate repeated link proof', path: PRIVATE_PATH, enrollment: enrollment(), proofSubmissions: [
    { id: 'p1', pathId: 'qa-path', dayNumber: 1, taskId: 'edit', evidenceType: 'url', evidenceUrl: 'https://example.test/a', note: 'a', status: 'submitted' },
    { id: 'p2', pathId: 'qa-path', dayNumber: 2, taskId: 'edit', evidenceType: 'url', evidenceUrl: 'https://example.test/b', note: 'b', status: 'submitted' },
    { id: 'p3', pathId: 'qa-path', dayNumber: 3, taskId: 'edit', evidenceType: 'url', evidenceUrl: 'https://example.test/c', note: 'c', status: 'submitted' },
  ] },
];

export function evidenceQaFixtureByName(name) {
  return EVIDENCE_QA_FIXTURES.find(f => f.name === name) || null;
}

export default { EVIDENCE_QA_FIXTURES, evidenceQaFixtureByName };
