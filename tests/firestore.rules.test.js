import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
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
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
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
  test('allows create, read, identity merge, and progress update for the owner', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    const ref = doc(db, 'enrollments', enrollmentA);

    await assertSucceeds(setDoc(ref, enrollmentData(userA, enrollmentA)));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(setDoc(ref, {
      id:enrollmentA,
      pathId,
      userId:userA,
    }, { merge:true }));
    assert.equal((await getDoc(ref)).data().currentDay, 1);
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

  test('allows a path owner to create a parent and children in one batch', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    const batch = writeBatch(db);
    batch.set(doc(db, 'paths', pathId), {
      id:pathId,
      ownerId:userA,
      title:'Test path',
      visibility:'private',
    });
    batch.set(doc(db, 'paths', pathId, 'members', userA), {
      uid:userA,
      role:'owner',
    });
    batch.set(doc(db, 'paths', pathId, 'sections', 'section-1'), {
      id:'section-1',
      title:'Section 1',
      order:1,
    });
    batch.set(doc(db, 'paths', pathId, 'tasks', 'task-1'), {
      id:'task-1',
      sectionId:'section-1',
      title:'Task 1',
      order:1,
    });

    await assertSucceeds(batch.commit());
  });

  test('allows direct-link reads for unlisted path metadata', async () => {
    const ownerDb = testEnv.authenticatedContext(userA).firestore();
    await assertSucceeds(setDoc(doc(ownerDb, 'paths', pathId), {
      id:pathId,
      ownerId:userA,
      title:'Unlisted path',
      visibility:'unlisted',
      previewEnabled:false,
    }));

    const signedOut = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(signedOut, 'paths', pathId)));
  });

  test('denies browser writes to server-managed path stats', async () => {
    const ownerDb = testEnv.authenticatedContext(userA).firestore();
    await assertFails(setDoc(doc(ownerDb, 'paths', 'stats-on-create'), {
      id:'stats-on-create',
      ownerId:userA,
      title:'Stats path',
      visibility:'public',
      stats:{ joinedCount:1, publicProgressCount:1 },
    }));

    await assertSucceeds(setDoc(doc(ownerDb, 'paths', pathId), {
      id:pathId,
      ownerId:userA,
      title:'Stats path',
      visibility:'public',
    }));
    await assertFails(updateDoc(doc(ownerDb, 'paths', pathId), {
      stats:{ joinedCount:99, publicProgressCount:99 },
    }));
  });

  test('allows public progress reads but denies browser writes', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'paths', pathId), {
        id:pathId,
        ownerId:userA,
        title:'Timeline path',
        visibility:'unlisted',
        stats:{ publicProgressCount:1 },
      });
      await setDoc(doc(adminDb, 'paths', pathId, 'publicProgress', 'entry-1'), {
        id:'entry-1',
        pathId,
        userId:userB,
        dayNumber:1,
        status:'completed',
        visibility:'public',
      });
    });

    const signedOut = testEnv.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(signedOut, 'paths', pathId, 'publicProgress', 'entry-1')));
    await assertSucceeds(getDocs(query(
      collection(signedOut, 'paths', pathId, 'publicProgress'),
      where('visibility', '==', 'public')
    )));
    await assertFails(getDocs(collection(signedOut, 'paths', pathId, 'publicProgress')));

    const userDb = testEnv.authenticatedContext(userB).firestore();
    await assertFails(setDoc(doc(userDb, 'paths', pathId, 'publicProgress', 'entry-2'), {
      id:'entry-2',
      pathId,
      userId:userB,
      dayNumber:2,
      status:'completed',
      visibility:'public',
    }));
  });

  test('denies public progress list reads when the parent path is private', async () => {
    const privatePathId = 'private-path';
    await testEnv.withSecurityRulesDisabled(async context => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'paths', privatePathId), {
        id:privatePathId,
        ownerId:userA,
        title:'Private timeline path',
        visibility:'private',
      });
      await setDoc(doc(adminDb, 'paths', privatePathId, 'publicProgress', 'entry-1'), {
        id:'entry-1',
        pathId:privatePathId,
        userId:userB,
        dayNumber:1,
        status:'completed',
        visibility:'public',
      });
    });

    const signedOut = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDocs(query(
      collection(signedOut, 'paths', privatePathId, 'publicProgress'),
      where('visibility', '==', 'public')
    )));
  });
});

describe('enrollment isolation', () => {
  test('denies reading an enrollment before the write-first bootstrap', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    await assertFails(getDoc(doc(db, 'enrollments', enrollmentA)));
  });

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

  test('denies create when stored id differs from the document id', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    await assertFails(setDoc(
      doc(db, 'enrollments', enrollmentA),
      enrollmentData(userA, 'wrong-enrollment-id')
    ));
  });

  test('denies changing userId, pathId, or id after creation', async () => {
    const db = testEnv.authenticatedContext(userA).firestore();
    const ref = doc(db, 'enrollments', enrollmentA);
    await assertSucceeds(setDoc(ref, enrollmentData(userA, enrollmentA)));

    await assertFails(updateDoc(ref, { userId:userB }));
    await assertFails(updateDoc(ref, { pathId:'path-2' }));
    await assertFails(updateDoc(ref, { id:'wrong-enrollment-id' }));
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

describe('server-only operational data', () => {
  test('denies client reads and writes to internal rate-limit documents', async () => {
    const authenticated = testEnv.authenticatedContext(userA).firestore();
    const unauthenticated = testEnv.unauthenticatedContext().firestore();
    const ref = doc(authenticated, '_internalRateLimits', 'user-a_generate');

    await assertFails(getDoc(ref));
    await assertFails(setDoc(ref, { uid:userA, routeKey:'generate', hourlyCount:1 }));
    await assertFails(getDoc(doc(unauthenticated, '_internalRateLimits', 'user-a_generate')));
  });
});
