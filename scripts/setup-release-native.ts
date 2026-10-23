import { createPortableNativeSetup } from '../src/adapters/native/portable-setup.ts';
import { parseArguments, printFailure, printResult } from '../src/distribution/cli.ts';

try {
  const { values, apply } = parseArguments(process.argv.slice(2),
    ['package-dir', 'extension-id', 'data-dir', 'output-dir', 'expected-previous-manifest', 'apply'],
    ['package-dir', 'extension-id', 'data-dir', 'output-dir']);
  printResult(createPortableNativeSetup({ packageDirectory: values.get('package-dir')!,
    extensionId: values.get('extension-id')!, dataDirectory: values.get('data-dir')!,
    outputDirectory: values.get('output-dir')!,
    ...(values.has('expected-previous-manifest') ? { expectedPreviousManifest: values.get('expected-previous-manifest')! } : {}), apply }));
} catch (error) { printFailure(error); }
