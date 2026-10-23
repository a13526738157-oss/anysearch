import type { BookmarkInput, BookmarkSnapshot } from '../../core/contracts.ts';
import { BOOKMARK_LIMITS, SOURCE_ID_PATTERN } from '../../core/limits.ts';

export const CHROME_TREE_LIMITS = Object.freeze({
  maxNodes: BOOKMARK_LIMITS.maxBookmarks,
  maxDepth: BOOKMARK_LIMITS.maxFolderPathLength + 1,
  maxInputCharacters: 8_000_000,
  maxOutputCharacters: 8_000_000,
});

interface PendingNode {
  value: unknown;
  parentId: string | undefined;
  index: number;
  depth: number;
  folderPath: string[];
  pathCharacters: number;
}

function invalid(reason: string): never {
  throw new TypeError(`Invalid Chrome bookmark tree: ${reason}`);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('node must be an object');
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return invalid('node must be a plain object');
  }
  return value as Record<string, unknown>;
}

function boundedString(
  value: unknown,
  field: string,
  limit: number,
  allowEmpty = false,
): string {
  if (typeof value !== 'string' || value.length > limit || (!allowEmpty && value.length === 0)) {
    return invalid(`${field} must be a bounded string`);
  }
  return value;
}

function identifier(value: unknown, field: string): string {
  const result = boundedString(value, field, BOOKMARK_LIMITS.maxNodeIdLength);
  if (/\s|[\u0000-\u001f\u007f]/u.test(result)) {
    return invalid(`${field} must not contain whitespace or controls`);
  }
  return result;
}

function bookmarkUrl(value: unknown): string {
  const url = boundedString(value, 'url', BOOKMARK_LIMITS.maxUrlLength);
  if (url.trim() !== url || /[\u0000-\u001f\u007f]/u.test(url)) {
    return invalid('url must not contain edge whitespace or controls');
  }
  try {
    // Parsing is validation only. Non-HTTP bookmarks are metadata, not fetch permissions.
    new URL(url);
  } catch {
    return invalid('url must be absolute');
  }
  return url;
}

export function normalizeBookmarkTree(
  tree: unknown,
  sourceId: string,
  sequence: number,
): BookmarkSnapshot {
  const normalizedSourceId = boundedString(sourceId, 'sourceId', BOOKMARK_LIMITS.maxSourceIdLength);
  if (!SOURCE_ID_PATTERN.test(normalizedSourceId)) return invalid('sourceId has unsupported characters');
  if (!Number.isSafeInteger(sequence) || sequence < BOOKMARK_LIMITS.minSequence || sequence > BOOKMARK_LIMITS.maxSequence) {
    return invalid('sequence must be a positive safe integer');
  }
  if (!Array.isArray(tree) || tree.length === 0 || tree.length > CHROME_TREE_LIMITS.maxNodes) {
    return invalid('getTree result must be a bounded nonempty root array');
  }

  const pending: PendingNode[] = [];
  for (let index = tree.length - 1; index >= 0; index -= 1) {
    pending.push({ value: tree[index], parentId: undefined, index, depth: 0, folderPath: [], pathCharacters: 0 });
  }
  const ids = new Set<string>();
  const bookmarks: BookmarkInput[] = [];
  let queuedNodes = tree.length;
  let inputCharacters = normalizedSourceId.length;
  let outputCharacters = normalizedSourceId.length;

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (current.depth > CHROME_TREE_LIMITS.maxDepth) return invalid('tree is too deep');
    const node = record(current.value);
    const nodeId = identifier(node.id, 'id');
    if (ids.has(nodeId)) return invalid('duplicate node ID or cyclic tree');
    ids.add(nodeId);

    if (node.parentId !== current.parentId) return invalid('parentId does not match the tree');
    if (node.index !== undefined && (!Number.isSafeInteger(node.index) || node.index !== current.index)) {
      return invalid('index does not match sibling order');
    }
    const title = boundedString(node.title, 'title', BOOKMARK_LIMITS.maxTitleLength, true);
    inputCharacters += nodeId.length + title.length;
    if (inputCharacters > CHROME_TREE_LIMITS.maxInputCharacters) return invalid('input text is too large');
    const children: unknown[] = node.children === undefined
      ? []
      : Array.isArray(node.children)
        ? node.children
        : invalid('children must be an array');

    if (node.url !== undefined) {
      if (current.parentId === undefined) return invalid('root must be a folder');
      if (children.length > 0) return invalid('bookmark must not have children');
      const url = bookmarkUrl(node.url);
      inputCharacters += url.length;
      if (inputCharacters > CHROME_TREE_LIMITS.maxInputCharacters) return invalid('input text is too large');
      outputCharacters += nodeId.length + title.length + url.length + current.pathCharacters;
      if (outputCharacters > CHROME_TREE_LIMITS.maxOutputCharacters) {
        return invalid('normalized output is too large');
      }
      bookmarks.push({ nodeId, title, url, folderPath: [...current.folderPath] });
      continue;
    }

    queuedNodes += children.length;
    if (queuedNodes > CHROME_TREE_LIMITS.maxNodes) return invalid('tree has too many nodes');
    const folderPath = current.parentId === undefined ? current.folderPath : [...current.folderPath, title];
    if (folderPath.length > BOOKMARK_LIMITS.maxFolderPathLength) return invalid('tree is too deep');
    const pathCharacters = current.parentId === undefined ? current.pathCharacters : current.pathCharacters + title.length;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({ value: children[index], parentId: nodeId, index, depth: current.depth + 1, folderPath, pathCharacters });
    }
  }

  return { sourceId: normalizedSourceId, sequence, bookmarks };
}
