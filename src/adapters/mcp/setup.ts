import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { requireValue } from '../../core/errors.ts';
import { sha256 } from '../../core/hash.ts';
import { openDatabase, transaction } from '../../storage/database.ts';
import { issueGrant, revokeGrant } from '../../storage/grants.ts';
import type { ContentLevel } from '../../core/contracts.ts';
import { contentAccessProfile } from './content-access.ts';
import { authorizeConnection, connectionContentLevel, CONNECTION_MAX_BYTES, localAbsolutePath, readConnectionFile, requireCanonicalPath } from './connection.ts';
import type { CodexConnection } from './connection.ts';

export interface ConnectionSetupOptions {
  databasePath: string;
  connectionPath: string;
  contentLevel?: ContentLevel;
  verifyConnectionFile?: () => void;
}

export interface ConnectionSummary {
  connectionPath: string;
  databasePath: string;
  sourceId: string;
  grantId: string;
  contentLevel: ContentLevel;
}

function summary(connectionPath: string, connection: CodexConnection): ConnectionSummary {
  return { connectionPath, databasePath: connection.databasePath, sourceId: connection.sourceId,
    grantId: connection.grantId, contentLevel: connectionContentLevel(connection) };
}

function prepareDirectory(path: string): void {
  let parent = path;
  while (!existsSync(parent)) {
    const next = dirname(parent);
    requireValue(next !== parent, 'INVALID_CONNECTION', 'A local parent directory is required.');
    parent = next;
  }
  requireCanonicalPath(parent, 'directory');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  requireCanonicalPath(path, 'directory');
}

export function provisionCodexConnection(options: ConnectionSetupOptions): ConnectionSummary & { reused: boolean } {
  const { contentLevel } = contentAccessProfile(options.contentLevel);
  const databasePath = requireCanonicalPath(options.databasePath, 'file');
  const connectionPath = localAbsolutePath(options.connectionPath);
  const db = openDatabase(databasePath, { mustExist: true });
  let createdIdentity: { dev: number; ino: number } | undefined;
  try {
    if (existsSync(connectionPath)) {
      options.verifyConnectionFile?.();
      const connection = readConnectionFile(connectionPath);
      requireValue(localAbsolutePath(connection.databasePath) === databasePath,
        'CONNECTION_CONFLICT', 'An existing connection must not be replaced.');
      requireValue(connectionContentLevel(connection) === contentLevel,
        'CONNECTION_CONFLICT', 'An existing connection must not change its authorized content level.');
      authorizeConnection(db, connection);
      return { ...summary(connectionPath, connection), reused: true };
    }
    prepareDirectory(dirname(connectionPath));
    const connection = transaction(db, () => {
      const active = db.prepare(`SELECT b.source_id, b.last_synced_at, s.enabled, s.sequence
        FROM chrome_bindings b JOIN sources s ON s.id = b.source_id WHERE b.revoked = 0`).all();
      requireValue(active.length === 1 && active[0]?.enabled === 1 && Number(active[0].sequence) > 0
        && typeof active[0].last_synced_at === 'string',
      'SOURCE_UNAVAILABLE', 'Exactly one enabled and synchronized Chrome source is required.');
      const sourceId = String(active[0].source_id);
      const grant = issueGrant(db, sourceId, contentLevel);
      const fields = { databasePath, sourceId, grantId: grant.id, capability: grant.capability };
      const value: CodexConnection = contentLevel === 'public_text'
        ? { version: 2, ...fields, contentLevel } : { version: 1, ...fields };
      const contents = JSON.stringify(value, null, 2) + '\n';
      requireValue(Buffer.byteLength(contents) <= CONNECTION_MAX_BYTES, 'INVALID_CONNECTION', 'The connection file is too large.');
      // Exclusive creation prevents replacing a user's file; a failed commit leaves no active grant.
      const descriptor = openSync(connectionPath, 'wx', 0o600);
      try {
        const identity = lstatSync(connectionPath);
        createdIdentity = { dev: identity.dev, ino: identity.ino };
        writeFileSync(descriptor, contents, 'utf8');
        fsyncSync(descriptor);
      } finally { closeSync(descriptor); }
      options.verifyConnectionFile?.();
      return value;
    });
    return { ...summary(connectionPath, connection), reused: false };
  } catch (error) {
    if (createdIdentity) {
      try {
        const current = lstatSync(connectionPath);
        if (current.dev === createdIdentity.dev && current.ino === createdIdentity.ino && !current.isSymbolicLink()) unlinkSync(connectionPath);
      } catch { /* A leftover invalid connection file cannot authorize a rolled-back grant. */ }
    }
    throw error;
  } finally { db.close(); }
}

export function revokeCodexConnection(path: string): ConnectionSummary & { revoked: true } {
  const connectionPath = localAbsolutePath(path);
  const connection = readConnectionFile(connectionPath);
  const db = openDatabase(connection.databasePath, { mustExist: true });
  try {
    transaction(db, () => {
      const grant = db.prepare('SELECT token_hash, source_id, content_level FROM grants WHERE id = ?').get(connection.grantId);
      requireValue(grant?.token_hash === sha256(connection.capability) && grant.source_id === connection.sourceId
        && grant.content_level === connectionContentLevel(connection),
      'ACCESS_DENIED', 'The local connection cannot be revoked with this file.');
      revokeGrant(db, connection.grantId);
    });
    return { ...summary(connectionPath, connection), revoked: true };
  } finally { db.close(); }
}
