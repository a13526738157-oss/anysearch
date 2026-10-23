import { EmbeddingError } from './contracts.ts';
import type { EmbeddingProvider } from './contracts.ts';
import { modelId } from './model-files.ts';
import { normalizedVector } from './ranking.ts';
import { ModelWorkerClient } from './worker-client.ts';

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = modelId;
  readonly dimensions = 384;
  private readonly client: ModelWorkerClient;

  constructor(modelDirectory: string, options: { timeoutMs?: number } = {}) {
    this.client = new ModelWorkerClient(modelDirectory, 'embedding-worker', options.timeoutMs);
  }

  async embed(texts: readonly string[], kind: 'query' | 'passage', signal?: AbortSignal): Promise<number[][]> {
    if (!texts.length || texts.length > 32 || !['query', 'passage'].includes(kind)
      || texts.some(text => typeof text !== 'string' || Buffer.byteLength(text) > 4096)) throw new EmbeddingError('model_failed');
    const result = await this.client.request({ texts: [...texts], kind }, signal);
    try {
      if (!Array.isArray(result) || result.length !== texts.length) throw new Error('Invalid embedding count.');
      return result.map((vector: number[]) => normalizedVector(vector, this.dimensions));
    } catch { throw new EmbeddingError('model_failed'); }
  }

  close(): Promise<void> { return this.client.close(); }
}
