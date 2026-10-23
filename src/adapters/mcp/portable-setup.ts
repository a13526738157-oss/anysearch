import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ContentLevel } from '../../core/contracts.ts';
import { readPackageContext } from '../../distribution/package-context.ts';
import { resolveSharedDataDirectory, requireCompatibleData } from '../../distribution/shared-data.ts';
import { existingDirectory, independent, localPath, pathKey, regularFile } from '../../distribution/paths.ts';
import { parseArguments } from '../../distribution/cli.ts';
import { connectionContentLevel, openConnection, readConnectionFile } from './connection.ts';
import { createPortableConfigPatch } from './portable-config.ts';

export interface PortableSetupOptions {
  packageDirectory: string;
  dataDirectory: string;
  connectionFile: string;
  configFile: string;
  outputDirectory: string;
  contentLevel: ContentLevel;
  apply: boolean;
}

export function parsePortableSetupArguments(args: string[]): PortableSetupOptions {
  const required = ['package-dir', 'data-dir', 'connection-file', 'config-file', 'output-dir'];
  const { values, apply } = parseArguments(args, [...required, 'content-level', 'apply'], required);
  const contentLevel = values.get('content-level') ?? 'metadata';
  if (contentLevel !== 'metadata' && contentLevel !== 'public_text') throw new Error('RELEASE_CODEX_CONTENT_LEVEL_INVALID');
  return { packageDirectory: values.get('package-dir')!, dataDirectory: values.get('data-dir')!,
    connectionFile: values.get('connection-file')!, configFile: values.get('config-file')!,
    outputDirectory: values.get('output-dir')!, contentLevel, apply };
}

export function preparePortableCodexSetup(options: PortableSetupOptions): object {
  const { root, node, manifest } = readPackageContext(options.packageDirectory);
  const data = resolveSharedDataDirectory(root, options.dataDirectory);
  requireCompatibleData(data, { mustExist: true });
  const connectionFile = regularFile(options.connectionFile);
  const configFile = regularFile(options.configFile);
  if (dirname(configFile) === configFile || !/^config\.toml$/u.test(configFile.split(/[\\/]/u).at(-1) ?? '')) {
    throw new Error('RELEASE_CODEX_CONFIG_PATH_INVALID');
  }
  const container = dirname(dirname(root));
  independent(container, connectionFile);
  independent(container, configFile);
  const output = localPath(options.outputDirectory);
  existingDirectory(dirname(output));
  independent(container, output);
  independent(data, output);
  independent(connectionFile, output);
  independent(configFile, output);
  if (existsSync(output)) throw new Error('RELEASE_CODEX_PLAN_DIRECTORY_EXISTS');
  const connection = readConnectionFile(connectionFile);
  if (connectionContentLevel(connection) !== options.contentLevel) throw new Error('RELEASE_CODEX_CONTENT_LEVEL_MISMATCH');
  if (pathKey(localPath(connection.databasePath)) !== pathKey(regularFile(join(data, 'index.sqlite')))) {
    throw new Error('RELEASE_CODEX_DATABASE_MISMATCH');
  }
  const opened = openConnection(connectionFile);
  try { opened.authorize(); } finally { opened.db.close(); }
  const bytes = readFileSync(configFile);
  if (bytes.length > 1024 * 1024) throw new Error('RELEASE_CODEX_CONFIG_TOO_LARGE');
  let original: string;
  try { original = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new Error('RELEASE_CODEX_CONFIG_INVALID'); }
  const patch = createPortableConfigPatch(original, { root, node, entry: regularFile(join(root, 'dist/release/mcp-entry.cjs')),
    connectionPath: connectionFile, contentLevel: options.contentLevel });
  const planPath = join(output, 'codex-plan.json');
  const plan = JSON.stringify({ version: 2, configPath: configFile, serverName: patch.serverName,
    operation: patch.operation, originalSha256: patch.originalSha256, resultSha256: patch.resultSha256,
    beforeText: patch.beforeText, afterText: patch.afterText }, null, 2) + '\n';
  if (Buffer.byteLength(plan) > 65_536) throw new Error('RELEASE_CODEX_PLAN_TOO_LARGE');
  if (options.apply) {
    mkdirSync(output, { mode: 0o700 });
    const descriptor = openSync(planPath, 'wx', 0o600);
    try {
      writeFileSync(descriptor, plan, 'utf8');
      fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
  }
  return { operation: options.apply ? 'codex-plan-created' : 'codex-setup-preview', version: manifest.version,
    change: patch.operation, serverName: patch.serverName, contentLevel: options.contentLevel,
    configPath: configFile, connectionPath: connectionFile, dataDirectory: data, planPath,
    server: patch.server, wrotePlan: options.apply, configurationChanged: false, grantOperation: 'none',
    userWideConfiguration: true, runtimeLoaded: false, acceptance: 'pending' };
}
