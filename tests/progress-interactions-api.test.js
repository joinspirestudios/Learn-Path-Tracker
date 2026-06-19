import test from 'node:test';
import assert from 'node:assert/strict';

import { apiError } from '../api/_lib/errors.js';
import { createCommentProgressHandler } from '../api/comment-progress.js';
import { createHideProgressCommentHandler } from '../api/hide-progress-comment.js';
import { createReactProgressHandler } from '../api/react-progress.js';

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
      uid:options.uid || 'viewer',
      email:'viewer@example.com',
      name:options.name || 'Viewer One',
      token:{ name:options.name || 'Viewer One', picture:options.picture || 'https://example.com/avatar.png' },
    };
  };
}

function seedProgress(visibility = 'public'){
  return {
    'paths/path-1':{ id:'path-1', ownerId:'owner', visibility, stats:{ publicProgressCount:1 } },
    'paths/path-1/publicProgress/entry-1':{
      id:'entry-1',
      pathId:'path-1',
      userId:'learner',
      dayNumber:1,
      status:'completed',
      visibility:'public',
      reactionCounts:{ cheer:0, keep_going:0, inspired:0 },
      totalReactionCount:0,
      visibleCommentCount:0,
    },
    'enrollments/private/dayLogs/1':{ status:'completed', summary:'private day log' },
    'enrollments/private/submissions/proof':{ evidenceUrl:'https://private.example.com/proof', note:'private evidence' },
  };
}

function reactHandler(db, options = {}){
  return createReactProgressHandler({
    db,
    authenticate:auth(options),
    rateLimit:options.rateLimit || (async () => {}),
    now:() => new Date('2026-06-19T13:00:00.000Z'),
    logger:{ info(){}, warn(){} },
  });
}

function commentHandler(db, options = {}){
  return createCommentProgressHandler({
    db,
    authenticate:auth(options),
    rateLimit:options.rateLimit || (async () => {}),
    now:() => new Date('2026-06-19T13:05:00.000Z'),
    logger:{ info(){}, warn(){} },
  });
}

function hideHandler(db, options = {}){
  return createHideProgressCommentHandler({
    db,
    authenticate:auth(options),
    rateLimit:options.rateLimit || (async () => {}),
    now:() => new Date('2026-06-19T13:10:00.000Z'),
    logger:{ info(){}, warn(){} },
  });
}

test('react progress is POST-only, private no-store, and rate limited', async () => {
  const db = new MockDb(seedProgress());
  const getRes = responseRecorder();
  await reactHandler(db)({ method:'GET', headers:{ authorization:'Bearer token' }, body:{} }, getRes);
  assert.equal(getRes.statusCode, 405);
  assert.equal(getRes.headers.Allow, 'POST');

  const limited = responseRecorder();
  await reactHandler(db, {
    rateLimit:async () => {
      const error = apiError('rate_limited', 'Slow down.', 429);
      error.retryAfterSeconds = 30;
      throw error;
    },
  })(jsonRequest({ pathId:'path-1', entryId:'entry-1', reaction:'cheer' }), limited);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.ok(limited.payload.requestId);
});

test('react progress increments, repeats idempotently, changes, and removes without negative counts', async () => {
  const db = new MockDb(seedProgress());
  const handler = reactHandler(db, { uid:'viewer' });

  const first = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', entryId:'entry-1', reaction:'cheer', reactionCounts:{ cheer:999 }, userId:'other' }), first);
  assert.equal(first.statusCode, 200);
  assert.equal(first.payload.reactionCounts.cheer, 1);
  assert.equal(first.payload.totalReactionCount, 1);
  assert.equal(db.get('paths/path-1/publicProgress/entry-1/reactions/viewer').userId, 'viewer');

  const repeat = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', entryId:'entry-1', reaction:'cheer' }), repeat);
  assert.equal(repeat.payload.reactionCounts.cheer, 1);
  assert.equal(repeat.payload.totalReactionCount, 1);

  const change = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', entryId:'entry-1', reaction:'inspired' }), change);
  assert.equal(change.payload.reactionCounts.cheer, 0);
  assert.equal(change.payload.reactionCounts.inspired, 1);
  assert.equal(change.payload.totalReactionCount, 1);

  const remove = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', entryId:'entry-1', reaction:null }), remove);
  assert.equal(remove.payload.totalReactionCount, 0);
  assert.equal(db.get('paths/path-1/publicProgress/entry-1/reactions/viewer'), undefined);

  const removeAgain = responseRecorder();
  await handler(jsonRequest({ pathId:'path-1', entryId:'entry-1', reaction:null }), removeAgain);
  assert.equal(removeAgain.payload.totalReactionCount, 0);
});

test('react progress rejects private paths, missing entries, and unsupported reactions', async () => {
  const privateRes = responseRecorder();
  await reactHandler(new MockDb(seedProgress('private')))(jsonRequest({ pathId:'path-1', entryId:'entry-1', reaction:'cheer' }), privateRes);
  assert.equal(privateRes.statusCode, 403);

  const missing = responseRecorder();
  await reactHandler(new MockDb(seedProgress()))(jsonRequest({ pathId:'path-1', entryId:'missing', reaction:'cheer' }), missing);
  assert.equal(missing.statusCode, 404);

  const invalid = responseRecorder();
  await reactHandler(new MockDb(seedProgress()))(jsonRequest({ pathId:'path-1', entryId:'entry-1', reaction:'wow' }), invalid);
  assert.equal(invalid.statusCode, 400);
});

test('unlisted path reactions and comments are allowed by direct path context', async () => {
  const db = new MockDb(seedProgress('unlisted'));
  const reaction = responseRecorder();
  await reactHandler(db)(jsonRequest({ pathId:'path-1', entryId:'entry-1', reaction:'cheer' }), reaction);
  assert.equal(reaction.statusCode, 200);
  assert.equal(reaction.payload.totalReactionCount, 1);

  const comment = responseRecorder();
  await commentHandler(db)(jsonRequest({ pathId:'path-1', entryId:'entry-1', body:'Direct link support' }), comment);
  assert.equal(comment.statusCode, 200);
  assert.equal(comment.payload.visibleCommentCount, 1);
});

test('comment progress creates sanitized visible comments and ignores client identity/counts', async () => {
  const db = new MockDb(seedProgress());
  const res = responseRecorder();
  await commentHandler(db, { uid:'viewer', name:'Verified Viewer', picture:'javascript:bad' })(jsonRequest({
    pathId:'path-1',
    entryId:'entry-1',
    body:'  <b>Nice work</b>  ',
    userId:'attacker',
    visibleCommentCount:999,
  }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.comment.userId, 'viewer');
  assert.equal(res.payload.comment.authorName, 'Verified Viewer');
  assert.equal(res.payload.comment.authorPhotoURL, '');
  assert.equal(res.payload.comment.body, '<b>Nice work</b>');
  assert.equal(res.payload.visibleCommentCount, 1);
  const stored = db.get(`paths/path-1/publicProgress/entry-1/comments/${res.payload.comment.id}`);
  assert.equal(stored.userId, 'viewer');
  assert.equal(db.get('paths/path-1/publicProgress/entry-1').visibleCommentCount, 1);
  assert.equal(db.get('enrollments/private/dayLogs/1').summary, 'private day log');
  assert.equal(db.get('enrollments/private/submissions/proof').note, 'private evidence');
});

test('comment progress rejects empty, overlong, private path, and missing entry requests', async () => {
  for(const body of ['', '   ', 'x'.repeat(501)]){
    const res = responseRecorder();
    await commentHandler(new MockDb(seedProgress()))(jsonRequest({ pathId:'path-1', entryId:'entry-1', body }), res);
    assert.equal(res.statusCode, 400);
  }

  const privateRes = responseRecorder();
  await commentHandler(new MockDb(seedProgress('private')))(jsonRequest({ pathId:'path-1', entryId:'entry-1', body:'Nice' }), privateRes);
  assert.equal(privateRes.statusCode, 403);

  const missing = responseRecorder();
  await commentHandler(new MockDb(seedProgress()))(jsonRequest({ pathId:'path-1', entryId:'missing', body:'Nice' }), missing);
  assert.equal(missing.statusCode, 404);
});

test('comment author and path owner can hide comments idempotently while random users cannot', async () => {
  const db = new MockDb({
    ...seedProgress(),
    'paths/path-1/publicProgress/entry-1':{
      ...seedProgress()['paths/path-1/publicProgress/entry-1'],
      visibleCommentCount:1,
    },
    'paths/path-1/publicProgress/entry-1/comments/c1':{
      id:'c1',
      pathId:'path-1',
      entryId:'entry-1',
      userId:'viewer',
      authorName:'Viewer',
      body:'Visible',
      visibility:'public',
      status:'visible',
    },
  });

  const random = responseRecorder();
  await hideHandler(db, { uid:'random' })(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'c1' }), random);
  assert.equal(random.statusCode, 403);

  const author = responseRecorder();
  await hideHandler(db, { uid:'viewer' })(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'c1' }), author);
  assert.equal(author.statusCode, 200);
  assert.equal(author.payload.visibleCommentCount, 0);
  assert.equal(db.get('paths/path-1/publicProgress/entry-1/comments/c1').status, 'hidden');

  const again = responseRecorder();
  await hideHandler(db, { uid:'viewer' })(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'c1' }), again);
  assert.equal(again.payload.visibleCommentCount, 0);

  db.docs.set('paths/path-1/publicProgress/entry-1/comments/c2', {
    id:'c2', pathId:'path-1', entryId:'entry-1', userId:'other', authorName:'Other',
    body:'Owner can hide', visibility:'public', status:'visible',
  });
  db.docs.set('paths/path-1/publicProgress/entry-1', {
    ...db.get('paths/path-1/publicProgress/entry-1'),
    visibleCommentCount:1,
  });
  const owner = responseRecorder();
  await hideHandler(db, { uid:'owner' })(jsonRequest({ pathId:'path-1', entryId:'entry-1', commentId:'c2' }), owner);
  assert.equal(owner.statusCode, 200);
  assert.equal(db.get('paths/path-1/publicProgress/entry-1/comments/c2').hiddenReason, 'owner_hidden');
});
