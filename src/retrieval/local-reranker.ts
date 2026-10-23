import { EmbeddingError } from './contracts.ts';
import type { RerankingProvider } from './contracts.ts';
import { rerankerId } from './reranker-files.ts';
import { ModelWorkerClient } from './worker-client.ts';

export class LocalRerankingProvider implements RerankingProvider {
  readonly id = rerankerId;
  private readonly client: ModelWorkerClient;

  constructor(directory: string, options: { timeoutMs?: number } = {}) {
    this.client = new ModelWorkerClient(directory, 'reranking-worker', options.timeoutMs);
  }

  async rank(query: string, texts: readonly string[], signal?: AbortSignal): Promise<number[]> {
    if (typeof query !== 'string' || Buffer.byteLength(query) > 4096 || !texts.length || texts.length > 32
      || texts.some(text => typeof text !== 'string' || Buffer.byteLength(text) > 4096)) throw new EmbeddingError('model_failed');
    const result = await this.client.request({ query, texts: [...texts] }, signal);
    if (!Array.isArray(result) || result.length !== texts.length
      || result.some(score => typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1)) {
      throw new EmbeddingError('model_failed');
    }
    return result as number[];
  }

  close(): Promise<void> { return this.client.close(); }
}
