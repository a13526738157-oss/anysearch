import { closeSync, constants, fstatSync, openSync, readSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod/v4';
import { requireValue, ServiceError } from '../../core/errors.ts';
import { openDatabase } from '../../storage/database.ts';
import { authorize } from '../../storage/grants.ts';
import type { ContentLevel } from '../../core/contracts.ts';
import { requireCanonicalPath } from '../../storage/local-path.ts';
export { localAbsolutePath, requireCanonicalPath } from '../../storage/local-path.ts';

export const CONNECTION_MAX_BYTES = 4096;

const connectionFields = {
  databasePath: z.string().min(1).max(2048),
  sourceId: z.string().regex(/^chrome:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/),
  grantId: z.uuid(),
  capability: z.string().regex(/^anysearch_[A-Za-z0-9_-]{43}$/),
};

const connectionSchema = z.discriminatedUnion('version', [
  z.strictObject({ version: z.literal(1), ...connectionFields }),
  z.strictObject({ version: z.literal(2), ...connectionFields, contentLevel: z.literal('public_text') }),
]);

export type CodexConnection = z.infer<typeof connectionSchema>;

export function connectionContentLevel(connection: CodexConnection): ContentLevel {
  return connection.version === 1 ? 'metadata' : connection.contentLevel;
}

export function readConnectionFile(path: string): CodexConnection {
  const resolved = requireCanonicalPath(path, 'file');
  let descriptor: number | undefined;
  try {
    descriptor = openSync(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = fstatSync(descriptor);
    requireValue(info.isFile() && info.nlink === 1 && info.size > 0 && info.size <= CONNECTION_MAX_BYTES,
      'INVALID_CONNECTION', 'Invalid local connection file.');
    const buffer = Buffer.alloc(CONNECTION_MAX_BYTES + 1);
    const length = readSync(descriptor, buffer, 0, buffer.length, 0);
    requireValue(length === info.size && length <= CONNECTION_MAX_BYTES,
      'INVALID_CONNECTION', 'Invalid local connection file.');
    const parsed = connectionSchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length))));
    requireValue(parsed.success, 'INVALID_CONNECTION', 'Invalid local connection file.');
    requireCanonicalPath(parsed.data.databasePath, 'file');
    return parsed.data;
  } catch {
    throw new ServiceError('INVALID_CONNECTION', 'Invalid local connection file.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function authorizeConnection(db: DatabaseSync, connection: CodexConnection): void {
  const grant = authorize(db, connection.capability);
  requireValue(grant.id === connection.grantId && grant.sourceId === connection.sourceId
    && grant.contentLevel === connectionContentLevel(connection),
    'ACCESS_DENIED', 'The local connection is not authorized.');
  requireValue(db.prepare(`SELECT 1 FROM chrome_bindings b JOIN sources s ON s.id = b.source_id
    WHERE b.source_id = ? AND b.revoked = 0 AND s.enabled = 1 AND s.sequence > 0 AND b.last_synced_at IS NOT NULL`)
    .get(connection.sourceId), 'ACCESS_DENIED', 'The local connection is not authorized.');
}

export function openConnection(path: string): { db: DatabaseSync; capability: string; authorize: () => void } {
  const connection = readConnectionFile(path);
  const db = openDatabase(connection.databasePath, { existingOnly: true });
  try {
    authorizeConnection(db, connection);
    return { db, capability: connection.capability, authorize: () => authorizeConnection(db, connection) };
  } catch (error) {
    db.close();
    throw error;
  }
}
