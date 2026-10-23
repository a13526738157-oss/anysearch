import assert from 'node:assert/strict';
import test from 'node:test';
import { openDatabase } from '../src/storage/database.ts';
import { getCaptureTarget, registerSource, resourceId, setCapturedText, syncBookmarks } from '../src/storage/bookmarks.ts';
import { authorize, issueGrant, revokeGrant } from '../src/storage/grants.ts';
import { AnySearchService } from '../src/core/service.ts';
import { sha256 } from '../src/core/hash.ts';
import { bookmarks, fixture, sourceId } from './helpers.ts';

test('real SQLite trigram search returns bounded evidence and literal Chinese matches', t => {
  const { service, full } = fixture(t);
  assert.equal(service.search(full.capability, 'orbitfinder').items.length, 1);
  assert.equal(service.search(full.capability, '数字人').items[0]?.title, '数字人资料');
  assert.equal(service.search(full.capability, '数字').items[0]?.title, '数字人资料');
  assert.equal(service.search(full.capability, '').items.length, 3);
  assert.equal(service.search(full.capability, '', 1).items.length, 1);
  assert.deepEqual(service.search(full.capability, 'not actually here').items, []);
  assert.equal(service.search(full.capability, 'orbitfinder').mode, 'keyword');
});

test('metadata grants cannot match, read, or detect body changes', t => {
  const { service, db, metadata, id } = fixture(t);
  assert.deepEqual(service.search(metadata.capability, 'orbitfinder').items, []);
  const before = service.search(metadata.capability, 'Research').items[0]!;
  const read = service.read(metadata.capability, { id, snapshotId: before.snapshotId });
  assert.equal(read.contentLevel, 'metadata');
  assert.ok(!JSON.stringify(read).includes('orbitfinder'));
  setCapturedText(db, id, bookmarks[0]!.url, 'Different secret body.', getCaptureTarget(db, id).revision);
  assert.deepEqual(service.search(metadata.capability, 'Research').items[0], before);
  assert.deepEqual(service.read(metadata.capability, { id, snapshotId: before.snapshotId }), read);
});

test('metadata result ordering is independent of captured body length', t => {
  const { db, service, metadata, id } = fixture(t);
  const before = service.search(metadata.capability, 'example').items;
  setCapturedText(db, id, bookmarks[0]!.url, 'example '.repeat(10000), getCaptureTarget(db, id).revision);
  assert.deepEqual(service.search(metadata.capability, 'example').items, before);
});

test('a grant cannot read another source even when the resource ID is known', t => {
  const { db, service, metadata } = fixture(t);
  registerSource(db, 'other-profile');
  syncBookmarks(db, { sourceId: 'other-profile', sequence: 1, bookmarks: [{ ...bookmarks[0]!, title: 'Different private source' }] });
  const other = issueGrant(db, 'other-profile', 'metadata');
  const result = service.search(other.capability, '').items[0]!;
  assert.deepEqual(service.search(metadata.capability, 'Different private').items, []);
  assert.throws(() => service.read(metadata.capability, { id: result.id, snapshotId: result.snapshotId }), { code: 'NOT_FOUND' });
  assert.notEqual(resourceId(sourceId, '1'), resourceId('other-profile', '1'));
});

test('persistent grant is usable by a reopened connection and revocation is shared immediately', t => {
  const { db, path, full } = fixture(t);
  const second = openDatabase(path);
  try {
    const service = new AnySearchService(second);
    const result = service.search(full.capability, 'Research').items[0]!;
    revokeGrant(db, full.id);
    assert.throws(() => service.search(full.capability, ''), { code: 'ACCESS_DENIED' });
    assert.throws(() => service.read(full.capability, { id: result.id, snapshotId: result.snapshotId }), { code: 'ACCESS_DENIED' });
    registerSource(db, sourceId);
    assert.throws(() => authorize(second, full.capability), { code: 'ACCESS_DENIED' });
  } finally { second.close(); }
  const third = openDatabase(path);
  try { assert.throws(() => authorize(third, full.capability), { code: 'ACCESS_DENIED' }); }
  finally { third.close(); }
});

test('capability is stored only as a hash and invalid tokens fail closed', t => {
  const { db, service, full } = fixture(t);
  const rows = JSON.stringify(db.prepare('SELECT * FROM grants').all());
  assert.ok(!rows.includes(full.capability));
  assert.ok(rows.includes(sha256(full.capability)));
  for (const token of ['', 'codex', 'a'.repeat(80), 'a'.repeat(200)]) {
    assert.throws(() => service.search(token, ''), { code: 'ACCESS_DENIED' });
  }
});

test('source disabling denies all grants and registration does not silently reenable it', t => {
  const { db, service, full } = fixture(t);
  db.prepare('UPDATE sources SET enabled = 0 WHERE id = ?').run(sourceId);
  registerSource(db, sourceId);
  assert.throws(() => service.search(full.capability, ''), { code: 'ACCESS_DENIED' });
  assert.throws(() => issueGrant(db, sourceId, 'metadata'), { code: 'SOURCE_UNAVAILABLE' });
});

test('same-profile additions become visible to the existing grant; removed nodes disappear', t => {
  const { db, service, full, id } = fixture(t);
  const old = service.search(full.capability, 'Research').items[0]!;
  syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [bookmarks[1]!, { ...bookmarks[2]!, nodeId: '4', title: 'New resource' }] });
  assert.equal(service.search(full.capability, 'New resource').items.length, 1);
  assert.equal(service.search(full.capability, '').items.length, 2);
  assert.deepEqual(service.search(full.capability, 'orbitfinder').items, []);
  assert.throws(() => service.read(full.capability, { id, snapshotId: old.snapshotId }), { code: 'NOT_FOUND' });
});

test('URL change drops captured text, changes snapshot, and rejects late capture', t => {
  const { db, service, full, id } = fixture(t);
  const old = service.search(full.capability, 'Research').items[0]!;
  syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [{ ...bookmarks[0]!, url: 'https://example.org/changed' }] });
  const fresh = service.search(full.capability, 'Research').items[0]!;
  assert.equal(fresh.id, old.id);
  assert.equal(fresh.contentLevel, 'metadata');
  assert.notEqual(fresh.snapshotId, old.snapshotId);
  assert.deepEqual(service.search(full.capability, 'orbitfinder').items, []);
  assert.throws(() => service.read(full.capability, { id, snapshotId: old.snapshotId }), { code: 'STALE_SNAPSHOT' });
  assert.throws(() => setCapturedText(db, id, bookmarks[0]!.url, 'late old content', getCaptureTarget(db, id).revision), { code: 'STALE_SOURCE' });
});

test('renaming or moving the bookmark preserves its ID and body but invalidates the old citation', t => {
  const { db, service, full, id } = fixture(t);
  const old = service.search(full.capability, 'Research').items[0]!;
  syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [{ ...bookmarks[0]!, title: 'Moved bookmark', folderPath: ['New folder'] }] });
  const fresh = service.search(full.capability, 'orbitfinder').items[0]!;
  assert.equal(fresh.id, id);
  assert.deepEqual(fresh.folderPath, ['New folder']);
  assert.throws(() => service.read(full.capability, { id, snapshotId: old.snapshotId }), { code: 'STALE_SNAPSHOT' });
});

test('stale sequences and malformed snapshots leave the previous index intact', t => {
  const { db, service, full } = fixture(t);
  const before = service.search(full.capability, '');
  assert.throws(() => syncBookmarks(db, { sourceId, sequence: 1, bookmarks: [] }), { code: 'STALE_SYNC' });
  assert.throws(() => syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [bookmarks[0]!, bookmarks[0]!] }), { code: 'INVALID_SNAPSHOT' });
  assert.throws(() => syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [{ ...bookmarks[0]!, url: 'invalid url' }] }), { code: 'INVALID_SNAPSHOT' });
  assert.deepEqual(service.search(full.capability, ''), before);
});

test('a failure halfway through a sync rolls back source, data, and FTS together', t => {
  const { db, service, full } = fixture(t);
  db.exec(`CREATE TRIGGER simulated_failure BEFORE INSERT ON bookmarks
    WHEN new.node_id = 'fail' BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END;`);
  const before = service.search(full.capability, '');
  assert.throws(() => syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [{ ...bookmarks[0]!, title: 'Should roll back' }, { ...bookmarks[1]!, nodeId: 'fail' }] }));
  assert.deepEqual(service.search(full.capability, ''), before);
  assert.equal(service.search(full.capability, 'orbitfinder').items.length, 1);
  assert.equal(db.prepare('SELECT sequence FROM sources WHERE id = ?').get(sourceId)?.sequence, 1);
});

test('an authoritative empty snapshot removes only its source', t => {
  const { db, service, full } = fixture(t);
  syncBookmarks(db, { sourceId, sequence: 2, bookmarks: [] });
  assert.deepEqual(service.search(full.capability, '').items, []);
});

test('read returns exact line ranges, full content hash, and honest truncation', t => {
  const { service, full, id } = fixture(t);
  const item = service.search(full.capability, 'Research').items[0]!;
  const response = service.read(full.capability, { id, snapshotId: item.snapshotId, lineStart: 2, maxLines: 1 });
  assert.equal(response.text, 'Hidden body keyword: orbitfinder.');
  assert.equal(response.lineStart, 2);
  assert.equal(response.lineEnd, 2);
  assert.equal(response.truncated, true);
  assert.equal(response.untrustedContent, true);
  assert.equal(response.applicability, 'unknown');
  assert.equal(response.sha256, sha256('Synthetic source only.\nHidden body keyword: orbitfinder.\nNot suitable for real-time use.'));
});

test('bounds and query syntax cannot become FTS expressions or SQL', t => {
  const { service, full } = fixture(t);
  for (const query of ['" OR body:*', "'; DROP TABLE bookmarks; --", 'NEAR(foo bar)', '*']) {
    assert.deepEqual(service.search(full.capability, query).items, []);
  }
  assert.throws(() => service.search(full.capability, 'x'.repeat(513)), { code: 'INVALID_QUERY' });
  assert.throws(() => service.search(full.capability, '\0'), { code: 'INVALID_QUERY' });
  assert.throws(() => service.search(full.capability, '', 100), { code: 'INVALID_LIMIT' });
  assert.equal(service.search(full.capability, '').items.length, 3);
});

test('long lines never produce misleading partial line citations', t => {
  const { db, service, full, id } = fixture(t);
  setCapturedText(db, id, bookmarks[0]!.url, 'x'.repeat(12001), getCaptureTarget(db, id).revision);
  const item = service.search(full.capability, 'Research').items[0]!;
  assert.throws(() => service.read(full.capability, { id, snapshotId: item.snapshotId }), { code: 'LINE_TOO_LONG' });
});
