export interface BookmarkInput {
  nodeId: string;
  title: string;
  url: string;
  folderPath: string[];
}

export interface BookmarkSnapshot {
  sourceId: string;
  sequence: number;
  bookmarks: BookmarkInput[];
}

export type ContentLevel = 'metadata' | 'public_text';

export interface MatchLocation {
  lineStart: number;
  lineEnd: number;
}

export interface SearchResult {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  folderPath: string[];
  snapshotId: string;
  contentLevel: ContentLevel;
  match?: MatchLocation;
  semanticMatch?: MatchLocation;
}

export type SearchMode = 'keyword' | 'hybrid';

export interface SearchResponse {
  mode: SearchMode;
  semantic?: { status: 'ready' | 'unavailable'; reason?: 'model_missing' | 'model_failed' | 'timeout' };
  items: SearchResult[];
  evidenceCompleteness: 'partial';
  untrustedContent: true;
}

export interface ReadResponse extends SearchResult {
  text: string;
  sha256: string;
  lineStart: number;
  lineEnd: number;
  truncated: boolean;
  untrustedContent: true;
  applicability: 'unknown';
}

export interface ReadRequest {
  id: string;
  snapshotId: string;
  lineStart?: number;
  maxLines?: number;
}

