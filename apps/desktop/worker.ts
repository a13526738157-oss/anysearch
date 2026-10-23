import { DesktopBackend } from './backend.ts';
import { ServiceError } from '../../src/core/errors.ts';
import { qaPublicTextFetcher } from './qa-public-text.ts';
import { LocalEmbeddingProvider } from '../../src/retrieval/local-provider.ts';
import { LocalRerankingProvider } from '../../src/retrieval/local-reranker.ts';
import { defaultRerankerDirectory } from '../../src/retrieval/reranker-files.ts';
import { defaultModelDirectory } from '../../src/retrieval/model-files.ts';
import { SqliteVectorCache } from '../../src/retrieval/vector-cache.ts';
import { isAbsolute, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { closeResources } from '../../src/runtime/cleanup.ts';

const port = process.parentPort;
if (!port) throw new Error('Desktop worker requires its parent process.');
const qa = process.env.ANYSEARCH_QA === '1';
if (qa && !process.env.ANYSEARCH_CHROME_USER_DATA_DIR) throw new Error('QA requires a synthetic Chrome directory.');
const dataDirectory = process.env.ANYSEARCH_DATA_DIR ?? '';
if (!isAbsolute(dataDirectory)) throw new Error('Desktop requires an absolute data directory.');
mkdirSync(dataDirectory, { recursive: true });
const embedder = new LocalEmbeddingProvider(process.env.ANYSEARCH_MODEL_DIR ?? defaultModelDirectory);
const reranker = new LocalRerankingProvider(process.env.ANYSEARCH_RERANKER_DIR ?? defaultRerankerDirectory);
let cache: SqliteVectorCache | undefined;
try { cache = new SqliteVectorCache(join(dataDirectory, 'vectors.sqlite')); }
catch { /* The backend's bounded memory cache remains available. */ }
const backend = new DesktopBackend(dataDirectory, qa
  ? { userDataDirectory: process.env.ANYSEARCH_CHROME_USER_DATA_DIR! } : {},
{ embedder, reranker, ...(cache ? { cache } : {}),
  ...(qa && process.env.ANYSEARCH_PUBLIC_TEXT_QA === '1' ? { fetchPublicText: qaPublicTextFetcher } : {}) });
// Permission changes must not wait behind a slow model request.
let closing = false;
let managementQueue = Promise.resolve();
port.on('message', ({ data }: { data: unknown }) => {
  if (typeof data !== 'object' || data === null) return;
  const request = data as Record<string, unknown>;
  if (typeof request.id !== 'string' || typeof request.method !== 'string') return;
  if (closing) return;
  const execute = async (): Promise<void> => { try {
    if (closing) return;
    if (request.method === 'close') {
      closing = true;
      const cleaned = await closeResources([
        () => backend.close(), () => embedder.close(), () => reranker.close(), () => cache?.close(),
      ]);
      try {
        port.postMessage(cleaned ? { id: request.id, ok: true, result: null }
          : { id: request.id, ok: false, error: 'SHUTDOWN_FAILED' });
      } finally { process.exit(cleaned ? 0 : 1); }
    }
    const result = await backend.handle(String(request.method), request.args);
    port.postMessage({ id: request.id, ok: true, result });
  } catch (error) {
    port.postMessage({ id: request.id, ok: false, error: error instanceof ServiceError ? error.code : 'REQUEST_FAILED' });
  }
  };
  if (request.method === 'search') void execute();
  else managementQueue = managementQueue.then(execute, execute);
});
