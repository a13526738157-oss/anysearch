import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { utilityProcess } from 'electron';
import type { UtilityProcess } from 'electron';

const RECOVERY_DELAYS_MS = [250, 1_000, 3_000] as const;
const STABLE_WORKER_MS = 30_000;
const GRACEFUL_EXIT_MS = 10_000;
const FORCED_EXIT_MS = 5_000;

interface Pending {
  generation: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

interface WorkerGeneration {
  id: number;
  child: UtilityProcess;
  startedAt: number;
  accepting: boolean;
  exited: boolean;
  exit: Promise<number>;
}

export class DesktopBackendClient {
  private readonly dataDirectory: string;
  private readonly pending = new Map<string, Pending>();
  private current: WorkerGeneration | undefined;
  private generation = 0;
  private recoveryAttempts = 0;
  private nextRecoveryAt = 0;
  private closed = false;
  private closing: Promise<void> | undefined;

  constructor(dataDirectory: string) {
    this.dataDirectory = dataDirectory;
    this.startWorker();
  }

  request(method: string, args?: unknown): Promise<unknown> {
    let worker: WorkerGeneration;
    try { worker = this.requireWorker(); }
    catch { return Promise.reject(new Error(this.closed ? 'BACKEND_CLOSED' : 'BACKEND_UNAVAILABLE')); }
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('BACKEND_TIMEOUT'));
      }, method === 'search' ? 95_000 : 15_000);
      this.pending.set(id, { generation: worker.id, resolve, reject, timer });
      try { worker.child.postMessage({ id, method, args }); }
      catch {
        worker.accepting = false;
        this.rejectGeneration(worker.id, 'BACKEND_UNAVAILABLE');
        try { worker.child.kill(); } catch { /* Do not replace a worker until its exit is observed. */ }
      }
    });
  }

  close(): Promise<void> {
    if (!this.closing) {
      this.closed = true;
      const worker = this.current;
      if (worker) this.rejectGeneration(worker.id, 'BACKEND_CLOSED');
      this.closing = this.stopWorker(worker);
    }
    return this.closing;
  }

  private requireWorker(): WorkerGeneration {
    if (this.closed) throw new Error('BACKEND_CLOSED');
    if (this.current) {
      if (!this.current.accepting) throw new Error('BACKEND_UNAVAILABLE');
      return this.current;
    }
    if (this.recoveryAttempts >= RECOVERY_DELAYS_MS.length || Date.now() < this.nextRecoveryAt) {
      throw new Error('BACKEND_UNAVAILABLE');
    }
    // A new request may rebuild the worker, but no previous operation is replayed.
    this.recoveryAttempts++;
    try { return this.startWorker(); }
    catch {
      this.scheduleRecovery();
      throw new Error('BACKEND_UNAVAILABLE');
    }
  }

  private startWorker(): WorkerGeneration {
    const child = utilityProcess.fork(join(__dirname, 'worker.cjs'), [], {
      env: { ...process.env, ANYSEARCH_DATA_DIR: this.dataDirectory }, stdio: 'pipe', serviceName: 'AnySearch local index',
    });
    let finishExit: (code: number) => void = () => {};
    const exit = new Promise<number>(resolve => { finishExit = resolve; });
    const worker: WorkerGeneration = {
      id: ++this.generation, child, startedAt: Date.now(), accepting: true, exited: false, exit,
    };
    this.current = worker;
    // Drain logs without exposing stored content to the renderer or persistent logs.
    child.stdout?.resume();
    child.stderr?.resume();
    child.on('message', (data: unknown) => {
      if (worker !== this.current || worker.exited || typeof data !== 'object' || data === null) return;
      const response = data as { id?: unknown; ok?: unknown; result?: unknown; error?: unknown };
      if (typeof response.id !== 'string') return;
      const pending = this.pending.get(response.id);
      if (!pending || pending.generation !== worker.id) return;
      clearTimeout(pending.timer);
      this.pending.delete(response.id);
      if (response.ok === true) pending.resolve(response.result);
      else pending.reject(new Error(typeof response.error === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/u.test(response.error)
        ? response.error : 'REQUEST_FAILED'));
    });
    child.on('error', () => {
      worker.accepting = false;
      this.rejectGeneration(worker.id, 'BACKEND_UNAVAILABLE');
    });
    child.once('exit', code => {
      worker.exited = true;
      worker.accepting = false;
      finishExit(code);
      this.rejectGeneration(worker.id, 'BACKEND_UNAVAILABLE');
      if (this.current !== worker) return;
      this.current = undefined;
      if (!this.closed) {
        if (Date.now() - worker.startedAt >= STABLE_WORKER_MS) this.recoveryAttempts = 0;
        this.scheduleRecovery();
      }
    });
    return worker;
  }

  private scheduleRecovery(): void {
    const delay = RECOVERY_DELAYS_MS[this.recoveryAttempts];
    this.nextRecoveryAt = delay === undefined ? Number.POSITIVE_INFINITY : Date.now() + delay;
  }

  private rejectGeneration(generation: number, code: string): void {
    for (const [id, pending] of this.pending) {
      if (pending.generation !== generation) continue;
      clearTimeout(pending.timer);
      this.pending.delete(id);
      pending.reject(new Error(code));
    }
  }

  private async stopWorker(worker: WorkerGeneration | undefined): Promise<void> {
    if (!worker || worker.exited) return;
    worker.accepting = false;
    let sendFailed = false;
    try { worker.child.postMessage({ id: randomUUID(), method: 'close' }); }
    catch { sendFailed = true; }
    const code = await this.waitForExit(worker, GRACEFUL_EXIT_MS);
    if (code !== undefined) {
      if (sendFailed || code !== 0) throw new Error('BACKEND_SHUTDOWN_FAILED');
      return;
    }
    try { worker.child.kill(); } catch { /* The final bounded wait still determines whether it exited. */ }
    const forcedCode = await this.waitForExit(worker, FORCED_EXIT_MS);
    throw new Error(forcedCode === undefined ? 'BACKEND_EXIT_TIMEOUT' : 'BACKEND_SHUTDOWN_TIMEOUT');
  }

  private waitForExit(worker: WorkerGeneration, timeoutMs: number): Promise<number | undefined> {
    return new Promise(resolve => {
      const timer = setTimeout(() => { resolve(undefined); }, timeoutMs);
      void worker.exit.then(code => { clearTimeout(timer); resolve(code); });
    });
  }
}
