import { createRequire } from 'node:module';
import { join } from 'node:path';
import { parseNativeArguments, readNativeConfiguration, requireNativeOrigin } from '../adapters/native/configuration.ts';
import { regularFile } from './paths.ts';
import { requireCompatibleData, resolveSharedDataDirectory } from './shared-data.ts';
import { prepareTransportRuntime } from './transport-runtime.ts';

try {
  const root = prepareTransportRuntime(import.meta.url);
  const { configurationPath, origin } = parseNativeArguments(process.argv.slice(2));
  const configuration = readNativeConfiguration(regularFile(configurationPath));
  requireNativeOrigin(origin, configuration.extensionId);
  const directory = resolveSharedDataDirectory(root, configuration.dataDirectory);
  requireCompatibleData(directory, { mustExist: true });
  createRequire(import.meta.url)(join(root, 'dist/native/main.cjs'));
} catch {
  process.stderr.write('AnySearch portable native host failed: review the selected package and local setup.\n');
  process.exitCode = 1;
}
