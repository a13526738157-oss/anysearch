import { closeSync, constants, copyFileSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { PayloadFile, SourceFile } from './contracts.ts';
import { fail, MANIFEST_NAME, record } from './contracts.ts';
import { existingDirectory, joinedFile, payloadPath, regularFile, within } from './paths.ts';

export function readJson(path: string, maxBytes = 8 * 1024 * 1024): Record<string, unknown> {
  const file = regularFile(path);
  if (lstatSync(file).size > maxBytes) fail('RELEASE_METADATA_TOO_LARGE');
  return record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file))));
}
export function fingerprint(path: string, algorithm: 'sha1' | 'sha256' = 'sha256', gitBlob = false): { size: number; hash: string } {
  const source = regularFile(path);
  const descriptor = openSync(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.nlink !== 1) fail('RELEASE_REGULAR_FILE_REQUIRED');
    const hash = createHash(algorithm);
    if (gitBlob) hash.update(`blob ${before.size}\0`);
    const buffer = Buffer.alloc(1024 * 1024);
    let size = 0;
    for (;;) {
      const bytes = readSync(descriptor, buffer, 0, buffer.length, null);
      if (!bytes) break;
      size += bytes;
      hash.update(buffer.subarray(0, bytes));
    }
    const after = fstatSync(descriptor);
    if (size !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('RELEASE_SOURCE_CHANGED');
    return { size, hash: hash.digest('hex') };
  } finally { closeSync(descriptor); }
}
export function describeFile(file: SourceFile): PayloadFile {
  const value = fingerprint(file.source);
  return { path: payloadPath(file.path), size: value.size, sha256: value.hash };
}
export function collectFiles(directory: string, targetPrefix: string, mode: 'runtime' | 'dependency'): SourceFile[] {
  const root = existingDirectory(directory);
  const files: SourceFile[] = [];
  const omitted = new Set(['node_modules', '.git', '.cache', 'test', 'tests', '__tests__', 'fixtures', 'examples', 'docs', 'doc']);
  const walk = (folder: string, prefix: string): void => {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const source = join(folder, entry.name);
      if (/^(?:\.local|vault|obsidian|logs|reports|verification)$/iu.test(entry.name)) fail('RELEASE_PRIVATE_FILE_REJECTED');
      if (entry.isSymbolicLink()) fail('RELEASE_INDIRECT_PATH_REJECTED');
      if (entry.isDirectory()) {
        if (mode === 'dependency' && (omitted.has(entry.name) || entry.name.startsWith('.'))) continue;
        walk(existingDirectory(source), `${prefix}/${entry.name}`);
      } else if (entry.isFile()) {
        if (mode === 'dependency' && (entry.name.endsWith('.map') || entry.name.startsWith('.'))) continue;
        if (/\.(?:sqlite(?:-wal|-shm)?|db|log|pem|key|env)$/iu.test(entry.name)
          || /^(?:connection|native-config|config\.toml|credentials?)(?:\.|$)/iu.test(entry.name)) {
          fail('RELEASE_PRIVATE_FILE_REJECTED');
        }
        files.push({ source: regularFile(source), path: payloadPath(`${prefix}/${entry.name}`) });
      } else fail('RELEASE_SPECIAL_FILE_REJECTED');
    }
  };
  walk(root, payloadPath(targetPrefix));
  return files;
}
export function requireUniqueFiles(files: readonly SourceFile[]): void {
  const seen = new Set<string>();
  for (const file of files) {
    const key = payloadPath(file.path).toLowerCase();
    if (seen.has(key) || key === MANIFEST_NAME.toLowerCase()) fail('RELEASE_DUPLICATE_PAYLOAD_PATH');
    seen.add(key);
  }
}
export function assertFileDescription(root: string, expected: PayloadFile): string {
  const source = joinedFile(root, expected.path);
  const actual = describeFile({ source, path: expected.path });
  if (actual.size !== expected.size || actual.sha256 !== expected.sha256) fail('RELEASE_PAYLOAD_INTEGRITY_FAILED');
  return source;
}

// The wrapper is exclusively reserved first. A partial wrapper is never reused or removed.
export function writeNewVersion(target: string, files: readonly SourceFile[], descriptions: readonly PayloadFile[], manifestText: string): string {
  if (files.length !== descriptions.length) fail('RELEASE_PLAN_INVALID');
  const parent = existingDirectory(dirname(target));
  if (!within(parent, target) || parent === target) fail('RELEASE_TARGET_INVALID');
  mkdirSync(target);
  const stage = join(target, `.staging-${randomUUID()}`);
  mkdirSync(stage);
  writeFileSync(join(target, 'INCOMPLETE.txt'), 'AnySearch incomplete version. Do not launch or reuse this directory.\n', { flag: 'wx' });
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const expected = descriptions[index];
    if (!file || !expected || file.path !== expected.path) fail('RELEASE_PLAN_INVALID');
    const destination = join(stage, payloadPath(file.path));
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(regularFile(file.source), destination, constants.COPYFILE_EXCL);
    assertFileDescription(stage, expected);
  }
  writeFileSync(join(stage, MANIFEST_NAME), manifestText, { encoding: 'utf8', flag: 'wx' });
  const payload = join(target, 'payload');
  renameSync(stage, payload);
  unlinkSync(join(target, 'INCOMPLETE.txt'));
  writeFileSync(join(target, 'READY.txt'), 'AnySearch version committed. payload/ is the executable program; no user data is included.\n', { flag: 'wx' });
  return payload;
}
