import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanReportSnippet,
  makeModerationReport,
  moderationReportId,
  normalizeReportNote,
  normalizeReportReason,
  reportTargetLabel,
} from '../src/moderation.js';
import { currentSchemaVersion, withSchemaVersion } from '../src/schema-versioning.js';

test('moderation model normalizes report reasons and labels safely', () => {
  assert.equal(normalizeReportReason(' spam '), 'spam');
  assert.equal(normalizeReportReason('HARASSMENT'), 'harassment');
  assert.equal(normalizeReportReason('not-a-reason'), 'other');
  assert.equal(reportTargetLabel('path'), 'Path');
  assert.equal(reportTargetLabel('publicProgressComment'), 'Comment');
  assert.equal(reportTargetLabel('unknown'), 'Content');
});

test('report note is trimmed, plain text, and bounded', () => {
  const long = '  <b>unsafe</b>  '.repeat(80);
  const note = normalizeReportNote(long);
  assert.equal(note.startsWith('<b>unsafe</b>'), true);
  assert.equal(note.length, 500);
  assert.equal(normalizeReportNote('  one\n\n two\tthree  '), 'one two three');
  assert.equal(cleanReportSnippet('  visible comment '.repeat(20)).length, 120);
});

test('moderation report ids are deterministic and schema-versioned', () => {
  const payload = {
    targetType:'publicProgressComment',
    pathId:'path-1',
    entryId:'entry-1',
    commentId:'comment-1',
    reporterUid:'viewer',
    reason:'spam',
  };
  assert.equal(moderationReportId(payload), moderationReportId(payload));
  assert.equal(currentSchemaVersion('moderationReport'), 1);
  assert.equal(withSchemaVersion('moderationReport', {}).schemaVersion, 1);

  const report = makeModerationReport({
    ...payload,
    ownerId:'owner',
    note:'  note  ',
    contentSnapshot:{ publicTitle:'Title', publicSnippet:'Comment body' },
    now:new Date('2026-06-21T10:00:00.000Z'),
  });
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.note, 'note');
  assert.equal(report.status, 'open');
  assert.equal(report.reportCount, 1);
  assert.equal(report.targetPath, 'paths/path-1/publicProgress/entry-1/comments/comment-1');
});
