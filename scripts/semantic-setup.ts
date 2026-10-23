import { randomUUID } from 'node:crypto';
import { link, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultModelDirectory, matchesModelFile, modelFiles, modelRevision, validateModelDirectory } from '../src/retrieval/model-files.ts';
import { defaultRerankerDirectory, rerankerFiles, rerankerRepository, rerankerRevision } from '../src/retrieval/reranker-files.ts';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'model-dir': { type: 'string' }, mirror: { type: 'boolean', default: false },
    reranker: { type: 'boolean', default: false } },
    strict: true, allowPositionals: false });
  const directory = values['model-dir'] ?? (values.reranker ? defaultRerankerDirectory : defaultModelDirectory);
  const files = values.reranker ? rerankerFiles : modelFiles;
  const revision = values.reranker ? rerankerRevision : modelRevision;
  const repository = values.reranker ? rerankerRepository : 'Xenova/multilingual-e5-small';
  const origin = values.mirror ? 'https://hf-mirror.com' : 'https://huggingface.co';
  validateModelDirectory(directory);
  for (const file of files) {
    const destination = join(directory, file.path);
    try {
      if (!matchesModelFile(await readFile(destination), file)) throw new Error(`Existing model file differs: ${file.path}. Not overwritten.`);
      continue;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const response = await fetch(`${origin}/${repository}/resolve/${revision}/${file.path}`, {
      signal: AbortSignal.timeout(300_000), credentials: 'omit',
    });
    if (!response.ok || !response.body) throw new Error(`Model download failed: ${file.path}.`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > file.size) throw new Error(`Model size exceeded: ${file.path}.`);
      chunks.push(chunk);
    }
    const data = Buffer.concat(chunks);
    if (!matchesModelFile(data, file)) throw new Error(`Model integrity failed: ${file.path}.`);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.download`;
    await writeFile(temporary, data, { flag: 'wx' });
    try { await link(temporary, destination); }
    finally { await unlink(temporary); }
    process.stdout.write(`Installed ${file.path}\n`);
  }
  process.stdout.write(`Local model installed at ${directory}. Search never downloads models.\n`);
}

void main().catch((error: unknown) => {
  const cause = error instanceof Error && error.cause && typeof error.cause === 'object'
    ? (error.cause as { code?: unknown }).code : undefined;
  process.stderr.write(`${error instanceof Error ? error.message : 'Model installation failed.'}${typeof cause === 'string' ? ` (${cause})` : ''}\n`);
  process.exitCode = 1;
});
