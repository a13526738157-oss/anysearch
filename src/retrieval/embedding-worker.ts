import { parentPort, workerData } from 'node:worker_threads';
import { EmbeddingError } from './contracts.ts';
import { verifyModelFiles } from './model-files.ts';

const port = parentPort;
if (!port) throw new Error('Embedding worker requires its parent.');
const directory = (workerData as { directory: string }).directory;
const extractor = (async () => {
  await verifyModelFiles(directory);
  const { env, pipeline } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.useFSCache = false;
  return pipeline('feature-extraction', directory, {
    dtype: 'q8', device: 'cpu', local_files_only: true,
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1, logSeverityLevel: 4 },
  });
})();
// Startup failures are returned to the requesting parent, never as process logs.
void extractor.catch(() => {});
port.on('message', (request: { id: number; texts: string[]; kind: 'query' | 'passage' }) => {
  void (async () => {
    try {
      const model = await extractor;
      const output = await model(request.texts.map(text => `${request.kind}: ${text}`), { pooling: 'mean', normalize: true });
      let data: unknown;
      try {
        data = output.tolist();
      } finally {
        output.dispose();
      }
      port.postMessage({ id: request.id, data });
    } catch (error) {
      port.postMessage({ id: request.id, error: error instanceof EmbeddingError ? error.reason : 'model_failed' });
    }
  })();
});
