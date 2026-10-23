import { SyncError } from './sync-client.ts';
import type { Pairing, SyncReceipt } from './sync-client.ts';
import { profileLabel } from './context.ts';

export interface ExtensionState {
  version: 1;
  instanceId: string;
  pairing: Pairing | null;
  dirty: boolean;
  importing?: boolean;
  receipt: SyncReceipt | null;
}

export interface ExtensionStatus {
  paired: boolean;
  label: string | null;
  syncing: boolean;
  dirty: boolean;
  importing?: boolean;
  lastSyncedAt: string | null;
  error: string | null;
}

export interface ControllerDependencies {
  load(): Promise<unknown>;
  save(state: ExtensionState): Promise<void>;
  newId(): string;
  pair(instanceId: string, code: string, label: string, selectionToken?: string): Promise<Pairing>;
  synchronize(instanceId: string, pairing: Pairing, assertSnapshotAllowed: () => void): Promise<SyncReceipt>;
  scheduleRetry(errorCode: string): Promise<void>;
}

function persistedState(value: unknown): ExtensionState | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') throw new SyncError('invalid_local_state');
  const state = value as Partial<ExtensionState>;
  if (state.version !== 1 || typeof state.instanceId !== 'string' || state.instanceId.length > 128
    || !/^[a-zA-Z0-9-]+$/u.test(state.instanceId) || typeof state.dirty !== 'boolean') {
    throw new SyncError('invalid_local_state');
  }
  if (state.importing !== undefined && typeof state.importing !== 'boolean') throw new SyncError('invalid_local_state');
  if (state.pairing !== null && (state.pairing === undefined || typeof state.pairing !== 'object'
    || typeof state.pairing.sourceId !== 'string' || typeof state.pairing.credential !== 'string'
    || typeof state.pairing.label !== 'string' || state.pairing.label.length > 80)) {
    throw new SyncError('invalid_local_state');
  }
  if (state.receipt !== null && (state.receipt === undefined || typeof state.receipt !== 'object'
    || !Number.isSafeInteger(state.receipt.sequence) || typeof state.receipt.lastSyncedAt !== 'string'
    || !Number.isSafeInteger(state.receipt.bookmarkCount))) {
    throw new SyncError('invalid_local_state');
  }
  return structuredClone(state as ExtensionState);
}

export class ExtensionController {
  private state: ExtensionState | undefined;
  private initializing: Promise<void> | undefined;
  private running: Promise<void> | undefined;
  private writes: Promise<void> = Promise.resolve();
  private generation = 0;
  private importing = false;
  private importEvent: boolean | undefined;
  private importEpoch = 0;
  private pairingNow = false;
  private error: string | null = null;
  private preparationFailed = false;
  private readonly dependencies: ControllerDependencies;

  constructor(dependencies: ControllerDependencies) { this.dependencies = dependencies; }

  async resetPairing(): Promise<void> {
    await this.initialize();
    if (this.running !== undefined || this.pairingNow || this.importing) throw new SyncError('sync_in_progress');
    this.state = { version: 1, instanceId: this.dependencies.newId(), pairing: null, dirty: true, receipt: null };
    await this.persist();
    this.error = null;
    this.preparationFailed = false;
  }

  async start(): Promise<void> {
    await this.changed();
  }

  async status(): Promise<ExtensionStatus> {
    await this.initialize();
    const state = this.state!;
    return {
      paired: state.pairing !== null,
      label: state.pairing?.label ?? null,
      syncing: this.running !== undefined || this.pairingNow,
      dirty: state.dirty,
      importing: this.importing,
      lastSyncedAt: state.receipt?.lastSyncedAt ?? null,
      error: this.error,
    };
  }

  async pair(code: string, label?: string, selectionToken?: string): Promise<void> {
    await this.initialize();
    if (this.pairingNow || this.state!.pairing !== null) throw new SyncError('already_paired');
    if (typeof code !== 'string' || code.trim().length === 0 || code.length > 128
      || (label !== undefined && (typeof label !== 'string' || label.trim().length > 80))
      || (selectionToken !== undefined && !/^[a-f0-9]{64}$/u.test(selectionToken))) {
      throw new SyncError('invalid_pairing_input');
    }
    this.pairingNow = true;
    try {
      const pairing = await this.dependencies.pair(this.state!.instanceId, code.trim(), profileLabel(label), selectionToken);
      this.state!.pairing = pairing;
      this.state!.dirty = true;
      await this.persist();
    } catch (error) {
      this.error = error instanceof SyncError ? error.code : 'pairing_failed';
      this.preparationFailed = false;
      throw new SyncError(this.error);
    } finally {
      this.pairingNow = false;
    }
    await this.changed();
  }

  setImporting(importing: boolean): void {
    // Invalidate collection, but preserve receipts for a previously complete snapshot.
    this.importing = importing;
    this.importEvent = importing;
    this.importEpoch += 1;
    if (this.state) this.state.importing = importing;
    this.generation += 1;
  }

  async resumeAfterImport(): Promise<void> {
    await this.initialize();
    if (this.state!.pairing === null) throw new SyncError('not_paired');
    if (this.running !== undefined || this.pairingNow) throw new SyncError('sync_in_progress');
    if (!this.importing) throw new SyncError('import_not_pending');
    this.setImporting(false);
    await this.changed();
  }

  async changed(): Promise<void> {
    this.generation += 1;
    try {
      await this.initialize();
      this.state!.dirty = true;
      await this.persist();
    } catch (error) {
      if (this.state) this.state.dirty = true;
      this.error = error instanceof SyncError ? error.code : 'connection_unavailable';
      this.preparationFailed = true;
      await this.requestRetry();
      throw error;
    }
    if (this.preparationFailed && this.state!.pairing === null && !this.importing) {
      this.error = null;
      this.preparationFailed = false;
    }
    await this.run();
  }

  private initialize(): Promise<void> {
    this.initializing ??= (async () => {
      this.state ??= persistedState(await this.dependencies.load()) ?? {
        version: 1, instanceId: this.dependencies.newId(), pairing: null, dirty: true, receipt: null,
      };
      // A live begin/end event takes precedence over the asynchronously loaded checkpoint.
      this.importing = this.importEvent ?? this.state.importing ?? false;
      this.state.importing = this.importing;
      await this.persist();
    })().catch((error: unknown) => {
      this.initializing = undefined;
      throw error;
    });
    return this.initializing;
  }

  private persist(): Promise<void> {
    const state = structuredClone(this.state!);
    const write = () => this.dependencies.save(state);
    this.writes = this.writes.then(write, write);
    return this.writes;
  }

  private async run(): Promise<void> {
    if (this.importing) return;
    if (this.running !== undefined) return this.running;
    if (this.state!.pairing === null) return;
    this.running = this.synchronize();
    try {
      await this.running;
    } finally {
      this.running = undefined;
    }
    if (this.state!.dirty && this.error === null) await this.run();
  }

  private async synchronize(): Promise<void> {
    while (!this.importing && this.state!.dirty && this.state!.pairing !== null) {
      const generation = this.generation;
      const importEpoch = this.importEpoch;
      const assertSnapshotAllowed = (): void => {
        if (this.importing || this.importEpoch !== importEpoch) throw new SyncError('import_in_progress');
      };
      try {
        this.error = null;
        this.preparationFailed = false;
        const receipt = await this.dependencies.synchronize(this.state!.instanceId, this.state!.pairing, assertSnapshotAllowed);
        this.state!.receipt = receipt;
        this.state!.dirty = this.generation !== generation;
        await this.persist();
      } catch (error) {
        this.state!.dirty = true;
        this.error = error instanceof SyncError ? error.code : 'connection_unavailable';
        this.preparationFailed = false;
        try { await this.persist(); }
        finally { await this.requestRetry(); }
        return;
      }
    }
  }

  private async requestRetry(): Promise<void> {
    try { await this.dependencies.scheduleRetry(this.error ?? 'connection_unavailable'); }
    catch { /* Keep the failure state retryable by the next event if alarms are unavailable. */ }
  }
}
