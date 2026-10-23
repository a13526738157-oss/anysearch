import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ContentLevel } from '../core/contracts.ts';
import { requireValue } from '../core/errors.ts';
import { sha256 } from '../core/hash.ts';

export interface Grant {
  id: string;
  sourceId: string;
  contentLevel: ContentLevel;
}

export interface GrantSummary extends Grant {
  revoked: boolean;
  sourceEnabled: boolean;
}

export interface GrantSummaryPage {
  items: GrantSummary[];
  nextCursor?: string;
}

export function listGrantSummaries(db: DatabaseSync, limit: number, afterId?: string): GrantSummaryPage {
  requireValue(Number.isSafeInteger(limit) && limit >= 1 && limit <= 50,
    'INVALID_LIMIT', 'Invalid grant page size.');
  const rows = db.prepare(`SELECT g.id, g.source_id, g.content_level, g.revoked, s.enabled AS source_enabled
    FROM grants g JOIN sources s ON s.id = g.source_id
    WHERE g.id > ? ORDER BY g.id LIMIT ?`).all(afterId ?? '', limit + 1);
  const items = rows.slice(0, limit).map(row => ({
    id: String(row.id), sourceId: String(row.source_id), contentLevel: row.content_level as ContentLevel,
    revoked: row.revoked === 1, sourceEnabled: row.source_enabled === 1,
  }));
  return { items, ...(rows.length > limit ? { nextCursor: items.at(-1)!.id } : {}) };
}

export function issueGrant(db: DatabaseSync, sourceId: string, contentLevel: ContentLevel): { id: string; capability: string } {
  requireValue(contentLevel === 'metadata' || contentLevel === 'public_text', 'INVALID_GRANT', 'Invalid content level.');
  const source = db.prepare('SELECT enabled FROM sources WHERE id = ?').get(sourceId);
  requireValue(source?.enabled === 1, 'SOURCE_UNAVAILABLE', 'Source is not enabled.');
  const capability = `anysearch_${randomBytes(32).toString('base64url')}`;
  const id = randomUUID();
  db.prepare('INSERT INTO grants(id, token_hash, source_id, content_level) VALUES (?, ?, ?, ?)')
    .run(id, sha256(capability), sourceId, contentLevel);
  return { id, capability };
}

export function revokeGrant(db: DatabaseSync, id: string): void {
  db.prepare('UPDATE grants SET revoked = 1 WHERE id = ?').run(id);
}

export function revokeExistingGrant(db: DatabaseSync, id: string): void {
  requireValue(db.prepare('SELECT 1 FROM grants WHERE id = ?').get(id),
    'GRANT_UNAVAILABLE', 'The local grant is not available.');
  revokeGrant(db, id);
}

export function authorize(db: DatabaseSync, capability: string): Grant {
  requireValue(typeof capability === 'string' && capability.length >= 32 && capability.length <= 128,
    'ACCESS_DENIED', 'Access is not authorized.');
  const grant = db.prepare(`SELECT g.id, g.source_id, g.content_level FROM grants g
    JOIN sources s ON s.id = g.source_id
    WHERE g.token_hash = ? AND g.revoked = 0 AND s.enabled = 1`).get(sha256(capability));
  requireValue(grant, 'ACCESS_DENIED', 'Access is not authorized.');
  return { id: String(grant.id), sourceId: String(grant.source_id), contentLevel: grant.content_level as ContentLevel };
}
