import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CURRENT_SCHEMA_VERSIONS,
  currentSchemaVersion,
  isLegacySchema,
  normalizeDocumentSchemaVersion,
  normalizeSchemaVersion,
  schemaLabel,
  withSchemaVersion,
} from '../src/schema-versioning.js';

test('schema module exposes current versions and safe helpers', () => {
  assert.equal(currentSchemaVersion('path'), 1);
  assert.equal(currentSchemaVersion('dayLog'), 2);
  assert.equal(currentSchemaVersion('publicProgress'), 2);
  assert.equal(currentSchemaVersion('moderationReport'), 1);
  assert.equal(currentSchemaVersion('rateLimit'), 1);
  assert.equal(currentSchemaVersion('unknown'), 0);
  assert.ok(Object.keys(CURRENT_SCHEMA_VERSIONS).includes('participantStats'));

  assert.equal(normalizeSchemaVersion(undefined), 0);
  assert.equal(normalizeSchemaVersion('2'), 2);
  assert.equal(normalizeSchemaVersion(-1), 0);
  assert.equal(normalizeSchemaVersion('bad', 7), 7);
  assert.equal(normalizeDocumentSchemaVersion('path', {}), 0);
  assert.equal(normalizeDocumentSchemaVersion('path', { schemaVersion:'bad' }), 0);
  assert.equal(normalizeDocumentSchemaVersion('path', { schemaVersion:4 }), 4);
  assert.deepEqual(withSchemaVersion('path', { title:'Path' }), { title:'Path', schemaVersion:1 });
  assert.equal(withSchemaVersion('moderationReport', { status:'open' }).schemaVersion, 1);
  assert.equal(withSchemaVersion('path', { schemaVersion:5 }).schemaVersion, 5);
  assert.equal(withSchemaVersion('unknown', {}).schemaVersion, 0);
  assert.equal(isLegacySchema({}), true);
  assert.equal(isLegacySchema({ schemaVersion:1 }), false);
  assert.equal(schemaLabel('dayLog', 0), 'dayLog@legacy');
});
