export const NATIVE_HOST_NAME = 'com.anysearch.bookmarks';
export const SYNC_LIMITS = Object.freeze({
  maxFrameBytes: 512 * 1024,
  maxSnapshotBytes: 8 * 1024 * 1024,
  chunkBytes: 64 * 1024,
  maxChunks: 128,
  transferLifetimeMs: 60_000,
  pairingLifetimeMs: 5 * 60_000,
});

interface Envelope { v: 1; id: string }
interface Credentials { instanceId: string; credential: string }

export type NativeRequest = Envelope & (
  | { type: 'pairing-info'; pairingCode: string }
  | { type: 'pair'; pairingCode: string; instanceId: string; label: string; selectionToken?: string }
  | ({ type: 'status' } & Credentials)
  | ({ type: 'begin'; sequence: number; hash: string; totalBytes: number; chunkCount: number } & Credentials)
  | ({ type: 'chunk'; transferId: string; index: number; data: string } & Credentials)
  | ({ type: 'commit'; transferId: string } & Credentials)
  | ({ type: 'abort'; transferId: string } & Credentials)
);

export type NativeResponse = { v: 1; id: string; ok: true; result: Record<string, unknown> }
  | { v: 1; id: string; ok: false; error: { code: string; message: string } };

export interface PairedSource {
  sourceId: string;
  label: string;
  enabled: boolean;
  sequence: number;
  bookmarkCount: number;
  lastSyncedAt: string | null;
}
