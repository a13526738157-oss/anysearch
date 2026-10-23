import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './contracts.ts';

export function toolRoot(moduleUrl: string): string {
  const directory = dirname(fileURLToPath(moduleUrl));
  return basename(directory) === 'release' && basename(dirname(directory)) === 'dist'
    ? resolve(directory, '../..') : resolve(directory, '..');
}
export function parseArguments(args: string[], names: readonly string[], required: readonly string[]): { values: Map<string, string>; apply: boolean } {
  const values = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument) fail('RELEASE_ARGUMENTS_INVALID');
    if (argument === '--apply') {
      if (apply || !names.includes('apply')) fail('RELEASE_ARGUMENTS_INVALID');
      apply = true;
      continue;
    }
    const separator = argument.indexOf('=');
    const name = (separator < 0 ? argument : argument.slice(0, separator)).replace(/^--/u, '');
    const value = separator < 0 ? args[++index] : argument.slice(separator + 1);
    if (!argument.startsWith('--') || name === 'apply' || !names.includes(name) || !value
      || value.startsWith('--') || values.has(name)) fail('RELEASE_ARGUMENTS_INVALID');
    values.set(name, value);
  }
  if (required.some(name => !values.has(name))) fail('RELEASE_REQUIRED_ARGUMENT_MISSING');
  return { values, apply };
}
export function printResult(value: object): void { process.stdout.write(JSON.stringify(value, null, 2) + '\n'); }
export function printFailure(error: unknown): void {
  const code = error instanceof Error && /^RELEASE_[A-Z0-9_]{1,100}$/u.test(error.message) ? error.message : 'RELEASE_OPERATION_FAILED';
  process.stderr.write(`${code}: No automatic download, data restore, connection migration or system setup is performed.\n`);
  process.exitCode = 1;
}
