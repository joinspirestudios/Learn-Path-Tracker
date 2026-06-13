import { after, before, beforeEach, describe, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const projectId = 'learn-path-tracker-rules-test';
const userA = 'user-a';
const userB = 'user-b';
const pathId = 'path-1';
const enrollmentA = `${userA}_${pathId}`;
const enrollmentB = `${userB}_${pathId}`;
let testEnv;

function enrollmentData(userId, id, selectedPathId = pathId){
  return {
    id,
    pathId:selectedPathId,
    userId,
    currentDay:1,
    status:'active',
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore:{ rules:await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe('deterministic enrollment bootstrap', () => {
  test('allows an owner lookup before create, then create, read, and immutable update', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    const ref = doc(db, 'enrollments', enrollmentA);

    await assertSucceeds(getDoc(ref));
    await assertSucceeds(setDoc(ref, enrollmentData(userA, enrollmentA)));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { currentDay:2, streak:1 }));
  });

  test('allows the owner to create and read a day log and submission', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    await assertSucceeds(setDoc(
      doc(db, 'enrollments', enrollmentA),
      enrollmentData(userA, enrollmentA)
    ));
    const dayRef = doc(db, 'enrollments', enrollmentA, 'dayLogs', '1');
    const submissionRef = doc(db, 'enrollments', enrollmentA, 'submissions', 'proof-1');

    await assertSucceeds(setDoc(dayRef, { dayNumber:1, status:'active' }));
    await assertSucceeds(getDoc(dayRef));
    await assertSucceeds(setDoc(submissionRef, { userId:userA, dayNumber:1, taskId:'task-1' }));
    await assertSucceeds(getDoc(submissionRef));
  });
});

describe('enrollment isolation', () => {
  test('denies signed-out enrollment reads and creates', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    const ref = doc(db, 'enrollments', enrollmentA);

    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, enrollmentData(userA, enrollmentA)));
  });

  test('denies a lookup whose deterministic ID belongs to another user', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    await assertFails(getDoc(doc(db, 'enrollments', enrollmentB)));
  });

  test('denies create when userId does not match auth', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    await assertFails(setDoc(
      doc(db, 'enrollments', enrollmentA),
      enrollmentData(userB, enrollmentA)
    ));
  });

  test('denies changing userId or pathId after creation', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    const ref = doc(db, 'enrollments', enrollmentA);
    await assertSucceeds(setDoc(ref, enrollmentData(userA, enrollmentA)));

    await assertFails(updateDoc(ref, { userId:userB }));
    await assertFails(updateDoc(ref, { pathId:'path-2' }));
  });

  test('denies reading another user enrollment, day log, and submission', async () => {
    const dbB = testEnv.authenticatedContext(userB).firestore();
    await assertSucceeds(setDoc(
      doc(dbB, 'enrollments', enrollmentB),
      enrollmentData(userB, enrollmentB)
    ));
    await assertSucceeds(setDoc(
      doc(dbB, 'enrollments', enrollmentB, 'dayLogs', '1'),
      { dayNumber:1, status:'active' }
    ));
    await assertSucceeds(setDoc(
      doc(dbB, 'enrollments', enrollmentB, 'submissions', 'proof-1'),
      { userId:userB, dayNumber:1, taskId:'task-1' }
    ));

    const dbA = testEnv.authenticatedContext(userA).firestore();
    await assertFails(getDoc(doc(dbA, 'enrollments', enrollmentB)));
    await assertFails(getDoc(doc(dbA, 'enrollments', enrollmentB, 'dayLogs', '1')));
    await assertFails(getDoc(doc(dbA, 'enrollments', enrollmentB, 'submissions', 'proof-1')));
  });

  test('denies listing the top-level enrollments collection', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    await assertFails(getDocs(collection(db, 'enrollments')));
  });
});
