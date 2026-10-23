import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { BookmarkSnapshot } from '../core/contracts.ts';
import { requireValue } from '../core/errors.ts';
import { sha256 } from '../core/hash.ts';
import { BOOKMARK_LIMITS, SOURCE_ID_PATTERN } from '../core/limits.ts';
import { transaction } from './database.ts';
import { createSearchText } from './search-text.ts';

const sourceIdSchema = z.string().regex(SOURCE_ID_PATTERN);
const snapshotSchema = z.object({
  sourceId: sourceIdSchema,
  sequence: z.number().int().min(BOOKMARK_LIMITS.minSequence).max(BOOKMARK_LIMITS.maxSequence),
  bookmarks: z.array(z.object({
    nodeId: z.string().min(1).max(BOOKMARK_LIMITS.maxNodeIdLength),
    title: z.string().max(BOOKMARK_LIMITS.maxTitleLength),
    url: z.string().min(1).max(BOOKMARK_LIMITS.maxUrlLength).refine(value => URL.canParse(value)),
    folderPath: z.array(z.string().max(BOOKMARK_LIMITS.maxTitleLength)).max(BOOKMARK_LIMITS.maxFolderPathLength),
  }).strict()).max(BOOKMARK_LIMITS.maxBookmarks),
}).strict();

export function resourceId(sourceId: string, nodeId: string): string {
  return sha256(JSON.stringify([sourceId, nodeId]));
}

export function registerSource(db: DatabaseSync, sourceId: string): void {
  requireValue(sourceIdSchema.safeParse(sourceId).success, 'INVALID_SOURCE', 'Invalid source identifier.');
  db.prepare('INSERT OR IGNORE INTO sources(id) VALUES (?)').run(sourceId);
}

export function syncBookmarks(db: DatabaseSync, input: BookmarkSnapshot): void {
  const parsed = snapshotSchema.safeParse(input);
  requireValue(parsed.success, 'INVALID_SNAPSHOT', 'Invalid bookmark snapshot.');
  const snapshot = parsed.data;
  const ids = new Set(snapshot.bookmarks.map(bookmark => bookmark.nodeId));
  requireValue(ids.size === snapshot.bookmarks.length, 'INVALID_SNAPSHOT', 'Duplicate bookmark identifiers.');

  transaction(db, () => {
    const source = db.prepare('SELECT sequence, enabled FROM sources WHERE id = ?').get(snapshot.sourceId);
    requireValue(source?.enabled === 1, 'SOURCE_UNAVAILABLE', 'Source is not enabled.');
    requireValue(snapshot.sequence > Number(source.sequence), 'STALE_SYNC', 'Snapshot sequence is not newer.');
    db.prepare('DELETE FROM bookmark_fts WHERE id IN (SELECT id FROM bookmarks WHERE source_id = ?)').run(snapshot.sourceId);

    const upsert = db.prepare(`INSERT INTO bookmarks
      (id, source_id, node_id, title, url, folder_path, metadata, search_text, seen_sequence, capture_revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, url = excluded.url,
        folder_path = excluded.folder_path, metadata = excluded.metadata, search_text = excluded.search_text,
        seen_sequence = excluded.seen_sequence,
        capture_revision = CASE WHEN bookmarks.url = excluded.url THEN bookmarks.capture_revision ELSE excluded.capture_revision END,
        body = CASE WHEN bookmarks.url = excluded.url THEN bookmarks.body ELSE '' END`);
    for (const bookmark of snapshot.bookmarks) {
      const metadata = JSON.stringify({ title: bookmark.title, url: bookmark.url, folderPath: bookmark.folderPath }, null, 2);
      upsert.run(resourceId(snapshot.sourceId, bookmark.nodeId), snapshot.sourceId, bookmark.nodeId,
        bookmark.title, bookmark.url, JSON.stringify(bookmark.folderPath), metadata, createSearchText(bookmark), snapshot.sequence, randomUUID());
    }
    db.prepare('DELETE FROM bookmarks WHERE source_id = ? AND seen_sequence <> ?').run(snapshot.sourceId, snapshot.sequence);
    db.prepare('INSERT INTO bookmark_fts(id, search_text, body) SELECT id, search_text, body FROM bookmarks WHERE source_id = ?').run(snapshot.sourceId);
    db.prepare('UPDATE sources SET sequence = ? WHERE id = ?').run(snapshot.sequence, snapshot.sourceId);
  });
}

export function getCaptureTarget(db: DatabaseSync, id: string): { url: string; revision: string } {
  const row = db.prepare(`SELECT b.url, b.capture_revision FROM bookmarks b
    JOIN sources s ON s.id = b.source_id WHERE b.id = ? AND s.enabled = 1`).get(id);
  requireValue(row, 'STALE_SOURCE', 'Bookmark is no longer available.');
  return { url: String(row.url), revision: String(row.capture_revision) };
}

// Ingestion-only entry point. A future fetcher must establish public access before calling this.
export function setCapturedText(db: DatabaseSync, id: string, expectedUrl: string, text: string, expectedRevision: string): void {
  requireValue(typeof text === 'string' && text.length > 0 && text.length <= 1_000_000,
    'INVALID_CONTENT', 'Captured text must be nonempty and bounded.');
  transaction(db, () => {
    const row = db.prepare(`SELECT b.url, b.search_text, b.capture_revision FROM bookmarks b
      JOIN sources s ON s.id = b.source_id WHERE b.id = ? AND s.enabled = 1`).get(id);
    requireValue(row && row.url === expectedUrl && row.capture_revision === expectedRevision,
      'STALE_SOURCE', 'Bookmark changed or is missing; discard the captured response.');
    db.prepare('UPDATE bookmarks SET body = ? WHERE id = ?').run(text, id);
    db.prepare('DELETE FROM bookmark_fts WHERE id = ?').run(id);
    db.prepare('INSERT INTO bookmark_fts(id, search_text, body) VALUES (?, ?, ?)').run(id, row.search_text!, text);
  });
}
