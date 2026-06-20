import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbLoadMorePlatformPaths, dbLoadPlatformPaths } from '../src/db.js';
import { fb } from '../src/firebase.js';
import { store } from '../src/store.js';
import { resetDiscoveryPageState } from '../src/discovery-pagination.js';

const originalFb = {};
const originalStore = {};

function rememberFb(){
  [
    'ready', 'firestoreReady', 'db', 'collection', 'query', 'where', 'limit', 'startAfter', 'getDocs', 'getDoc',
  ].forEach(key => { originalFb[key] = fb[key]; });
}

function restoreFb(){
  Object.entries(originalFb).forEach(([key, value]) => { fb[key] = value; });
}

function rememberStore(){
  [
    'cloudStatus', 'cloudMessage', 'cloudCheck', 'cloudDiagnostics',
    'state', 'platformPaths', 'currentUser', 'discoveryPage',
  ].forEach(key => { originalStore[key] = store[key]; });
}

function restoreStore(){
  Object.entries(originalStore).forEach(([key, value]) => { store[key] = value; });
}

function doc(id, data = {}){
  return { id, data:() => ({ title:id, visibility:'public', ownerId:'owner', ...data }) };
}

function installDiscoveryMocks({ publicPages = [], ownerDocs = [] } = {}){
  const calls = { collections:[], queries:[], getDocs:[], limits:[], startAfter:[] };
  let publicIndex = 0;
  fb.ready = true;
  fb.firestoreReady = true;
  fb.db = { mock:true };
  fb.collection = (db, ...path) => {
    calls.collections.push(path);
    return { type:'collection', path };
  };
  fb.where = (field, op, value) => ({ type:'where', field, op, value });
  fb.limit = count => {
    calls.limits.push(count);
    return { type:'limit', count };
  };
  fb.startAfter = cursor => {
    calls.startAfter.push(cursor);
    return { type:'startAfter', cursor };
  };
  fb.query = (col, ...constraints) => {
    const q = { type:'query', col, constraints };
    calls.queries.push(q);
    return q;
  };
  fb.getDocs = async queryRef => {
    calls.getDocs.push(queryRef);
    const ownerQuery = queryRef.constraints.some(c => c.type === 'where' && c.field === 'ownerId');
    if(ownerQuery) return { docs:ownerDocs };
    const docs = publicPages[publicIndex] || [];
    publicIndex += 1;
    return { docs };
  };
  fb.getDoc = async () => {
    throw new Error('summary discovery should not load individual docs');
  };
  return calls;
}

beforeEach(() => {
  rememberFb();
  rememberStore();
  store.cloudStatus = 'connected';
  store.cloudMessage = '';
  store.cloudCheck = { status:'connected' };
  store.cloudDiagnostics = {};
  store.state = { current:null, skills:{}, userPaths:{}, enrollments:{}, evidenceSubmissions:{}, version:5 };
  store.platformPaths = {};
  store.currentUser = { uid:'owner', email:'owner@example.com' };
  store.discoveryPage = resetDiscoveryPageState(2);
});

afterEach(() => {
  restoreFb();
  restoreStore();
});

test('initial platform discovery load uses bounded public query and separate owner query', async () => {
  const calls = installDiscoveryMocks({
    publicPages:[[
      doc('public-1', { stats:{ joinedCount:1 } }),
      doc('public-2', { stats:{ publicProgressCount:1 } }),
    ]],
    ownerDocs:[
      doc('owner-private', { visibility:'private', ownerId:'owner' }),
    ],
  });

  const records = await dbLoadPlatformPaths({ pageSize:2 });

  assert.deepEqual(records.map(record => record.id), ['public-1', 'public-2', 'owner-private']);
  const publicQuery = calls.queries.find(q => q.constraints.some(c => c.type === 'where' && c.field === 'visibility'));
  assert.ok(publicQuery);
  assert.deepEqual(publicQuery.constraints.find(c => c.type === 'where'), {
    type:'where', field:'visibility', op:'==', value:'public',
  });
  assert.equal(publicQuery.constraints.find(c => c.type === 'limit').count, 2);
  const ownerQuery = calls.queries.find(q => q.constraints.some(c => c.type === 'where' && c.field === 'ownerId'));
  assert.ok(ownerQuery);
  assert.equal(ownerQuery.constraints.find(c => c.field === 'ownerId').value, 'owner');
  assert.deepEqual(store.discoveryPage.loadedPublicIds, ['public-1', 'public-2']);
  assert.equal(store.state.userPaths['owner-private'].visibility, 'private');
  assert.equal(store.cloudDiagnostics.discoveryPageSize, 2);
  assert.equal(store.cloudDiagnostics.discoveryLoadedCount, 2);
  assert.equal(store.cloudDiagnostics.discoveryLoadStatus, 'loaded');
  assert.deepEqual(calls.collections, [['paths'], ['paths']]);
});

test('load more uses cursor, appends records, dedupes ids, and preserves owner records', async () => {
  const initialCalls = installDiscoveryMocks({
    publicPages:[[
      doc('public-1'),
      doc('public-2'),
    ]],
    ownerDocs:[
      doc('owner-private', { visibility:'private', ownerId:'owner' }),
    ],
  });
  await dbLoadPlatformPaths({ pageSize:2 });
  const cursor = store.discoveryPage.cursor;
  assert.equal(cursor.id, 'public-2');

  const moreCalls = installDiscoveryMocks({
    publicPages:[[
      doc('public-2'),
      doc('public-3'),
    ]],
  });
  await dbLoadMorePlatformPaths({ pageSize:2 });

  assert.equal(moreCalls.startAfter[0], cursor);
  const loadMoreQuery = moreCalls.queries.find(q => q.constraints.some(c => c.type === 'startAfter'));
  assert.equal(loadMoreQuery.constraints.find(c => c.type === 'limit').count, 2);
  assert.deepEqual(store.discoveryPage.loadedPublicIds, ['public-1', 'public-2', 'public-3']);
  assert.equal(store.state.userPaths['owner-private'].visibility, 'private');
  assert.equal(store.cloudDiagnostics.discoveryLoadStatus, 'loaded_more');
  assert.equal(initialCalls.collections.some(path => path.length > 1), false);
  assert.equal(moreCalls.collections.some(path => path.length > 1), false);
});

test('discovery load excludes discoverable false but keeps legacy missing discoverable public paths', async () => {
  installDiscoveryMocks({
    publicPages:[
      [
        doc('hidden', { discoverable:false }),
        doc('legacy', { discoverable:undefined }),
      ],
      [],
    ],
  });

  await dbLoadPlatformPaths({ pageSize:2 });

  assert.deepEqual(store.discoveryPage.loadedPublicIds, ['legacy']);
  assert.equal(store.state.userPaths.hidden, undefined);
  assert.equal(store.state.userPaths.legacy.discoverable, true);
});

test('optional discovery load-more failure records local diagnostics without poisoning cloud status', async () => {
  installDiscoveryMocks({ publicPages:[[doc('public-1')]] });
  await dbLoadPlatformPaths({ pageSize:1 });
  fb.getDocs = async () => {
    const error = new Error('Missing or insufficient permissions.');
    error.code = 'permission-denied';
    throw error;
  };

  const cached = await dbLoadMorePlatformPaths({ pageSize:1 });

  assert.deepEqual(cached.map(record => record.id), ['public-1']);
  assert.equal(store.cloudStatus, 'connected');
  assert.equal(store.discoveryPage.errorStatus, 'permission_denied');
  assert.match(store.discoveryPage.errorMessage, /security rules blocked this action/i);
  assert.equal(store.cloudDiagnostics.discoveryLoadStatus, 'error');
});
