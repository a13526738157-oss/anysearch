import './runtime-guard.ts';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
createRequire(import.meta.url)(join(root, 'dist/desktop/main.cjs'));
