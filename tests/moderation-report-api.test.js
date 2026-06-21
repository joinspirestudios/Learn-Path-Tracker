import test from 'node:test';
import assert from 'node:assert/strict';

import { apiError } from '../api/_lib/errors.js';
import { createReportPathHandler } from '../server/api-handlers/report-path.js';
import { createReportProgressCommentHandler } from '../server/api-handlers/report-progress-comment.js';

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
  reportDocs(){ return [...this.docs.entries()].filter(([key]) => key.startsWith('moderationReports/')); }
}

function auth(options = {}){
  return async req => {
    if(!req.headers.authorization) throw apiError('unauthorized', 'Authentication is required.', 401);
    return { uid:options.uid || 'viewer', email:'viewer@example.com', name:'Viewer', token:{} };
  };
}

function seed(visibility = 'public', commentStatus = 'visible'){
  return {
    'paths/path-1':{ id:'path-1', ownerId:'owner', visibility, title:'Public Path', previewTitle:'Preview Title' },
    'paths/path-1/publicProgress/entry-1':{
      id:'entry-1',
      pathId:'path-1',
      userId:'learner',
      dayNumber:1,
      status:'completed',
      visibility:'public',
      visibleCommentCount:1,
    },
    'paths/path-1/publicProgress/entry-1/comments/c1':{
      id:'c1',
      pathId:'path-1',
      entryId:'entry-1',
      userId:'learner',
      authorName:'Learner',
      body:'Visible public comment body',
      visibility:commentStatus === 'visible' ? 'public' : 'hidden',
      status:commentStatus,
    },
    'enrollments/private/dayLogs/1':{ summary:'private reflection' },
    'enrollments/private/submissions/proof':{ evidenceUrl:'https://private.example.com/proof' },
  };
}

function pathHandler(db, options = {}){
  return createReportPathHandler({
    db,
    authenticate:auth(options),
    rateLimit:options.rateLimit || (async () => {}),
    now:() => new Date('2026-06-21T10:00:00.000Z'),
    logger:{ info(){}, warn(){} },
  });
}

function commentHandler(db, options = {}){
  return createReportProgressCommentHandler({
    db,
    authenticate:auth(options),
    rateLimit:options.rateLimit || (async () => {}),
    now:() => new Date('2026-06-21T10:05:00.000Z'),
    logger:{ info(){}, warn(){} },
  });
}

test('report path is POST-only, authenticated, private no-store, and rate limited', async () => {
  const db = new MockDb(seed());
  const getRes = responseRecorder();
  await pathHandler(db)({ method:'GET', headers:{ authorization:'Bearer token' }, body:{} }, getRes);
  assert.equal(getRes.statusCode, 405);
  assert.equal(getRes.headers.Allow, 'POST');

  const missingAuth = responseRecorder();
  await pathHandler(db)(jsonRequest({ pathId:'path-1', reason:'spam' }, ''), missingAuth);
  assert.equal(missingAuth.statusCode, 401);

  const limited = responseRecorder();
  await pathHandler(db, {
    rateLimit:async () => {
      const error = apiError('rate_limited', 'Slow down.', 429);
      error.retryAfterSeconds = 30;
      throw error;
    },
  })(jsonRequest({ pathId:'path-1', reason:'spam' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.ok(limited.payload.requestId);
});

test('report path succeeds for public and unlisted paths while rejecting private paths', async () => {
  for(const visibility of ['public', 'unlisted']){
    const db = new MockDb(seed(visibility));
    const res = responseRecorder();
    await pathHandler(db)(jsonRequest({ pathId:'path-1', reason:'misleading', note:'  Looks wrong  ' }), res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.payload.reportId);
    const reports = db.reportDocs();
    assert.equal(reports.length, 1);
    assert.equal(reports[0][1].targetType, 'path');
    assert.equal(reports[0][1].note, 'Looks wrong');
    assert.equal(reports[0][1].schemaVersion, 1);
    assert.equal(db.get('enrollments/private/dayLogs/1').summary, 'private reflection');
  }

  const privateRes = responseRecorder();
  await pathHandler(new MockDb(seed('private')))(jsonRequest({ pathId:'path-1', reason:'spam' }), privateRes);
  assert.equal(privateRes.statusCode, 403);
});

test('report path rejects invalid reason and dedupes repeated reports', async () => {
  const db = new MockDb(seed());
  const invalid = responseRecorder();
  await pathHandler(db)(jsonRequest({ pathId:'path-1', reason:'not-real' }), invalid);
  assert.equal(invalid.statusCode, 400);

  const handler = pathHandler(db, { uid:'viewer' });
  const first = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', reason:'spam', note:'one' }), first);
  const second = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', reason:'spam', note:'two' }), second);
  assert.equal(first.payload.reportId, second.payload.reportId);
  assert.equal(db.reportDocs().length, 1);
  assert.equal(db.reportDocs()[0][1].reportCount, 2);
  assert.equal(db.reportDocs()[0][1].note, 'two');
});

test('report comment validates public visible source and does not hide or mutate counts', async () => {
  const db = new MockDb(seed());
  const res = responseRecorder();
  await commentHandler(db)(jsonRequest({
    pathId:'path-1',
    entryId:'entry-1',
    commentId:'c1',
    reason:'harassment',
    note:'  <b>bad</b>  ',
  }), res);
  assert.equal(res.statusCode, 200);
  const report = db.reportDocs()[0][1];
  assert.equal(report.targetType, 'publicProgressComment');
  assert.equal(report.note, '<b>bad</b>');
  assert.equal(report.contentSnapshot.publicSnippet, 'Visible public comment body');
  assert.equal(db.get('paths/path-1/publicProgress/entry-1/comments/c1').status, 'visible');
  assert.equal(db.get('paths/path-1/publicProgress/entry-1').visibleCommentCount, 1);
});

test('report comment rejects private paths, missing entries/comments, hidden comments, and invalid reason', async () => {
  const privateRes = responseRecorder();
  await commentHandler(new MockDb(seed('private')))(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'c1', reason:'spam' }), privateRes);
  assert.equal(privateRes.statusCode, 403);

  const missingEntry = responseRecorder();
  await commentHandler(new MockDb(seed()))(jsonRequest({ pathId:'path-1', entryId:'missing', commentId:'c1', reason:'spam' }), missingEntry);
  assert.equal(missingEntry.statusCode, 404);

  const missingComment = responseRecorder();
  await commentHandler(new MockDb(seed()))(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'missing', reason:'spam' }), missingComment);
  assert.equal(missingComment.statusCode, 404);

  const hidden = responseRecorder();
  await commentHandler(new MockDb(seed('public', 'hidden')))(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'c1', reason:'spam' }), hidden);
  assert.equal(hidden.statusCode, 404);

  const invalid = responseRecorder();
  await commentHandler(new MockDb(seed()))(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'c1', reason:'bad' }), invalid);
  assert.equal(invalid.statusCode, 400);
});

test('report comment dedupes same reporter target and reason', async () => {
  const db = new MockDb(seed());
  const handler = commentHandler(db, { uid:'viewer' });
  const first = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'c1', reason:'spam' }), first);
  const second = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'c1', reason:'spam' }), second);
  assert.equal(first.payload.reportId, second.payload.reportId);
  assert.equal(db.reportDocs().length, 1);
  assert.equal(db.reportDocs()[0][1].reportCount, 2);
});
