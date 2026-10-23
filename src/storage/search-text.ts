import type { BookmarkInput } from '../core/contracts.ts';
import { requireValue, ServiceError } from '../core/errors.ts';
import { BOOKMARK_LIMITS } from '../core/limits.ts';

export function createSearchText(bookmark: Pick<BookmarkInput, 'title' | 'url' | 'folderPath'>): string {
  return [bookmark.title, bookmark.url, ...bookmark.folderPath].join('\n');
}

export function createStoredSearchText(row: { title: string; url: string; folder_path: string }): string {
  let folders: unknown;
  try { folders = JSON.parse(row.folder_path); }
  catch { throw new ServiceError('INVALID_DATABASE', 'Stored bookmark folders are invalid.'); }
  requireValue(Array.isArray(folders) && folders.length <= BOOKMARK_LIMITS.maxFolderPathLength
    && folders.every((folder: unknown) => typeof folder === 'string' && folder.length <= BOOKMARK_LIMITS.maxTitleLength),
  'INVALID_DATABASE', 'Stored bookmark folders are invalid.');
  return createSearchText({ title: row.title, url: row.url, folderPath: folders as string[] });
}
