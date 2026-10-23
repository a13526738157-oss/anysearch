import { join } from 'node:path';
import type { ComponentNotice, PayloadFile, ReleaseManifest } from './contracts.ts';
import { DATA_APPLICATION_ID, DATA_SCHEMA_VERSION, fail, MANIFEST_NAME, record, releaseVersion, stringArray, textValue } from './contracts.ts';
import { assertFileDescription, collectFiles, readJson } from './files.ts';
import { existingDirectory, payloadPath } from './paths.ts';
import { EMBEDDING_DIRECTORY, PROGRAM_FILES, PROJECT_LICENSE_FILE, RERANKER_DIRECTORY } from './payload.ts';
import { modelFiles, modelId } from '../retrieval/model-files.ts';
import { rerankerFiles, rerankerId } from '../retrieval/reranker-files.ts';

function readNotice(value: unknown): ComponentNotice {
  const notice = record(value);
  if (notice.provenance !== 'installed-package' && notice.provenance !== 'explicit-input') fail('RELEASE_MANIFEST_INVALID');
  const files = stringArray(notice.files).map(payloadPath);
  if (!files.length || files.some(file => !file.startsWith('licenses/'))) fail('RELEASE_MANIFEST_INVALID');
  return { id: textValue(notice.id), name: textValue(notice.name), version: textValue(notice.version),
    license: textValue(notice.license), source: textValue(notice.source), files, provenance: notice.provenance };
}
export function readManifest(packageDirectory: string): ReleaseManifest {
  const root = existingDirectory(packageDirectory);
  const value = readJson(join(root, MANIFEST_NAME), 32 * 1024 * 1024);
  if (value.format !== 1 || value.product !== 'AnySearch' || value.platform !== 'win32' || value.arch !== 'x64'
    || value.payload !== 'full' || !Array.isArray(value.files) || value.files.length > 100_000
    || !Array.isArray(value.notices) || value.notices.length > 1000) fail('RELEASE_MANIFEST_INVALID');
  const data = record(value.data);
  const runtime = record(value.runtime);
  const models = record(value.models);
  if (data.applicationId !== DATA_APPLICATION_ID || data.schemaVersion !== DATA_SCHEMA_VERSION || data.rollback !== 'program-only'
    || models.embedding !== modelId || models.reranker !== rerankerId) fail('RELEASE_MANIFEST_INCOMPATIBLE');
  const files: PayloadFile[] = value.files.map(item => {
    const file = record(item);
    const path = payloadPath(textValue(file.path));
    if ((path !== 'Launch.cmd' && path !== PROJECT_LICENSE_FILE && !/^(?:dist|runtime|node_modules|licenses|\.models)\//u.test(path))
      || (path.startsWith('dist/') && !(PROGRAM_FILES as readonly string[]).includes(path))
      || path.split('/').some(part => /^(?:\.local|vault|obsidian|whb|tests?|verification|logs|reports)$/iu.test(part))
      || !Number.isSafeInteger(file.size) || Number(file.size) < 0
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(file.sha256)) fail('RELEASE_MANIFEST_INVALID');
    return { path, size: Number(file.size), sha256: file.sha256 };
  });
  const paths = new Set(files.map(file => file.path.toLowerCase()));
  if (paths.size !== files.length) fail('RELEASE_DUPLICATE_PAYLOAD_PATH');
  const dependencies = stringArray(runtime.dependencies).map(payloadPath);
  if (!dependencies.includes('node_modules/@huggingface/transformers')
    || dependencies.some(directory => !directory.startsWith('node_modules/'))) fail('RELEASE_MANIFEST_INVALID');
  const notices = value.notices.map(readNotice);
  const noticeIds = new Set(notices.map(notice => notice.id));
  for (const id of ['runtime:node', 'model:embedding', 'model:reranker']) {
    if (!noticeIds.has(id)) fail('RELEASE_MANIFEST_LICENSE_MISSING');
  }
  const required = [
    ...PROGRAM_FILES, PROJECT_LICENSE_FILE, 'runtime/node/node.exe', 'runtime/electron/electron.exe',
    'runtime/electron/LICENSE', 'runtime/electron/LICENSES.chromium.html',
    ...dependencies.map(directory => `${directory}/package.json`),
    ...modelFiles.map(file => `${EMBEDDING_DIRECTORY}/${file.path}`),
    ...rerankerFiles.map(file => `${RERANKER_DIRECTORY}/${file.path}`),
    ...notices.flatMap(notice => notice.files),
  ];
  if (required.some(file => !paths.has(file.toLowerCase()))) fail('RELEASE_MANIFEST_ASSET_MISSING');
  return { format: 1, product: 'AnySearch', version: releaseVersion(value.version), platform: 'win32', arch: 'x64', payload: 'full',
    data: { applicationId: DATA_APPLICATION_ID, schemaVersion: DATA_SCHEMA_VERSION, rollback: 'program-only' },
    runtime: { node: textValue(runtime.node), electron: textValue(runtime.electron), dependencies },
    models: { embedding: modelId, reranker: rerankerId }, notices, files };
}
export function verifyPayload(root: string, manifest: ReleaseManifest): void {
  const expected = new Set(manifest.files.map(file => file.path.toLowerCase()));
  const found = collectFiles(root, 'payload', 'runtime');
  if (found.length !== expected.size + 1 || found.some(file => {
    const relative = file.path.slice('payload/'.length);
    return relative !== MANIFEST_NAME && !expected.has(relative.toLowerCase());
  })) fail('RELEASE_UNLISTED_PAYLOAD_FILES');
  for (const file of manifest.files) assertFileDescription(root, file);
}
