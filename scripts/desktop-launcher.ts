import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import { createStartupReceiptChannel, STARTUP_RECEIPT_ENV } from '../apps/desktop/startup-receipt.ts';
import type { StartupReceiptChannel, StartupReceiptStatus } from '../apps/desktop/startup-receipt.ts';

const STARTUP_TIMEOUT_MS = 30_000;
const RECEIPT_POLL_MS = 100;
const REQUIRED_DESKTOP_FILES = ['main.cjs', 'preload.cjs', 'worker.cjs', 'index.html', 'renderer.js', 'renderer.css'] as const;
const require = createRequire(import.meta.url);
const ELECTRON_EXECUTABLE_PATHS = new Set(['electron.exe', 'electron', 'Electron.app/Contents/MacOS/Electron']);

type StartupFailure = 'DESKTOP_BUILD_MISSING' | 'DESKTOP_DEPENDENCY_MISSING' | 'DESKTOP_SPAWN_FAILED'
  | 'DESKTOP_STARTUP_FAILED' | 'DESKTOP_STARTUP_TIMEOUT' | 'DESKTOP_EXITED_DURING_STARTUP'
  | 'DESKTOP_STARTUP_RECEIPT_INVALID' | 'DESKTOP_STARTUP_RECEIPT_UNAVAILABLE';

type LaunchResult = { ok: true; status: 'ready' | 'already-running' } | { ok: false; code: StartupFailure };

function requiredFilesExist(root: string): boolean {
  return REQUIRED_DESKTOP_FILES.every(file => {
    try { return statSync(join(root, 'dist/desktop', file)).isFile(); }
    catch { return false; }
  });
}

function waitForStartup(child: ChildProcess, channel: StartupReceiptChannel): Promise<LaunchResult> {
  return new Promise(resolve => {
    let settled = false;
    let lastReceipt: StartupReceiptStatus | undefined;
    const finish = (result: LaunchResult): void => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(deadline);
      child.removeListener('error', onError);
      child.removeListener('exit', onExit);
      resolve(result);
    };
    const readReceipt = (): boolean => {
      try { lastReceipt = channel.read(); return true; }
      catch { finish({ ok: false, code: 'DESKTOP_STARTUP_RECEIPT_INVALID' }); return false; }
    };
    const onError = (): void => { finish({ ok: false, code: 'DESKTOP_SPAWN_FAILED' }); };
    const onExit = (code: number | null): void => {
      if (!readReceipt()) return;
      if (code === 0 && lastReceipt === 'already-running') finish({ ok: true, status: 'already-running' });
      else finish({ ok: false, code: lastReceipt === 'error' ? 'DESKTOP_STARTUP_FAILED' : 'DESKTOP_EXITED_DURING_STARTUP' });
    };
    const poll = setInterval(() => {
      if (!readReceipt()) return;
      if (lastReceipt === 'error') finish({ ok: false, code: 'DESKTOP_STARTUP_FAILED' });
      else if (lastReceipt === 'ready') {
        if (child.exitCode !== null || child.signalCode !== null) finish({ ok: false, code: 'DESKTOP_EXITED_DURING_STARTUP' });
        else finish({ ok: true, status: 'ready' });
      }
      // A second instance must also exit successfully, rather than only write a receipt.
    }, RECEIPT_POLL_MS);
    const deadline = setTimeout(() => { finish({ ok: false, code: 'DESKTOP_STARTUP_TIMEOUT' }); }, STARTUP_TIMEOUT_MS);
    child.once('error', onError);
    child.once('exit', onExit);
  });
}

export async function launchDesktop(root: string): Promise<LaunchResult> {
  if (!requiredFilesExist(root)) return { ok: false, code: 'DESKTOP_BUILD_MISSING' };
  let executable: string;
  try {
    // Electron's module entry can download a missing runtime; inspect installed files without executing it.
    const packageDirectory = dirname(require.resolve('electron/package.json'));
    const relativeExecutable = readFileSync(join(packageDirectory, 'path.txt'), 'utf8');
    if (!ELECTRON_EXECUTABLE_PATHS.has(relativeExecutable)) throw new Error('ELECTRON_UNAVAILABLE');
    const runtimeDirectory = process.env.ELECTRON_OVERRIDE_DIST_PATH ?? join(packageDirectory, 'dist');
    if (!isAbsolute(runtimeDirectory)) throw new Error('ELECTRON_UNAVAILABLE');
    const candidate = join(runtimeDirectory, relativeExecutable);
    if (!statSync(candidate).isFile()) throw new Error('ELECTRON_UNAVAILABLE');
    executable = candidate;
  } catch { return { ok: false, code: 'DESKTOP_DEPENDENCY_MISSING' }; }

  let channel: StartupReceiptChannel;
  try { channel = createStartupReceiptChannel(); }
  catch { return { ok: false, code: 'DESKTOP_STARTUP_RECEIPT_UNAVAILABLE' }; }
  let child: ChildProcess | undefined;
  try {
    const env: NodeJS.ProcessEnv = { ...process.env, [STARTUP_RECEIPT_ENV]: channel.path };
    delete env.ELECTRON_RUN_AS_NODE;
    child = spawn(executable, [join(root, 'dist/desktop/main.cjs')], {
      cwd: root, env, windowsHide: true, stdio: 'ignore', detached: true,
    });
    return await waitForStartup(child, channel);
  } catch { return { ok: false, code: 'DESKTOP_SPAWN_FAILED' }; }
  finally {
    child?.unref();
    if (!channel.dispose()) process.stderr.write('DESKTOP_STARTUP_CLEANUP_INCOMPLETE: Startup temporary files were not fully removed.\n');
  }
}

export function printDesktopLaunchResult(result: LaunchResult): void {
  if (result.ok) {
    process.stdout.write(result.status === 'ready'
      ? 'DESKTOP_READY: Desktop initialization completed.\n'
      : 'DESKTOP_ALREADY_RUNNING: An existing instance was found; window activation and focus were not confirmed.\n');
    return;
  }
  const messages: Record<StartupFailure, string> = {
    DESKTOP_BUILD_MISSING: 'Required desktop build files are missing. Build explicitly with npm run build before launching.',
    DESKTOP_DEPENDENCY_MISSING: 'The local Electron runtime is unavailable. Review the local dependency setup before launching.',
    DESKTOP_SPAWN_FAILED: 'The desktop process could not be started.',
    DESKTOP_STARTUP_FAILED: 'Desktop initialization failed.',
    DESKTOP_STARTUP_TIMEOUT: 'No successful desktop startup receipt arrived within 30 seconds. The process may still be running.',
    DESKTOP_EXITED_DURING_STARTUP: 'The desktop process exited before a running instance could be confirmed.',
    DESKTOP_STARTUP_RECEIPT_INVALID: 'The desktop startup receipt was invalid; startup was not confirmed.',
    DESKTOP_STARTUP_RECEIPT_UNAVAILABLE: 'The local startup receipt channel could not be created.',
  };
  process.stderr.write(`${result.code}: ${messages[result.code]}\n`);
  process.exitCode = 1;
}
