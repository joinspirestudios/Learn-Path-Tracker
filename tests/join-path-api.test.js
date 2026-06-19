import test from 'node:test';
import assert from 'node:assert/strict';

import { apiError } from '../api/_lib/errors.js';
import { createJoinPathHandler, enrollmentIdFor } from '../api/join-path.js';

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
    if(value && typeof value === 'object' && value.__increment != null){
      target[key] = Number(target[key] || 0) + Number(value.__increment || 0);
    }else if(value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)){
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
  data(){ return this._data; }
}

class MockDb {
  constructor(seed = {}){ this.docs = new Map(Object.entries(seed).map(([key, value]) => [key, structuredClone(value)])); }
  collection(name){ return new Collection(this, name); }
  async runTransaction(fn){
    const tx = {
      get:async ref => new Snapshot(this.docs.has(ref.path) ? structuredClone(this.docs.get(ref.path)) : null),
      set:(ref, data, options = {}) => {
        const existing = this.docs.has(ref.path) ? structuredClone(this.docs.get(ref.path)) : {};
        this.docs.set(ref.path, options.merge ? deepMerge(existing, structuredClone(data)) : structuredClone(data));
      },
    };
    return fn(tx);
  }
  get(path){ return this.docs.get(path); }
}

function handlerWithDb(db, options = {}){
  return createJoinPathHandler({
    db,
    authenticate:async req => {
      if(!req.headers.authorization) throw apiError('unauthorized', 'Authentication is required.', 401);
      return { uid:options.uid || 'joiner', email:'joiner@example.com' };
    },
    rateLimit:options.rateLimit || (async () => {}),
    increment:value => ({ __increment:value }),
    now:() => new Date('2026-06-18T12:00:00.000Z'),
    logger:{ info(){}, warn(){} },
  });
}

test('join path route is POST-only and requires auth', async () => {
  const db = new MockDb();
  const handler = handlerWithDb(db);

  const getRes = responseRecorder();
  await handler({ method:'GET', headers:{ authorization:'Bearer valid-token' }, body:{} }, getRes);
  assert.equal(getRes.statusCode, 405);
  assert.equal(getRes.headers.Allow, 'POST');

  const authRes = responseRecorder();
  await handler(jsonRequest({ pathId:'public-path' }, ''), authRes);
  assert.equal(authRes.statusCode, 401);
  assert.equal(authRes.payload.code, 'unauthorized');
  assert.equal(authRes.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.ok(authRes.headers['X-Request-Id']);
});

test('join path validates path id and missing paths safely', async () => {
  const handler = handlerWithDb(new MockDb());
  const badRes = responseRecorder();
  await handler(jsonRequest({ pathId:'../bad' }), badRes);
  assert.equal(badRes.statusCode, 400);

  const missingRes = responseRecorder();
  await handler(jsonRequest({ pathId:'missing' }), missingRes);
  assert.equal(missingRes.statusCode, 404);
  assert.equal(missingRes.payload.code, 'path_not_found');
});

test('private paths reject non-member joins', async () => {
  const db = new MockDb({
    'paths/private-path':{ ownerId:'owner', visibility:'private', title:'Private' },
  });
  const res = responseRecorder();
  await handlerWithDb(db)(jsonRequest({ pathId:'private-path' }), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'path_private');
  assert.equal(db.get('paths/private-path/members/joiner'), undefined);
});

test('public path join creates viewer membership, enrollment, and increments count once', async () => {
  const db = new MockDb({
    'paths/public-path':{ ownerId:'owner', visibility:'public', title:'Public', stats:{ joinedCount:2 } },
  });
  const handler = handlerWithDb(db);

  const first = responseRecorder();
  await handler(jsonRequest({ pathId:'public-path' }), first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.payload.joinCount, 3);
  assert.equal(first.payload.alreadyJoined, false);

  const member = db.get('paths/public-path/members/joiner');
  assert.equal(member.role, 'viewer');
  assert.equal(member.joinStatus, 'active');
  assert.equal(member.source, 'join');

  const enrollment = db.get(`enrollments/${enrollmentIdFor('public-path', 'joiner')}`);
  assert.equal(enrollment.pathId, 'public-path');
  assert.equal(enrollment.userId, 'joiner');
  assert.equal(enrollment.currentDay, 1);
  assert.equal(enrollment.streak, 0);
  assert.equal(enrollment.freezeCount, 1);
  assert.equal(enrollment.startDate, null);

  const second = responseRecorder();
  db.docs.set(`enrollments/${enrollmentIdFor('public-path', 'joiner')}`, { ...enrollment, currentDay:5, streak:4 });
  await handler(jsonRequest({ pathId:'public-path' }), second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.payload.alreadyJoined, true);
  assert.equal(second.payload.joinCount, 3);
  assert.equal(db.get('paths/public-path').stats.joinedCount, 3);
  assert.equal(db.get(`enrollments/${enrollmentIdFor('public-path', 'joiner')}`).currentDay, 5);
  assert.equal(db.get(`enrollments/${enrollmentIdFor('public-path', 'joiner')}`).streak, 4);
  assert.equal(db.get('paths/public-path').ownerId, 'owner');
  assert.equal(db.get('paths/public-path').title, 'Public');
});

test('unlisted paths can be joined by direct path id', async () => {
  const db = new MockDb({
    'paths/unlisted-path':{ ownerId:'owner', visibility:'unlisted', title:'Unlisted' },
  });
  const res = responseRecorder();
  await handlerWithDb(db)(jsonRequest({ pathId:'unlisted-path' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(db.get('paths/unlisted-path/members/joiner').role, 'viewer');
  assert.equal(db.get('paths/unlisted-path').stats.joinedCount, 1);
});

test('existing membership is preserved and never upgraded to editor by join', async () => {
  const db = new MockDb({
    'paths/member-path':{ ownerId:'owner', visibility:'private', title:'Member path', stats:{ joinedCount:7 } },
    'paths/member-path/members/joiner':{ uid:'joiner', role:'commenter', joinStatus:'active', source:'invite' },
  });
  const res = responseRecorder();
  await handlerWithDb(db)(jsonRequest({ pathId:'member-path' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.alreadyJoined, true);
  assert.equal(res.payload.joinCount, 7);
  assert.equal(db.get('paths/member-path/members/joiner').role, 'commenter');
  assert.equal(db.get('paths/member-path').stats.joinedCount, 7);
});

test('owner route calls do not create participant joins or increment count', async () => {
  const db = new MockDb({
    'paths/owner-path':{ ownerId:'owner', visibility:'public', title:'Owner path', stats:{ joinedCount:1 } },
  });
  const res = responseRecorder();
  await handlerWithDb(db, { uid:'owner' })(jsonRequest({ pathId:'owner-path' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.owner, true);
  assert.equal(res.payload.alreadyJoined, true);
  assert.equal(db.get('paths/owner-path').stats.joinedCount, 1);
  assert.equal(db.get('paths/owner-path/members/owner'), undefined);
});

test('join path route is rate limited before writes', async () => {
  const db = new MockDb({
    'paths/public-path':{ ownerId:'owner', visibility:'public', title:'Public' },
  });
  const res = responseRecorder();
  await handlerWithDb(db, {
    rateLimit:async () => {
      const error = apiError('rate_limited', 'Limit reached.', 429);
      error.retryAfterSeconds = 60;
      throw error;
    },
  })(jsonRequest({ pathId:'public-path' }), res);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers['Retry-After'], '60');
  assert.equal(db.get('paths/public-path/members/joiner'), undefined);
});
