import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fail } from './contracts.ts';

export function pathKey(path: string): string { return process.platform === 'win32' ? path.toLowerCase() : path; }
export function within(parent: string, target: string): boolean {
  const path = relative(pathKey(parent), pathKey(target));
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('..\\') && !path.startsWith('../'));
}
export function independent(left: string, right: string): void {
  if (within(left, right) || within(right, left)) fail('RELEASE_DIRECTORIES_OVERLAP');
}
export function deploymentPath(value: string): string {
  const path = localPath(value);
  if (path.split(/[\\/]/u).some(part => /^(?:\.local|\.git|vault|obsidian|whb)$/iu.test(part))) {
    fail('RELEASE_PRIVATE_DEPLOYMENT_PATH_REJECTED');
  }
  return path;
}
export function localPath(value: string): string {
  if (!isAbsolute(value) || /[\u0000-\u001f\u007f]/u.test(value) || value.startsWith('\\\\') || value.startsWith('//')
    || (process.platform === 'win32' && (!/^[A-Za-z]:[\\/]/u.test(value) || value.slice(2).includes(':')))) {
    fail('RELEASE_LOCAL_ABSOLUTE_PATH_REQUIRED');
  }
  const path = resolve(value);
  let ancestor = path;
  while (!existsSync(ancestor)) {
    const parent = dirname(ancestor);
    if (parent === ancestor) fail('RELEASE_PATH_UNAVAILABLE');
    ancestor = parent;
  }
  if (lstatSync(ancestor).isSymbolicLink() || pathKey(realpathSync.native(ancestor)) !== pathKey(ancestor)) {
    fail('RELEASE_INDIRECT_PATH_REJECTED');
  }
  return path;
}
export function existingDirectory(value: string): string {
  const path = localPath(value);
  if (!lstatSync(path).isDirectory()) fail('RELEASE_DIRECTORY_REQUIRED');
  return path;
}
export function regularFile(value: string): string {
  const path = localPath(value);
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('RELEASE_REGULAR_FILE_REQUIRED');
  return path;
}
export function payloadPath(value: string): string {
  if (!value || value.length > 2048 || value.includes('\\') || value.includes(':') || value.startsWith('/')
    || /[\u0000-\u001f\u007f]/u.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/u.test(part))) {
    fail('RELEASE_PAYLOAD_PATH_INVALID');
  }
  return value;
}
export function joinedFile(root: string, path: string): string {
  const target = join(root, payloadPath(path));
  if (!within(root, target)) fail('RELEASE_PAYLOAD_PATH_INVALID');
  return regularFile(target);
}
