import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { requireValue } from '../../src/core/errors.ts';

interface ChromeTarget { userDataDirectory: string; directoryName: string }

export function chromeProfileLaunchArguments(target: ChromeTarget): string[] {
  requireValue(isAbsolute(target.userDataDirectory) && !/[\u0000-\u001f]/.test(target.userDataDirectory)
    && target.directoryName.length > 0 && target.directoryName.length <= 128
    && !/[\\/\u0000-\u001f<>:"|?*]/.test(target.directoryName) && !/[. ]$/.test(target.directoryName)
    && !['Guest Profile', 'System Profile', '.', '..'].includes(target.directoryName),
  'INVALID_PROFILE', 'Invalid Chrome profile launch target.');
  // No pairing secret or caller-provided URL enters the browser command line.
  return [`--user-data-dir=${target.userDataDirectory}`, `--profile-directory=${target.directoryName}`, 'chrome://extensions/'];
}

export async function findChromeExecutable(environment: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  for (const base of [environment.LOCALAPPDATA, environment.ProgramFiles, environment['ProgramFiles(x86)']]) {
    if (!base || !isAbsolute(base)) continue;
    const candidate = join(base, 'Google', 'Chrome', 'Application', 'chrome.exe');
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* Try the next standard installation. */ }
  }
  return null;
}

export async function launchChromeProfile(target: ChromeTarget): Promise<void> {
  const args = chromeProfileLaunchArguments(target);
  const executable = await findChromeExecutable();
  requireValue(executable, 'CHROME_NOT_FOUND', 'Chrome was not found at a standard installation location.');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: 'ignore', detached: true });
    child.once('error', () => reject(new Error('CHROME_LAUNCH_FAILED')));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
