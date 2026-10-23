import type { ContentLevel, MatchLocation } from '../core/contracts.ts';
import type { BookmarkRow } from '../core/evidence.ts';

export interface Passage { text: string; location?: MatchLocation }
const passageBytes = 384;
const overlapBytes = 64;
const titleBytes = 96;

function chunks(text: string, budget: number, overlap: number): Array<Passage & { location: MatchLocation }> {
  const points = Array.from(text.replace(/\r\n|\r/g, '\n'));
  const sizes = points.map(point => Buffer.byteLength(point));
  const lines: number[] = [];
  let line = 1;
  for (const point of points) { lines.push(line); if (point === '\n') line++; }
  const result: Array<Passage & { location: MatchLocation }> = [];
  for (let start = 0; start < points.length;) {
    let end = start;
    let size = 0;
    while (end < points.length && size + sizes[end]! <= budget) size += sizes[end++]!;
    result.push({ text: points.slice(start, end).join(''), location: {
      lineStart: lines[start]!, lineEnd: lines[end - 1]!,
    } });
    if (end === points.length) break;
    let next = end;
    let retained = 0;
    while (next > start + 1 && retained + sizes[next - 1]! <= overlap) retained += sizes[--next]!;
    start = next;
  }
  return result;
}

export function createPassages(row: BookmarkRow, level: ContentLevel): Passage[] {
  const folders = JSON.parse(row.folder_path) as string[];
  const metadata = [row.title, ...folders, row.url].join('\n');
  const result: Passage[] = chunks(metadata, passageBytes, overlapBytes).map(({ text }) => ({ text }));
  if (level === 'public_text' && row.body) {
    const title = chunks(row.title, titleBytes, 0)[0]?.text ?? '';
    for (const part of chunks(row.body, passageBytes, overlapBytes)) {
      result.push({ text: `${title}\n${part.text}`, location: part.location });
    }
  }
  return result;
}
