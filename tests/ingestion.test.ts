import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { AnySearchService } from '../src/core/service.ts';
import { getCaptureTarget, registerSource, resourceId, setCapturedText, syncBookmarks } from '../src/storage/bookmarks.ts';
import { openDatabase } from '../src/storage/database.ts';
import { issueGrant } from '../src/storage/grants.ts';

const sourceId = 'synthetic-ingestion';
const bookmark = { nodeId: '1', title: 'Capture fixture', url: 'https://example.com/first', folderPath: [] };
const id = resourceId(sourceId, bookmark.nodeId);

function fixture(t: TestContext) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  registerSource(db, sourceId);
  syncBookmarks(db, { sourceId, sequence: 1, bookmarks: [bookmark] });
  return db;
}

test('rejects a delayed capture after URL changes away and back', (t) => {
  const db = fixture(t);
  const original = getCaptureTarget(db, id);
  syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [{ ...bookmark, url: 'https://example.com/second' }] });
  const changed = getCaptureTarget(db, id);
  syncBookmarks(db, { sourceId, sequence: 3, bookmarks: [bookmark] });
  const current = getCaptureTarget(db, id);
  assert.notEqual(original.revision, changed.revision);
  assert.notEqual(original.revision, current.revision);
  assert.notEqual(changed.revision, current.revision);
  assert.throws(() => setCapturedText(db, id, original.url, 'stale-marker', original.revision), { code: 'STALE_SOURCE' });
  const service = new AnySearchService(db);
  const grant = issueGrant(db, sourceId, 'public_text');
  assert.deepEqual(service.search(grant.capability, 'stale-marker').items, []);
  setCapturedText(db, id, current.url, 'current-marker', current.revision);
  assert.equal(service.search(grant.capability, 'current-marker').items.length, 1);
});

test('rejects a delayed capture after deletion and same-ID URL recreation', (t) => {
  const db = fixture(t);
  const original = getCaptureTarget(db, id);
  syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [] });
  assert.throws(() => getCaptureTarget(db, id), { code: 'STALE_SOURCE' });
  assert.throws(() => setCapturedText(db, id, original.url, 'deleted-marker', original.revision), { code: 'STALE_SOURCE' });
  syncBookmarks(db, { sourceId, sequence: 3, bookmarks: [bookmark] });
  assert.notEqual(getCaptureTarget(db, id).revision, original.revision);
  assert.throws(() => setCapturedText(db, id, original.url, 'recreated-marker', original.revision), { code: 'STALE_SOURCE' });
  assert.equal(db.prepare('SELECT body FROM bookmarks WHERE id = ?').get(id)?.body, '');
});

test('same-URL metadata synchronization preserves the capture revision and body', (t) => {
  const db = fixture(t);
  const target = getCaptureTarget(db, id);
  setCapturedText(db, id, target.url, 'prior-marker', target.revision);
  syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [{ ...bookmark, title: 'Renamed fixture', folderPath: ['Moved'] }] });
  assert.deepEqual(getCaptureTarget(db, id), target);
  assert.equal(db.prepare('SELECT body FROM bookmarks WHERE id = ?').get(id)?.body, 'prior-marker');
  setCapturedText(db, id, target.url, 'fresh-marker', target.revision);
  assert.equal(db.prepare('SELECT body FROM bookmarks WHERE id = ?').get(id)?.body, 'fresh-marker');
});

test('wrong revisions and missing revisions fail closed without replacing existing content', (t) => {
  const db = fixture(t);
  const target = getCaptureTarget(db, id);
  setCapturedText(db, id, target.url, 'retained-marker', target.revision);
  for (const revision of ['', 'incorrect', undefined as unknown as string]) {
    assert.throws(() => setCapturedText(db, id, target.url, 'rejected-marker', revision), { code: 'STALE_SOURCE' });
  }
  assert.equal(db.prepare('SELECT body FROM bookmarks WHERE id = ?').get(id)?.body, 'retained-marker');
});

test('disabling a source prevents further capture targets and delayed body commits', t => {
  const db = fixture(t);
  const target = getCaptureTarget(db, id);
  db.prepare('UPDATE sources SET enabled = 0 WHERE id = ?').run(sourceId);
  assert.throws(() => getCaptureTarget(db, id), { code: 'STALE_SOURCE' });
  assert.throws(() => setCapturedText(db, id, target.url, 'late disabled content', target.revision), { code: 'STALE_SOURCE' });
  assert.equal(db.prepare('SELECT body FROM bookmarks WHERE id = ?').get(id)?.body, '');
});

function databasePath(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'anysearch-ingestion-'));
  const path = join(directory, 'index.sqlite');
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  return path;
}

test('initialized database reopens read-only without rotating capture revisions', (t) => {
  const path = databasePath(t);
  const writer = openDatabase(path);
  registerSource(writer, sourceId);
  syncBookmarks(writer, { sourceId, sequence: 1, bookmarks: [bookmark] });
  const target = getCaptureTarget(writer, id);
  setCapturedText(writer, id, target.url, 'persisted-marker', target.revision);
  writer.close();
  const before = readFileSync(path);
  const reopened = openDatabase(path, { existingOnly: true });
  try {
    assert.deepEqual(getCaptureTarget(reopened, id), target);
    assert.equal(reopened.prepare('SELECT body FROM bookmarks WHERE id = ?').get(id)?.body, 'persisted-marker');
    assert.throws(() => registerSource(reopened, 'cannot-write'), /readonly/);
  } finally {
    reopened.close();
  }
  assert.deepEqual(readFileSync(path), before);
});

test('existing-only open does not create a missing database', (t) => {
  const path = databasePath(t);
  assert.throws(() => openDatabase(path, { existingOnly: true }));
  assert.equal(existsSync(path), false);
});

test('an unmarked unrelated database is rejected without modification in both modes', (t) => {
  const path = databasePath(t);
  const other = new DatabaseSync(path);
  other.exec("CREATE TABLE important (value TEXT); INSERT INTO important VALUES ('keep this original');");
  other.close();
  const before = readFileSync(path);
  for (const existingOnly of [false, true]) {
    assert.throws(() => openDatabase(path, { existingOnly }), { code: 'INVALID_DATABASE' });
    assert.deepEqual(readFileSync(path), before);
  }
});

test('an uninitialized empty database cannot be initialized by existing-only consumers', (t) => {
  const path = databasePath(t);
  new DatabaseSync(path).close();
  const before = readFileSync(path);
  assert.throws(() => openDatabase(path, { existingOnly: true }), { code: 'INVALID_DATABASE' });
  assert.deepEqual(readFileSync(path), before);
});

test('unsupported application identity or schema version is rejected without modification', (t) => {
  const path = databasePath(t);
  const original = openDatabase(path);
  original.exec('PRAGMA user_version = 999');
  original.close();
  const future = readFileSync(path);
  for (const existingOnly of [false, true]) {
    assert.throws(() => openDatabase(path, { existingOnly }), { code: 'INVALID_DATABASE' });
    assert.deepEqual(readFileSync(path), future);
  }
  const wrongIdentity = new DatabaseSync(path);
  wrongIdentity.exec('PRAGMA user_version = 1; PRAGMA application_id = 1234;');
  wrongIdentity.close();
  const foreign = readFileSync(path);
  assert.throws(() => openDatabase(path, { existingOnly: true }), { code: 'INVALID_DATABASE' });
  assert.deepEqual(readFileSync(path), foreign);
});
