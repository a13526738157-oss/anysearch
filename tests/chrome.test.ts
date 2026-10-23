import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHROME_TREE_LIMITS, normalizeBookmarkTree } from '../src/adapters/chrome/normalize.ts';
import { BOOKMARK_LIMITS } from '../src/core/limits.ts';

interface SyntheticNode {
  id: string;
  title: string;
  parentId?: string;
  index?: number;
  url?: string;
  children?: SyntheticNode[];
}

function leaf(id = '2', url = 'https://example.com/page'): SyntheticNode {
  return { id, title: 'Reference', parentId: '1', url };
}

function tree(bookmarks: SyntheticNode[] = [leaf()]): SyntheticNode[] {
  return [{ id: 'root', title: '', children: [{ id: '1', parentId: 'root', title: 'Bookmarks bar', children: bookmarks }] }];
}

test('normalizes a complete API tree with only bookmark contract fields', () => {
  const input = tree();
  Object.assign(input[0]!, { dateLastUsed: 123, unusedAccountField: 'not collected' });
  Object.assign(input[0]!.children![0]!.children![0]!, { dateLastUsed: 456, dateAdded: 789 });
  const before = structuredClone(input);
  const result = normalizeBookmarkTree(input, 'chrome:instance-1', 3);
  assert.deepEqual(result, {
    sourceId: 'chrome:instance-1',
    sequence: 3,
    bookmarks: [{ nodeId: '2', title: 'Reference', url: 'https://example.com/page', folderPath: ['Bookmarks bar'] }],
  });
  assert.deepEqual(input, before);
});

test('supports all root folders without hardcoded IDs and keeps duplicate URLs separate', () => {
  const input = [{
    id: 'custom-root', title: '', children: [
      { id: 'local', parentId: 'custom-root', title: 'Local', children: [{ ...leaf('a'), parentId: 'local' }] },
      { id: 'account', parentId: 'custom-root', title: 'Account', children: [{ ...leaf('b'), parentId: 'account' }] },
    ],
  }];
  const result = normalizeBookmarkTree(input, 'source', 1);
  assert.equal(result.bookmarks.length, 2);
  assert.deepEqual(result.bookmarks.map(({ nodeId, folderPath }) => ({ nodeId, folderPath })), [
    { nodeId: 'a', folderPath: ['Local'] }, { nodeId: 'b', folderPath: ['Account'] },
  ]);
});

test('preserves nested titles, empty folder names, and original URL query and fragment', () => {
  const url = 'https://Example.com:443/page?x=1&x=2#section';
  const input = tree([{ id: 'nested', parentId: '1', title: '', children: [{ ...leaf('page', url), parentId: 'nested' }] }]);
  const [bookmark] = normalizeBookmarkTree(input, 'source', 1).bookmarks;
  assert.deepEqual(bookmark?.folderPath, ['Bookmarks bar', '']);
  assert.equal(bookmark?.url, url);
});

test('non-HTTP absolute URLs are metadata and remain unmodified', () => {
  const urls = ['chrome://settings/', 'about:blank', 'file:///C:/notes.txt', 'javascript:alert(1)', 'data:text/plain,hello'];
  const input = tree(urls.map((url, index) => leaf(String(index + 2), url)));
  assert.deepEqual(normalizeBookmarkTree(input, 'source', 1).bookmarks.map(({ url }) => url), urls);
});

test('empty source requires a valid folder root instead of a missing result', () => {
  assert.deepEqual(normalizeBookmarkTree([{ id: 'any-root', title: '', children: [] }], 'source', 1).bookmarks, []);
  for (const input of [[], null, {}, '[]', [undefined], [null]]) {
    assert.throws(() => normalizeBookmarkTree(input, 'source', 1), TypeError);
  }
});

test('rejects duplicate node IDs across folders and bookmarks', () => {
  assert.throws(() => normalizeBookmarkTree(tree([leaf(), leaf()]), 'source', 1), /duplicate node ID/);
  assert.throws(() => normalizeBookmarkTree(tree([leaf('1')]), 'source', 1), /duplicate node ID/);
});

test('rejects missing and mismatched parent IDs and inconsistent sibling indexes', () => {
  const missing = leaf();
  delete missing.parentId;
  for (const child of [missing, { ...leaf(), parentId: 'other' }, { ...leaf(), index: 1 }, { ...leaf(), index: -1 }]) {
    assert.throws(() => normalizeBookmarkTree(tree([child]), 'source', 1), /parentId|index/);
  }
  assert.doesNotThrow(() => normalizeBookmarkTree(tree([{ ...leaf(), index: 0 }]), 'source', 1));
});

test('rejects invalid hierarchy and non-object nodes', () => {
  const cases: unknown[] = [
    [{ ...leaf(), parentId: undefined }],
    [{ id: 'root', title: '', parentId: 'elsewhere', children: [] }],
    tree([{ ...leaf(), children: [{ ...leaf('3'), parentId: '2' }] }]),
    [{ id: 'root', title: '', children: {} }],
    [new Date()],
    [{ id: 'root', title: '', children: [3] }],
    [{ id: 'root', title: '', children: new Array(1) }],
  ];
  for (const input of cases) assert.throws(() => normalizeBookmarkTree(input, 'source', 1), TypeError);
});

test('rejects a cyclic object graph without mutating it', () => {
  const root: SyntheticNode = { id: 'root', title: '', children: [] };
  root.children!.push(root);
  assert.throws(() => normalizeBookmarkTree([root], 'source', 1), /duplicate node ID|parentId/);
  assert.equal(root.children![0], root);
});

test('rejects invalid identifiers, titles, URLs, and sequences', () => {
  for (const source of ['', 'with space', '\u6765\u6e90', 'a/b', 'a'.repeat(BOOKMARK_LIMITS.maxSourceIdLength + 1)]) {
    assert.throws(() => normalizeBookmarkTree(tree(), source, 1), TypeError);
  }
  for (const sequence of [-1, 0, 0.5, NaN, Infinity, BOOKMARK_LIMITS.maxSequence + 1]) {
    assert.throws(() => normalizeBookmarkTree(tree(), 'source', sequence), /sequence/);
  }
  const cases: unknown[] = [
    tree([{ ...leaf(), id: '' }]),
    tree([{ ...leaf(), title: 'a'.repeat(BOOKMARK_LIMITS.maxTitleLength + 1) }]),
    tree([{ ...leaf(), title: undefined } as unknown as SyntheticNode]),
    ...['', 'relative/path', ' https://example.com', 'https://example.com\n', 'x'.repeat(BOOKMARK_LIMITS.maxUrlLength + 1)]
      .map((url) => tree([leaf('2', url)])),
    tree([{ ...leaf(), url: null } as unknown as SyntheticNode]),
  ];
  for (const input of cases) assert.throws(() => normalizeBookmarkTree(input, 'source', 1), TypeError);
});

test('bounds depth without recursive traversal', () => {
  const root: SyntheticNode = { id: 'root', title: '', children: [] };
  let parent = root;
  for (let index = 1; index <= BOOKMARK_LIMITS.maxFolderPathLength + 1; index += 1) {
    const child: SyntheticNode = { id: `folder-${index}`, parentId: parent.id, title: 'Folder', children: [] };
    parent.children!.push(child);
    parent = child;
  }
  assert.throws(() => normalizeBookmarkTree([root], 'source', 1), /too deep/);
});

test('bounds total nodes before traversing an oversized child array', () => {
  const input = [{ id: 'root', title: '', children: new Array(CHROME_TREE_LIMITS.maxNodes) }];
  assert.throws(() => normalizeBookmarkTree(input, 'source', 1), /too many nodes/);
});

test('bounds expanded output including repeated folder paths', () => {
  const root: SyntheticNode = { id: 'root', title: '', children: [] };
  let parent = root;
  for (let index = 1; index <= BOOKMARK_LIMITS.maxFolderPathLength; index += 1) {
    const child: SyntheticNode = { id: `folder-${index}`, parentId: parent.id, title: 'a'.repeat(BOOKMARK_LIMITS.maxTitleLength), children: [] };
    parent.children!.push(child);
    parent = child;
  }
  const repeatedPathLength = BOOKMARK_LIMITS.maxFolderPathLength * BOOKMARK_LIMITS.maxTitleLength;
  const count = Math.floor(CHROME_TREE_LIMITS.maxOutputCharacters / repeatedPathLength) + 1;
  parent.children = Array.from({ length: count }, (_, index) => ({ ...leaf(`page-${index}`), parentId: parent.id }));
  assert.throws(() => normalizeBookmarkTree([root], 'source', 1), /output is too large/);
});

test('bounds relevant input text even when a tree contains no bookmarks', () => {
  const count = Math.floor(CHROME_TREE_LIMITS.maxInputCharacters / BOOKMARK_LIMITS.maxTitleLength) + 1;
  const input = [{
    id: 'root', title: '', children: Array.from({ length: count }, (_, index) => ({
      id: `folder-${index}`, parentId: 'root', title: 'a'.repeat(BOOKMARK_LIMITS.maxTitleLength), children: [],
    })),
  }];
  assert.throws(() => normalizeBookmarkTree(input, 'source', 1), /input text is too large/);
});

test('rejects the entire snapshot when a later node is invalid', () => {
  const input = tree([leaf('valid'), { ...leaf('invalid'), parentId: 'wrong' }]);
  const before = structuredClone(input);
  assert.throws(() => normalizeBookmarkTree(input, 'source', 1), /parentId/);
  assert.deepEqual(input, before);
});

test('output folder arrays do not alias each other or the source tree', () => {
  const input = tree([leaf('a'), leaf('b')]);
  const result = normalizeBookmarkTree(input, 'source', 1);
  result.bookmarks[0]!.folderPath.push('changed');
  assert.deepEqual(result.bookmarks[1]!.folderPath, ['Bookmarks bar']);
  assert.equal(input[0]!.children![0]!.title, 'Bookmarks bar');
});
