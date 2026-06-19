import test from 'node:test';
import assert from 'node:assert/strict';

import { apiError } from '../api/_lib/errors.js';
import { currentUtcWeekKey } from '../api/_lib/path-trust-metrics.js';
import { createSyncPathMetricsHandler } from '../api/sync-path-metrics.js';
import { enrollmentIdFor } from '../api/join-path.js';

function responseRecorder(){
  return {
    statusCode:200,
    headers:{},
    payload:null,
    setHeader(name, value){ this.headers[name] = value; },
    status(code){ this.statusCode = code; return this; },
    json(value){ this.payload = value; return value; },
  };
}

function jsonRequest(body, authorization = 'Bearer valid-token'){
  return {
    method:'POST',
    headers:{ authorization, 'content-type':'application/json' },
    body,
  };
}

function deepMerge(target, patch){
  Object.entries(patch || {}).forEach(([key, value]) => {
    if(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)){
      target[key] = deepMerge({ ...(target[key] || {}) }, value);
    }else{
      target[key] = value;
    }
  });
  return target;
}

class Ref {
  constructor(db, path){ this.db = db; this.path = path; }
  collection(name){ return new Collection(this.db, `${this.path}/${name}`); }
}

class Collection {
  constructor(db, path){ this.db = db; this.path = path; }
  doc(id){ return new Ref(this.db, `${this.path}/${id}`); }
}

class Snapshot {
  constructor(data){ this._data = data; this.exists = data != null; }
  data(){ return structuredClone(this._data); }
}

class MockDb {
  constructor(seed = {}){ this.docs = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)])); }
  collection(name){ return new Collection(this, name); }
  async runTransaction(fn){
    const tx = {
      get:async ref => new Snapshot(this.docs.has(ref.path) ? this.docs.get(ref.path) : null),
      set:(ref, data, options = {}) => {
        const existing = this.docs.has(ref.path) ? structuredClone(this.docs.get(ref.path)) : {};
        this.docs.set(ref.path, options.merge ? deepMerge(existing, structuredClone(data)) : structuredClone(data));
      },
    };
    return fn(tx);
  }
  get(path){ return this.docs.get(path); }
}

function auth(options = {}){
  return async req => {
    if(!req.headers.authorization) throw apiError('unauthorized', 'Authentication is required.', 401);
    return { uid:options.uid || 'learner', email:'learner@example.com' };
  };
}

function handlerWithDb(db, options = {}){
  return createSyncPathMetricsHandler({
    db,
    authenticate:auth(options),
    rateLimit:options.rateLimit || (async () => {}),
    now:options.now || (() => new Date('2026-06-19T12:00:00.000Z')),
    logger:{ info(){}, warn(){} },
  });
}

function seedPath({ durationDays = 14, visibility = 'public', uid = 'learner' } = {}){
  const enrollmentId = enrollmentIdFor('path-1', uid);
  return {
    enrollmentId,
    seed:{
      'paths/path-1':{
        id:'path-1',
        ownerId:'owner',
        visibility,
        durationDays,
        stats:{ joinedCount:1, activeThisWeek:0, activeWeekKey:'' },
      },
      'paths/path-1/members/learner':{ uid:'learner', role:'viewer' },
      [`enrollments/${enrollmentId}`]:{
        id:enrollmentId,
        pathId:'path-1',
        userId:uid,
        startDate:'2026-06-19',
        currentDay:1,
        status:'active',
        lastCompletedDay:null,
      },
      [`enrollments/${enrollmentId}/dayLogs/1`]:{
        dayNumber:1,
        status:'active',
      },
    },
  };
}

test('sync path metrics is POST-only, protected, private no-store, and rate limited', async () => {
  const { seed } = seedPath();
  const db = new MockDb(seed);
  const getRes = responseRecorder();
  await handlerWithDb(db)({ method:'GET', headers:{ authorization:'Bearer token' }, body:{} }, getRes);
  assert.equal(getRes.statusCode, 405);
  assert.equal(getRes.headers.Allow, 'POST');

  const authRes = responseRecorder();
  await handlerWithDb(db)(jsonRequest({ pathId:'path-1', event:'day_started', dayNumber:1 }, ''), authRes);
  assert.equal(authRes.statusCode, 401);
  assert.equal(authRes.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.ok(authRes.payload.requestId);

  const limited = responseRecorder();
  await handlerWithDb(db, {
    rateLimit:async () => {
      const error = apiError('rate_limited', 'Slow down.', 429);
      error.retryAfterSeconds = 45;
      throw error;
    },
  })(jsonRequest({ pathId:'path-1', event:'day_started', dayNumber:1 }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Retry-After'], '45');
});

test('day milestones initialize participantStats and count once', async () => {
  const { seed } = seedPath({ durationDays:14 });
  const db = new MockDb(seed);
  const handler = handlerWithDb(db);

  const first = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', event:'day_started', dayNumber:1, uid:'attacker', stats:{ completedCount:999 } }), first);
  assert.equal(first.statusCode, 200);
  assert.deepEqual(first.payload.milestonesUpdated, ['day1StartedCount']);
  assert.equal(first.payload.stats.day1StartedCount, 1);
  assert.equal(first.payload.stats.completedCount, 0);
  assert.equal(first.payload.stats.activeThisWeek, 1);
  assert.equal(first.payload.stats.activeWeekKey, currentUtcWeekKey(new Date('2026-06-19T12:00:00.000Z')));
  assert.equal(db.get('paths/path-1/participantStats/learner').uid, 'learner');

  const repeat = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', event:'day_started', dayNumber:1 }), repeat);
  assert.equal(repeat.payload.stats.day1StartedCount, 1);
  assert.equal(repeat.payload.stats.activeThisWeek, 1);

  db.docs.set(`enrollments/${enrollmentIdFor('path-1', 'learner')}/dayLogs/7`, { dayNumber:7, status:'completed' });
  const day7 = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', event:'day_completed', dayNumber:7 }), day7);
  assert.equal(day7.payload.stats.day7ReachedCount, 1);
  assert.equal(day7.payload.stats.halfwayReachedCount, 1);
  assert.equal(day7.payload.stats.completedCount, 0);

  const day7Again = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', event:'day_completed', dayNumber:7 }), day7Again);
  assert.equal(day7Again.payload.stats.day7ReachedCount, 1);
  assert.equal(day7Again.payload.stats.halfwayReachedCount, 1);

  db.docs.set(`enrollments/${enrollmentIdFor('path-1', 'learner')}/dayLogs/14`, { dayNumber:14, status:'completed' });
  const completed = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', event:'day_completed', dayNumber:14 }), completed);
  assert.equal(completed.payload.stats.completedCount, 1);
  assert.equal(db.get('paths/path-1/participantStats/learner').highestCompletedDay, 14);
});

test('active this week counts a participant once per UTC week and resets stale path week', async () => {
  const { seed } = seedPath();
  const db = new MockDb({
    ...seed,
    'paths/path-1':{ ...seed['paths/path-1'], stats:{ activeThisWeek:7, activeWeekKey:'2026-W24' } },
    'paths/path-1/participantStats/learner':{
      uid:'learner',
      pathId:'path-1',
      activeWeekKey:'2026-W24',
      day1StartedAt:new Date('2026-06-18T12:00:00.000Z'),
    },
  });

  const res = responseRecorder();
  await handlerWithDb(db, { now:() => new Date('2026-06-22T12:00:00.000Z') })(
    jsonRequest({ pathId:'path-1', event:'day_started', dayNumber:1 }),
    res
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.stats.activeWeekKey, '2026-W26');
  assert.equal(res.payload.stats.activeThisWeek, 1);

  const repeat = responseRecorder();
  await handlerWithDb(db, { now:() => new Date('2026-06-23T12:00:00.000Z') })(
    jsonRequest({ pathId:'path-1', event:'day_started', dayNumber:1 }),
    repeat
  );
  assert.equal(repeat.payload.stats.activeThisWeek, 1);
});

test('sync path metrics rejects missing path, invalid events, missing enrollment, and unverified day logs', async () => {
  const missingPath = responseRecorder();
  await handlerWithDb(new MockDb())(jsonRequest({ pathId:'missing', event:'day_started', dayNumber:1 }), missingPath);
  assert.equal(missingPath.statusCode, 404);

  const invalid = responseRecorder();
  await handlerWithDb(new MockDb(seedPath().seed))(jsonRequest({ pathId:'path-1', event:'fake', dayNumber:1 }), invalid);
  assert.equal(invalid.statusCode, 400);

  const noEnrollment = responseRecorder();
  await handlerWithDb(new MockDb({ 'paths/path-1':{ ownerId:'owner', visibility:'public' } }))(
    jsonRequest({ pathId:'path-1', event:'day_started', dayNumber:1 }),
    noEnrollment
  );
  assert.equal(noEnrollment.statusCode, 404);

  const { seed } = seedPath();
  const unverified = responseRecorder();
  await handlerWithDb(new MockDb({
    ...seed,
    [`enrollments/${enrollmentIdFor('path-1', 'learner')}/dayLogs/7`]:{ dayNumber:7, status:'active' },
  }))(jsonRequest({ pathId:'path-1', event:'day_completed', dayNumber:7 }), unverified);
  assert.equal(unverified.statusCode, 409);
});

test('private paths require existing ownership or membership plus caller-owned enrollment', async () => {
  const { seed } = seedPath({ visibility:'private' });
  const allowed = responseRecorder();
  await handlerWithDb(new MockDb(seed))(jsonRequest({ pathId:'path-1', event:'day_started', dayNumber:1 }), allowed);
  assert.equal(allowed.statusCode, 200);

  const deniedSeed = { ...seed };
  delete deniedSeed['paths/path-1/members/learner'];
  const denied = responseRecorder();
  await handlerWithDb(new MockDb(deniedSeed))(jsonRequest({ pathId:'path-1', event:'day_started', dayNumber:1 }), denied);
  assert.equal(denied.statusCode, 403);
});
