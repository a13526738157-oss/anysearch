import { Worker } from 'node:worker_threads';
import { EmbeddingError } from './contracts.ts';
import { validateModelDirectory } from './model-files.ts';

interface QueuedRequest {
  payload: object;
  deadline: number;
  signal: AbortSignal | undefined;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  cleanup(): void;
}

export class ModelWorkerClient {
  private readonly directory: string;
  private readonly entry: 'embedding-worker' | 'reranking-worker';
  private readonly timeoutMs: number;
  private worker: Worker | undefined;
  private readonly queue: QueuedRequest[] = [];
  private draining: Promise<void> | undefined;
  private active = false;
  private sequence = 0;
  private closed = false;
  private cancel: (() => void) | undefined;

  constructor(directory: string, entry: 'embedding-worker' | 'reranking-worker', timeoutMs = 30_000) {
    validateModelDirectory(directory);
    this.directory = directory;
    this.entry = entry;
    this.timeoutMs = timeoutMs;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('Invalid model timeout.');
  }

  request(payload: object, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) return Promise.reject(new DOMException('Model request aborted.', 'AbortError'));
    if (this.closed || this.queue.length + Number(this.active) >= 4) return Promise.reject(new EmbeddingError('model_failed'));
    return new Promise((resolve, reject) => {
      const remove = (error: unknown): void => {
        const index = this.queue.indexOf(job);
        if (index === -1) return;
        this.queue.splice(index, 1);
        job.cleanup();
        reject(error);
      };
      const aborted = (): void => remove(new DOMException('Model request aborted.', 'AbortError'));
      const timer = setTimeout(() => remove(new EmbeddingError('timeout')), this.timeoutMs);
      const job: QueuedRequest = { payload, deadline: Date.now() + this.timeoutMs, signal, resolve, reject,
        cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); } };
      signal?.addEventListener('abort', aborted, { once: true });
      this.queue.push(job);
      this.pump();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const job of this.queue.splice(0)) {
      job.cleanup();
      job.reject(new EmbeddingError('model_failed'));
    }
    this.cancel?.();
    const worker = this.worker;
    this.worker = undefined;
    if (worker) await worker.terminate();
    await this.draining;
  }

  private pump(): void {
    if (this.closed || this.draining) return;
    this.draining = this.drain().finally(() => {
      this.draining = undefined;
      if (this.queue.length) this.pump();
    });
  }

  private async drain(): Promise<void> {
    let job: QueuedRequest | undefined;
    while (!this.closed && (job = this.queue.shift())) {
      job.cleanup();
      this.active = true;
      try { job.resolve(await this.run(job.payload, job.deadline, job.signal)); }
      catch (error) { job.reject(error); }
      finally { this.active = false; }
    }
  }

  private async run(payload: object, deadline: number, signal?: AbortSignal): Promise<unknown> {
    if (signal?.aborted) throw new DOMException('Model request aborted.', 'AbortError');
    if (this.closed) throw new EmbeddingError('model_failed');
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new EmbeddingError('timeout');
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'cjs';
    if (!this.worker) {
      const created = new Worker(new URL(`./${this.entry}.${extension}`, import.meta.url), {
        workerData: { directory: this.directory }, stdout: true, stderr: true,
      });
      const forget = (): void => { if (this.worker === created) this.worker = undefined; };
      created.on('error', forget);
      created.on('exit', forget);
      this.worker = created;
    }
    const worker = this.worker;
    worker.stdout?.resume();
    worker.stderr?.resume();
    const id = ++this.sequence;
    try {
      return await new Promise<unknown>((resolve, reject) => {
        const cleanup = (): void => {
          clearTimeout(timer);
          worker.off('message', message);
          worker.off('error', failed);
          worker.off('exit', failed);
          signal?.removeEventListener('abort', aborted);
          this.cancel = undefined;
        };
        const failed = (): void => { cleanup(); reject(new EmbeddingError('model_failed')); };
        const aborted = (): void => { cleanup(); reject(new DOMException('Model request aborted.', 'AbortError')); };
        const message = (result: { id: number; data?: unknown; error?: EmbeddingError['reason'] }): void => {
          if (result.id !== id) return;
          cleanup();
          if (result.error) reject(new EmbeddingError(result.error));
          else resolve(result.data);
        };
        const timer = setTimeout(() => { cleanup(); reject(new EmbeddingError('timeout')); }, remaining);
        this.cancel = failed;
        worker.on('message', message);
        worker.once('error', failed);
        worker.once('exit', failed);
        signal?.addEventListener('abort', aborted, { once: true });
        worker.postMessage({ ...payload, id });
      });
    } catch (error) {
      if (this.worker === worker) this.worker = undefined;
      // Rejection alone does not cancel native inference; await actual termination.
      await worker.terminate();
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw error instanceof EmbeddingError ? error : new EmbeddingError('model_failed');
    }
  }
}
