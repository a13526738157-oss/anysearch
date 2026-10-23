import type { ContentLevel } from '../core/contracts.ts';

export function bookmarkProjection(level: ContentLevel, alias = 'b'): string {
  const fields = ['id', 'source_id', 'title', 'url', 'folder_path', 'metadata'];
  return [...fields.map(field => `${alias}.${field}`), level === 'public_text' ? `${alias}.body` : "'' AS body"].join(', ');
}
