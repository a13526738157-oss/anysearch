import type { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import type { CaptureStatus, PublicTextFetcher } from '../../src/capture/contracts.ts';
import type { BookmarkRow } from '../../src/core/evidence.ts';
import { summarize } from '../../src/core/evidence.ts';
import { requireValue, ServiceError } from '../../src/core/errors.ts';
import { getCaptureTarget, setCapturedText } from '../../src/storage/bookmarks.ts';

const CAPTURE_INTERVAL_MS = 1_000;

interface CaptureTask {
  id: string;
  sourceId: string;
  url: string;
  revision: string;
  controller: AbortController;
}

interface CaptureFailure {
  revision: string;
  errorCode: string;
}

export class CaptureManager {
  private readonly db: DatabaseSync;
  private readonly fetchText: PublicTextFetcher;
  private active: CaptureTask | undefined;
  private readonly failures = new Map<string, CaptureFailure>();
  private nextCaptureAt = 0;
  private closed = false;

  constructor(db: DatabaseSync, fetchText: PublicTextFetcher) {
    this.db = db;
    this.fetchText = fetchText;
  }

  start(sourceId: string, id: string): CaptureStatus {
    this.assertOpen();
    const target = this.target(sourceId, id);
    if (this.active) {
      requireValue(this.active.id === id && this.active.sourceId === sourceId
        && this.active.url === target.url && this.active.revision === target.revision
        && !this.active.controller.signal.aborted, 'CAPTURE_BUSY', 'Another capture is still finishing.');
      return this.status(sourceId, id);
    }
    const task: CaptureTask = { id, sourceId, ...target, controller: new AbortController() };
    this.active = task;
    this.failures.delete(id);
    void this.execute(task);
    return this.status(sourceId, id);
  }

  status(sourceId: string, id: string): CaptureStatus {
    this.assertOpen();
    const row = this.db.prepare(`SELECT b.* FROM bookmarks b JOIN sources s ON s.id = b.source_id
      WHERE b.id = ? AND b.source_id = ? AND s.enabled = 1`).get(id, sourceId) as unknown as
      (BookmarkRow & { capture_revision: string }) | undefined;
    requireValue(row, 'STALE_SOURCE', 'Bookmark is no longer available.');
    const failure = this.failures.get(id);
    const active = this.active?.id === id && this.active.revision === row.capture_revision
      ? this.active : undefined;
    const currentFailure = failure?.revision === row.capture_revision ? failure : undefined;
    const hasReadableText = row.body.length > 0;
    const errorCode = active?.controller.signal.aborted ? 'CAPTURE_CANCELLED' : currentFailure?.errorCode;
    return {
      id, state: errorCode ? 'failed' : active ? 'running' : hasReadableText ? 'captured' : 'not_captured',
      hasReadableText, item: summarize(row, 'public_text'), ...(errorCode ? { errorCode } : {}),
    };
  }

  cancel(sourceId: string, id: string): CaptureStatus {
    this.target(sourceId, id);
    if (this.active?.id === id && this.active.sourceId === sourceId) this.active.controller.abort();
    return this.status(sourceId, id);
  }

  abortSource(sourceId: string): void {
    if (this.active?.sourceId === sourceId) this.active.controller.abort();
  }

  close(): void {
    this.closed = true;
    this.active?.controller.abort();
  }

  private target(sourceId: string, id: string): { url: string; revision: string } {
    this.assertOpen();
    const row = this.db.prepare('SELECT source_id FROM bookmarks WHERE id = ?').get(id);
    requireValue(row?.source_id === sourceId, 'STALE_SOURCE', 'Bookmark is no longer available.');
    return getCaptureTarget(this.db, id);
  }

  private assertOpen(): void {
    requireValue(!this.closed, 'CAPTURE_CANCELLED', 'Capture is no longer active.');
  }

  private assertCurrent(task: CaptureTask): void {
    this.assertOpen();
    requireValue(!task.controller.signal.aborted, 'CAPTURE_CANCELLED', 'Capture was cancelled.');
    const target = this.target(task.sourceId, task.id);
    requireValue(target.url === task.url && target.revision === task.revision,
      'STALE_SOURCE', 'Bookmark changed during capture.');
  }

  private async execute(task: CaptureTask): Promise<void> {
    try {
      const remaining = Math.max(0, this.nextCaptureAt - Date.now());
      if (remaining) await delay(remaining, undefined, { signal: task.controller.signal });
      else await Promise.resolve();
      this.assertCurrent(task);
      this.nextCaptureAt = Date.now() + CAPTURE_INTERVAL_MS;
      const text = await this.fetchText(task.url, {
        signal: task.controller.signal, assertCurrent: () => this.assertCurrent(task),
      });
      this.assertCurrent(task);
      setCapturedText(this.db, task.id, task.url, text, task.revision);
      this.failures.delete(task.id);
    } catch (error) {
      if (!this.closed) {
        const errorCode = task.controller.signal.aborted ? 'CAPTURE_CANCELLED'
          : error instanceof ServiceError && /^[A-Z][A-Z0-9_]{0,63}$/u.test(error.code)
            ? error.code : 'CAPTURE_FAILED';
        this.failures.set(task.id, { revision: task.revision, errorCode });
      }
    } finally {
      if (this.active === task) this.active = undefined;
    }
  }
}
