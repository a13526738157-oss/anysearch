import { normalizeBookmarkTree } from '../../src/adapters/chrome/normalize.ts';
import { SYNC_LIMITS } from '../../src/connectors/protocol.ts';
import type { NativeRequest } from '../../src/connectors/protocol.ts';

export interface Pairing {
  sourceId: string;
  credential: string;
  label: string;
}

export interface PairingInfo {
  expiresAt: string;
  profileName?: string;
  selectionToken?: string;
}

export interface SyncReceipt {
  sequence: number;
  bookmarkCount: number;
  lastSyncedAt: string;
}

export interface NativeTransport {
  request(message: NativeRequest): Promise<unknown>;
  close(): void;
}

export class SyncError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new SyncError('invalid_response');
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256) throw new SyncError('invalid_response');
  return value;
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new SyncError('invalid_response');
  return value as number;
}

function whitelistNode(value: unknown): Record<string, unknown> {
  const node = object(value);
  const clean: Record<string, unknown> = { id: node.id, title: node.title };
  for (const key of ['parentId', 'index', 'url'] as const) {
    if (node[key] !== undefined) clean[key] = node[key];
  }
  if (Array.isArray(node.children)) clean.children = node.children.map(whitelistNode);
  return clean;
}

export function prepareSnapshot(tree: unknown, sourceId: string, sequence: number): Uint8Array<ArrayBuffer> {
  normalizeBookmarkTree(tree, sourceId, sequence);
  const bytes = new TextEncoder().encode(JSON.stringify((tree as unknown[]).map(whitelistNode)));
  if (bytes.byteLength > SYNC_LIMITS.maxSnapshotBytes) throw new SyncError('snapshot_too_large');
  return bytes;
}

export function encodeChunks(bytes: Uint8Array): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += SYNC_LIMITS.chunkBytes) {
    const chunk = bytes.subarray(start, start + SYNC_LIMITS.chunkBytes);
    let binary = '';
    for (const byte of chunk) binary += String.fromCharCode(byte);
    chunks.push(btoa(binary));
  }
  return chunks;
}

export class SyncClient {
  private readonly transport: NativeTransport;
  constructor(transport: NativeTransport) { this.transport = transport; }

  async pairingInfo(pairingCode: string): Promise<PairingInfo> {
    try {
      const result = await this.call({ v: 1, id: crypto.randomUUID(), type: 'pairing-info', pairingCode });
      const expiresAt = text(result.expiresAt);
      if (!Number.isFinite(Date.parse(expiresAt))) throw new SyncError('invalid_response');
      if (result.profileName === undefined && result.selectionToken === undefined) return { expiresAt };
      const profileName = text(result.profileName);
      const selectionToken = text(result.selectionToken);
      if (profileName.length > 80 || !/^[a-f0-9]{64}$/u.test(selectionToken)) throw new SyncError('invalid_response');
      return { expiresAt, profileName, selectionToken };
    } finally {
      this.transport.close();
    }
  }

  async pair(instanceId: string, pairingCode: string, label: string, selectionToken?: string): Promise<Pairing> {
    try {
      const result = await this.call({
        v: 1, id: crypto.randomUUID(), type: 'pair', instanceId, pairingCode, label,
        ...(selectionToken === undefined ? {} : { selectionToken }),
      });
      const pairing = { sourceId: text(result.sourceId), credential: text(result.credential), label };
      integer(result.sequence);
      return pairing;
    } finally {
      this.transport.close();
    }
  }

  async synchronize(instanceId: string, pairing: Pairing, readTree: () => Promise<unknown>,
    assertSnapshotAllowed: () => void = () => {}): Promise<SyncReceipt> {
    const credentials = { instanceId, credential: pairing.credential };
    let transferId: string | undefined;
    try {
      assertSnapshotAllowed();
      const status = await this.call({ v: 1, id: crypto.randomUUID(), type: 'status', ...credentials });
      if (status.sourceId !== pairing.sourceId) throw new SyncError('invalid_response');
      if (status.enabled !== true) throw new SyncError('ACCESS_DENIED');
      const sequence = integer(status.sequence) + 1;
      assertSnapshotAllowed();
      const tree = await readTree();
      assertSnapshotAllowed();
      const bytes = prepareSnapshot(tree, pairing.sourceId, sequence);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const chunks = encodeChunks(bytes);
      assertSnapshotAllowed();
      const begin = await this.call({
        v: 1, id: crypto.randomUUID(), type: 'begin', ...credentials,
        sequence, hash, totalBytes: bytes.byteLength, chunkCount: chunks.length,
      });
      transferId = text(begin.transferId);
      if (begin.nextIndex !== 0) throw new SyncError('invalid_response');
      for (const [index, data] of chunks.entries()) {
        const ack = await this.call({ v: 1, id: crypto.randomUUID(), type: 'chunk', ...credentials, transferId, index, data });
        if (ack.transferId !== transferId || ack.nextIndex !== index + 1) throw new SyncError('invalid_response');
      }
      const committed = await this.call({ v: 1, id: crypto.randomUUID(), type: 'commit', ...credentials, transferId });
      if (committed.sequence !== sequence) throw new SyncError('invalid_response');
      return { sequence, bookmarkCount: integer(committed.bookmarkCount), lastSyncedAt: text(committed.lastSyncedAt) };
    } catch (error) {
      if (transferId !== undefined) {
        try {
          await this.call({ v: 1, id: crypto.randomUUID(), type: 'abort', ...credentials, transferId });
        } catch {
          // Disconnect discards staging when the host cannot acknowledge an abort.
        }
      }
      throw error;
    } finally {
      // A fresh connection and authoritative sequence recover even if a commit ACK was lost.
      this.transport.close();
    }
  }

  private async call(request: NativeRequest): Promise<Record<string, unknown>> {
    const response = object(await this.transport.request(request));
    if (response.v !== 1 || response.id !== request.id) throw new SyncError('invalid_response');
    if (response.ok === false) {
      const code = object(response.error).code;
      throw new SyncError(typeof code === 'string' && /^[A-Za-z_]{1,64}$/u.test(code) ? code : 'native_rejected');
    }
    if (response.ok !== true) throw new SyncError('invalid_response');
    return object(response.result);
  }
}
