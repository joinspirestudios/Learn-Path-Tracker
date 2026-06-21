import test from 'node:test';
import assert from 'node:assert/strict';

import { apiError } from '../api/_lib/errors.js';
import { enrollmentIdFor } from '../api/join-path.js';
import { createPublishProgressHandler } from '../api/publish-progress.js';
import { createUnpublishProgressHandler } from '../api/unpublish-progress.js';
import { publicProgressEntryId } from '../src/public-progress.js';

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
  async get(){
    const prefix = `${this.path}/`;
    const docs = [];
    for(const [path, data] of this.db.docs.entries()){
      if(!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if(!rest || rest.includes('/')) continue;
      docs.push({ id:rest, data:() => structuredClone(data) });
    }
    return { docs };
  }
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
      delete:ref => {
        this.docs.delete(ref.path);
      },
    };
    return fn(tx);
  }
  get(path){ return this.docs.get(path); }
}

function auth(options = {}){
  return async req => {
    if(!req.headers.authorization) throw apiError('unauthorized', 'Authentication is required.', 401);
    return {
      uid:options.uid || 'learner',
      email:'learner@example.com',
      name:'Learner One',
      token:{ name:'Learner One', picture:'https://example.com/avatar.png' },
    };
  };
}

function publishHandler(db, options = {}){
  return createPublishProgressHandler({
    db,
    authenticate:auth(options),
    rateLimit:options.rateLimit || (async () => {}),
    now:() => new Date('2026-06-19T12:00:00.000Z'),
    logger:{ info(){}, warn(){} },
  });
}

function unpublishHandler(db, options = {}){
  return createUnpublishProgressHandler({
    db,
    authenticate:auth(options),
    rateLimit:options.rateLimit || (async () => {}),
    now:() => new Date('2026-06-19T12:30:00.000Z'),
    logger:{ info(){}, warn(){} },
  });
}

function seedCompletedPath(){
  const enrollmentId = enrollmentIdFor('public-path', 'learner');
  return {
    enrollmentId,
    seed:{
      'paths/public-path':{ id:'public-path', ownerId:'owner', visibility:'public', stats:{ publicProgressCount:0 } },
      'paths/public-path/tasks/t1':{ id:'t1', title:'Proof task', evidenceRequired:true, scheduleType:'daily', startDay:1, endDay:5 },
      [`enrollments/${enrollmentId}`]:{ id:enrollmentId, pathId:'public-path', userId:'learner', currentDay:2, status:'active' },
      [`enrollments/${enrollmentId}/dayLogs/1`]:{
        dayNumber:1,
        status:'completed',
        completedTaskIds:['t1'],
        verifiedTaskIds:['t1'],
        completedAt:new Date('2026-06-19T09:00:00.000Z'),
        completionScore:70,
        completionTier:'passed',
      },
      [`enrollments/${enrollmentId}/submissions/s1`]:{
        id:'s1',
        dayNumber:1,
        taskId:'t1',
        evidenceType:'url',
        evidenceUrl:'https://private.example.com/proof',
        note:'private note',
      },
    },
  };
}

test('publish progress route creates sanitized public entry and increments count once', async () => {
  const { seed } = seedCompletedPath();
  const db = new MockDb(seed);
  const handler = publishHandler(db);

  const first = responseRecorder();
  await handler(jsonRequest({ pathId:'public-path', dayNumber:1, publicCaption:'Shared update' }), first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.payload.publicProgressCount, 1);
  assert.equal(first.payload.proofSubmissionCount, 1);
  assert.equal(first.payload.alreadyPublished, false);

  const entryPath = `paths/public-path/publicProgress/${publicProgressEntryId('learner', 1)}`;
  const entry = db.get(entryPath);
  assert.equal(entry.publicCaption, 'Shared update');
  assert.equal(entry.evidenceCount, 1);
  assert.equal(entry.completionScore, 70);
  assert.equal(entry.completionTier, 'passed');
  assert.equal(entry.schemaVersion, 2);
  assert.deepEqual(entry.evidenceTypes, ['url']);
  assert.equal(db.get('paths/public-path').stats.publicProgressCount, 1);
  assert.equal(db.get('paths/public-path').stats.proofSubmissionCount, 1);
  assert.equal(db.get('paths/public-path/participantStats/learner').publicProgressCount, 1);
  assert.equal(db.get('paths/public-path/participantStats/learner').proofSubmissionCount, 1);
  assert.doesNotMatch(JSON.stringify(entry), /private\.example\.com|private note/);

  const second = responseRecorder();
  await handler(jsonRequest({ pathId:'public-path', dayNumber:1, publicCaption:'Edited public caption' }), second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.payload.publicProgressCount, 1);
  assert.equal(second.payload.proofSubmissionCount, 1);
  assert.equal(second.payload.alreadyPublished, true);
  assert.equal(db.get(entryPath).publicCaption, 'Edited public caption');
});

test('republishing adjusts proofSubmissionCount by sanitized evidence delta', async () => {
  const { seed } = seedCompletedPath();
  const entryId = publicProgressEntryId('learner', 1);
  const db = new MockDb({
    ...seed,
    'paths/public-path':{ id:'public-path', ownerId:'owner', visibility:'public', stats:{ publicProgressCount:1, proofSubmissionCount:2 } },
    [`paths/public-path/publicProgress/${entryId}`]:{
      id:entryId,
      pathId:'public-path',
      userId:'learner',
      dayNumber:1,
      status:'completed',
      visibility:'public',
      evidenceCount:2,
    },
    [`enrollments/${enrollmentIdFor('public-path', 'learner')}/submissions/s2`]:{
      id:'s2',
      dayNumber:2,
      taskId:'t1',
      evidenceType:'url',
      evidenceUrl:'https://private.example.com/other',
    },
  });

  const res = responseRecorder();
  await publishHandler(db)(jsonRequest({ pathId:'public-path', dayNumber:1 }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.publicProgressCount, 1);
  assert.equal(res.payload.proofSubmissionCount, 1);
  assert.equal(db.get('paths/public-path').stats.proofSubmissionCount, 1);
});

test('publish progress rejects private paths and incomplete days', async () => {
  const { seed } = seedCompletedPath();
  const privateDb = new MockDb({
    ...seed,
    'paths/public-path':{ id:'public-path', ownerId:'owner', visibility:'private', stats:{ publicProgressCount:0 } },
  });
  const privateRes = responseRecorder();
  await publishHandler(privateDb)(jsonRequest({ pathId:'public-path', dayNumber:1 }), privateRes);
  assert.equal(privateRes.statusCode, 403);
  assert.equal(privateRes.payload.code, 'path_not_publishable');

  const incompleteDb = new MockDb({
    ...seed,
    [`enrollments/${enrollmentIdFor('public-path', 'learner')}/dayLogs/1`]:{ dayNumber:1, status:'active' },
  });
  const incompleteRes = responseRecorder();
  await publishHandler(incompleteDb)(jsonRequest({ pathId:'public-path', dayNumber:1 }), incompleteRes);
  assert.equal(incompleteRes.statusCode, 409);
  assert.equal(incompleteRes.payload.code, 'day_not_completed');
});

test('unpublish progress deletes only the public mirror and decrements count idempotently', async () => {
  const { seed, enrollmentId } = seedCompletedPath();
  const entryId = publicProgressEntryId('learner', 1);
  const db = new MockDb({
    ...seed,
    'paths/public-path':{ id:'public-path', ownerId:'owner', visibility:'public', stats:{ publicProgressCount:1, proofSubmissionCount:1 } },
    'paths/public-path/participantStats/learner':{ uid:'learner', pathId:'public-path', publicProgressCount:1, proofSubmissionCount:1 },
    [`paths/public-path/publicProgress/${entryId}`]:{
      id:entryId,
      pathId:'public-path',
      userId:'learner',
      dayNumber:1,
      status:'completed',
      visibility:'public',
      evidenceCount:1,
    },
  });
  const handler = unpublishHandler(db);

  const first = responseRecorder();
  await handler(jsonRequest({ pathId:'public-path', dayNumber:1 }), first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.payload.publicProgressCount, 0);
  assert.equal(first.payload.proofSubmissionCount, 0);
  assert.equal(first.payload.alreadyUnpublished, false);
  assert.equal(db.get(`paths/public-path/publicProgress/${entryId}`), undefined);
  assert.equal(db.get('paths/public-path').stats.proofSubmissionCount, 0);
  assert.equal(db.get('paths/public-path/participantStats/learner').proofSubmissionCount, 0);
  assert.equal(db.get(`enrollments/${enrollmentId}/dayLogs/1`).status, 'completed');
  assert.ok(db.get(`enrollments/${enrollmentId}/submissions/s1`));

  const second = responseRecorder();
  await handler(jsonRequest({ pathId:'public-path', dayNumber:1 }), second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.payload.publicProgressCount, 0);
  assert.equal(second.payload.proofSubmissionCount, 0);
  assert.equal(second.payload.alreadyUnpublished, true);
});
