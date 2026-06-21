import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  pathSummaryDTO,
  publicPathPreviewDTO,
  dailyFocusDTO,
  completionResultDTO,
  publicProgressDTO,
  trustMetricsDTO,
  discoveryCardDTO,
  moderationReportDTO,
} from '../src/shared-dtos.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('pathSummaryDTO returns null for null/undefined/non-object input', () => {
  assert.equal(pathSummaryDTO(null), null);
  assert.equal(pathSummaryDTO(undefined), null);
  assert.equal(pathSummaryDTO('string'), null);
  assert.equal(pathSummaryDTO(42), null);
});

test('pathSummaryDTO extracts safe fields and normalizes strings', () => {
  const input = {
    id: 'path1',
    title: '  My Path  ',
    goal: 'Learn something',
    description: 'A path',
    visibility: 'public',
    intensity: 'soft',
    durationDays: 30,
    category: 'fitness',
    creatorDisplayName: 'Alice',
    createdAt: '2025-01-01',
    privateField: 'should not appear',
    sections: [{ tasks: [] }],
  };
  const dto = pathSummaryDTO(input);
  assert.equal(dto.id, 'path1');
  assert.equal(dto.title, 'My Path');
  assert.equal(dto.visibility, 'public');
  assert.equal(dto.intensity, 'soft');
  assert.equal(dto.durationDays, 30);
  assert.equal(dto.privateField, undefined);
  assert.equal(dto.sections, undefined);
});

test('pathSummaryDTO does not mutate the input', () => {
  const input = { id: 'p1', title: 'Test' };
  const frozen = Object.freeze({ ...input });
  const dto = pathSummaryDTO(frozen);
  assert.equal(dto.id, 'p1');
  assert.notEqual(dto, frozen);
});

test('pathSummaryDTO normalizes malformed data', () => {
  const dto = pathSummaryDTO({
    id: 123,
    title: null,
    durationDays: -5,
    intensity: undefined,
  });
  assert.equal(dto.id, '123');
  assert.equal(dto.title, '');
  assert.equal(dto.durationDays, 0);
  assert.equal(dto.intensity, 'balanced');
});

test('publicPathPreviewDTO excludes private fields and includes stats', () => {
  const input = {
    id: 'p1',
    title: 'Public Path',
    goal: 'A goal',
    description: 'Desc',
    previewCopy: 'Preview',
    visibility: 'public',
    intensity: 'balanced',
    durationDays: 14,
    category: 'learning',
    creatorDisplayName: 'Bob',
    stats: { joinedCount: 5, day1StartedCount: 3 },
    sections: [{ tasks: [] }],
    enrollments: [{}],
    participantStats: {},
  };
  const dto = publicPathPreviewDTO(input);
  assert.equal(dto.id, 'p1');
  assert.equal(dto.previewCopy, 'Preview');
  assert.equal(dto.stats.joinedCount, 5);
  assert.equal(dto.sections, undefined);
  assert.equal(dto.enrollments, undefined);
  assert.equal(dto.participantStats, undefined);
});

test('dailyFocusDTO normalizes day log data', () => {
  const dto = dailyFocusDTO({
    dayNumber: 3,
    status: 'active',
    score: 75.5,
    tier: 'strong',
    requiredTotal: 5,
    requiredDone: 4,
    optionalTotal: 2,
    optionalDone: 1,
    optionalSkipped: 0,
    evidenceCount: 2,
    completedAt: null,
    privateReflection: 'my secret thoughts',
    evidenceUrls: ['https://private.example.com/file.jpg'],
  });
  assert.equal(dto.dayNumber, 3);
  assert.equal(dto.score, 75.5);
  assert.equal(dto.tier, 'strong');
  assert.equal(dto.requiredDone, 4);
  assert.equal(dto.evidenceCount, 2);
  assert.equal(dto.privateReflection, undefined);
  assert.equal(dto.evidenceUrls, undefined);
});

test('dailyFocusDTO returns null for invalid input', () => {
  assert.equal(dailyFocusDTO(null), null);
  assert.equal(dailyFocusDTO(undefined), null);
});

test('completionResultDTO extracts completion fields safely', () => {
  const dto = completionResultDTO({
    dayNumber: 7,
    score: 100,
    tier: 'perfect',
    passed: true,
    requiredTotal: 4,
    requiredDone: 4,
    optionalTotal: 1,
    optionalDone: 1,
    optionalSkipped: 0,
    evidenceCount: 3,
    streakLength: 7,
    completedAt: '2025-06-15',
    privateReflection: 'secret',
    dayLogSummary: 'private summary',
  });
  assert.equal(dto.dayNumber, 7);
  assert.equal(dto.score, 100);
  assert.equal(dto.tier, 'perfect');
  assert.equal(dto.passed, true);
  assert.equal(dto.streakLength, 7);
  assert.equal(dto.privateReflection, undefined);
  assert.equal(dto.dayLogSummary, undefined);
});

test('completionResultDTO normalizes passed to boolean', () => {
  const dto = completionResultDTO({ passed: 'yes' });
  assert.equal(dto.passed, false);
  const dto2 = completionResultDTO({ passed: true });
  assert.equal(dto2.passed, true);
});

test('publicProgressDTO excludes private evidence URLs and reflections', () => {
  const dto = publicProgressDTO({
    id: 'entry1',
    pathId: 'p1',
    dayNumber: 3,
    authorDisplayName: 'Alice',
    authorUid: 'uid1',
    publicCaption: 'Great day!',
    completedTaskCount: 5,
    totalTaskCount: 6,
    evidenceCount: 2,
    evidenceTypeLabels: ['photo', 'document'],
    score: 88,
    tier: 'strong',
    reactionCounts: { cheer: 3 },
    visibleCommentCount: 1,
    publishedAt: '2025-06-10',
    visibility: 'public',
    privateEvidenceUrls: ['https://storage.example.com/secret.jpg'],
    privateReflection: 'my reflection',
    email: 'alice@example.com',
    participantStats: { uid1: {} },
  });
  assert.equal(dto.id, 'entry1');
  assert.equal(dto.publicCaption, 'Great day!');
  assert.equal(dto.evidenceCount, 2);
  assert.deepEqual(dto.evidenceTypeLabels, ['photo', 'document']);
  assert.deepEqual(dto.reactionCounts, { cheer: 3 });
  assert.equal(dto.privateEvidenceUrls, undefined);
  assert.equal(dto.privateReflection, undefined);
  assert.equal(dto.email, undefined);
  assert.equal(dto.participantStats, undefined);
});

test('publicProgressDTO does not mutate input reactionCounts', () => {
  const counts = { cheer: 2 };
  const input = { id: 'e1', reactionCounts: counts };
  const dto = publicProgressDTO(input);
  dto.reactionCounts.cheer = 999;
  assert.equal(counts.cheer, 2);
});

test('publicProgressDTO normalizes malformed evidenceTypeLabels', () => {
  const dto = publicProgressDTO({
    id: 'e1',
    evidenceTypeLabels: ['photo', null, '', 42, 'video'],
  });
  assert.deepEqual(dto.evidenceTypeLabels, ['photo', '42', 'video']);
});

test('trustMetricsDTO returns safe defaults for null/undefined input', () => {
  const dto = trustMetricsDTO(null);
  assert.equal(dto.joinedCount, 0);
  assert.equal(dto.day1StartedCount, 0);
  assert.equal(dto.completedCount, 0);
  assert.equal(dto.publicProgressCount, 0);
  assert.equal(dto.proofSubmissionCount, 0);
});

test('trustMetricsDTO normalizes negative values to zero', () => {
  const dto = trustMetricsDTO({ joinedCount: -5, completedCount: 'abc' });
  assert.equal(dto.joinedCount, 0);
  assert.equal(dto.completedCount, 0);
});

test('trustMetricsDTO extracts valid counts', () => {
  const dto = trustMetricsDTO({
    joinedCount: 10,
    day1StartedCount: 8,
    day7ReachedCount: 5,
    halfwayReachedCount: 3,
    completedCount: 2,
    publicProgressCount: 7,
    proofSubmissionCount: 15,
    participantStats: { uid1: {} },
  });
  assert.equal(dto.joinedCount, 10);
  assert.equal(dto.day7ReachedCount, 5);
  assert.equal(dto.proofSubmissionCount, 15);
  assert.equal(dto.participantStats, undefined);
});

test('discoveryCardDTO includes stats and excludes private fields', () => {
  const dto = discoveryCardDTO({
    id: 'p1',
    title: 'Discover Me',
    goal: 'A goal',
    previewCopy: 'Preview text',
    visibility: 'public',
    intensity: 'intensive',
    durationDays: 60,
    category: 'health',
    creatorDisplayName: 'Charlie',
    stats: { joinedCount: 20 },
    sections: [{}],
    enrollments: [{}],
    participantStats: {},
    members: [{}],
  });
  assert.equal(dto.id, 'p1');
  assert.equal(dto.stats.joinedCount, 20);
  assert.equal(dto.sections, undefined);
  assert.equal(dto.enrollments, undefined);
  assert.equal(dto.participantStats, undefined);
  assert.equal(dto.members, undefined);
});

test('moderationReportDTO excludes sensitive report details', () => {
  const dto = moderationReportDTO({
    id: 'r1',
    targetType: 'path',
    targetId: 'p1',
    pathId: 'p1',
    reason: 'spam',
    status: 'pending',
    createdAt: '2025-06-12',
    reporterUid: 'uid1',
    reporterEmail: 'user@example.com',
    note: 'detailed description',
    snapshot: { title: 'path title' },
  });
  assert.equal(dto.id, 'r1');
  assert.equal(dto.targetType, 'path');
  assert.equal(dto.reason, 'spam');
  assert.equal(dto.status, 'pending');
  assert.equal(dto.reporterUid, undefined);
  assert.equal(dto.reporterEmail, undefined);
  assert.equal(dto.note, undefined);
  assert.equal(dto.snapshot, undefined);
});

test('moderationReportDTO returns null for invalid input', () => {
  assert.equal(moderationReportDTO(null), null);
  assert.equal(moderationReportDTO(undefined), null);
});

test('shared-dtos module has no DOM/Firebase/analytics imports', () => {
  const source = readFileSync(resolve(root, 'src/shared-dtos.js'), 'utf8');
  assert.doesNotMatch(source, /import.*from.*firebase/i);
  assert.doesNotMatch(source, /import.*from.*views/i);
  assert.doesNotMatch(source, /import.*from.*analytics/i);
  assert.doesNotMatch(source, /document\./);
  assert.doesNotMatch(source, /window\./);
  assert.doesNotMatch(source, /process\.env/);
});
