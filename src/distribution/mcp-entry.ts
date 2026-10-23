import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readConnectionFile } from '../adapters/mcp/connection.ts';
import { fail } from './contracts.ts';
import { pathKey, regularFile } from './paths.ts';
import { requireCompatibleData, resolveSharedDataDirectory } from './shared-data.ts';
import { prepareTransportRuntime } from './transport-runtime.ts';

try {
  const root = prepareTransportRuntime(import.meta.url);
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--connection' || !args[1]) fail('RELEASE_CONNECTION_ARGUMENTS_INVALID');
  const connection = readConnectionFile(regularFile(args[1]));
  const directory = resolveSharedDataDirectory(root, dirname(connection.databasePath));
  if (pathKey(connection.databasePath) !== pathKey(join(directory, 'index.sqlite'))) fail('RELEASE_CONNECTION_DATA_DIFFERS');
  requireCompatibleData(directory, { mustExist: true });
  createRequire(import.meta.url)(join(root, 'dist/mcp/main.cjs'));
} catch {
  process.stderr.write('AnySearch portable MCP startup failed: review the selected package and existing connection.\n');
  process.exitCode = 1;
}
