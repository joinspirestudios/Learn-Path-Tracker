import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanPublicCaption,
  createSanitizedPublicProgressEntry,
  evidenceTypeLabel,
  normalizePublicProgressEntry,
  publicProgressEntryId,
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
