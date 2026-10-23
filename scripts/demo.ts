import { normalizeBookmarkTree } from '../src/adapters/chrome/normalize.ts';
import { AnySearchService } from '../src/core/service.ts';
import { ServiceError } from '../src/core/errors.ts';
import { openDatabase } from '../src/storage/database.ts';
import { getCaptureTarget, registerSource, resourceId, setCapturedText, syncBookmarks } from '../src/storage/bookmarks.ts';
import { issueGrant, revokeGrant } from '../src/storage/grants.ts';

const db = openDatabase(':memory:');
try {
  const sourceId = 'synthetic-demo';
  registerSource(db, sourceId);
  syncBookmarks(db, normalizeBookmarkTree([
    { id: 'root', title: '', children: [
      { id: '1', parentId: 'root', title: 'Example research', url: 'https://example.org/research' },
    ] },
  ], sourceId, 1));
  const id = resourceId(sourceId, '1');
  const capture = getCaptureTarget(db, id);
  setCapturedText(db, id, capture.url, 'Synthetic document, not fetched from the web.\nAn example of source-linked evidence.\nLimitations remain part of the source.', capture.revision);
  const grant = issueGrant(db, sourceId, 'public_text');
  const service = new AnySearchService(db);
  const search = service.search(grant.capability, 'source-linked');
  const result = search.items[0];
  if (!result) throw new Error('Demo source was not found.');
  const read = service.read(grant.capability, { id: result.id, snapshotId: result.snapshotId, lineStart: 2, maxLines: 2 });
  revokeGrant(db, grant.id);
  let revoked = false;
  try { service.search(grant.capability, 'source-linked'); }
  catch (error) {
    if (!(error instanceof ServiceError) || error.code !== 'ACCESS_DENIED') throw error;
    revoked = true;
  }
  if (!revoked) throw new Error('Revocation check failed.');
  console.log(JSON.stringify({ synthetic: true, search, read, accessAfterRevocation: 'denied' }, null, 2));
} finally { db.close(); }
