import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { isAbsolute, join } from 'node:path';
import type { DesktopActivationStatus } from './activation-contracts.ts';

const STARTUP_TIMEOUT_MS = 15_000;
const COMMAND_TIMEOUT_MS = 1_500;
const GRACEFUL_EXIT_MS = 1_500;
const FORCED_EXIT_MS = 1_000;
const MAX_QUEUED_COMMANDS = 16;
const MAX_OUTPUT_LINE_BYTES = 32;
const MAX_OUTPUT_CHUNK_BYTES = 4_096;
const REPLIES = new Set(['ready', 'enabled', 'disabled', 'toggle', 'captured', 'capture-unavailable',
  'restored', 'restore-unavailable', 'closed', 'unavailable']);

// All executable text is constant; neither renderer values nor paths enter this script.
const BOOTSTRAP = "$ErrorActionPreference='Stop'; $WarningPreference='SilentlyContinue'; "
  + "$ProgressPreference='SilentlyContinue'; try { "
  + 'Add-Type -LiteralPath $env:ANYSEARCH_ACTIVATION_SOURCE -ErrorAction Stop; '
  + '[AnySearch.NativeActivation]::Run([int]$env:ANYSEARCH_ACTIVATION_PARENT_PID) '
  + "} catch { [Console]::Out.WriteLine('unavailable'); exit 1 }";

interface ActivationOptions {
  qaMode: boolean;
  onToggle: () => void;
  onStatusChange?: (status: DesktopActivationStatus) => void;
}

interface Helper {
  child: ChildProcessWithoutNullStreams;
  exited: boolean;
  stopping: boolean;
  exit: Promise<void>;
  termination: Promise<void> | undefined;
}

interface PendingReply {
  accepted: readonly string[];
  finish: (reply: string | undefined) => void;
  timer: NodeJS.Timeout;
}

export class WindowsActivationClient {
  private readonly options: ActivationOptions;
  private value: DesktopActivationStatus;
  private helper: Helper | undefined;
  private pending: PendingReply | undefined;
  private startPromise: Promise<DesktopActivationStatus> | undefined;
  private closePromise: Promise<void> | undefined;
  private operationQueue: Promise<void> = Promise.resolve();
  private queued = 0;
  private revision = 0;
  private requestedEnabled = false;
  private hookMayBeActive = false;
  private helperReady = false;
  private closed = false;
  private outputLine = '';

  constructor(options: ActivationOptions) {
    this.options = options;
    const supported = process.platform === 'win32' && !options.qaMode && process.env.ANYSEARCH_QA !== '1';
    this.value = { supported, service: supported ? 'starting' : 'unavailable', doubleShift: { enabled: false, state: 'disabled' },
      focusReturn: { state: supported ? 'starting' : 'unavailable' } };
  }

  status(): DesktopActivationStatus { return structuredClone(this.value); }

  start(): Promise<DesktopActivationStatus> {
    if (this.closed || !this.value.supported) return Promise.resolve(this.status());
    this.startPromise ??= this.startHelper();
    return this.startPromise;
  }

  setDoubleShiftEnabled(enabled: boolean): Promise<DesktopActivationStatus> {
    if (this.closed) return Promise.resolve(this.status());
    this.requestedEnabled = enabled;
    const revision = ++this.revision;
    this.publish({ ...this.value, doubleShift: { enabled,
      state: this.value.supported ? 'starting' : enabled ? 'unavailable' : 'disabled' } });
    return this.sequence(async () => {
      await this.start();
      if (revision !== this.revision || this.closed) return;
      if (!this.helperReady) { this.unavailable(); return; }
      const reply = await this.command(enabled ? 'enable' : 'disable', [enabled ? 'enabled' : 'disabled']);
      if (reply === 'disabled') this.hookMayBeActive = false;
      if (revision === this.revision && !this.closed && reply) {
        this.publish({ ...this.value, doubleShift: { enabled, state: enabled ? 'ready' : 'disabled' } });
      }
    }, undefined).then(() => this.status());
  }

  capture(): Promise<boolean> { return this.focusCommand('capture', 'captured', 'capture-unavailable'); }
  restore(): Promise<boolean> { return this.focusCommand('restore', 'restored', 'restore-unavailable'); }

  close(): Promise<void> {
    if (!this.closePromise) {
      this.closed = true;
      this.requestedEnabled = false;
      this.helperReady = false;
      this.settleReply(undefined);
      this.value = { ...this.value, service: 'unavailable', doubleShift: { enabled: false,
        state: this.hookMayBeActive ? 'unavailable' : 'disabled' },
        focusReturn: { state: 'unavailable' } };
      this.closePromise = (this.helper ? this.stopHelper(this.helper) : Promise.resolve()).then(() => {
        this.hookMayBeActive = false;
        this.value = { ...this.value, doubleShift: { enabled: false, state: 'disabled' } };
      });
    }
    return this.closePromise;
  }

  private async startHelper(): Promise<DesktopActivationStatus> {
    const systemRoot = process.env.SystemRoot;
    if (!systemRoot || !isAbsolute(systemRoot) || !/^[a-z]:[\\/]/iu.test(systemRoot)) {
      this.unavailable();
      return this.status();
    }
    try {
      const executable = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const child = spawn(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', BOOTSTRAP], {
        windowsHide: true, shell: false, stdio: 'pipe',
        env: { ...process.env, ANYSEARCH_ACTIVATION_SOURCE: join(__dirname, 'windows-activation.cs'),
          ANYSEARCH_ACTIVATION_PARENT_PID: String(process.pid) },
      });
      let finishExit: () => void = () => {};
      const helper: Helper = { child, exited: false, stopping: false,
        exit: new Promise<void>(resolve => { finishExit = resolve; }), termination: undefined };
      this.helper = helper;
      // Never forward compiler, system, or process error text to logs or the renderer.
      child.stderr.resume();
      child.stdout.on('data', (chunk: Buffer) => { this.receive(helper, chunk); });
      child.stdout.on('error', () => { this.fail(helper); });
      child.stdout.once('end', () => { if (!helper.stopping && !helper.exited) this.fail(helper); });
      child.stdout.once('close', () => { if (!helper.stopping && !helper.exited) this.fail(helper); });
      child.stderr.on('error', () => { this.fail(helper); });
      child.stdin.on('error', () => { this.fail(helper); });
      child.on('error', () => { this.fail(helper); });
      child.once('close', () => {
        helper.exited = true;
        finishExit();
        this.helperReady = false;
        this.hookMayBeActive = false;
        this.settleReply(undefined);
        if (!this.closed) this.unavailable();
      });
      const reply = await this.waitForReply(helper, ['ready'], STARTUP_TIMEOUT_MS);
      if (reply && !this.closed && !helper.exited && !helper.stopping) {
        this.helperReady = true;
        this.publish({ ...this.value, service: 'ready', focusReturn: { state: 'ready' } });
      }
    } catch {
      if (this.helper) this.fail(this.helper);
      else this.unavailable();
    }
    return this.status();
  }

  private focusCommand(command: 'capture' | 'restore', success: string, failure: string): Promise<boolean> {
    return this.sequence(async () => {
      await this.start();
      if (!this.helperReady || this.closed) return false;
      return await this.command(command, [success, failure]) === success;
    }, false);
  }

  private sequence<T>(operation: () => Promise<T>, fallback: T): Promise<T> {
    if (this.closed) return Promise.resolve(fallback);
    if (this.queued >= MAX_QUEUED_COMMANDS) {
      if (this.helper) this.fail(this.helper);
      else this.unavailable();
      return Promise.resolve(fallback);
    }
    this.queued++;
    const result = this.operationQueue.then(async () => {
      if (this.closed) return fallback;
      try { return await operation(); }
      catch { if (this.helper) this.fail(this.helper); return fallback; }
    });
    this.operationQueue = result.then(() => {}, () => {});
    return result.finally(() => { this.queued--; });
  }

  private command(command: 'enable' | 'disable' | 'capture' | 'restore', accepted: readonly string[]): Promise<string | undefined> {
    const helper = this.helper;
    if (this.closed || !this.helperReady || !helper || helper.stopping || helper.exited) return Promise.resolve(undefined);
    const response = this.waitForReply(helper, accepted, COMMAND_TIMEOUT_MS);
    if (command === 'enable') this.hookMayBeActive = true;
    try { helper.child.stdin.write(`${command}\n`); }
    catch { this.fail(helper); }
    return response;
  }

  private waitForReply(helper: Helper, accepted: readonly string[], timeoutMs: number): Promise<string | undefined> {
    return new Promise(resolve => {
      if (this.closed || helper.stopping || helper.exited || this.pending) { resolve(undefined); return; }
      const timer = setTimeout(() => { this.fail(helper); }, timeoutMs);
      this.pending = { accepted, finish: resolve, timer };
    });
  }

  private receive(helper: Helper, chunk: Buffer): void {
    if (this.closed || helper.stopping || helper !== this.helper) return;
    if (chunk.length > MAX_OUTPUT_CHUNK_BYTES) { this.fail(helper); return; }
    for (const byte of chunk) {
      if (this.closed || helper.stopping) return;
      if (byte === 10) {
        const reply = this.outputLine.replace(/\r$/u, '');
        this.outputLine = '';
        if (!REPLIES.has(reply) || reply === 'unavailable') { this.fail(helper); return; }
        if (reply === 'toggle') {
          if (this.requestedEnabled && this.value.doubleShift.state === 'ready') {
            try { this.options.onToggle(); } catch { /* Consumer errors must not expose input data. */ }
          }
        } else if (this.pending?.accepted.includes(reply)) this.settleReply(reply);
        else { this.fail(helper); return; }
      } else if (byte === 13 || byte === 45 || (byte >= 97 && byte <= 122)) {
        this.outputLine += String.fromCharCode(byte);
        if (this.outputLine.length > MAX_OUTPUT_LINE_BYTES) { this.fail(helper); return; }
      } else { this.fail(helper); return; }
    }
  }

  private settleReply(reply: string | undefined): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.finish(reply);
  }

  private fail(helper: Helper): void {
    this.helperReady = false;
    this.settleReply(undefined);
    if (!this.closed) this.unavailable();
    void this.stopHelper(helper).catch(() => {});
  }

  private unavailable(): void {
    if (this.closed) return;
    this.publish({ ...this.value, service: 'unavailable', doubleShift: { enabled: this.requestedEnabled,
      state: this.requestedEnabled || this.hookMayBeActive ? 'unavailable' : 'disabled' }, focusReturn: { state: 'unavailable' } });
  }

  private publish(value: DesktopActivationStatus): void {
    if (this.closed) return;
    this.value = value;
    try { this.options.onStatusChange?.(this.status()); } catch { /* Status callbacks are not native evidence. */ }
  }

  private stopHelper(helper: Helper): Promise<void> {
    if (!helper.termination) {
      helper.stopping = true;
      helper.termination = (async () => {
        if (helper.exited) return;
        try { helper.child.stdin.end('close\n'); } catch { /* EOF/parent exit also removes the hook. */ }
        if (await this.waitForExit(helper, GRACEFUL_EXIT_MS)) return;
        try { helper.child.kill(); } catch { /* Only this owned child is eligible for termination. */ }
        if (!await this.waitForExit(helper, FORCED_EXIT_MS)) throw new Error('ACTIVATION_EXIT_TIMEOUT');
      })();
    }
    return helper.termination;
  }

  private waitForExit(helper: Helper, timeoutMs: number): Promise<boolean> {
    if (helper.exited) return Promise.resolve(true);
    return new Promise(resolve => {
      const timer = setTimeout(() => { resolve(false); }, timeoutMs);
      void helper.exit.then(() => { clearTimeout(timer); resolve(true); });
    });
  }
}
