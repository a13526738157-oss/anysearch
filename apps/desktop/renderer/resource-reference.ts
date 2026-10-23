import type { SearchResult } from '../../../src/core/contracts.ts';
import type { ResourceReference } from '../desktop-contracts.ts';

export function referenceOf(item: SearchResult): ResourceReference {
  return { id: item.id, snapshotId: item.snapshotId, contentLevel: item.contentLevel };
}
