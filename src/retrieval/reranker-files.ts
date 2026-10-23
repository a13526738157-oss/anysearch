import { fileURLToPath } from 'node:url';
import type { ModelFile } from './model-files.ts';

export const rerankerRepository = 'onnx-community/bge-reranker-v2-m3-ONNX';
export const rerankerRevision = '6f5ff65298512715a1e669753bc754d2bc8f367b';
export const rerankerId = `${rerankerRepository}@${rerankerRevision}:q8`;
export const defaultRerankerDirectory = fileURLToPath(new URL('../../.models/bge-reranker-v2-m3/', import.meta.url));
export const rerankerFiles: readonly ModelFile[] = [
  { path: 'config.json', size: 848, hash: '3eae9b124f6d5bc1aa368cc9ce7c4d5dfc151f5f', algorithm: 'git' },
  { path: 'tokenizer_config.json', size: 1203, hash: '95bd7c849ee6a47d5c92805af18d187239c1ba4a', algorithm: 'git' },
  { path: 'special_tokens_map.json', size: 964, hash: 'b1879d702821e753ffe4245048eee415d54a9385', algorithm: 'git' },
  { path: 'tokenizer.json', size: 17082900, hash: '8bf8afbfd11306bd872018c53bfdf2e160a56f8edbcf49933324404791c148d3', algorithm: 'sha256' },
  { path: 'onnx/model_quantized.onnx', size: 570727094, hash: '912fc1215c2dbff6499700534bd8d31253af01573861abbfc43afd1fab6cce5d', algorithm: 'sha256' },
];
