import { createRelease } from '../src/distribution/package.ts';
import { parseArguments, printFailure, printResult, toolRoot } from '../src/distribution/cli.ts';

try {
  const { values, apply } = parseArguments(process.argv.slice(2), ['output-dir', 'licenses', 'apply'], ['output-dir', 'licenses']);
  printResult(createRelease({ projectDirectory: toolRoot(import.meta.url), outputDirectory: values.get('output-dir')!,
    licenseInputPath: values.get('licenses')!, apply }));
} catch (error) { printFailure(error); }
