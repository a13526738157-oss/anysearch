import { lstatSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { requireValue, ServiceError } from '../core/errors.ts';

export function localAbsolutePath(path: string): string {
  requireValue(typeof path === 'string' && isAbsolute(path) && !/[\u0000-\u001f\u007f]/.test(path),
    'INVALID_CONNECTION', 'An absolute local path is required.');
  if (process.platform === 'win32') {
    requireValue(/^[A-Za-z]:[\\/]/.test(path) && !path.slice(2).includes(':'),
      'INVALID_CONNECTION', 'An absolute local path is required.');
  }
  return resolve(path);
}

function pathKey(path: string): string { return process.platform === 'win32' ? path.toLowerCase() : path; }

export function requireCanonicalPath(path: string, kind: 'file' | 'directory'): string {
  const resolved = localAbsolutePath(path);
  try {
    const info = lstatSync(resolved);
    requireValue(!info.isSymbolicLink() && (kind === 'file' ? info.isFile() && info.nlink === 1 : info.isDirectory())
      && pathKey(realpathSync.native(resolved)) === pathKey(resolved),
    'INVALID_CONNECTION', 'Expected a regular local connection path.');
    return resolved;
  } catch {
    throw new ServiceError('INVALID_CONNECTION', 'Expected a regular local connection path.');
  }
}
