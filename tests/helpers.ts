import { mkdtempSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import { openDatabase } from '../src/storage/database.ts';
import { getCaptureTarget, registerSource, resourceId, syncBookmarks, setCapturedText } from '../src/storage/bookmarks.ts';
import { issueGrant } from '../src/storage/grants.ts';
import { AnySearchService } from '../src/core/service.ts';
import type { BookmarkInput } from '../src/core/contracts.ts';

export const sourceId = 'synthetic-chrome';
export const bookmarks: BookmarkInput[] = [
  { nodeId: '1', title: 'Research notes', url: 'https://example.org/research', folderPath: ['Bookmarks', 'Reading'] },
  { nodeId: '2', title: '数字人资料', url: 'https://example.org/avatar', folderPath: ['Bookmarks'] },
  { nodeId: '3', title: 'Reference guide', url: 'https://example.org/guide', folderPath: [] },
];

export function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'anysearch-test-'));
  const path = join(directory, 'index.sqlite');
  const db = openDatabase(path);
  t.after(() => {
    db.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  });
  registerSource(db, sourceId);
  syncBookmarks(db, { sourceId, sequence: 1, bookmarks });
  const id = resourceId(sourceId, '1');
  setCapturedText(db, id, bookmarks[0]!.url, 'Synthetic source only.\nHidden body keyword: orbitfinder.\nNot suitable for real-time use.', getCaptureTarget(db, id).revision);
  const full = issueGrant(db, sourceId, 'public_text');
  const metadata = issueGrant(db, sourceId, 'metadata');
  return { db, path, id, full, metadata, service: new AnySearchService(db) };
}
