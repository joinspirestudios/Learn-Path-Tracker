import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DISCOVERY_PAGE_SIZE, DISCOVERY_PAGE_SIZE_MAX,
  boundedDiscoveryPageSize, dedupeDiscoveryIds, mergeDiscoveryLoadedIds,
  normalizeDiscoveryPageState, resetDiscoveryPageState, serializableDiscoveryPageState,
} from '../src/discovery-pagination.js';

test('discovery pagination state normalizes safely with defaults', () => {
  assert.deepEqual(normalizeDiscoveryPageState(null), {
    pageSize: DISCOVERY_PAGE_SIZE,
    loading: false,
    loadingMore: false,
    hasMore: true,
    cursor: null,
    loadedPublicIds: [],
    lastLoadedAt: 0,
    errorStatus: '',
    errorMessage: '',
  });
  assert.deepEqual(normalizeDiscoveryPageState({
    pageSize:'2',
    loading:1,
    loadingMore:0,
    hasMore:false,
    cursor:{ id:'cursor' },
    loadedPublicIds:['a', '', 'a', 'b'],
    lastLoadedAt:'123',
    errorStatus:'offline',
    errorMessage:'Cached only',
  }), {
    pageSize: 2,
    loading: true,
    loadingMore: false,
    hasMore: false,
    cursor:{ id:'cursor' },
    loadedPublicIds:['a', 'b'],
    lastLoadedAt: 123,
    errorStatus:'offline',
    errorMessage:'Cached only',
  });
});

test('discovery page size is bounded', () => {
  assert.equal(boundedDiscoveryPageSize(0), DISCOVERY_PAGE_SIZE);
  assert.equal(boundedDiscoveryPageSize(-4, 12), 12);
  assert.equal(boundedDiscoveryPageSize(999), DISCOVERY_PAGE_SIZE_MAX);
  assert.equal(boundedDiscoveryPageSize(3), 3);
});

test('loaded discovery ids dedupe safely while preserving order', () => {
  assert.deepEqual(dedupeDiscoveryIds(['p1', 'p2', 'p1', null, ' ', 'p3']), ['p1', 'p2', 'p3']);
  assert.deepEqual(mergeDiscoveryLoadedIds(['p1', 'p2'], ['p2', 'p3']), ['p1', 'p2', 'p3']);
});

test('reset clears loaded ids and runtime cursor', () => {
  const state = resetDiscoveryPageState(4);
  assert.equal(state.pageSize, 4);
  assert.equal(state.cursor, null);
  assert.deepEqual(state.loadedPublicIds, []);
  assert.equal(state.hasMore, true);
});

test('serializable pagination state strips unsafe Firestore cursor snapshots', () => {
  const cursor = { id:'doc-1', data:() => ({ title:'not serializable' }) };
  const serialized = serializableDiscoveryPageState({
    cursor,
    loadedPublicIds:['p1'],
    hasMore:false,
  });
  assert.equal(serialized.cursor, null);
  assert.deepEqual(serialized.loadedPublicIds, ['p1']);
  assert.equal(serialized.hasMore, false);
});
