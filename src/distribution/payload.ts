import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { modelFiles, modelId, modelRevision } from '../retrieval/model-files.ts';
import { rerankerFiles, rerankerId, rerankerRepository, rerankerRevision } from '../retrieval/reranker-files.ts';
import type { ModelFile } from '../retrieval/model-files.ts';
import type { ReleaseManifest, SourceFile } from './contracts.ts';
import { DATA_APPLICATION_ID, DATA_SCHEMA_VERSION, fail, record, releaseVersion } from './contracts.ts';
import { bundledPackages, lockedPackage, runtimeDependencies } from './dependencies.ts';
import { collectFiles, fingerprint, readJson, requireUniqueFiles } from './files.ts';
import { NoticeCollector, readLicenseInputs } from './licenses.ts';
import { deploymentPath, existingDirectory, independent, regularFile } from './paths.ts';

export const PROGRAM_FILES = [
  'dist/desktop/main.cjs', 'dist/desktop/preload.cjs', 'dist/desktop/worker.cjs',
  'dist/desktop/embedding-worker.cjs', 'dist/desktop/reranking-worker.cjs',
  'dist/desktop/index.html', 'dist/desktop/renderer.js', 'dist/desktop/renderer.css',
  'dist/desktop/windows-activation.cs',
  'dist/native/main.cjs', 'dist/mcp/main.cjs', 'dist/mcp/embedding-worker.cjs', 'dist/mcp/reranking-worker.cjs',
  'dist/chrome-extension/manifest.json', 'dist/chrome-extension/worker.js',
  'dist/chrome-extension/popup.js', 'dist/chrome-extension/popup.html', 'dist/chrome-extension/popup.css',
  'dist/release/package.cjs', 'dist/release/install.cjs', 'dist/release/launch.cjs',
  'dist/release/native-setup.cjs', 'dist/release/codex-setup.cjs',
  'dist/release/native-entry.cjs', 'dist/release/mcp-entry.cjs',
  'dist/release/codex-repoint-install.ps1',
  'dist/release/runtime-guard.cjs', 'dist/release/desktop-entry.cjs', 'dist/release/bundle-inputs.json',
  'Launch.cmd',
] as const;
export const PROJECT_LICENSE_FILE = 'LICENSE';
export const EMBEDDING_DIRECTORY = '.models/multilingual-e5-small';
export const RERANKER_DIRECTORY = '.models/bge-reranker-v2-m3';

function requireWindowsRuntime(): void {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (process.platform !== 'win32' || process.arch !== 'x64' || major !== 24 || minor === undefined || minor < 18
    || process.versions.electron) fail('RELEASE_REQUIRES_WINDOWS_X64_NODE_24_18');
}
function modelSources(project: string, directory: string, expected: readonly ModelFile[]): SourceFile[] {
  return expected.map(file => {
    const path = `${directory}/${file.path}`;
    let source: string;
    try { source = regularFile(join(project, path)); }
    catch { return fail('RELEASE_MODEL_ASSET_MISSING'); }
    const content = fingerprint(source, file.algorithm === 'git' ? 'sha1' : 'sha256', file.algorithm === 'git');
    if (content.size !== file.size || content.hash !== file.hash) fail('RELEASE_MODEL_ASSET_INVALID');
    return { source, path };
  });
}
export function packagePayload(projectDirectory: string, outputDirectory: string, licenseInputPath: string): {
  files: SourceFile[]; metadata: Omit<ReleaseManifest, 'files'>; target: string;
} {
  requireWindowsRuntime();
  const project = existingDirectory(projectDirectory);
  const target = deploymentPath(outputDirectory);
  existingDirectory(join(target, '..'));
  independent(project, target);
  if (existsSync(target)) fail('RELEASE_TARGET_ALREADY_EXISTS');
  let programFiles: SourceFile[];
  try {
    programFiles = PROGRAM_FILES.map(path => ({ source: regularFile(join(project,
      path === 'Launch.cmd' ? 'dist/release/Launch.cmd' : path)), path }));
  } catch { return fail('RELEASE_BUILD_ASSET_MISSING'); }
  const packageJson = readJson(join(project, 'package.json'));
  const lock = readJson(join(project, 'package-lock.json'));
  if (lock.lockfileVersion !== 3 || packageJson.name !== 'anysearch') fail('RELEASE_PROJECT_INVALID');
  const packages = record(lock.packages);
  const version = releaseVersion(packageJson.version);
  const lockRoot = record(packages['']);
  if (lockRoot.version !== version) fail('RELEASE_PACKAGE_LOCK_DIFFERS');
  const runtime = runtimeDependencies(project, packages);
  const electron = lockedPackage(project, 'node_modules/electron', record(packages['node_modules/electron']));
  if (record(packageJson.devDependencies).electron !== electron.version
    || record(packageJson.dependencies)['@huggingface/transformers'] !== runtime.packages.find(item => item.name === '@huggingface/transformers')?.version) {
    fail('RELEASE_RUNTIME_LOCK_DIFFERS');
  }
  const electronDirectory = existingDirectory(join(project, 'node_modules/electron/dist'));
  if (readFileSync(regularFile(join(electronDirectory, 'version')), 'utf8').trim() !== electron.version) {
    fail('RELEASE_ELECTRON_VERSION_DIFFERS');
  }
  const electronFiles = collectFiles(electronDirectory, 'runtime/electron', 'runtime');
  for (const required of ['electron.exe', 'LICENSE', 'LICENSES.chromium.html', 'icudtl.dat', 'resources/default_app.asar']) {
    regularFile(join(electronDirectory, required));
  }
  const notices = new NoticeCollector(readLicenseInputs(licenseInputPath));
  notices.explicit('runtime:node', 'Node.js', process.versions.node);
  notices.explicit('model:embedding', 'Xenova/multilingual-e5-small', modelRevision);
  notices.explicit('model:reranker', rerankerRepository, rerankerRevision);
  for (const dependency of [...runtime.packages, ...bundledPackages(project, packages)]) notices.package(project, dependency);
  notices.package(project, electron);
  const files: SourceFile[] = [
    ...programFiles,
    { source: regularFile(join(project, PROJECT_LICENSE_FILE)), path: PROJECT_LICENSE_FILE },
    { source: regularFile(process.execPath), path: 'runtime/node/node.exe' },
    ...electronFiles, ...runtime.files,
    ...modelSources(project, EMBEDDING_DIRECTORY, modelFiles),
    ...modelSources(project, RERANKER_DIRECTORY, rerankerFiles), ...notices.files,
  ];
  requireUniqueFiles(files);
  return { files, target, metadata: {
    format: 1, product: 'AnySearch', version, platform: 'win32', arch: 'x64', payload: 'full',
    data: { applicationId: DATA_APPLICATION_ID, schemaVersion: DATA_SCHEMA_VERSION, rollback: 'program-only' },
    runtime: { node: process.versions.node, electron: electron.version, dependencies: runtime.packages.map(item => item.directory) },
    models: { embedding: modelId, reranker: rerankerId }, notices: notices.notices,
  } };
}
