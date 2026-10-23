import type { ContentLevel } from '../../core/contracts.ts';

export function contentAccessProfile(contentLevel: ContentLevel = 'metadata') {
  if (contentLevel === 'metadata') {
    return { contentLevel, connectionFileName: 'connection.json', serverName: 'anysearch' } as const;
  }
  if (contentLevel === 'public_text') {
    return { contentLevel, connectionFileName: 'public-text.json', serverName: 'anysearch_public_text' } as const;
  }
  throw new Error('INVALID_CONTENT_LEVEL');
}
