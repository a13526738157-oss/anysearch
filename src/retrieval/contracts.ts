export interface EmbeddingProvider {
  readonly id: string;
  readonly dimensions: number;
  embed(texts: readonly string[], kind: 'query' | 'passage', signal?: AbortSignal): Promise<number[][]>;
}
export interface RerankingProvider {
  readonly id: string;
  rank(query: string, texts: readonly string[], signal?: AbortSignal): Promise<number[]>;
}

export interface VectorCache {
  get(key: string): number[] | undefined;
  set(key: string, value: readonly number[]): void;
}

export class EmbeddingError extends Error {
  readonly reason: 'model_missing' | 'model_failed' | 'timeout';
  constructor(reason: EmbeddingError['reason']) {
    super(reason);
    this.name = 'EmbeddingError';
    this.reason = reason;
  }
}

export class MemoryVectorCache implements VectorCache {
  private readonly entries = new Map<string, number[]>();
  get(key: string): number[] | undefined { return this.entries.get(key)?.slice(); }
  set(key: string, value: readonly number[]): void {
    if (this.entries.size >= 20_000 && !this.entries.has(key)) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, [...value]);
  }
}
