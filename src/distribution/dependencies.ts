import { join, posix } from 'node:path';
import type { SourceFile } from './contracts.ts';
import { fail, record, textValue } from './contracts.ts';
import { collectFiles, readJson } from './files.ts';
import { existingDirectory, payloadPath } from './paths.ts';

export interface LockedPackage { directory: string; name: string; version: string; license?: string; source: string }
interface LockEntry extends Record<string, unknown> { version?: unknown }

function dependencyNames(value: unknown): string[] {
  if (value === undefined) return [];
  const dependencies = record(value);
  for (const [name, range] of Object.entries(dependencies)) {
    if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/iu.test(name)) fail('RELEASE_DEPENDENCY_NAME_INVALID');
    textValue(range);
  }
  return Object.keys(dependencies);
}
function compatible(value: unknown, target: string): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) fail('RELEASE_LOCK_INVALID');
  const list = value as string[];
  return !list.includes(`!${target}`) && (!list.some(item => !item.startsWith('!')) || list.includes(target));
}
function resolveDependency(packages: Record<string, unknown>, from: string, name: string): string | undefined {
  let parent = from;
  for (;;) {
    const candidate = parent ? `${parent}/node_modules/${name}` : `node_modules/${name}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    if (!parent) return undefined;
    const previous = parent.lastIndexOf('/node_modules/');
    parent = previous < 0 ? '' : parent.slice(0, previous);
  }
}
function sameDependencies(actual: unknown, locked: unknown): void {
  const left = actual === undefined ? {} : record(actual);
  const right = locked === undefined ? {} : record(locked);
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length || keys.some(key => left[key] !== right[key])) {
    fail('RELEASE_INSTALLED_DEPENDENCIES_DIFFER');
  }
}
export function lockedPackage(project: string, directory: string, entry: LockEntry): LockedPackage {
  payloadPath(directory);
  if (!directory.startsWith('node_modules/') || entry.link === true || typeof entry.integrity !== 'string'
    || !entry.integrity.startsWith('sha512-')) fail('RELEASE_LOCKED_PACKAGE_REQUIRED');
  const installed = readJson(join(project, directory, 'package.json'));
  const version = textValue(entry.version);
  if (installed.version !== version) fail('RELEASE_INSTALLED_VERSION_DIFFERS');
  sameDependencies(installed.dependencies, entry.dependencies);
  sameDependencies(installed.optionalDependencies, entry.optionalDependencies);
  sameDependencies(installed.peerDependencies, entry.peerDependencies);
  const name = textValue(installed.name);
  const expectedName = directory.slice(directory.lastIndexOf('node_modules/') + 'node_modules/'.length);
  if (name !== expectedName) fail('RELEASE_INSTALLED_PACKAGE_DIFFERS');
  return { directory, name, version, source: textValue(entry.resolved),
    ...(typeof entry.license === 'string' ? { license: entry.license } : {}) };
}
export function runtimeDependencies(project: string, packages: Record<string, unknown>): {
  packages: LockedPackage[]; files: SourceFile[];
} {
  const selected = new Map<string, LockedPackage>();
  const visit = (directory: string): void => {
    if (selected.has(directory)) return;
    const entry = record(packages[directory]);
    if (!compatible(entry.os, 'win32') || !compatible(entry.cpu, 'x64')) fail('RELEASE_RUNTIME_PLATFORM_MISMATCH');
    selected.set(directory, lockedPackage(project, directory, entry));
    const optional = new Set(dependencyNames(entry.optionalDependencies));
    const peerOptional = entry.peerDependenciesMeta === undefined ? {} : record(entry.peerDependenciesMeta);
    const names = new Set([...dependencyNames(entry.dependencies), ...optional, ...dependencyNames(entry.peerDependencies)]);
    for (const name of names) {
      const resolved = resolveDependency(packages, directory, name);
      const optionalPeer = peerOptional[name] !== undefined && record(peerOptional[name]).optional === true;
      if (optionalPeer && !optional.has(name) && !dependencyNames(entry.dependencies).includes(name)) continue;
      if (!resolved) {
        if (optionalPeer && !optional.has(name)) continue;
        fail('RELEASE_RUNTIME_DEPENDENCY_MISSING');
      }
      const child = record(packages[resolved]);
      if (optional.has(name) && (!compatible(child.os, 'win32') || !compatible(child.cpu, 'x64'))) continue;
      visit(resolved);
    }
  };
  visit('node_modules/@huggingface/transformers');
  const result = [...selected.values()].sort((left, right) => left.directory.localeCompare(right.directory));
  const files = result.flatMap(item => collectFiles(existingDirectory(join(project, item.directory)), item.directory, 'dependency'));
  for (const suffix of [
    'onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime_binding.node',
    'onnxruntime-node/bin/napi-v6/win32/x64/onnxruntime.dll',
  ]) {
    if (!files.some(file => file.path.endsWith(`/node_modules/${suffix}`) || file.path === `node_modules/${suffix}`)) {
      fail('RELEASE_NATIVE_RUNTIME_ASSET_MISSING');
    }
  }
  if (!files.some(file => /@img\/sharp-win32-x64\/lib\/sharp-win32-x64(?:-[0-9.]+)?\.node$/iu.test(file.path))) {
    fail('RELEASE_NATIVE_RUNTIME_ASSET_MISSING');
  }
  // Preserve complete selected native package trees, including DLLs and license subdirectories.
  if (!files.some(file => /@img\/sharp-win32-x64\/lib\/.*\.dll$/iu.test(file.path))) {
    fail('RELEASE_NATIVE_RUNTIME_ASSET_MISSING');
  }
  return { packages: result, files };
}
export function bundledPackages(project: string, packages: Record<string, unknown>): LockedPackage[] {
  const metadata = readJson(join(project, 'dist/release/bundle-inputs.json'));
  if (metadata.version !== 1 || !Array.isArray(metadata.packages)) fail('RELEASE_BUNDLE_INPUTS_MISSING');
  return metadata.packages.map(value => {
    const directory = payloadPath(textValue(value));
    if (posix.normalize(directory) !== directory) fail('RELEASE_BUNDLE_INPUTS_INVALID');
    return lockedPackage(project, directory, record(packages[directory]));
  });
}
