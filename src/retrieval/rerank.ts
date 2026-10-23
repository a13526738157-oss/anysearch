import type { SearchResult } from '../core/contracts.ts';
import { EmbeddingError } from './contracts.ts';
import type { RerankingProvider } from './contracts.ts';
import type { Passage } from './passages.ts';

export interface RankedCandidate {
  item: SearchResult;
  score: number;
  eligible: boolean;
  boost: number;
  passages: Array<Passage & { score: number }>;
}

const candidateLimit = 40;
const passageLimit = 3;
const relevanceFloor = 0.05;

export function orderCandidates(a: { item: SearchResult; score: number }, b: { item: SearchResult; score: number }): number {
  return b.score - a.score || a.item.title.localeCompare(b.item.title) || a.item.id.localeCompare(b.item.id);
}

export async function rerankCandidates(candidates: RankedCandidate[], query: string, provider: RerankingProvider,
  guard: () => void, deadline: number, signal?: AbortSignal): Promise<Array<{ item: SearchResult; score: number }>> {
  const term = query.toLowerCase();
  const selected = candidates.sort((a, b) => {
    const exactTitleOrder = Number(b.item.title.toLowerCase() === term) - Number(a.item.title.toLowerCase() === term);
    return exactTitleOrder || orderCandidates(a, b);
  }).slice(0, candidateLimit);
  const passages = selected.flatMap((candidate, index) => candidate.passages
    .sort((a, b) => b.score - a.score).slice(0, passageLimit).map(passage => ({ ...passage, index })));
  const best = new Map<number, { score: number; passage: Passage }>();
  for (let start = 0; start < passages.length; start += 16) {
    guard();
    if (Date.now() >= deadline) throw new EmbeddingError('timeout');
    const batch = passages.slice(start, start + 16);
    let scores: number[];
    try {
      scores = await provider.rank(query, batch.map(passage => passage.text), signal);
      if (scores.length !== batch.length || scores.some(score => !Number.isFinite(score) || score < 0 || score > 1)) {
        throw new EmbeddingError('model_failed');
      }
    } catch (error) {
      guard();
      throw error instanceof EmbeddingError ? error : new EmbeddingError('model_failed');
    }
    guard();
    for (const [index, score] of scores.entries()) {
      const passage = batch[index]!;
      if (score > (best.get(passage.index)?.score ?? -1)) best.set(passage.index, { score, passage });
    }
  }
  return selected.flatMap((candidate, index) => {
    const result = best.get(index);
    if (!result || (result.score < relevanceFloor && !candidate.eligible)) return [];
    const location = result.score >= relevanceFloor ? result.passage.location : undefined;
    return [{ item: { ...candidate.item, ...(location ? { semanticMatch: location } : {}) },
      score: result.score + candidate.boost }];
  }).sort(orderCandidates);
}
