import { isBuiltin, registerHooks } from 'node:module';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localPath, within } from './paths.ts';
import { fail } from './contracts.ts';

// Preloaded in desktop, utility processes and model workers; this is not a same-user security sandbox.
const root = localPath(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (isBuiltin(specifier) || (specifier === 'electron' && process.versions.electron)) {
      return nextResolve(specifier, context);
    }
    const result = nextResolve(specifier, context);
    if (!result.url.startsWith('file:')) fail('RELEASE_EXTERNAL_MODULE_REJECTED');
    const path = localPath(fileURLToPath(result.url));
    if (!isAbsolute(path) || !within(root, path)) fail('RELEASE_EXTERNAL_MODULE_REJECTED');
    return result;
  },
});
