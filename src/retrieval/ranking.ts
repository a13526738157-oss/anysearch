import type { BookmarkRow } from '../core/evidence.ts';
import type { ContentLevel } from '../core/contracts.ts';

const segmenter = new Intl.Segmenter('zh', { granularity: 'word' });
function words(text: string): Set<string> {
  return new Set([...segmenter.segment(text.toLowerCase())].filter(part => part.isWordLike).map(part => part.segment));
}

export function lexicalSignal(row: BookmarkRow, level: ContentLevel, query: string): { eligible: boolean; boost: number } {
  const term = query.toLowerCase();
  const title = row.title.toLowerCase();
  const metadata = [row.title, ...(JSON.parse(row.folder_path) as string[]), row.url].join('\n').toLowerCase();
  const visible = level === 'public_text' ? `${metadata}\n${row.body.toLowerCase()}` : metadata;
  const terms = words(query);
  const all = words(visible);
  const titleWords = words(title);
  const coversAll = terms.size > 0 && [...terms].every(word => all.has(word));
  const titleCoverage = terms.size ? [...terms].filter(word => titleWords.has(word)).length / terms.size : 0;
  return {
    eligible: visible.includes(term) || coversAll,
    boost: title === term ? 2 : (title.includes(term) ? 0.4 : 0) + 0.15 * titleCoverage,
  };
}

export function normalizedVector(value: readonly number[], dimensions: number): number[] {
  if (value.length !== dimensions || !value.every(Number.isFinite)) throw new Error('INVALID_EMBEDDING');
  const norm = Math.hypot(...value);
  if (!Number.isFinite(norm) || norm <= 0) throw new Error('INVALID_EMBEDDING');
  return value.map(item => item / norm);
}

export function similarity(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index]!, 0);
}
