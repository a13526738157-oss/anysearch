import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fail } from './contracts.ts';
import { releaseEnvironment } from './environment.ts';
import { readPackageContext } from './package-context.ts';
import { pathKey, regularFile } from './paths.ts';

export function prepareTransportRuntime(moduleUrl: string): string {
  const context = readPackageContext(resolve(dirname(fileURLToPath(moduleUrl)), '../..'));
  if (process.versions.electron || process.versions.node !== context.manifest.runtime.node
    || pathKey(regularFile(process.execPath)) !== pathKey(context.node)) fail('RELEASE_NODE_RUNTIME_DIFFERS');
  const environment = releaseEnvironment(context.root);
  const guard = regularFile(join(context.root, 'dist/release/runtime-guard.cjs'));
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, environment);
  process.env.NODE_OPTIONS = `--require=${JSON.stringify(guard)}`;
  createRequire(moduleUrl)(guard);
  return context.root;
}
