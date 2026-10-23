import { launchRelease } from '../src/distribution/launch.ts';
import { parseArguments, printFailure, printResult, toolRoot } from '../src/distribution/cli.ts';

async function main(): Promise<void> {
  const { values } = parseArguments(process.argv.slice(2), ['package-dir', 'data-dir'], ['data-dir']);
  printResult(await launchRelease(values.get('package-dir') ?? toolRoot(import.meta.url), values.get('data-dir')!));
}
void main().catch(printFailure);
