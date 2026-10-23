import type { SearchResult } from '../core/contracts.ts';

export interface CaptureStatus {
  id: string;
  state: 'not_captured' | 'running' | 'captured' | 'failed';
  hasReadableText: boolean;
  item: SearchResult;
  errorCode?: string;
}

export interface PublicTextOptions {
  signal: AbortSignal;
  assertCurrent(): void;
}

export type PublicTextFetcher = (url: string, options: PublicTextOptions) => Promise<string>;
