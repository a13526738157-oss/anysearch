import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fail } from '../../distribution/contracts.ts';
import { readPackageContext } from '../../distribution/package-context.ts';
import { existingDirectory, independent, localPath, pathKey, regularFile } from '../../distribution/paths.ts';
import { requireCompatibleData, resolveSharedDataDirectory } from '../../distribution/shared-data.ts';
import { NATIVE_HOST_NAME } from '../../connectors/protocol.ts';
import { extensionIdSchema, type NativeConfiguration } from './configuration.ts';
import { portableRegistryScript } from './portable-registry.ts';
import { registryKey } from './registry-scripts.ts';

export interface PortableNativeSetupOptions {
  packageDirectory: string;
  extensionId: string;
  dataDirectory: string;
  outputDirectory: string;
  expectedPreviousManifest?: string;
  apply: boolean;
}

function cmdPath(path: string): string {
  if (/[&|<>^%!"()\r\n]/u.test(path)) fail('RELEASE_NATIVE_LAUNCHER_PATH_INVALID');
  return `"${path}"`;
}

export function createPortableNativeSetup(options: PortableNativeSetupOptions): object {
  if (process.platform !== 'win32' || process.arch !== 'x64') fail('RELEASE_WINDOWS_X64_REQUIRED');
  const parsedExtension = extensionIdSchema.safeParse(options.extensionId);
  if (!parsedExtension.success) fail('RELEASE_EXTENSION_ID_INVALID');
  const { root, node, manifest } = readPackageContext(options.packageDirectory);
  const dataDirectory = resolveSharedDataDirectory(root, options.dataDirectory);
  requireCompatibleData(dataDirectory, { mustExist: true });
  const outputDirectory = localPath(options.outputDirectory);
  existingDirectory(dirname(outputDirectory));
  independent(dirname(dirname(root)), outputDirectory);
  independent(dataDirectory, outputDirectory);
  if (existsSync(outputDirectory)) fail('RELEASE_NATIVE_SETUP_TARGET_EXISTS');
  const previousManifest = options.expectedPreviousManifest === undefined
    ? undefined : localPath(options.expectedPreviousManifest);
  const configurationPath = join(outputDirectory, 'native-config.json');
  const manifestPath = join(outputDirectory, `${NATIVE_HOST_NAME}.json`);
  if (previousManifest && pathKey(previousManifest) === pathKey(manifestPath)) fail('RELEASE_NATIVE_PREVIOUS_MANIFEST_INVALID');
  const launcherPath = join(outputDirectory, 'anysearch-native.cmd');
  const entry = regularFile(join(root, 'dist/release/native-entry.cjs'));
  const configuration: NativeConfiguration = { version: 1, extensionId: parsedExtension.data, dataDirectory };
  const files: Record<string, string> = {
    'native-config.json': JSON.stringify(configuration, null, 2) + '\n',
    'anysearch-native.cmd': ['@echo off', 'setlocal', 'set "NODE_OPTIONS="', 'set "NODE_PATH="',
      `${cmdPath(node)} --no-global-search-paths ${cmdPath(entry)} --config ${cmdPath(configurationPath)} %*`,
      'exit /b %errorlevel%', ''].join('\r\n'),
    [`${NATIVE_HOST_NAME}.json`]: JSON.stringify({ name: NATIVE_HOST_NAME,
      description: 'AnySearch read-only bookmark connector', path: launcherPath, type: 'stdio',
      allowed_origins: [`chrome-extension://${parsedExtension.data}/`] }, null, 2) + '\n',
    'registry-preview.json': JSON.stringify({ hive: 'HKEY_CURRENT_USER', view: 'Registry32', key: registryKey,
      defaultValue: manifestPath, expectedPreviousManifest: previousManifest ?? null }, null, 2) + '\n',
    'install.ps1': portableRegistryScript(manifestPath, previousManifest, 'install'),
    'uninstall.ps1': portableRegistryScript(manifestPath, previousManifest, 'uninstall'),
    'rollback.ps1': portableRegistryScript(manifestPath, previousManifest, 'rollback'),
    'README.txt': [
      'AnySearch portable Native Messaging setup',
      'Generation never registers a host, launches a program, installs an extension, or modifies source bookmarks.',
      'Review the exact extension origin, bundled Node and entry, existing data directory, manifest, and previous registration.',
      'The same extension ID can exist in multiple profiles; it does not prove profile identity or replace the existing pairing credential.',
      'The existing application/schema-v4 database is reused. No database, pairing credential, source binding, grant or Codex configuration is copied or reissued.',
      'Each PowerShell script previews without arguments. An explicitly reviewed -Apply is a separate system setup action.',
      'install.ps1 accepts only an absent registration when no previous manifest was supplied, or the exact explicit previous value.',
      'uninstall.ps1 removes only this matching registration. rollback.ps1 requires the explicit previous path and this matching current registration.',
      'Rollback changes only the program registration path, never data, pairing or grants. Review the previous program availability separately.',
      'Only the HKCU Registry32 NativeMessagingHosts key is used. No HKLM, elevation, autostart, Chrome profile or Codex settings are changed.',
      'A named mutex coordinates these scripts. Existing-value changes are re-read before and after writes; this is not an atomic registry compare-and-swap or a same-user security sandbox.',
      'The files contain no capability secret. They do not establish protected-storage or special ACL guarantees; another process under the same user can alter them.',
      'The generated setup directory is never overwritten or automatically cleaned up, including after a partial failure.',
      'An interrupted new registration may leave a newly created empty key; review it separately rather than forcing an overwrite or deletion.',
      'Actual Windows Chrome Native Messaging acceptance remains pending; source generation or a Node child process is not that evidence.',
      '',
    ].join('\n'),
  };
  const result = { operation: options.apply ? 'native-setup' : 'native-setup-preview', apply: options.apply,
    version: manifest.version, outputDirectory, manifestPath, expectedPreviousManifest: previousManifest ?? null,
    files: Object.keys(files), wroteFiles: options.apply, registered: false, dataOperation: 'reuse-existing-only',
    pairingChanged: false, grantsChanged: false, settingsChanged: false };
  if (!options.apply) return result;
  mkdirSync(outputDirectory);
  existingDirectory(outputDirectory);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(outputDirectory, name), content, { encoding: 'utf8', flag: 'wx' });
  }
  return result;
}
