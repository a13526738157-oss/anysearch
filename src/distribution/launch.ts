import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createStartupReceiptChannel, STARTUP_RECEIPT_ENV } from '../../apps/desktop/startup-receipt.ts';
import { fail } from './contracts.ts';
import { releaseEnvironment } from './environment.ts';
import { readPackageContext } from './package-context.ts';
import { existingDirectory, pathKey, regularFile } from './paths.ts';
import { requireCompatibleData, resolveSharedDataDirectory } from './shared-data.ts';
export async function launchRelease(packageDirectory: string, requestedDataDirectory: string): Promise<object> {
  if (process.platform !== 'win32' || process.arch !== 'x64') fail('RELEASE_WINDOWS_X64_REQUIRED');
  const { root, node, manifest } = readPackageContext(packageDirectory);
  const dataDirectory = resolveSharedDataDirectory(root, requestedDataDirectory);
  const environment = releaseEnvironment(root);
  if (pathKey(regularFile(process.execPath)) !== pathKey(node)) {
    const result = spawnSync(node, ['--no-global-search-paths', join(root, 'dist/release/launch.cjs'),
      '--data-dir', dataDirectory], { cwd: root, env: environment, windowsHide: true, stdio: 'inherit' });
    if (result.error || result.status !== 0) fail('RELEASE_BUNDLED_LAUNCH_FAILED');
    return { operation: 'launch-delegated', version: manifest.version };
  }
  if (process.versions.node !== manifest.runtime.node || process.versions.electron) fail('RELEASE_NODE_RUNTIME_DIFFERS');
  requireCompatibleData(dataDirectory);
  mkdirSync(dataDirectory, { recursive: true });
  existingDirectory(dataDirectory);
  const channel = createStartupReceiptChannel();
  const env = { ...environment, ANYSEARCH_DATA_DIR: dataDirectory, [STARTUP_RECEIPT_ENV]: channel.path,
    NODE_OPTIONS: `--require=${JSON.stringify(join(root, 'dist/release/runtime-guard.cjs'))}` };
  let child: ReturnType<typeof spawn> | undefined;
  try {
    const status = await new Promise<'ready' | 'already-running'>((accept, reject) => {
      let settled = false;
      const finish = (error?: string, result?: 'ready' | 'already-running'): void => {
        if (settled) return;
        settled = true;
        clearInterval(poll);
        clearTimeout(deadline);
        if (error) reject(new Error(error));
        else if (result) accept(result);
      };
      const receipt = (): ReturnType<typeof channel.read> => {
        try { return channel.read(); }
        catch { finish('RELEASE_STARTUP_RECEIPT_INVALID'); return undefined; }
      };
      const poll = setInterval(() => {
        const result = receipt();
        if (result === 'error') finish('RELEASE_DESKTOP_STARTUP_FAILED');
        if (result === 'ready') {
          if (child && child.exitCode === null && child.signalCode === null) finish(undefined, 'ready');
          else finish('RELEASE_DESKTOP_EXITED_DURING_STARTUP');
        }
      }, 100);
      const deadline = setTimeout(() => { finish('RELEASE_DESKTOP_STARTUP_TIMEOUT'); }, 30_000);
      try {
        child = spawn(join(root, 'runtime/electron/electron.exe'), [join(root, 'dist/release/desktop-entry.cjs')], {
          cwd: root, env, windowsHide: true, stdio: 'ignore', detached: true,
        });
        child.once('error', () => { finish('RELEASE_DESKTOP_SPAWN_FAILED'); });
        child.once('exit', code => {
          const result = receipt();
          if (code === 0 && result === 'already-running') finish(undefined, 'already-running');
          else finish('RELEASE_DESKTOP_EXITED_DURING_STARTUP');
        });
      } catch { finish('RELEASE_DESKTOP_SPAWN_FAILED'); }
    });
    return { operation: 'launch', version: manifest.version, status,
      focusDeliveryConfirmed: false, settingsChanged: false, dataRollback: false };
  } finally {
    child?.unref();
    if (!channel.dispose()) process.stderr.write('RELEASE_STARTUP_CLEANUP_INCOMPLETE\n');
  }
}
