import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbLoadPlatformPath, dbLoadPublicProgress } from '../src/db.js';
import { fb } from '../src/firebase.js';
import { store } from '../src/store.js';

const originalFb = {};
const originalStore = {};

function rememberFb(){
  [
    'ready', 'firestoreReady', 'db', 'collection', 'doc', 'query', 'where', 'getDoc', 'getDocs',
  ].forEach(key => { originalFb[key] = fb[key]; });
}

function restoreFb(){
  Object.entries(originalFb).forEach(([key, value]) => { fb[key] = value; });
}

function rememberStore(){
  [
    'cloudStatus', 'cloudMessage', 'cloudCheck', 'cloudDiagnostics',
    'publicProgress', 'currentUser', 'platformPaths',
  ].forEach(key => { originalStore[key] = store[key]; });
}

function restoreStore(){
  Object.entries(originalStore).forEach(([key, value]) => { store[key] = value; });
}

function setConnectedCloud(){
  fb.ready = true;
  fb.firestoreReady = true;
  fb.db = {};
  store.cloudStatus = 'connected';
  store.cloudMessage = '';
  store.cloudCheck = { status:'connected' };
  store.cloudDiagnostics = {
    latestErrorStatus: '',
    latestErrorMessage: '',
  };
}

beforeEach(() => {
  rememberFb();
  rememberStore();
  setConnectedCloud();
});

afterEach(() => {
  restoreFb();
  restoreStore();
});

test('public progress loader returns cached entries and isolates permission failures', async () => {
  const cachedEntry = {
    id:'entry-1',
    pathId:'path-id',
    userId:'learner',
    dayNumber:1,
    visibility:'public',
    status:'completed',
    publishedAt:'2026-06-19T10:00:00.000Z',
  };
  store.publicProgress = { 'path-id':[cachedEntry] };
  fb.collection = (...segments) => ({ type:'collection', segments });
  fb.where = (...args) => ({ type:'where', args });
  fb.query = (...args) => ({ type:'query', args });
  fb.getDocs = async () => {
    const error = new Error('Missing or insufficient permissions.');
    error.code = 'permission-denied';
    throw error;
  };

  const entries = await dbLoadPublicProgress('path-id', { limit:12 });

  assert.deepEqual(entries, [cachedEntry]);
  assert.equal(store.cloudStatus, 'connected');
  assert.equal(store.cloudMessage, '');
  assert.deepEqual(store.cloudCheck, { status:'connected' });
  assert.equal(store.cloudDiagnostics.latestErrorStatus, '');
  assert.equal(store.cloudDiagnostics.latestErrorMessage, '');
  assert.equal(store.cloudDiagnostics.publicProgressStatus, 'permission_denied');
  assert.match(store.cloudDiagnostics.publicProgressMessage, /security rules blocked this action/i);
  assert.equal(typeof store.cloudDiagnostics.publicProgressFailedAt, 'number');
});

test('public progress loader returns an empty array without mutating global cloud fields', async () => {
  store.publicProgress = {};
  fb.collection = (...segments) => ({ type:'collection', segments });
  fb.where = (...args) => ({ type:'where', args });
  fb.query = (...args) => ({ type:'query', args });
  fb.getDocs = async () => {
    const error = new Error('Missing or insufficient permissions.');
    error.code = 'permission-denied';
    throw error;
  };

  const entries = await dbLoadPublicProgress('empty-path', { limit:12 });

  assert.deepEqual(entries, []);
  assert.equal(store.cloudStatus, 'connected');
  assert.equal(store.cloudMessage, '');
  assert.deepEqual(store.cloudCheck, { status:'connected' });
  assert.equal(store.cloudDiagnostics.latestErrorStatus, '');
  assert.equal(store.cloudDiagnostics.latestErrorMessage, '');
  assert.equal(store.cloudDiagnostics.publicProgressStatus, 'permission_denied');
});

test('public progress loader keeps the Firestore query constrained to public entries', async () => {
  let capturedQuery = null;
  const whereConstraint = { type:'where', field:'visibility', op:'==', value:'public' };
  const collectionRef = { type:'collection', path:['paths', 'path-id', 'publicProgress'] };
  fb.collection = (db, ...path) => {
    assert.equal(db, fb.db);
    assert.deepEqual(path, ['paths', 'path-id', 'publicProgress']);
    return collectionRef;
  };
  fb.where = (field, op, value) => {
    assert.equal(field, 'visibility');
    assert.equal(op, '==');
    assert.equal(value, 'public');
    return whereConstraint;
  };
  fb.query = (...args) => {
    capturedQuery = args;
    return { type:'query', args };
  };
  fb.getDocs = async queryRef => {
    assert.deepEqual(queryRef, { type:'query', args:[collectionRef, whereConstraint] });
    return { forEach(){} };
  };

  const entries = await dbLoadPublicProgress('path-id', { limit:12 });

  assert.deepEqual(entries, []);
  assert.deepEqual(capturedQuery, [collectionRef, whereConstraint]);
});

test('optional public comment loading does not mutate global cloud fields', async () => {
  fb.collection = (db, ...path) => ({ type:'collection', path });
  fb.where = (...args) => ({ type:'where', args });
  fb.query = (...args) => ({ type:'query', args });
  fb.getDocs = async queryRef => {
    const path = queryRef.args[0].path;
    if(path.join('/') === 'paths/path-id/publicProgress'){
      return {
        forEach(fn){
          fn({
            id:'entry-1',
            data:() => ({
              id:'entry-1',
              pathId:'path-id',
              userId:'learner',
              dayNumber:1,
              visibility:'public',
              status:'completed',
            }),
          });
        },
      };
    }
    const error = new Error('Missing or insufficient permissions.');
    error.code = 'permission-denied';
    throw error;
  };

  const entries = await dbLoadPublicProgress('path-id', { limit:12, includeComments:true });

  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].comments, []);
  assert.equal(store.cloudStatus, 'connected');
  assert.equal(store.cloudMessage, '');
  assert.deepEqual(store.cloudCheck, { status:'connected' });
  assert.equal(store.cloudDiagnostics.latestErrorStatus, '');
  assert.equal(store.cloudDiagnostics.latestErrorMessage, '');
  assert.equal(store.cloudDiagnostics.commentLoadStatus, 'permission_denied');
});

test('core platform path failures still update global cloud status', async () => {
  store.currentUser = null;
  store.platformPaths = {};
  fb.doc = (...segments) => ({ type:'doc', segments });
  fb.getDoc = async () => {
    const error = new Error('Missing or insufficient permissions.');
    error.code = 'permission-denied';
    throw error;
  };

  await assert.rejects(() => dbLoadPlatformPath('path-id'), /Missing or insufficient permissions/);

  assert.equal(store.cloudStatus, 'permission_denied');
  assert.match(store.cloudMessage, /security rules blocked this action/i);
  assert.equal(store.cloudCheck.status, 'permission_denied');
  assert.equal(store.cloudDiagnostics.latestErrorStatus, 'permission_denied');
  assert.match(store.cloudDiagnostics.latestErrorMessage, /security rules blocked this action/i);
});
