import type { DatabaseSync } from 'node:sqlite';
import type { ReadRequest, ReadResponse, SearchMode, SearchResponse, SearchResult } from '../core/contracts.ts';
import type { BookmarkRow } from '../core/evidence.ts';
import { summarize } from '../core/evidence.ts';
import { requireValue } from '../core/errors.ts';
import { sha256 } from '../core/hash.ts';
import { locateLiteralMatch } from '../core/match-location.ts';
import { AnySearchService } from '../core/service.ts';
import { bookmarkProjection } from '../storage/bookmark-projection.ts';
import { authorize } from '../storage/grants.ts';
import type { Grant } from '../storage/grants.ts';
import { EmbeddingError, MemoryVectorCache } from './contracts.ts';
import type { EmbeddingProvider, RerankingProvider, VectorCache } from './contracts.ts';
import { createPassages } from './passages.ts';
import { lexicalSignal, normalizedVector, similarity } from './ranking.ts';
import { orderCandidates, rerankCandidates } from './rerank.ts';
import type { RankedCandidate } from './rerank.ts';

const semanticFloor = 0.80;
const batchSize = 16;

export class RetrievalService {
  private readonly db: DatabaseSync;
  private readonly keyword: AnySearchService;
  private readonly embedder: EmbeddingProvider;
  private readonly cache: VectorCache;
  private readonly reranker: RerankingProvider | undefined;
  private readonly timeoutMs: number;

  constructor(db: DatabaseSync, options: { embedder: EmbeddingProvider; cache?: VectorCache; reranker?: RerankingProvider; timeoutMs?: number }) {
    this.db = db;
    this.keyword = new AnySearchService(db);
    this.embedder = options.embedder;
    this.cache = options.cache ?? new MemoryVectorCache();
    this.reranker = options.reranker;
    this.timeoutMs = options.timeoutMs ?? 60_000;
    requireValue(Number.isSafeInteger(this.timeoutMs) && this.timeoutMs >= 1 && this.timeoutMs <= 120_000,
      'INVALID_TIMEOUT', 'Invalid search timeout.');
  }

  read(capability: string, request: ReadRequest): ReadResponse { return this.keyword.read(capability, request); }
  authorize(capability: string): void { this.keyword.authorize(capability); }

  async search(capability: string, query: string, limit = 10, mode: SearchMode = 'hybrid', signal?: AbortSignal): Promise<SearchResponse> {
    requireValue(mode === 'keyword' || mode === 'hybrid', 'INVALID_MODE', 'Unknown search mode.');
    const fallback = this.keyword.search(capability, query, limit);
    if (mode === 'keyword' || !query.trim()) return fallback;
    const grant = authorize(this.db, capability);
    const rows = this.rows(grant);
    const fingerprint = this.fingerprint(rows, grant);
    const deadline = Date.now() + this.timeoutMs;
    const budget = new AbortController();
    const timer = setTimeout(() => budget.abort(), this.timeoutMs);
    timer.unref();
    const operationSignal = signal ? AbortSignal.any([signal, budget.signal]) : budget.signal;
    const guard = (): void => {
      requireValue(!signal?.aborted, 'SEARCH_CANCELLED', 'Search was cancelled.');
      const current = authorize(this.db, capability);
      requireValue(current.id === grant.id && current.sourceId === grant.sourceId && current.contentLevel === grant.contentLevel,
        'ACCESS_DENIED', 'The connection authorization changed.');
      requireValue(this.fingerprint(this.rows(grant), grant) === fingerprint, 'STALE_SEARCH', 'Content changed during search; retry.');
    };
    const term = query.trim();
    try {
      guard();
      const [queryVector] = await this.embed([term], 'query', operationSignal);
      guard();
      if (!rows.length) return fallback;
      const documents = rows.map(row => {
        const item = summarize(row, grant.contentLevel);
        return { row, item, passages: createPassages(row, grant.contentLevel).map(passage => ({ ...passage,
          key: sha256(JSON.stringify([this.embedder.id, this.embedder.dimensions, grant.sourceId,
            grant.contentLevel, row.id, item.snapshotId, passage.text])),
        })) };
      });
      const vectors = new Map<string, number[]>();
      const missing: Array<{ key: string; text: string }> = [];
      for (const document of documents) for (const passage of document.passages) {
        try {
          const cached = this.cache.get(passage.key);
          if (cached) vectors.set(passage.key, normalizedVector(cached, this.embedder.dimensions));
        } catch { /* A corrupt optimization must not become an authoritative result. */ }
        if (!vectors.has(passage.key)) missing.push(passage);
      }
      for (let start = 0; start < missing.length; start += batchSize) {
        guard();
        if (Date.now() >= deadline) throw new EmbeddingError('timeout');
        const batch = missing.slice(start, start + batchSize);
        const generated = await this.embed(batch.map(passage => passage.text), 'passage', operationSignal);
        guard();
        for (const [index, vector] of generated.entries()) {
          const key = batch[index]!.key;
          vectors.set(key, vector);
          try { this.cache.set(key, vector); } catch { /* Cache persistence is optional. */ }
        }
      }
      const ranked: RankedCandidate[] = [];
      for (const { row, item, passages } of documents) {
        let best = -1;
        let location: SearchResult['semanticMatch'];
        const scoredPassages = [];
        for (const passage of passages) {
          const score = similarity(queryVector!, vectors.get(passage.key)!);
          scoredPassages.push({ text: passage.text, ...(passage.location ? { location: passage.location } : {}), score });
          if (score > best) { best = score; location = passage.location; }
        }
        const lexical = lexicalSignal(row, grant.contentLevel, term);
        if (!this.reranker && best < semanticFloor && !lexical.eligible) continue;
        const match = grant.contentLevel === 'public_text' ? locateLiteralMatch(row.body, term) : undefined;
        ranked.push({ item: { ...item, ...(match ? { match } : {}),
          ...(!this.reranker && location && best >= semanticFloor ? { semanticMatch: location } : {}) },
        score: best + lexical.boost, eligible: lexical.eligible, boost: lexical.boost, passages: scoredPassages });
      }
      const results = this.reranker
        ? await rerankCandidates(ranked, term, this.reranker, guard, deadline, operationSignal) : ranked.sort(orderCandidates);
      guard();
      if (Date.now() >= deadline) throw new EmbeddingError('timeout');
      return { ...fallback, mode: 'hybrid', items: results.slice(0, limit).map(result => result.item), semantic: { status: 'ready' } };
    } catch (error) {
      if (!(error instanceof EmbeddingError)) throw error;
      guard();
      return { ...this.keyword.search(capability, query, limit),
        semantic: { status: 'unavailable', reason: budget.signal.aborted ? 'timeout' : error.reason } };
    } finally {
      clearTimeout(timer);
    }
  }

  private async embed(texts: readonly string[], kind: 'query' | 'passage', signal?: AbortSignal): Promise<number[][]> {
    try {
      const vectors = await this.embedder.embed(texts, kind, signal);
      if (vectors.length !== texts.length) throw new Error('INVALID_EMBEDDING_COUNT');
      return vectors.map(vector => normalizedVector(vector, this.embedder.dimensions));
    } catch (error) {
      if (error instanceof EmbeddingError) throw error;
      throw new EmbeddingError('model_failed');
    }
  }

  private rows(grant: Grant): BookmarkRow[] {
    return this.db.prepare(`SELECT ${bookmarkProjection(grant.contentLevel)} FROM bookmarks b WHERE source_id = ? ORDER BY id`)
      .all(grant.sourceId) as unknown as BookmarkRow[];
  }

  private fingerprint(rows: BookmarkRow[], grant: Grant): string {
    return sha256(JSON.stringify(rows.map(row => [row.id, summarize(row, grant.contentLevel).snapshotId])));
  }
}
