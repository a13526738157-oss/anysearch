import type { ContentLevel, ReadResponse, SearchResult } from './contracts.ts';
import { requireValue } from './errors.ts';
import { sha256 } from './hash.ts';

export interface BookmarkRow {
  id: string;
  source_id: string;
  title: string;
  url: string;
  folder_path: string;
  metadata: string;
  body: string;
}

export function visibleText(row: BookmarkRow, level: ContentLevel): string {
  return level === 'public_text' && row.body ? row.body : row.metadata;
}

export function summarize(row: BookmarkRow, level: ContentLevel): SearchResult {
  const contentLevel = level === 'public_text' && row.body ? 'public_text' : 'metadata';
  return {
    id: row.id, sourceId: row.source_id, title: row.title, url: row.url,
    folderPath: JSON.parse(row.folder_path) as string[], contentLevel,
    snapshotId: sha256(JSON.stringify([row.metadata, contentLevel, visibleText(row, level)])),
  };
}

export function readEvidence(row: BookmarkRow, level: ContentLevel, lineStart: number, maxLines: number): ReadResponse {
  const fullText = visibleText(row, level);
  const lines = fullText.split(/\r\n|\n|\r/);
  requireValue(lineStart <= lines.length, 'INVALID_RANGE', 'Line range is outside the captured content.');
  const selected: string[] = [];
  const charLimit = 12_000;
  let used = 0;
  for (const line of lines.slice(lineStart - 1, lineStart - 1 + maxLines)) {
    const cost = line.length + (selected.length ? 1 : 0);
    requireValue(selected.length || cost <= charLimit, 'LINE_TOO_LONG', 'This line exceeds the bounded excerpt size.');
    if (used + cost > charLimit) break;
    selected.push(line);
    used += cost;
  }
  const lineEnd = lineStart + selected.length - 1;
  return {
    ...summarize(row, level), text: selected.join('\n'), sha256: sha256(fullText),
    lineStart, lineEnd, truncated: lineStart > 1 || lineEnd < lines.length,
    untrustedContent: true, applicability: 'unknown',
  };
}
