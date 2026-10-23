import {
  closeSync, constants, fstatSync, lstatSync, mkdtempSync, openSync, readSync,
  realpathSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';

export const STARTUP_RECEIPT_ENV = 'ANYSEARCH_STARTUP_RECEIPT';
export type StartupReceiptStatus = 'ready' | 'already-running' | 'error';

const DIRECTORY_PREFIX = 'anysearch-desktop-startup-';
const DIRECTORY_NAME = /^anysearch-desktop-startup-[A-Za-z0-9]{6}$/u;
const RECEIPT_NAME = 'receipt';
const OWNER_NAME = 'owner';
const OWNER_CONTENT = 'AnySearch startup receipt v1\n';
const MAX_FILE_BYTES = 32;

export interface StartupReceiptChannel {
  readonly path: string;
  read(): StartupReceiptStatus | undefined;
  dispose(): boolean;
}

function samePath(left: string, right: string): boolean {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function readSmallFile(path: string): string {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || before.size > MAX_FILE_BYTES
    || !samePath(realpathSync(path), path)) throw new Error('STARTUP_RECEIPT_INVALID');
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.size > MAX_FILE_BYTES || !sameFile(before, opened)) {
      throw new Error('STARTUP_RECEIPT_INVALID');
    }
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytes > MAX_FILE_BYTES) throw new Error('STARTUP_RECEIPT_INVALID');
    return buffer.subarray(0, bytes).toString('utf8');
  } finally { closeSync(descriptor); }
}

function requireOwnedDirectory(directory: string): Stats {
  const temporaryRoot = realpathSync(tmpdir());
  const stat = lstatSync(directory);
  if (!samePath(dirname(directory), temporaryRoot) || !DIRECTORY_NAME.test(basename(directory))
    || !stat.isDirectory() || stat.isSymbolicLink() || !samePath(realpathSync(directory), directory)
    || readSmallFile(join(directory, OWNER_NAME)) !== OWNER_CONTENT) {
    throw new Error('STARTUP_RECEIPT_INVALID');
  }
  return stat;
}

function parseReceipt(content: string): StartupReceiptStatus | undefined {
  if (content === 'ready\n') return 'ready';
  if (content === 'already-running\n') return 'already-running';
  if (content === 'error\n') return 'error';
  // A file can be observed between its exclusive creation and the completed write.
  if (['ready\n', 'already-running\n', 'error\n'].some(receipt => receipt.startsWith(content))) return undefined;
  throw new Error('STARTUP_RECEIPT_INVALID');
}

export function createStartupReceiptChannel(): StartupReceiptChannel {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), DIRECTORY_PREFIX));
  const owner = join(directory, OWNER_NAME);
  const path = join(directory, RECEIPT_NAME);
  try { writeFileSync(owner, OWNER_CONTENT, { flag: 'wx', mode: 0o600 }); }
  catch {
    try { rmdirSync(directory); } catch { /* Never recursively remove an unexpected entry. */ }
    throw new Error('STARTUP_RECEIPT_UNAVAILABLE');
  }
  const directoryIdentity = lstatSync(directory);
  const ownerIdentity = lstatSync(owner);
  let disposed = false;

  function requireChannel(): void {
    if (disposed || !sameFile(directoryIdentity, requireOwnedDirectory(directory))
      || !sameFile(ownerIdentity, lstatSync(owner))) throw new Error('STARTUP_RECEIPT_INVALID');
  }

  function read(): StartupReceiptStatus | undefined {
    requireChannel();
    try { return parseReceipt(readSmallFile(path)); }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return undefined;
      throw new Error('STARTUP_RECEIPT_INVALID');
    }
  }

  return {
    path,
    read,
    dispose(): boolean {
      if (disposed) return true;
      try {
        requireChannel();
        const receipt = read();
        if (receipt !== undefined) unlinkSync(path);
        requireChannel();
        unlinkSync(owner);
        rmdirSync(directory);
        disposed = true;
        return true;
      } catch { return false; }
    },
  };
}

export function createStartupReporter(environment: NodeJS.ProcessEnv = process.env): {
  report(status: StartupReceiptStatus): boolean;
} {
  const target = environment[STARTUP_RECEIPT_ENV];
  let reported = false;
  return {
    report(status): boolean {
      if (!target || reported) return false;
      try {
        const path = resolve(target);
        if (!samePath(path, target) || basename(path) !== RECEIPT_NAME) return false;
        requireOwnedDirectory(dirname(path));
        writeFileSync(path, `${status}\n`, { flag: 'wx', mode: 0o600 });
        reported = true;
        return true;
      } catch { return false; }
    },
  };
}
