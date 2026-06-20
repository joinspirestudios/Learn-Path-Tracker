import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearDiscoveryState, curatedDiscoverySections, discoverPaths, discoveryCategoryOptions,
  durationBucket, filterDiscoveryPaths, isDiscoverablePublicPath, normalizeDiscoveryState,
  proofSignals, sortDiscoveryPaths,
} from '../src/discovery.js';

const now = new Date('2026-06-20T12:00:00.000Z');

function path(id, patch = {}){
  return {
    id,
    platform:true,
    visibility:'public',
    discoverable:true,
    title:id,
    previewDescription:'',
    goal:'',
    category:'',
    creatorName:'',
    durationDays:30,
    intensity:'balanced',
    createdAt:'2026-06-10T00:00:00.000Z',
    stats:{
      joinedCount:0,
      publicProgressCount:0,
      proofSubmissionCount:0,
      completedCount:0,
      activeThisWeek:0,
      activeWeekKey:'',
    },
    ...patch,
  };
}

const paths = [
  path('proof-course', {
    title:'Blender Product Animation',
    previewDescription:'Create polished product shots',
    category:'Creative',
    creatorName:'Maya',
    durationDays:21,
    intensity:'balanced',
    stats:{ joinedCount:4, publicProgressCount:2, proofSubmissionCount:1, completedCount:0, activeThisWeek:3, activeWeekKey:'2026-W25' },
  }),
  path('soft-french', {
    title:'Gentle French',
    previewDescription:'Begin speaking simple French',
    category:'Language',
    creatorName:'Noor',
    durationDays:7,
    intensity:'soft',
    createdAt:'2026-06-19T00:00:00.000Z',
    stats:{ joinedCount:2, publicProgressCount:0, proofSubmissionCount:0, completedCount:0, activeThisWeek:4, activeWeekKey:'2026-W24' },
  }),
  path('intensive-run', {
    title:'Run 15 km',
    goal:'Build running endurance',
    category:'Fitness',
    creatorName:'Ari',
    durationDays:120,
    intensity:'intensive',
    createdAt:'2025-12-01T00:00:00.000Z',
    stats:{ joinedCount:9, publicProgressCount:0, proofSubmissionCount:0, completedCount:3, activeThisWeek:0, activeWeekKey:'2026-W25' },
  }),
  path('hidden-private', { visibility:'private', title:'Private path' }),
  path('hidden-unlisted', { visibility:'unlisted', title:'Unlisted path' }),
  path('hidden-discoverable', { discoverable:false, title:'Hidden public path' }),
];

test('discovery state normalizes and clears safely', () => {
  assert.deepEqual(normalizeDiscoveryState({ query:'  Blender  ', duration:'bad', sort:'wat' }), {
    query:'Blender',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  });
  assert.deepEqual(clearDiscoveryState(), {
    query:'',
    category:'all',
    duration:'all',
    intensity:'all',
    proof:'all',
    sort:'recommended',
  });
});

test('discoverability includes only public discoverable platform paths', () => {
  assert.equal(isDiscoverablePublicPath(paths[0]), true);
  assert.equal(isDiscoverablePublicPath({ ...paths[0], platform:false }), false);
  assert.equal(isDiscoverablePublicPath({ ...paths[0], visibility:'unlisted' }), false);
  assert.equal(isDiscoverablePublicPath({ ...paths[0], visibility:'private' }), false);
  assert.equal(isDiscoverablePublicPath({ ...paths[0], discoverable:false }), false);
});

test('search matches safe public metadata and handles missing fields', () => {
  assert.deepEqual(discoverPaths(paths, { query:' blender product ' }, now).map(item => item.id), ['proof-course']);
  assert.deepEqual(discoverPaths(paths, { query:'maya' }, now).map(item => item.id), ['proof-course']);
  assert.deepEqual(discoverPaths(paths, { query:'language speaking' }, now).map(item => item.id), ['soft-french']);
  assert.deepEqual(discoverPaths([{ id:'missing', platform:true, visibility:'public' }], {}, now).map(item => item.id), ['missing']);
  assert.deepEqual(discoverPaths(paths, { query:'private' }, now).map(item => item.id), []);
});

test('category, duration, intensity and proof filters use real public fields', () => {
  assert.deepEqual(discoveryCategoryOptions(paths.filter(isDiscoverablePublicPath)).map(item => item.label), ['Creative', 'Fitness', 'Language']);
  assert.deepEqual(filterDiscoveryPaths(paths, { category:'creative' }, now).map(item => item.id), ['proof-course']);
  assert.equal(durationBucket(paths[1]), 'short');
  assert.equal(durationBucket(paths[0]), 'month');
  assert.equal(durationBucket(paths[2]), 'long');
  assert.deepEqual(filterDiscoveryPaths(paths, { duration:'short' }, now).map(item => item.id), ['soft-french']);
  assert.deepEqual(filterDiscoveryPaths(paths, { intensity:'soft' }, now).map(item => item.id), ['soft-french']);
  assert.deepEqual(filterDiscoveryPaths(paths, { proof:'proof_backed' }, now).map(item => item.id), ['proof-course']);
  assert.deepEqual(filterDiscoveryPaths(paths, { proof:'active_this_week' }, now).map(item => item.id), ['proof-course']);
  assert.deepEqual(filterDiscoveryPaths(paths, { proof:'completed' }, now).map(item => item.id), ['intensive-run']);
  assert.deepEqual(filterDiscoveryPaths(paths, { proof:'new' }, now).map(item => item.id).sort(), ['proof-course', 'soft-french']);
});

test('active-this-week signal rejects stale activity', () => {
  assert.equal(proofSignals(paths[0], now).activeThisWeek, true);
  assert.equal(proofSignals(paths[1], now).activeThisWeek, false);
});

test('sort options are deterministic and use real metrics', () => {
  assert.deepEqual(sortDiscoveryPaths(paths.filter(isDiscoverablePublicPath), 'most_joined', now).map(item => item.id), ['intensive-run', 'proof-course', 'soft-french']);
  assert.deepEqual(sortDiscoveryPaths(paths.filter(isDiscoverablePublicPath), 'most_proof', now).map(item => item.id)[0], 'proof-course');
  assert.deepEqual(sortDiscoveryPaths(paths.filter(isDiscoverablePublicPath), 'recently_active', now).map(item => item.id)[0], 'proof-course');
  assert.deepEqual(sortDiscoveryPaths(paths.filter(isDiscoverablePublicPath), 'most_completed', now).map(item => item.id)[0], 'intensive-run');
  assert.deepEqual(sortDiscoveryPaths(paths.filter(isDiscoverablePublicPath), 'newest', now).map(item => item.id)[0], 'soft-french');
  assert.deepEqual(sortDiscoveryPaths(paths.filter(isDiscoverablePublicPath), 'shortest', now).map(item => item.id), ['soft-french', 'proof-course', 'intensive-run']);
  assert.deepEqual(sortDiscoveryPaths(paths.filter(isDiscoverablePublicPath), 'longest', now).map(item => item.id), ['intensive-run', 'proof-course', 'soft-french']);
  assert.deepEqual(sortDiscoveryPaths(paths.filter(isDiscoverablePublicPath), 'recommended', now).map(item => item.id)[0], 'proof-course');
});

test('curated sections contain only qualifying real paths and hide empty sections', () => {
  const sections = curatedDiscoverySections(paths, now, 6);
  const byId = Object.fromEntries(sections.map(section => [section.id, section.paths.map(item => item.id)]));
  assert.deepEqual(byId['proof-backed'], ['proof-course']);
  assert.deepEqual(byId['recently-active'], ['proof-course']);
  assert.deepEqual(byId.popular, ['intensive-run', 'proof-course', 'soft-french']);
  assert.deepEqual(byId['beginner-friendly'], ['proof-course', 'soft-french']);
  assert.deepEqual(byId['newly-added'], ['soft-french', 'proof-course']);
  assert.equal(sections.some(section => section.id === 'featured'), false);
  assert.equal(sections.some(section => section.paths.some(item => item.id.startsWith('fake'))), false);
  assert.equal(curatedDiscoverySections([path('quiet', { stats:{} })], now).some(section => section.id === 'proof-backed'), false);
});
