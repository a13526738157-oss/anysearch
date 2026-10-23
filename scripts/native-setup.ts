import { fileURLToPath } from 'node:url';
import { createNativeSetup, parseSetupArguments } from '../src/adapters/native/setup.ts';

try {
  const files = createNativeSetup(parseSetupArguments(process.argv.slice(2)), fileURLToPath(new URL('..', import.meta.url)));
  process.stdout.write(`Generated ${files.length} setup preview files. No installation or registry changes were performed.\n`);
} catch {
  process.stderr.write('Native setup generation failed. Verify the build, extension ID, and separate absolute project .local paths. Existing different files are not overwritten.\n');
  process.exitCode = 1;
}
