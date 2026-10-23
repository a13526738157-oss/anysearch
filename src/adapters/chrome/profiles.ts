import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import type {
  ChromeProfileCandidate,
  ChromeProfileDiscovery,
  ChromeProfileDiscoveryOptions,
  ResolvedChromeProfile,
} from './profile-contracts.ts';

export const CHROME_PROFILE_LIMITS = Object.freeze({
  maxLocalStateBytes: 8 * 1024 * 1024,
  maxProfiles: 256,
  maxDirectoryNameLength: 128,
  maxDisplayNameLength: 80,
});

interface ScanResult {
  state: ChromeProfileDiscovery['state'];
  profiles: ResolvedChromeProfile[];
}

function pathKey(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function safeDirectoryName(value: string): boolean {
  return value.length > 0 && value.length <= CHROME_PROFILE_LIMITS.maxDirectoryNameLength
    && value.trim() === value && !value.startsWith('.') && !value.endsWith('.')
    && !/[\u0000-\u001f\u007f/\\:*?"<>|]/u.test(value)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(value)
    && !/^(?:guest profile|system profile|__proto__|constructor|prototype)$/iu.test(value);
}

function displayName(value: Record<string, unknown>, fallback: string): string {
  const name = Object.hasOwn(value, 'name') ? value.name : undefined;
  const cleaned = typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f-\u009f]/gu, '').trim() : '';
  return (cleaned || fallback).slice(0, CHROME_PROFILE_LIMITS.maxDisplayNameLength).replace(/[\ud800-\udbff]$/u, '');
}

function sourceDirectory(options: ChromeProfileDiscoveryOptions): string | undefined {
  if (options.userDataDirectory !== undefined) {
    return isAbsolute(options.userDataDirectory) ? resolve(options.userDataDirectory) : undefined;
  }
  const localAppData = options.localAppData ?? process.env.LOCALAPPDATA;
  return localAppData && isAbsolute(localAppData)
    ? join(resolve(localAppData), 'Google', 'Chrome', 'User Data') : undefined;
}

async function readLocalState(root: string): Promise<unknown> {
  const statePath = join(root, 'Local State');
  const stateInfo = await lstat(statePath);
  if (!stateInfo.isFile() || stateInfo.isSymbolicLink() || stateInfo.nlink > 1
    || stateInfo.size > CHROME_PROFILE_LIMITS.maxLocalStateBytes) throw new Error('Invalid local state');
  const canonicalPath = await realpath(statePath);
  if (pathKey(canonicalPath) !== pathKey(statePath)) throw new Error('Invalid local state');

  const handle = await open(canonicalPath, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.ino !== stateInfo.ino || before.dev !== stateInfo.dev
      || before.size > CHROME_PROFILE_LIMITS.maxLocalStateBytes) throw new Error('Invalid local state');
    const buffer = Buffer.alloc(CHROME_PROFILE_LIMITS.maxLocalStateBytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, size);
      if (bytesRead === 0) break;
      size += bytesRead;
    }
    const after = await handle.stat();
    if (size > CHROME_PROFILE_LIMITS.maxLocalStateBytes || size !== before.size
      || before.size !== after.size || before.mtimeMs !== after.mtimeMs) throw new Error('Invalid local state');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, size))) as unknown;
  } finally {
    await handle.close();
  }
}

async function scan(options: ChromeProfileDiscoveryOptions): Promise<ScanResult> {
  const requestedRoot = sourceDirectory(options);
  if (!requestedRoot) return { state: 'unavailable', profiles: [] };
  try {
    const rootInfo = await lstat(requestedRoot);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) return { state: 'unavailable', profiles: [] };
    const root = await realpath(requestedRoot);
    const data = await readLocalState(root);
    if (!isRecord(data) || !Object.hasOwn(data, 'profile') || !isRecord(data.profile)
      || !Object.hasOwn(data.profile, 'info_cache') || !isRecord(data.profile.info_cache)) {
      return { state: 'unavailable', profiles: [] };
    }
    const entries = Object.entries(data.profile.info_cache);
    if (entries.length > CHROME_PROFILE_LIMITS.maxProfiles) return { state: 'unavailable', profiles: [] };
    const profiles: ResolvedChromeProfile[] = [];
    const seen = new Set<string>();
    for (const [directoryName, entry] of entries) {
      if (!safeDirectoryName(directoryName) || !isRecord(entry)) continue;
      const directoryKey = pathKey(directoryName);
      if (seen.has(directoryKey)) return { state: 'unavailable', profiles: [] };
      seen.add(directoryKey);
      const profilePath = join(root, directoryName);
      try {
        const profileInfo = await lstat(profilePath);
        if (!profileInfo.isDirectory() || profileInfo.isSymbolicLink()) continue;
        const profileDirectory = await realpath(profilePath);
        if (pathKey(dirname(profileDirectory)) !== pathKey(root)) continue;
        const id = createHash('sha256').update(JSON.stringify([pathKey(root), directoryKey])).digest('hex');
        profiles.push({ id, name: displayName(entry, directoryName), directoryName, userDataDirectory: root, profileDirectory });
      } catch (error) {
        if (!isRecord(error) || error.code !== 'ENOENT') throw error;
      }
    }
    profiles.sort((a, b) => a.directoryName < b.directoryName ? -1 : a.directoryName > b.directoryName ? 1 : 0);
    return { state: 'ready', profiles };
  } catch (error) {
    return { state: isRecord(error) && error.code === 'ENOENT' ? 'not-found' : 'unavailable', profiles: [] };
  }
}

export async function discoverChromeProfiles(options: ChromeProfileDiscoveryOptions = {}): Promise<ChromeProfileDiscovery> {
  const result = await scan(options);
  const profiles: ChromeProfileCandidate[] = result.profiles.map(({ id, name, directoryName }) => ({ id, name, directoryName }));
  return { state: result.state, profiles };
}

export async function resolveDiscoveredProfile(
  options: ChromeProfileDiscoveryOptions,
  id: string,
): Promise<ResolvedChromeProfile | null> {
  if (!/^[a-f0-9]{64}$/u.test(id)) return null;
  const result = await scan(options);
  return result.profiles.find((profile) => profile.id === id) ?? null;
}
