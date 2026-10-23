import assert from 'node:assert/strict';
import type { SQLInputValue } from 'node:sqlite';
import { test, type TestContext } from 'node:test';
import type { BookmarkInput, SearchResult } from '../src/core/contracts.ts';
import { sha256 } from '../src/core/hash.ts';
import { AnySearchService } from '../src/core/service.ts';
import { getCaptureTarget, registerSource, resourceId, setCapturedText, syncBookmarks } from '../src/storage/bookmarks.ts';
import { openDatabase } from '../src/storage/database.ts';
import { issueGrant, revokeGrant } from '../src/storage/grants.ts';

const sourceId = 'synthetic-evidence-location';
const bookmark: BookmarkInput = {
  nodeId: '1', title: 'Catalog reference', url: 'https://example.invalid/evidence', folderPath: ['Synthetic references'],
};

function fixture(t: TestContext, body = '', bookmarks: BookmarkInput[] = [bookmark]) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  registerSource(db, sourceId);
  syncBookmarks(db, { sourceId, sequence: 1, bookmarks });
  const id = resourceId(sourceId, bookmark.nodeId);
  function capture(text: string) {
    if (!text) {
      dataClearBody();
      return;
    }
    const target = getCaptureTarget(db, id);
    setCapturedText(db, id, target.url, text, target.revision);
  }
  function dataClearBody() {
    db.prepare('UPDATE bookmarks SET body = ? WHERE id = ?').run('', id);
    db.prepare('UPDATE bookmark_fts SET body = ? WHERE id = ?').run('', id);
  }
  if (body) capture(body);
  return { db, id, capture, service: new AnySearchService(db),
    full: issueGrant(db, sourceId, 'public_text'), metadata: issueGrant(db, sourceId, 'metadata') };
}

function matchAt(item: SearchResult | undefined, lineStart: number, lineEnd = lineStart) {
  assert.ok(item);
  assert.deepEqual(item.match, { lineStart, lineEnd });
  return item;
}

test('EA-L01: a stored body hit beyond the first excerpt guides read without search returning body or fetching', t => {
  const body = Array.from({ length: 65 }, (_, index) => index === 53 ? 'Evidence: violet-boundary-731.' : `Filler line ${index + 1}.`).join('\n');
  const data = fixture(t, body);
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', () => { fetches += 1; throw new Error('Network is forbidden in this fixture.'); });
  const result = data.service.search(data.full.capability, 'violet-boundary-731');
  assert.equal(result.items.length, 1);
  const item = matchAt(result.items[0], 54);
  assert.deepEqual(Object.keys(item).sort(), ['contentLevel', 'folderPath', 'id', 'match', 'snapshotId', 'sourceId', 'title', 'url']);
  assert.equal(JSON.stringify(result).includes('Evidence: violet-boundary-731.'), false);
  assert.equal(data.service.read(data.full.capability, item).text.includes('violet-boundary-731'), false);
  const read = data.service.read(data.full.capability, { ...item, lineStart: item.match!.lineStart, maxLines: 1 });
  assert.equal(read.text, 'Evidence: violet-boundary-731.');
  assert.equal(read.lineStart, 54);
  assert.equal(read.lineEnd, 54);
  assert.equal(read.snapshotId, item.snapshotId);
  assert.equal(read.sha256, sha256(body));
  assert.equal(read.url, bookmark.url);
  assert.equal(read.untrustedContent, true);
  assert.equal(read.applicability, 'unknown');
  assert.equal(fetches, 0);
});

test('EA-L02: repeated literal hits locate only the first original occurrence', t => {
  const data = fixture(t, 'Introduction.\nFirst opal-marker hit.\nMiddle.\nSecond opal-marker hit.');
  const item = matchAt(data.service.search(data.full.capability, 'opal-marker').items[0], 2);
  assert.equal(data.service.read(data.full.capability, { ...item, lineStart: 2, maxLines: 1 }).text, 'First opal-marker hit.');
});

test('EA-L03: all read separators, blanks and Unicode prefixes retain original line numbers', t => {
  const variants = [
    'Header.\n\nIndigo-target.\nFooter.',
    'Header.\r\n\r\nIndigo-target.\r\nFooter.',
    'Header.\r\rIndigo-target.\rFooter.',
    'Header.\r\n\rIndigo-target.\nFooter.',
    `${'\u0130'.repeat(40)}\r\n\rIndigo-target.\nFooter.`,
    '\ud83c\udf08 prefix\n\nIndigo-target.\nFooter.',
  ];
  for (const body of variants) {
    const data = fixture(t, body);
    const item = matchAt(data.service.search(data.full.capability, 'Indigo-target').items[0], 3);
    const read = data.service.read(data.full.capability, { ...item, lineStart: 3, maxLines: 1 });
    assert.equal(read.text, 'Indigo-target.');
    assert.equal(read.lineEnd, 3);
    assert.equal(read.sha256, sha256(body));
  }
});

test('EA-L04: complete literal queries across LF, CRLF and CR produce inclusive original ranges', t => {
  for (const separator of ['\n', '\r\n', '\r']) {
    const data = fixture(t, `Header.${separator}Start amber${separator}finish marker.${separator}Footer.`);
    const item = matchAt(data.service.search(data.full.capability, `amber${separator}finish`).items[0], 2, 3);
    const read = data.service.read(data.full.capability, { ...item, lineStart: 2, maxLines: 2 });
    assert.equal(read.text, 'Start amber\nfinish marker.');
    assert.equal(read.lineStart, 2);
    assert.equal(read.lineEnd, 3);
  }
});

test('EA-L05: whitespace trimming and ASCII case-insensitivity do not alter the cited source', t => {
  const data = fixture(t, 'Header.\nMixed Violet-Target remains original.');
  const item = matchAt(data.service.search(data.full.capability, '  vIoLeT-tArGeT\t ').items[0], 2);
  assert.equal(data.service.read(data.full.capability, { ...item, lineStart: 2, maxLines: 1 }).text, 'Mixed Violet-Target remains original.');
});

test('EA-L06: short queries and literal punctuation locate source text, not query operators', t => {
  for (const query of ['x', 'xy', 'a"b', '100%', 'C:\\Temp', '_', '*']) {
    const data = fixture(t, `Header.\n\nLiteral ${query} end.`);
    matchAt(data.service.search(data.full.capability, query).items[0], 3);
  }
});

test('EA-L07: only a nonempty query actually present in a captured body may have match', t => {
  const captured = fixture(t, 'Unrelated captured body.');
  const uncaptured = fixture(t);
  for (const [data, query] of [[captured, 'Catalog'], [uncaptured, 'Catalog'], [captured, ''], [captured, '   ']] as const) {
    const item = data.service.search(data.full.capability, query).items[0];
    assert.ok(item);
    assert.equal(Object.hasOwn(item, 'match'), false);
  }
});

test('EA-L08: metadata matches cannot fabricate a complete body match from separated words', t => {
  for (const body of ['alpha unrelated beta', 'alpha\nbeta', 'alpha  beta']) {
    const data = fixture(t, body, [{ ...bookmark, title: 'alpha beta reference' }]);
    const item = data.service.search(data.full.capability, 'alpha beta').items[0];
    assert.ok(item);
    assert.equal(item.contentLevel, 'public_text');
    assert.equal(Object.hasOwn(item, 'match'), false);
  }
});

test('EA-L09: metadata responses, ordering, snapshots and reads are invariant under all body changes', t => {
  const data = fixture(t, '', [bookmark,
    { ...bookmark, nodeId: '2', title: 'Catalog second', url: 'https://example.invalid/second' }]);
  const queries = ['', 'Catalog', 'example', 'hidden-needle', 'x'];
  const before = queries.map(query => data.service.search(data.metadata.capability, query));
  const reference = before[1]!.items.find(item => item.id === data.id)!;
  const read = data.service.read(data.metadata.capability, reference);
  for (const body of ['hidden-needle\nCatalog x', 'x '.repeat(14000) + '\nhidden-needle', 'No former marker.', '']) {
    data.capture(body);
    assert.deepEqual(queries.map(query => data.service.search(data.metadata.capability, query)), before);
    assert.deepEqual(data.service.read(data.metadata.capability, reference), read);
    for (const response of before) for (const item of response.items) assert.equal(Object.hasOwn(item, 'match'), false);
  }
});

test('EA-L10: body locations do not cross sources or revive stale citation snapshots', t => {
  const data = fixture(t, 'Header.\nOwn sapphire-token.');
  registerSource(data.db, 'synthetic-foreign-source');
  syncBookmarks(data.db, { sourceId: 'synthetic-foreign-source', sequence: 1, bookmarks: [bookmark] });
  const foreign = issueGrant(data.db, 'synthetic-foreign-source', 'public_text');
  const foreignId = resourceId('synthetic-foreign-source', '1');
  const target = getCaptureTarget(data.db, foreignId);
  setCapturedText(data.db, foreignId, target.url, 'Foreign sapphire-token.', target.revision);
  const other = matchAt(data.service.search(foreign.capability, 'sapphire-token').items[0], 1);
  const own = matchAt(data.service.search(data.full.capability, 'sapphire-token').items[0], 2);
  assert.deepEqual(data.service.search(data.full.capability, 'sapphire-token').items.map(item => item.id), [data.id]);
  assert.throws(() => data.service.read(data.full.capability, other), { code: 'NOT_FOUND' });
  data.capture('Changed.\n\n\n\nOwn sapphire-token.');
  assert.throws(() => data.service.read(data.full.capability, own), { code: 'STALE_SNAPSHOT' });
  matchAt(data.service.search(data.full.capability, 'sapphire-token').items[0], 5);
});

test('EA-L11: revocation after SQL search rows are obtained denies the output boundary', t => {
  const data = fixture(t, 'Hidden body ruby-token.');
  const prepare = data.db.prepare.bind(data.db);
  let intercepted = false;
  t.mock.method(data.db, 'prepare', (sql: string) => {
    const statement = prepare(sql);
    if (sql.includes('FROM bookmark_fts')) {
      const all = statement.all.bind(statement);
      t.mock.method(statement, 'all', (...parameters: SQLInputValue[]) => {
        const rows = all(...parameters);
        intercepted = true;
        revokeGrant(data.db, data.full.id);
        return rows;
      });
    }
    return statement;
  });
  assert.throws(() => data.service.search(data.full.capability, 'ruby-token'), { code: 'ACCESS_DENIED' });
  assert.equal(intercepted, true);
});

test('EA-L12: revocation after a read row is obtained denies its text and location output', t => {
  const data = fixture(t, 'Hidden body ruby-token.');
  const item = data.service.search(data.full.capability, 'ruby-token').items[0]!;
  const prepare = data.db.prepare.bind(data.db);
  let intercepted = false;
  t.mock.method(data.db, 'prepare', (sql: string) => {
    const statement = prepare(sql);
    const get = statement.get.bind(statement);
    t.mock.method(statement, 'get', (...parameters: SQLInputValue[]) => {
      const row = get(...parameters);
      if (parameters.length === 2 && parameters[0] === item.id && parameters[1] === sourceId
        && row?.id === item.id && row.source_id === sourceId) {
        intercepted = true;
        revokeGrant(data.db, data.full.id);
      }
      return row;
    });
    return statement;
  });
  assert.throws(() => data.service.read(data.full.capability, item), { code: 'ACCESS_DENIED' });
  assert.equal(intercepted, true);
});
