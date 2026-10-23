import { basename, dirname, join } from 'node:path';
import type { ReleaseManifest } from './contracts.ts';
import { fail } from './contracts.ts';
import { readManifest, verifyPayload } from './manifest.ts';
import { existingDirectory, regularFile } from './paths.ts';

export interface PackageContext {
  root: string;
  node: string;
  manifest: ReleaseManifest;
}

export function readPackageContext(packageDirectory: string): PackageContext {
  if (process.platform !== 'win32' || process.arch !== 'x64') fail('RELEASE_WINDOWS_X64_REQUIRED');
  const root = existingDirectory(packageDirectory);
  if (basename(root) !== 'payload') fail('RELEASE_PAYLOAD_DIRECTORY_REQUIRED');
  regularFile(join(dirname(root), 'READY.txt'));
  const manifest = readManifest(root);
  verifyPayload(root, manifest);
  return { root, node: regularFile(join(root, 'runtime/node/node.exe')), manifest };
}
