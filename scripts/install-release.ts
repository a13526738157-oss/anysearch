import { installRelease } from '../src/distribution/install.ts';
import { parseArguments, printFailure, printResult, toolRoot } from '../src/distribution/cli.ts';

try {
  const { values, apply } = parseArguments(process.argv.slice(2), ['package-dir', 'install-root', 'apply'], ['install-root']);
  printResult(installRelease({ packageDirectory: values.get('package-dir') ?? toolRoot(import.meta.url),
    installRoot: values.get('install-root')!, apply }));
} catch (error) { printFailure(error); }
