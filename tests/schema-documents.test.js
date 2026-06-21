import test from 'node:test';
import assert from 'node:assert/strict';

import { makeEnrollment, makeDayLog, makeEvidenceSubmission } from '../src/db.js';
import {
  createSanitizedPublicProgressEntry,
  normalizePublicComment,
  normalizePublicProgressEntry,
  normalizePublicProgressReaction,
} from '../src/public-progress.js';
import { normalizeDiscoveryPageState, serializableDiscoveryPageState } from '../src/discovery-pagination.js';
import { localToPlatformParts, normalizePathDoc, normalizePathStats } from '../src/platform.js';
import {
  makeParticipantStats,
  normalizeServerPathStats,
  participantWrite,
  statsWrite,
} from '../api/_lib/path-trust-metrics.js';
import { withSchemaVersion } from '../src/schema-versioning.js';

test('path documents and stats normalize legacy and malformed schema safely', () => {
  const legacy = normalizePathDoc('path-1', {
    title:'Legacy',
    visibility:'unexpected',
    discoverable:true,
    durationDays:'bad',
    stats:{ joinedCount:-1, publicProgressCount:'bad', schemaVersion:'bad' },
  });
  assert.equal(legacy.schemaVersion, 0);
  assert.equal(legacy.visibility, 'private');
  assert.equal(legacy.discoverable, true);
  assert.equal(legacy.intensity, 'balanced');
  assert.equal(legacy.stats.joinedCount, 0);
  assert.equal(legacy.stats.publicProgressCount, 0);
  assert.equal(legacy.stats.schemaVersion, 1);

  const current = normalizePathDoc('path-2', { title:'Current', schemaVersion:1, visibility:'public', discoverable:true });
  assert.equal(current.schemaVersion, 1);
  assert.equal(current.visibility, 'public');

  const { path } = localToPlatformParts('path-3', { title:'New path', weeks:[] }, { uid:'owner' }, 'owner');
  assert.equal(path.schemaVersion, 1);
  assert.equal(path.stats.schemaVersion, 1);

  assert.deepEqual(normalizePathStats(null), {
    joinedCount:0,
    activeThisWeek:0,
    activeWeekKey:'',
    day1StartedCount:0,
    day7ReachedCount:0,
    halfwayReachedCount:0,
    completedCount:0,
    proofSubmissionCount:0,
    publicProgressCount:0,
    updatedAt:null,
    schemaVersion:1,
  });
  assert.equal(normalizePathStats({ joinedCount:-2, activeWeekKey:'2026-W25', schemaVersion:7 }).schemaVersion, 7);
  assert.equal(normalizeServerPathStats({ stats:{ activeWeekKey:'2026-W25' } }).activeWeekKey, '2026-W25');
  assert.equal(statsWrite({ joinedCount:-1, activeWeekKey:'2026-W25' }, new Date()).schemaVersion, 1);
});

test('enrollments, day logs, and evidence submissions keep legacy data safe', () => {
  const enrollment = makeEnrollment('path-1', 'user-1', {
    currentDay:'bad',
    streak:'bad',
    freezeCount:-2,
    status:'weird',
  });
  assert.equal(enrollment.schemaVersion, 0);
  assert.equal(enrollment.currentDay, 1);
  assert.equal(enrollment.streak, 0);
  assert.equal(enrollment.freezeCount, 0);
  assert.equal(enrollment.status, 'active');
  assert.equal(withSchemaVersion('enrollment', enrollment).schemaVersion, 1);

  const completed = makeDayLog(3, {
    status:'completed',
    completedTaskIds:'bad',
    verifiedTaskIds:null,
    completionScore:'bad',
    completionTier:'surprise',
    passThreshold:'bad',
  });
  assert.equal(completed.schemaVersion, 0);
  assert.equal(completed.status, 'completed');
  assert.deepEqual(completed.completedTaskIds, []);
  assert.deepEqual(completed.verifiedTaskIds, []);
  assert.equal(completed.completionScore, null);
  assert.equal(completed.completionTier, null);
  assert.equal(completed.passThreshold, null);

  const currentCompleted = withSchemaVersion('dayLog', makeDayLog(1, {
    status:'completed',
    completionScore:88,
    completionTier:'strong',
    passThreshold:65,
    anchorSatisfied:true,
  }));
  assert.equal(currentCompleted.schemaVersion, 2);
  assert.equal(currentCompleted.completionScore, 88);
  assert.equal(currentCompleted.completionTier, 'strong');

  const evidence = makeEvidenceSubmission('missing-enrollment', {
    type:'file',
    url:'javascript:alert(1)',
    filename:'proof.pdf',
    mimeType:'application/pdf',
    sizeBytes:'bad',
    schemaVersion:'bad',
  });
  assert.equal(evidence.schemaVersion, 0);
  assert.equal(evidence.evidenceType, 'file');
  assert.equal(evidence.evidenceUrl || '', '');
  assert.equal(evidence.fileName, 'proof.pdf');
  assert.equal(evidence.fileType, 'application/pdf');
  assert.equal(evidence.fileSize, 0);
  assert.equal(withSchemaVersion('evidenceSubmission', evidence).schemaVersion, 1);
});

test('public progress, comments, reactions, and participant stats normalize versioned shapes', () => {
  const legacyEntry = normalizePublicProgressEntry({
    id:'entry-1',
    pathId:'path-1',
    userId:'user-1',
    visibility:'public',
    completionScore:120,
    completionTier:'unexpected',
    reactionCounts:{ cheer:-1 },
    visibleCommentCount:'bad',
  });
  assert.equal(legacyEntry.schemaVersion, 0);
  assert.equal(legacyEntry.completionScore, 100);
  assert.equal(legacyEntry.completionTier, '');
  assert.equal(legacyEntry.totalReactionCount, 0);
  assert.equal(legacyEntry.visibleCommentCount, 0);

  const newEntry = createSanitizedPublicProgressEntry({
    pathId:'path-1',
    user:{ uid:'user-1', name:'Learner' },
    dayNumber:1,
    dayLog:{ dayNumber:1, status:'completed', completedTaskIds:['task-1'], completionScore:70, completionTier:'passed' },
    tasks:[{ id:'task-1', title:'Task', scheduleType:'daily', startDay:1, endDay:1 }],
    evidenceSubmissions:[{ evidenceType:'url', evidenceUrl:'https://private.example/proof' }],
  });
  assert.equal(newEntry.schemaVersion, 2);
  assert.doesNotMatch(JSON.stringify(newEntry), /private\.example/);

  const comment = normalizePublicComment({
    id:'c1',
    body:'x'.repeat(700),
    visibility:'public',
    status:'visible',
  });
  assert.equal(comment.schemaVersion, 0);
  assert.equal(comment.body.length, 500);
  const hidden = normalizePublicComment({ id:'c2', body:'hidden', visibility:'public', status:'hidden' });
  assert.equal(hidden.status, 'hidden');

  const reaction = normalizePublicProgressReaction({ userId:'u1', type:'wow' });
  assert.equal(reaction.schemaVersion, 0);
  assert.equal(reaction.type, null);
  assert.equal(withSchemaVersion('publicProgressReaction', { userId:'u1', type:'cheer' }).schemaVersion, 1);

  const participant = makeParticipantStats('path-1', 'u1', new Date('2026-06-20T00:00:00Z'), {
    highestDayReached:'bad',
    publicProgressCount:-1,
  });
  assert.equal(participant.schemaVersion, 1);
  assert.equal(participant.highestDayReached, 0);
  assert.equal(participant.publicProgressCount, 0);
  assert.equal(participantWrite({ ...participant, schemaVersion:5 }, new Date()).schemaVersion, 5);
});

test('discovery pagination schema keeps cursor runtime-only', () => {
  const state = normalizeDiscoveryPageState({
    pageSize:999,
    cursor:{ unsafe:true },
    loadedPublicIds:['a', 'a', '', 'b'],
    schemaVersion:'bad',
  });
  assert.equal(state.schemaVersion, 0);
  assert.equal(state.pageSize, 30);
  assert.deepEqual(state.loadedPublicIds, ['a', 'b']);

  const stored = serializableDiscoveryPageState(state);
  assert.equal(stored.cursor, null);
  assert.equal(stored.schemaVersion, 1);
});
