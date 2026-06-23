import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

import { apiError } from '../api/_lib/errors.js';
import { enrollmentIdFor } from '../server/api-handlers/join-path.js';
import { createPublishProgressHandler } from '../server/api-handlers/publish-progress.js';
import { publicProgressEntryId, createSanitizedPublicProgressEntryFromMobileDayLog } from '../src/public-progress.js';
import { resolvePublishProgressSource, canPublishMobilePath } from '../server/public-progress-source-resolver.js';
import { mobileDayLogId } from '../src/mobile-day-log-ids.js';
import { mobileDayLogId as mobileIdClient } from '../apps/mobile/src/core/mobileDaySync.js';
import {
  createMobilePublicProgressRepository, publishErrorMessage,
} from '../apps/mobile/src/services/mobilePublicProgressRepository.js';

const root = new URL('../', import.meta.url);
function read(rel) { return readFileSync(new URL(rel, root), 'utf8'); }

/* ── Minimal Firestore mock (path-keyed) ── */
function deepMerge(target, patch) {
  Object.entries(patch || {}).forEach(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      target[k] = deepMerge({ ...(target[k] || {}) }, v);
    } else target[k] = v;
  });
  return target;
}
class Ref { constructor(db, path) { this.db = db; this.path = path; } collection(n) { return new Collection(this.db, `${this.path}/${n}`); } }
class Collection {
  constructor(db, path) { this.db = db; this.path = path; }
  doc(id) { return new Ref(this.db, `${this.path}/${id}`); }
  async get() {
    const prefix = `${this.path}/`; const docs = [];
    for (const [p, data] of this.db.docs.entries()) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      if (!rest || rest.includes('/')) continue;
      docs.push({ id: rest, data: () => structuredClone(data) });
    }
    return { docs };
  }
}
class Snapshot { constructor(d) { this._d = d; this.exists = d != null; } data() { return this._d; } }
class MockDb {
  constructor(seed = {}) { this.docs = new Map(Object.entries(seed).map(([k, v]) => [k, structuredClone(v)])); }
  collection(n) { return new Collection(this, n); }
  async runTransaction(fn) {
    const tx = {
      get: async ref => new Snapshot(this.docs.has(ref.path) ? structuredClone(this.docs.get(ref.path)) : null),
      set: (ref, data, opts = {}) => {
        const existing = this.docs.has(ref.path) ? structuredClone(this.docs.get(ref.path)) : {};
        this.docs.set(ref.path, opts.merge ? deepMerge(existing, structuredClone(data)) : structuredClone(data));
      },
      delete: ref => { this.docs.delete(ref.path); },
    };
    return fn(tx);
  }
  get(path) { return this.docs.get(path); }
}
function recorder() {
  return {
    statusCode: 200, headers: {}, payload: null,
    setHeader(n, v) { this.headers[n] = v; }, status(c) { this.statusCode = c; return this; },
    json(v) { this.payload = v; return v; },
  };
}
function req(body, authorization = 'Bearer valid') {
  return { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body };
}
function authAs(uid) {
  return async r => {
    if (!r.headers.authorization) throw apiError('unauthorized', 'Authentication is required.', 401);
    return { uid, email: `${uid}@x.z`, name: 'Owner', token: { name: 'Owner', picture: 'https://x/a.png' } };
  };
}
function handlerFor(db, uid = 'owner') {
  return createPublishProgressHandler({
    db, authenticate: authAs(uid), rateLimit: async () => {},
    now: () => new Date('2026-06-23T12:00:00.000Z'), logger: { info() {}, warn() {} },
  });
}

// A mobile day log payload as written by Phase 6.13 (private proof/reflection).
function mobileDayLog({ uid = 'owner', pathId = 'owned-path', dayNumber = 1 } = {}) {
  return {
    id: mobileDayLogId({ pathId, uid, dayNumber }),
    uid, pathId, dayNumber,
    status: 'completed',
    completionScore: 86, completionTier: 'strong',
    totalTaskCount: 4, completedTaskCount: 4, completedTaskIds: ['a', 'b', 'c', 'd'],
    proofSubmittedCount: 1,
    proof: [{ taskId: 'c', type: 'link', url: 'https://private.example.com/secret-proof', privacy: 'private', submitted: true }],
    reflections: { c: 'my very private reflection text' },
    source: 'mobile', schemaVersion: 1,
  };
}
function seedMobileOwned() {
  const uid = 'owner';
  const log = mobileDayLog({ uid });
  return {
    'paths/owned-path': { id: 'owned-path', ownerId: 'owner', visibility: 'public', stats: { publicProgressCount: 0 } },
    [`users/${uid}/mobileDayLogs/${log.id}`]: log,
  };
}

/* ── 1. Shared id parity ── */

test('Phase 6.14 server and mobile mobileDayLogId are identical', () => {
  for (const c of [
    { pathId: 'p', uid: 'u', dayNumber: 1 },
    { pathId: 'a b/c', uid: 'x@y', dayNumber: 3 },
    { pathId: 'owned-path', uid: 'owner', dayNumber: 12 },
  ]) {
    assert.equal(mobileDayLogId(c), mobileIdClient(c));
  }
});

/* ── 2. Resolver behavior ── */

async function resolve(db, { uid = 'owner', pathId = 'owned-path', dayNumber = 1 } = {}) {
  return db.runTransaction(async transaction => {
    const pathRef = db.collection('paths').doc(pathId);
    const pathSnap = await transaction.get(pathRef);
    const path = pathSnap.exists ? pathSnap.data() : null;
    return resolvePublishProgressSource({
      firestore: db, transaction, path, pathId,
      auth: { uid }, dayNumber, enrollmentIdFor,
    });
  });
}

test('Phase 6.14 resolver prefers a valid web enrollment day log', async () => {
  const enrollmentId = enrollmentIdFor('owned-path', 'owner');
  const db = new MockDb({
    'paths/owned-path': { id: 'owned-path', ownerId: 'owner', visibility: 'public' },
    [`enrollments/${enrollmentId}`]: { id: enrollmentId, pathId: 'owned-path', userId: 'owner' },
    [`enrollments/${enrollmentId}/dayLogs/1`]: { dayNumber: 1, status: 'completed', completionScore: 70, completionTier: 'passed' },
    ...seedMobileOwned(),
  });
  const r = await resolve(db);
  assert.equal(r.source, 'web_enrollment_day_log');
});

test('Phase 6.14 resolver falls back to mobile when no enrollment exists', async () => {
  const db = new MockDb(seedMobileOwned());
  const r = await resolve(db);
  assert.equal(r.source, 'mobile_private_day_log');
  assert.equal(r.dayLog.completionTier, 'strong');
});

test('Phase 6.14 resolver rejects missing/foreign/mismatched/in-progress mobile logs and private paths', async () => {
  await assert.rejects(() => resolve(new MockDb({ 'paths/owned-path': { id: 'owned-path', ownerId: 'owner', visibility: 'public' } })),
    e => e.code === 'day_log_not_found');

  // another uid's path (not owner) -> forbidden
  const foreign = new MockDb({ ...seedMobileOwned(), 'paths/owned-path': { id: 'owned-path', ownerId: 'someone-else', visibility: 'public' } });
  await assert.rejects(() => resolve(foreign), e => e.code === 'forbidden');

  // wrong path on the log
  const wrongPath = new MockDb({
    'paths/owned-path': { id: 'owned-path', ownerId: 'owner', visibility: 'public' },
    [`users/owner/mobileDayLogs/${mobileDayLogId({ pathId: 'owned-path', uid: 'owner', dayNumber: 1 })}`]: mobileDayLog({ pathId: 'other-path' }),
  });
  await assert.rejects(() => resolve(wrongPath), e => e.code === 'invalid_day_log');

  // in-progress
  const inProgress = mobileDayLog(); inProgress.status = 'in_progress';
  const ip = new MockDb({
    'paths/owned-path': { id: 'owned-path', ownerId: 'owner', visibility: 'public' },
    [`users/owner/mobileDayLogs/${inProgress.id}`]: inProgress,
  });
  await assert.rejects(() => resolve(ip), e => e.code === 'day_not_completed');
});

test('Phase 6.14 canPublishMobilePath honors owner/creator fields only', () => {
  assert.equal(canPublishMobilePath({ ownerId: 'u' }, 'u'), true);
  assert.equal(canPublishMobilePath({ creatorId: 'u' }, 'u'), true);
  assert.equal(canPublishMobilePath({ creatorUid: 'u' }, 'u'), true);
  assert.equal(canPublishMobilePath({ ownerId: 'other' }, 'u'), false);
});

/* ── 3. Server publish API (mobile source) ── */

test('Phase 6.14 mobile day log publishes a sanitized public entry', async () => {
  const db = new MockDb(seedMobileOwned());
  const res = recorder();
  await handlerFor(db)(req({ pathId: 'owned-path', dayNumber: 1, publicCaption: 'shared' }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.publicProgressCount, 1);

  const entryPath = `paths/owned-path/publicProgress/${publicProgressEntryId('owner', 1)}`;
  const entry = db.get(entryPath);
  assert.ok(entry);
  assert.equal(entry.source, 'mobile-day-log');
  assert.equal(entry.evidenceCount, 1);
  assert.equal(entry.completionScore, 86);
  assert.equal(entry.completionTier, 'strong');
  assert.equal(entry.publicCaption, 'shared');
  // Sanitization: no private proof/reflection/raw URL leaks.
  const json = JSON.stringify(entry);
  assert.doesNotMatch(json, /private\.example\.com|secret-proof|very private reflection/);
  assert.doesNotMatch(json, /verified/i);
});

test('Phase 6.14 mobile publish is idempotent (no double count)', async () => {
  const db = new MockDb(seedMobileOwned());
  const h = handlerFor(db);
  const first = recorder();
  await h(req({ pathId: 'owned-path', dayNumber: 1, publicCaption: 'one' }), first);
  const second = recorder();
  await h(req({ pathId: 'owned-path', dayNumber: 1, publicCaption: 'two' }), second);
  assert.equal(second.payload.alreadyPublished, true);
  assert.equal(second.payload.publicProgressCount, 1);
  assert.equal(second.payload.proofSubmissionCount, first.payload.proofSubmissionCount);
  assert.equal(db.get('paths/owned-path').stats.publicProgressCount, 1);
  assert.equal(db.get(`paths/owned-path/publicProgress/${publicProgressEntryId('owner', 1)}`).publicCaption, 'two');
});

test('Phase 6.14 mobile publish on a private path is rejected', async () => {
  const seed = seedMobileOwned();
  seed['paths/owned-path'] = { id: 'owned-path', ownerId: 'owner', visibility: 'private', stats: { publicProgressCount: 0 } };
  const db = new MockDb(seed);
  const res = recorder();
  await handlerFor(db)(req({ pathId: 'owned-path', dayNumber: 1 }), res);
  assert.equal(res.payload.code, 'path_not_publishable');
});

test('Phase 6.14 cannot publish a path you do not own without enrollment', async () => {
  const seed = seedMobileOwned();
  seed['paths/owned-path'] = { id: 'owned-path', ownerId: 'someone-else', visibility: 'public', stats: { publicProgressCount: 0 } };
  const db = new MockDb(seed);
  const res = recorder();
  await handlerFor(db)(req({ pathId: 'owned-path', dayNumber: 1 }), res);
  assert.equal(res.payload.code, 'forbidden');
});

/* ── 4. Sanitized entry builder ── */

test('Phase 6.14 mobile entry builder excludes private content and never says verified', () => {
  const entry = createSanitizedPublicProgressEntryFromMobileDayLog({
    pathId: 'p', user: { uid: 'u', name: 'U' }, dayNumber: 2, mobileDayLog: mobileDayLog({ dayNumber: 2 }), caption: 'hi',
  });
  assert.equal(entry.source, 'mobile-day-log');
  assert.equal(entry.evidenceCount, 1);
  assert.deepEqual(entry.taskSummary, []);
  const json = JSON.stringify(entry);
  assert.doesNotMatch(json, /private\.example\.com|secret-proof|very private reflection|reflection/i);
  assert.doesNotMatch(json, /verified/i);
});

/* ── 5. Mobile client request shape + error mapping ── */

test('Phase 6.14 mobile publish repo sends only pathId/dayNumber/publicCaption', async () => {
  const calls = [];
  const apiClient = { post: async (endpoint, body) => { calls.push({ endpoint, body }); return { ok: true }; } };
  const repo = createMobilePublicProgressRepository({ apiClient });
  await repo.publish({ dayLog: mobileDayLog(), publicCaption: 'done' });
  assert.equal(calls[0].endpoint, '/api/publish-progress');
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['dayNumber', 'pathId', 'publicCaption']);
  assert.doesNotMatch(JSON.stringify(calls[0].body), /proof|reflection|secret/i);
});

test('Phase 6.14 mobile publish repo maps server error codes to safe copy', () => {
  assert.match(publishErrorMessage({ status: 401 }), /sign in/i);
  assert.match(publishErrorMessage({ code: 'day_log_not_found' }), /sync this day/i);
  assert.match(publishErrorMessage({ code: 'day_not_completed' }), /not complete/i);
  assert.match(publishErrorMessage({ code: 'path_not_publishable' }), /cannot be published/i);
  assert.doesNotMatch(publishErrorMessage({ code: 'weird_internal' }), /weird_internal/);
});

test('Phase 6.14 mobile publish repo still uses the existing endpoint constant', () => {
  const src = read('apps/mobile/src/services/mobilePublicProgressRepository.js');
  assert.match(src, /API_ENDPOINTS\.PUBLISH_PROGRESS/);
  assert.doesNotMatch(src, /\/api\/[a-z-]*mobile/i);
});

/* ── 6. No forbidden behavior / no new routes ── */

test('Phase 6.14 Vercel API function count unchanged (ai/community/voice)', () => {
  const dir = new URL('../api/', import.meta.url);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter(e => e.isFile() && e.name.endsWith('.js') && !e.name.startsWith('_'))
    .map(e => e.name).sort();
  assert.deepEqual(files, ['ai.js', 'community.js', 'voice.js']);
  assert.ok(files.length < 12);
});

test('Phase 6.14 no media/storage/notification code in the new server modules', () => {
  for (const f of ['server/public-progress-source-resolver.js', 'server/mobile-day-log-source.js', 'server/api-handlers/publish-progress.js']) {
    const src = read(f);
    assert.doesNotMatch(src, /firebase\/storage|getStorage|uploadBytes|expo-camera|expo-image-picker|expo-notifications/i, f);
  }
});

/* ── 7. Firestore rules unchanged / still strict ── */

test('Phase 6.14 Firestore rules remain strict (relied upon, unchanged)', () => {
  const rules = read('firestore.rules');
  assert.match(rules, /match \/users\/\{uid\}\/\{document=\*\*\}/);
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /match \/publicProgress\/\{entryId\}[\s\S]*?allow write: if false/);
  assert.match(rules, /match \/participantStats\/\{uid\}\s*\{\s*allow read, write: if false/);
});

/* ── 8. Docs ── */

test('Phase 6.14 documentation exists and references the bridge', () => {
  assert.ok(existsSync(new URL('../docs/mobile-public-progress-server-bridge.md', import.meta.url)));
  assert.match(read('README.md'), /Phase 6\.14/);
  const doc = read('docs/mobile-public-progress-server-bridge.md');
  assert.match(doc, /web_enrollment_day_log|web enrollment/i);
  assert.match(doc, /mobile_private_day_log|mobile private/i);
  assert.match(doc, /idempoten/i);
});
