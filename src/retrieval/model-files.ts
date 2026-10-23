import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbeddingError } from './contracts.ts';

export const modelRevision = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const modelId = `Xenova/multilingual-e5-small@${modelRevision}:q8`;
export const defaultModelDirectory = fileURLToPath(new URL('../../.models/multilingual-e5-small/', import.meta.url));
export interface ModelFile { path: string; size: number; hash: string; algorithm: 'git' | 'sha256' }
export const modelFiles = [
  { path: 'config.json', size: 658, hash: '4104f38273cc595fd9500fd243124e9f6cf383dc', algorithm: 'git' },
  { path: 'tokenizer_config.json', size: 443, hash: '059214673d9d6d2ee319411e2ffec8c024b816d5', algorithm: 'git' },
  { path: 'special_tokens_map.json', size: 167, hash: 'e0b1d18ecd0ae4ff1d47bd297d910c0cf83e504b', algorithm: 'git' },
  { path: 'tokenizer.json', size: 17082730, hash: '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39', algorithm: 'sha256' },
  { path: 'onnx/model_quantized.onnx', size: 118308185, hash: 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193', algorithm: 'sha256' },
] as const;

export function validateModelDirectory(directory: string): void {
  if (!isAbsolute(directory) || directory.startsWith('\\\\') || directory.startsWith('//') || /[\u0000-\u001f]/u.test(directory)) {
    throw new EmbeddingError('model_missing');
  }
}

export function matchesModelFile(data: Buffer, file: ModelFile): boolean {
  if (data.length !== file.size) return false;
  const hash = createHash(file.algorithm === 'git' ? 'sha1' : 'sha256');
  if (file.algorithm === 'git') hash.update(`blob ${data.length}\0`);
  return hash.update(data).digest('hex') === file.hash;
}

export async function verifyModelFiles(directory: string, files: readonly ModelFile[] = modelFiles): Promise<void> {
  validateModelDirectory(directory);
  for (const file of files) {
    const path = join(directory, file.path);
    try {
      if ((await stat(path)).size !== file.size || !matchesModelFile(await readFile(path), file)) throw new EmbeddingError('model_failed');
    } catch (error) {
      if (error instanceof EmbeddingError) throw error;
      throw new EmbeddingError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'model_missing' : 'model_failed');
    }
  }
}
