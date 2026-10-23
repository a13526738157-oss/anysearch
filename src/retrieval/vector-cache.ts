import { DatabaseSync } from 'node:sqlite';
import { closeSync, existsSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { requireCanonicalPath, localAbsolutePath } from '../storage/local-path.ts';
import type { VectorCache } from './contracts.ts';

export class SqliteVectorCache implements VectorCache {
  private readonly db: DatabaseSync;
  private readonly path: string;

  constructor(path: string) {
    this.path = localAbsolutePath(path);
    requireCanonicalPath(dirname(this.path), 'directory');
    const existing = existsSync(this.path);
    if (existing) {
      requireCanonicalPath(this.path, 'file');
      const inspection = new DatabaseSync(this.path, { readOnly: true });
      try { requireCacheSchema(inspection); } finally { inspection.close(); }
    } else closeSync(openSync(this.path, 'wx', 0o600));
    requireCanonicalPath(this.path, 'file');
    this.db = new DatabaseSync(this.path);
    try {
      if (!existing) this.db.exec(`BEGIN; PRAGMA application_id = 1096377174;
        CREATE TABLE vectors (key TEXT PRIMARY KEY, vector TEXT NOT NULL, updated_at INTEGER NOT NULL); COMMIT;`);
      requireCacheSchema(this.db);
      this.db.exec('PRAGMA busy_timeout = 1000');
    } catch (error) { this.db.close(); throw error; }
  }

  get(key: string): number[] | undefined {
    this.requireOwned();
    const row = this.db.prepare('SELECT vector FROM vectors WHERE key = ?').get(key);
    if (!row) return undefined;
    const value: unknown = JSON.parse(String(row.vector));
    if (!Array.isArray(value) || value.some(item => typeof item !== 'number' || !Number.isFinite(item))) return undefined;
    return value as number[];
  }

  set(key: string, value: readonly number[]): void {
    this.requireOwned();
    this.db.prepare(`INSERT INTO vectors (key, vector, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET vector = excluded.vector, updated_at = excluded.updated_at`)
      .run(key, JSON.stringify(value), Date.now());
    this.db.exec('DELETE FROM vectors WHERE key IN (SELECT key FROM vectors ORDER BY updated_at DESC, key LIMIT -1 OFFSET 10000)');
  }

  close(): void { this.db.close(); }

  private requireOwned(): void {
    requireCanonicalPath(this.path, 'file');
    requireCacheSchema(this.db);
  }
}

function requireCacheSchema(db: DatabaseSync): void {
  const objects = db.prepare("SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all();
  const columns = db.prepare('PRAGMA table_info(vectors)').all();
  if (db.prepare('PRAGMA application_id').get()?.application_id !== 1096377174
    || objects.length !== 1 || objects[0]?.type !== 'table' || objects[0]?.name !== 'vectors'
    || JSON.stringify(columns.map(column => [column.name, column.type, column.notnull, column.pk]))
      !== JSON.stringify([['key', 'TEXT', 0, 1], ['vector', 'TEXT', 1, 0], ['updated_at', 'INTEGER', 1, 0]])) {
    throw new Error('Not an AnySearch vector cache.');
  }
}
