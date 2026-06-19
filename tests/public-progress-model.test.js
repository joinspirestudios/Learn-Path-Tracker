import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanPublicCommentBody,
  cleanPublicCaption,
  createSanitizedPublicProgressEntry,
  evidenceTypeLabel,
  normalizePublicComment,
  normalizePublicProgressEntry,
  normalizeReactionCounts,
  normalizeReactionType,
  publicProgressEntryId,
  visiblePublicComments,
} from '../src/public-progress.js';

test('public progress entries sanitize private proof details', () => {
  const entry = createSanitizedPublicProgressEntry({
    pathId:'public-path',
    user:{ uid:'user/1', name:'  Maya   Learner  ', photoURL:'https://example.com/avatar.png' },
    dayNumber:1,
    now:new Date('2026-06-19T10:00:00.000Z'),
    caption:'  Finished the practice block.  ',
    tasks:[
      { id:'required-proof', title:'Submit proof', evidenceRequired:true, scheduleType:'daily', startDay:1, endDay:5 },
      { id:'optional-note', title:'Optional reflection', optional:true, scheduleType:'daily', startDay:1, endDay:5 },
    ],
    dayLog:{
      dayNumber:1,
      status:'completed',
      completedTaskIds:['required-proof', 'optional-note'],
      verifiedTaskIds:['required-proof'],
      completedAt:new Date('2026-06-19T09:30:00.000Z'),
      summary:'private summary',
      taskReflections:{ 'required-proof':'private reflection' },
    },
    evidenceSubmissions:[{
      taskId:'required-proof',
      evidenceType:'file',
      evidenceUrl:'https://private.example.com/proof.pdf',
      fileName:'proof.pdf',
      note:'private note',
    }],
  });

  assert.equal(entry.id, publicProgressEntryId('user/1', 1));
  assert.equal(entry.authorName, 'Maya Learner');
  assert.equal(entry.status, 'completed');
  assert.equal(entry.visibility, 'public');
  assert.equal(entry.requiredCompletedCount, 1);
  assert.equal(entry.requiredTotalCount, 1);
  assert.equal(entry.optionalCompletedCount, 1);
  assert.equal(entry.optionalTotalCount, 1);
  assert.equal(entry.evidenceCount, 1);
  assert.deepEqual(entry.evidenceTypes, ['file']);
  assert.equal(evidenceTypeLabel(entry.evidenceTypes[0]), 'File');

  const serialized = JSON.stringify(entry);
  assert.doesNotMatch(serialized, /private\.example\.com/);
  assert.doesNotMatch(serialized, /proof\.pdf/);
  assert.doesNotMatch(serialized, /private note/);
  assert.doesNotMatch(serialized, /private reflection/);
  assert.doesNotMatch(serialized, /private summary/);
});

test('public progress normalization bounds public text and preserves public identity metadata', () => {
  const longCaption = 'x'.repeat(700);
  assert.equal(cleanPublicCaption(longCaption).length, 500);
  const entry = normalizePublicProgressEntry({
    id:'entry-1',
    pathId:'path-1',
    userId:'user-1',
    authorName:'Ava',
    authorPhotoURL:'javascript:alert(1)',
    dayNumber:'2',
    visibility:'public',
    publicCaption:longCaption,
    evidenceTypes:['file', 'other'],
  });

  assert.equal(entry.userId, 'user-1');
  assert.equal(entry.authorPhotoURL, '');
  assert.equal(entry.dayNumber, 2);
  assert.equal(entry.publicCaption.length, 500);
  assert.deepEqual(entry.evidenceTypes, ['file', 'url']);
});

test('public progress interactions normalize reactions, counts, and visible comments safely', () => {
  assert.equal(normalizeReactionType('cheer'), 'cheer');
  assert.equal(normalizeReactionType('CHEER'), 'cheer');
  assert.equal(normalizeReactionType('keep_going'), 'keep_going');
  assert.equal(normalizeReactionType('unsupported'), null);
  assert.deepEqual(normalizeReactionCounts({ cheer:2, keep_going:1, nope:9 }), { cheer:2, keep_going:1, inspired:0 });
  assert.deepEqual(normalizeReactionCounts({ cheer:-3 }), { cheer:0, keep_going:0, inspired:0 });

  const entry = normalizePublicProgressEntry({
    id:'entry-1',
    pathId:'path-1',
    userId:'user-1',
    visibility:'public',
    reactionCounts:{ cheer:3, extra:99 },
    totalReactionCount:'bad',
    visibleCommentCount:'2',
    comments:[
      { id:'c1', pathId:'path-1', entryId:'entry-1', userId:'u1', authorName:'Ada', body:'Visible', visibility:'public', status:'visible' },
      { id:'c2', pathId:'path-1', entryId:'entry-1', userId:'u2', authorName:'Ben', body:'Hidden', visibility:'hidden', status:'hidden' },
    ],
  });

  assert.deepEqual(entry.reactionCounts, { cheer:3, keep_going:0, inspired:0 });
  assert.equal(entry.totalReactionCount, 3);
  assert.equal(entry.visibleCommentCount, 2);
  assert.equal(entry.comments.length, 1);
  assert.equal(entry.comments[0].body, 'Visible');
});

test('public comments are plain bounded text and hidden comments are filtered', () => {
  assert.equal(cleanPublicCommentBody('  <b>Hello</b>  '), '<b>Hello</b>');
  assert.equal(cleanPublicCommentBody(42), '');
  assert.equal(cleanPublicCommentBody('x'.repeat(700)).length, 500);

  const visible = normalizePublicComment({
    id:'c1',
    pathId:'path-1',
    entryId:'entry-1',
    userId:'user-1',
    authorName:'',
    authorPhotoURL:'javascript:alert(1)',
    body:'  Nice work  ',
    visibility:'public',
    status:'visible',
  });
  assert.equal(visible.authorName, 'A learner');
  assert.equal(visible.authorPhotoURL, '');
  assert.equal(visible.body, 'Nice work');

  const comments = visiblePublicComments([
    visible,
    { ...visible, id:'c2', body:'Hidden', visibility:'hidden', status:'hidden' },
    { ...visible, id:'c3', body:'', visibility:'public', status:'visible' },
  ]);
  assert.deepEqual(comments.map(comment => comment.id), ['c1']);
});
