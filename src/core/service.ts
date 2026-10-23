import type { DatabaseSync } from 'node:sqlite';
import type { ReadRequest, ReadResponse, SearchResponse } from './contracts.ts';
import { requireValue } from './errors.ts';
import { readEvidence, summarize } from './evidence.ts';
import type { BookmarkRow } from './evidence.ts';
import { authorize } from '../storage/grants.ts';
import { locateLiteralMatch } from './match-location.ts';
import { bookmarkProjection } from '../storage/bookmark-projection.ts';

export class AnySearchService {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  authorize(capability: string): void { authorize(this.db, capability); }

  search(capability: string, query: string, limit = 10): SearchResponse {
    const grant = authorize(this.db, capability);
    requireValue(typeof query === 'string' && query.length <= 512 && !query.includes('\0'), 'INVALID_QUERY', 'Query must be at most 512 characters.');
    requireValue(Number.isInteger(limit) && limit >= 1 && limit <= 20, 'INVALID_LIMIT', 'Limit must be between 1 and 20.');
    const term = query.trim();
    const projection = bookmarkProjection(grant.contentLevel);
    let rows: BookmarkRow[];
    if (!term) {
      rows = this.db.prepare(`SELECT ${projection} FROM bookmarks b WHERE source_id = ? ORDER BY title, id LIMIT ?`)
        .all(grant.sourceId, limit) as unknown as BookmarkRow[];
    } else if ([...term].length >= 3) {
      const literal = `"${term.replaceAll('"', '""')}"`;
      const match = grant.contentLevel === 'metadata' ? `search_text : ${literal}` : literal;
      rows = this.db.prepare(`SELECT ${projection} FROM bookmark_fts f JOIN bookmarks b ON b.id = f.id
        WHERE bookmark_fts MATCH ? AND b.source_id = ? ORDER BY b.title, b.id LIMIT ?`)
        .all(match, grant.sourceId, limit) as unknown as BookmarkRow[];
    } else {
      // Trigram cannot match one or two characters; bound the literal fallback to this source.
      const expression = grant.contentLevel === 'metadata' ? 'search_text' : "search_text || char(10) || body";
      rows = this.db.prepare(`SELECT ${projection} FROM bookmarks b WHERE source_id = ?
        AND instr(lower(${expression}), lower(?)) > 0 ORDER BY title, id LIMIT ?`)
        .all(grant.sourceId, term, limit) as unknown as BookmarkRow[];
    }
    const response: SearchResponse = {
      mode: 'keyword', items: rows.map(row => {
        const item = summarize(row, grant.contentLevel);
        const match = grant.contentLevel === 'public_text' && row.body
          ? locateLiteralMatch(row.body, term) : undefined;
        return match ? { ...item, match } : item;
      }),
      evidenceCompleteness: 'partial', untrustedContent: true,
    };
    authorize(this.db, capability);
    return response;
  }

  read(capability: string, request: ReadRequest): ReadResponse {
    const grant = authorize(this.db, capability);
    requireValue(typeof request.id === 'string' && /^[a-f0-9]{64}$/.test(request.id), 'INVALID_RESOURCE', 'Invalid resource identifier.');
    requireValue(typeof request.snapshotId === 'string' && /^[a-f0-9]{64}$/.test(request.snapshotId), 'INVALID_SNAPSHOT', 'A valid snapshot identifier is required.');
    const lineStart = request.lineStart ?? 1;
    const maxLines = request.maxLines ?? 40;
    requireValue(Number.isSafeInteger(lineStart) && lineStart >= 1 && Number.isInteger(maxLines) && maxLines >= 1 && maxLines <= 80,
      'INVALID_RANGE', 'Invalid excerpt range.');
    const row = this.db.prepare(`SELECT ${bookmarkProjection(grant.contentLevel)} FROM bookmarks b WHERE id = ? AND source_id = ?`)
      .get(request.id, grant.sourceId) as unknown as BookmarkRow | undefined;
    requireValue(row, 'NOT_FOUND', 'Resource is not available in this grant.');
    requireValue(summarize(row, grant.contentLevel).snapshotId === request.snapshotId, 'STALE_SNAPSHOT', 'Content changed; search again before reading.');
    const response = readEvidence(row, grant.contentLevel, lineStart, maxLines);
    authorize(this.db, capability);
    return response;
  }
}
