import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RetrievalService } from '../../retrieval/service.ts';
import { LocalEmbeddingProvider } from '../../retrieval/local-provider.ts';
import { LocalRerankingProvider } from '../../retrieval/local-reranker.ts';
import { defaultRerankerDirectory } from '../../retrieval/reranker-files.ts';
import { defaultModelDirectory } from '../../retrieval/model-files.ts';
import { SqliteVectorCache } from '../../retrieval/vector-cache.ts';
import { MemoryVectorCache } from '../../retrieval/contracts.ts';
import { openDatabase } from '../../storage/database.ts';
import { createMcpServer } from './server.ts';
import { openConnection } from './connection.ts';
import { authorize as authorizeGrant } from '../../storage/grants.ts';
import { closeResources } from '../../runtime/cleanup.ts';

const SHUTDOWN_TIMEOUT_MS = 15_000;

function openStartupConnection(): ReturnType<typeof openConnection> {
  const args = process.argv.slice(2);
  const capability = process.env['ANYSEARCH_CAPABILITY'];
  const databasePath = process.env['ANYSEARCH_DB'];
  if (args.length > 0) {
    if (args.length !== 2 || args[0] !== '--connection' || !args[1]
      || capability !== undefined || databasePath !== undefined) throw new Error('Conflicting connection configuration.');
    return openConnection(args[1]);
  }
  if (!capability?.trim() || !databasePath || !isAbsolute(databasePath) || !existsSync(databasePath)) {
    throw new Error('A capability and an existing absolute database path are required.');
  }
  const db = openDatabase(databasePath, { existingOnly: true });
  return { db, capability, authorize: () => { authorizeGrant(db, capability); } };
}

async function main(): Promise<void> {
  const { db, capability, authorize } = openStartupConnection();
  let embedder: LocalEmbeddingProvider | undefined;
  let reranker: LocalRerankingProvider | undefined;
  let persistentCache: SqliteVectorCache | undefined;
  let server: ReturnType<typeof createMcpServer> | undefined;
  let shutdownPromise: Promise<void> | undefined;
  const shutdown = (): Promise<void> => {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        const deadline = setTimeout(() => {
          process.stderr.write('AnySearch MCP shutdown timed out.\n');
          process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);
        // Keep the failure deadline alive while required cleanup is unresolved.
        const cleaned = await closeResources([
          () => server?.close(), () => embedder?.close(), () => reranker?.close(),
          () => persistentCache?.close(), () => db.close(),
        ]);
        if (!cleaned) {
          process.exitCode = 1;
          throw new Error('SHUTDOWN_FAILED');
        }
        clearTimeout(deadline);
      })();
    }
    return shutdownPromise;
  };
  let shutdownReported = false;
  const stop = (): void => {
    void shutdown().catch(() => {
      if (!shutdownReported) process.stderr.write('AnySearch MCP shutdown failed.\n');
      shutdownReported = true;
      process.exitCode = 1;
    });
  };

  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.stdin.once('end', stop);
  try {
    embedder = new LocalEmbeddingProvider(process.env.ANYSEARCH_MODEL_DIR ?? defaultModelDirectory);
    reranker = new LocalRerankingProvider(process.env.ANYSEARCH_RERANKER_DIR ?? defaultRerankerDirectory);
    const path = String(db.prepare('PRAGMA database_list').get()?.file ?? '');
    try { if (path) persistentCache = new SqliteVectorCache(join(dirname(path), 'vectors.sqlite')); }
    catch { /* Read-only deployments can retain a bounded process-local cache. */ }
    const service = new RetrievalService(db, { embedder, reranker, cache: persistentCache ?? new MemoryVectorCache() });
    server = createMcpServer(service, capability, authorize);
    await server.connect(new StdioServerTransport());
  } catch (error) {
    try { await shutdown(); } catch { process.exitCode = 1; }
    throw error;
  }
}

void main().catch(() => {
  process.stderr.write('AnySearch MCP startup failed: check local connection setup.\n');
  process.exitCode = 1;
});
