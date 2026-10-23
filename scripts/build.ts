import { build } from 'esbuild';
import type { Metafile } from 'esbuild';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
for (const folder of ['desktop', 'native', 'mcp', 'chrome-extension', 'release']) await mkdir(resolve(output, folder), { recursive: true });
const bundledPackageDirectories = new Set<string>();
function recordBundleInputs(metadata: Metafile | undefined): void {
  for (const input of Object.keys(metadata?.inputs ?? {})) {
    const normalized = input.replaceAll('\\', '/');
    const matches = [...normalized.matchAll(/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/]+/gu)];
    const match = matches.at(-1);
    if (match?.index !== undefined) bundledPackageDirectories.add(normalized.slice(0, match.index + match[0].length).replace(/^\//u, ''));
  }
}

for (const [entry, target] of [
  ['apps/desktop/main.ts', 'desktop/main.cjs'],
  ['apps/desktop/preload.ts', 'desktop/preload.cjs'],
  ['apps/desktop/worker.ts', 'desktop/worker.cjs'],
  ['src/adapters/native/main.ts', 'native/main.cjs'],
  ['src/adapters/mcp/main.ts', 'mcp/main.cjs'],
  ['src/retrieval/embedding-worker.ts', 'mcp/embedding-worker.cjs'],
  ['src/retrieval/embedding-worker.ts', 'desktop/embedding-worker.cjs'],
  ['src/retrieval/reranking-worker.ts', 'mcp/reranking-worker.cjs'],
  ['src/retrieval/reranking-worker.ts', 'desktop/reranking-worker.cjs'],
  ['scripts/package-release.ts', 'release/package.cjs'],
  ['scripts/install-release.ts', 'release/install.cjs'],
  ['scripts/launch-release.ts', 'release/launch.cjs'],
  ['scripts/setup-release-native.ts', 'release/native-setup.cjs'],
  ['scripts/setup-release-codex.ts', 'release/codex-setup.cjs'],
  ['src/distribution/runtime-guard.ts', 'release/runtime-guard.cjs'],
  ['src/distribution/desktop-entry.ts', 'release/desktop-entry.cjs'],
  ['src/distribution/native-entry.ts', 'release/native-entry.cjs'],
  ['src/distribution/mcp-entry.ts', 'release/mcp-entry.cjs'],
] as const) {
  const needsModuleUrl = entry === 'apps/desktop/worker.ts' || entry === 'src/adapters/mcp/main.ts'
    || entry.startsWith('src/retrieval/') || entry.startsWith('scripts/') || entry.startsWith('src/distribution/');
  const result = await build({ absWorkingDir: root, entryPoints: [entry], outfile: resolve(output, target),
    bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['electron', '@huggingface/transformers'],
    define: { 'import.meta.url': '__anysearchImportMetaUrl' },
    banner: needsModuleUrl ? { js: 'var __anysearchImportMetaUrl = require("node:url").pathToFileURL(__filename).href;' } : {},
    sourcemap: true, metafile: true });
  recordBundleInputs(result.metafile);
}
const renderer = await build({ absWorkingDir: root, entryPoints: ['apps/desktop/renderer/main.tsx'],
  outfile: resolve(output, 'desktop/renderer.js'), bundle: true, platform: 'browser', format: 'esm',
  target: 'chrome140', jsx: 'automatic', sourcemap: true, metafile: true, define: { 'process.env.NODE_ENV': '"production"' } });
recordBundleInputs(renderer.metafile);
for (const entry of ['worker', 'popup']) {
  const extension = await build({ absWorkingDir: root, entryPoints: [`apps/chrome-extension/${entry}.ts`],
    outfile: resolve(output, `chrome-extension/${entry}.js`), bundle: true, platform: 'browser',
    format: 'esm', target: 'chrome120', sourcemap: true, metafile: true });
  recordBundleInputs(extension.metafile);
}
await copyFile(resolve(root, 'apps/desktop/index.html'), resolve(output, 'desktop/index.html'));
await copyFile(resolve(root, 'native/windows-activation.cs'), resolve(output, 'desktop/windows-activation.cs'));
await copyFile(resolve(root, 'src/distribution/launch.cmd'), resolve(output, 'release/Launch.cmd'));
await copyFile(resolve(root, 'scripts/codex-repoint-install.ps1'), resolve(output, 'release/codex-repoint-install.ps1'));
for (const file of ['manifest.json', 'popup.html', 'popup.css']) {
  await copyFile(resolve(root, 'apps/chrome-extension', file), resolve(output, 'chrome-extension', file));
}
await writeFile(resolve(output, 'release/bundle-inputs.json'), JSON.stringify({ version: 1,
  packages: [...bundledPackageDirectories].sort() }, null, 2) + '\n');
process.stdout.write('Built desktop, native host, MCP server, Chrome extension and explicit portable tools in dist/. No package or installation was created.\n');
