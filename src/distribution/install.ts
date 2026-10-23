import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { InstallOptions } from './contracts.ts';
import { fail } from './contracts.ts';
import { writeNewVersion } from './files.ts';
import { readManifest, verifyPayload } from './manifest.ts';
import { deploymentPath, existingDirectory, independent, localPath, regularFile } from './paths.ts';

export function installRelease(options: InstallOptions): object {
  const source = existingDirectory(options.packageDirectory);
  if (basename(source) !== 'payload') fail('RELEASE_PAYLOAD_DIRECTORY_REQUIRED');
  regularFile(join(dirname(source), 'READY.txt'));
  const installRoot = existingDirectory(deploymentPath(options.installRoot));
  independent(source, installRoot);
  const manifest = readManifest(source);
  const target = localPath(join(installRoot, manifest.version));
  if (existsSync(target)) fail('RELEASE_TARGET_ALREADY_EXISTS');
  verifyPayload(source, manifest);
  if (!options.apply) return { operation: 'install-preview', apply: false, version: manifest.version,
    target, files: manifest.files.length, bytes: manifest.files.reduce((total, file) => total + file.size, 0),
    wroteFiles: false, userDataOperation: 'none', settingsChanged: false };
  const payloadDirectory = writeNewVersion(target, manifest.files.map(file => ({ source: join(source, file.path), path: file.path })),
    manifest.files, JSON.stringify(manifest, null, 2) + '\n');
  return { operation: 'install', version: manifest.version, payloadDirectory, userDataOperation: 'none',
    selectedCurrentVersion: false, settingsChanged: false, launched: false };
}
