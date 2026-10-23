import type { MatchLocation } from './contracts.ts';

function lineBreaks(text: string, start: number, end: number): number {
  let count = 0;
  for (let index = start; index < end; index++) {
    if (text[index] === '\r') {
      count++;
      if (index + 1 < end && text[index + 1] === '\n') index++;
    } else if (text[index] === '\n') count++;
  }
  return count;
}

export function locateLiteralMatch(text: string, query: string): MatchLocation | undefined {
  const term = query.trim().toLowerCase();
  if (!term) return undefined;
  const folded = text.toLowerCase();
  const start = folded.indexOf(term);
  if (start < 0) return undefined;
  // Count line breaks in the same folded string: Unicode lowercasing can change offsets.
  const lineStart = lineBreaks(folded, 0, start) + 1;
  return { lineStart, lineEnd: lineStart + lineBreaks(folded, start, start + term.length) };
}
