import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { NATIVE_HOST_NAME } from '../../connectors/protocol.ts';
import { extensionIdSchema, type NativeConfiguration } from './configuration.ts';
import { registryKey, registryScript } from './registry-scripts.ts';

export interface NativeSetupOptions {
  extensionId: string;
  dataDirectory: string;
  outputDirectory: string;
}

function within(parent: string, target: string): boolean {
  const path = relative(parent, target);
  return path !== '' && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(path);
}

function requireScopedDirectory(path: string, scope: string): string {
  if (!isAbsolute(path)) throw new Error('Setup directories must be absolute paths.');
  const target = resolve(path);
  if (!within(scope, target)) throw new Error('Setup directories must be below this project .local directory.');
  let ancestor = target;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actual = resolve(realpathSync(ancestor), relative(ancestor, target));
  if (!within(scope, actual)) throw new Error('Setup directory resolves outside the project scope.');
  return target;
}

function cmdPath(path: string): string {
  if (/[&|<>^%!"()\r\n]/.test(path)) throw new Error('Unsupported launcher path characters.');
  return `"${path}"`;
}

export function createNativeSetup(options: NativeSetupOptions, projectDirectory: string): string[] {
  const extensionId = extensionIdSchema.parse(options.extensionId);
  const project = realpathSync(projectDirectory);
  const scope = join(project, '.local');
  const dataDirectory = requireScopedDirectory(options.dataDirectory, scope);
  const outputDirectory = requireScopedDirectory(options.outputDirectory, scope);
  if (dataDirectory === outputDirectory || within(dataDirectory, outputDirectory) || within(outputDirectory, dataDirectory)) {
    throw new Error('Data and host setup directories must be separate.');
  }
  const bundlePath = join(project, 'dist', 'native', 'main.cjs');
  if (!existsSync(bundlePath)) throw new Error('Build the native host before generating setup files.');
  const manifestPath = join(outputDirectory, `${NATIVE_HOST_NAME}.json`);
  const configurationPath = join(outputDirectory, 'native-config.json');
  const launcherPath = join(outputDirectory, 'anysearch-native.cmd');
  const configuration: NativeConfiguration = { version: 1, extensionId, dataDirectory };
  const files: Record<string, string> = {
    'native-config.json': JSON.stringify(configuration, null, 2) + '\n',
    'anysearch-native.cmd': `@echo off\r\n${cmdPath(process.execPath)} ${cmdPath(bundlePath)} --config ${cmdPath(configurationPath)} %*\r\n`,
    [`${NATIVE_HOST_NAME}.json`]: JSON.stringify({
      name: NATIVE_HOST_NAME,
      description: 'AnySearch read-only bookmark connector',
      path: launcherPath,
      type: 'stdio',
      allowed_origins: [`chrome-extension://${extensionId}/`],
    }, null, 2) + '\n',
    'registry-preview.json': JSON.stringify({ hive: 'HKEY_CURRENT_USER', view: 'Registry32', key: registryKey, defaultValue: manifestPath }, null, 2) + '\n',
    'install.ps1': registryScript(manifestPath, 'install'),
    'uninstall.ps1': registryScript(manifestPath, 'uninstall'),
    'README.txt': [
      'AnySearch native host setup preview',
      'Nothing has been registered or installed by this generator.',
      'Review the exact extension ID in the manifest and identify the intended Chrome profile before loading the extension.',
      'The same extension ID can exist in multiple profiles. A separate pairing credential is still required.',
      'Run install.ps1 without arguments to preview; only an explicitly approved install.ps1 -Apply writes the HKCU Registry32 key.',
      'The installer refuses a different existing registration. uninstall.ps1 -Apply removes only the matching key.',
      'No HKLM, Codex configuration, autostart, Chrome data, or source bookmarks are changed by these scripts.',
      'These project-local paths are development setup, not a production protected-storage or ACL guarantee.',
      'The native host requires an initialized index.sqlite in the data directory and refuses missing databases.',
      'A Node subprocess test is not proof that Chrome launched this .cmd host. Actual Chrome acceptance is separate.',
      '',
    ].join('\n'),
  };
  // Check every output before writing any file; never replace a different setup.
  for (const [name, content] of Object.entries(files)) {
    const path = join(outputDirectory, name);
    if (existsSync(path) && (realpathSync(path) !== path || readFileSync(path, 'utf8') !== content)) {
      throw new Error('A setup output already exists with different content or target.');
    }
  }
  mkdirSync(dataDirectory, { recursive: true });
  mkdirSync(outputDirectory, { recursive: true });
  requireScopedDirectory(dataDirectory, scope);
  requireScopedDirectory(outputDirectory, scope);
  for (const [name, content] of Object.entries(files)) {
    const path = join(outputDirectory, name);
    if (!existsSync(path)) writeFileSync(path, content, { encoding: 'utf8', flag: 'wx' });
  }
  return Object.keys(files).map((name) => join(outputDirectory, name));
}

export function parseSetupArguments(args: string[]): NativeSetupOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!name || !['--extension-id', '--data-dir', '--output-dir'].includes(name) || !value || values.has(name)) {
      throw new Error('Expected --extension-id, --data-dir, and --output-dir exactly once.');
    }
    values.set(name, value);
  }
  const extensionId = values.get('--extension-id');
  const dataDirectory = values.get('--data-dir');
  const outputDirectory = values.get('--output-dir');
  if (!extensionId || !dataDirectory || !outputDirectory) throw new Error('All setup options are required.');
  return { extensionId, dataDirectory, outputDirectory };
}
