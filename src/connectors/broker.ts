import { randomUUID, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { normalizeBookmarkTree } from '../adapters/chrome/normalize.ts';
import { ServiceError, requireValue } from '../core/errors.ts';
import { syncBookmarks } from '../storage/bookmarks.ts';
import { transaction } from '../storage/database.ts';
import { authorizeConnector, getPairingInfo, listSources, pairSource } from '../storage/pairing.ts';
import { SYNC_LIMITS } from './protocol.ts';
import type { NativeResponse } from './protocol.ts';

const envelope = { v: z.literal(1), id: z.string().min(1).max(128) };
const credentials = { instanceId: z.string().min(16).max(128), credential: z.string().min(32).max(128) };
const transferId = z.string().uuid();
const sequence = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const requestSchema = z.discriminatedUnion('type', [
  z.object({ ...envelope, type: z.literal('pairing-info'), pairingCode: z.string().max(128) }).strict(),
  z.object({ ...envelope, type: z.literal('pair'), pairingCode: z.string().max(128),
    instanceId: credentials.instanceId, label: z.string().min(1).max(80), selectionToken: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
  z.object({ ...envelope, ...credentials, type: z.literal('status') }).strict(),
  z.object({ ...envelope, ...credentials, type: z.literal('begin'), sequence,
    hash: z.string().regex(/^[a-f0-9]{64}$/), totalBytes: z.number().int().min(1).max(SYNC_LIMITS.maxSnapshotBytes),
    chunkCount: z.number().int().min(1).max(SYNC_LIMITS.maxChunks) }).strict(),
  z.object({ ...envelope, ...credentials, type: z.literal('chunk'), transferId,
    index: z.number().int().min(0).max(SYNC_LIMITS.maxChunks - 1),
    data: z.string().min(1).max(Math.ceil(SYNC_LIMITS.chunkBytes / 3) * 4).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/) }).strict(),
  z.object({ ...envelope, ...credentials, type: z.literal('commit'), transferId }).strict(),
  z.object({ ...envelope, ...credentials, type: z.literal('abort'), transferId }).strict(),
]);

interface Stage {
  id: string; sourceId: string; sequence: number; hash: string; totalBytes: number; chunkCount: number;
  expires: number; chunks: Buffer[]; receivedBytes: number;
}

export class NativeBroker {
  private readonly db: DatabaseSync;
  private readonly origin: string;
  private stage: Stage | undefined;

  constructor(db: DatabaseSync, origin: string) { this.db = db; this.origin = origin; }
  close(): void { this.stage = undefined; }

  handle(input: unknown): NativeResponse {
    let id = '';
    try {
      const parsed = requestSchema.safeParse(input);
      requireValue(parsed.success, 'INVALID_REQUEST', 'Invalid connection request.');
      const request = parsed.data;
      id = request.id;
      if (this.stage && this.stage.expires <= Date.now()) this.close();
      if (request.type === 'pairing-info') return this.ok(id, getPairingInfo(this.db, this.origin, request.pairingCode));
      if (request.type === 'pair') {
        return this.ok(id, pairSource(this.db, this.origin, request.pairingCode, request.instanceId, request.label, Date.now(), request.selectionToken));
      }
      const sourceId = authorizeConnector(this.db, this.origin, request.instanceId, request.credential);
      const source = listSources(this.db).find(item => item.sourceId === sourceId)!;
      if (request.type === 'status') return this.ok(id, { ...source });
      if (request.type === 'begin') {
        requireValue(request.sequence === source.sequence + 1, 'STALE_SYNC', 'Refresh the source status before syncing.');
        requireValue(request.chunkCount === Math.ceil(request.totalBytes / SYNC_LIMITS.chunkBytes),
          'INVALID_REQUEST', 'Invalid transfer size.');
        this.stage = { id: randomUUID(), sourceId, sequence: request.sequence, hash: request.hash,
          totalBytes: request.totalBytes, chunkCount: request.chunkCount,
          expires: Date.now() + SYNC_LIMITS.transferLifetimeMs, chunks: [], receivedBytes: 0 };
        return this.ok(id, { transferId: this.stage.id, nextIndex: 0 });
      }
      const stage = this.stage;
      requireValue(stage && stage.id === request.transferId && stage.sourceId === sourceId,
        'TRANSFER_UNAVAILABLE', 'Transfer is missing or expired.');
      if (request.type === 'abort') { this.close(); return this.ok(id, {}); }
      if (request.type === 'chunk') {
        requireValue(request.index === stage.chunks.length && request.index < stage.chunkCount,
          'INVALID_CHUNK', 'Chunk is out of sequence.');
        const chunk = Buffer.from(request.data, 'base64');
        const expected = Math.min(SYNC_LIMITS.chunkBytes, stage.totalBytes - stage.receivedBytes);
        requireValue(chunk.byteLength === expected && chunk.toString('base64') === request.data,
          'INVALID_CHUNK', 'Chunk size or encoding is invalid.');
        stage.chunks.push(chunk);
        stage.receivedBytes += chunk.byteLength;
        return this.ok(id, { transferId: stage.id, nextIndex: stage.chunks.length });
      }
      requireValue(stage.chunks.length === stage.chunkCount && stage.receivedBytes === stage.totalBytes,
        'INCOMPLETE_TRANSFER', 'Transfer is incomplete.');
      const bytes = Buffer.concat(stage.chunks);
      requireValue(createHash('sha256').update(bytes).digest('hex') === stage.hash, 'HASH_MISMATCH', 'Transfer integrity check failed.');
      const tree: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      const snapshot = normalizeBookmarkTree(tree, sourceId, stage.sequence);
      const lastSyncedAt = new Date().toISOString();
      transaction(this.db, () => {
        syncBookmarks(this.db, snapshot);
        this.db.prepare('UPDATE chrome_bindings SET last_synced_at = ? WHERE source_id = ?').run(lastSyncedAt, sourceId);
      });
      this.close();
      return this.ok(id, { sequence: stage.sequence, bookmarkCount: snapshot.bookmarks.length, lastSyncedAt });
    } catch (error) {
      this.close();
      return { v: 1, id, ok: false, error: error instanceof ServiceError
        ? { code: error.code, message: error.message }
        : { code: 'SYNC_FAILED', message: 'Connection request could not be completed.' } };
    }
  }

  private ok(id: string, result: Record<string, unknown>): NativeResponse { return { v: 1, id, ok: true, result }; }
}
