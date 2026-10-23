import { parentPort, workerData } from 'node:worker_threads';
import { EmbeddingError } from './contracts.ts';
import { verifyModelFiles } from './model-files.ts';
import { rerankerFiles } from './reranker-files.ts';

const port = parentPort;
if (!port) throw new Error('Reranking worker requires its parent.');
const directory = (workerData as { directory: string }).directory;
const resources = (async () => {
  await verifyModelFiles(directory, rerankerFiles);
  const { env, AutoTokenizer, AutoModelForSequenceClassification, Tensor } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.useFSCache = false;
  const tokenizer = await AutoTokenizer.from_pretrained(directory, { local_files_only: true });
  const model = await AutoModelForSequenceClassification.from_pretrained(directory, {
    dtype: 'q8', device: 'cpu', local_files_only: true,
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1, logSeverityLevel: 4 },
  });
  const release = (...values: unknown[]): void => {
    const seen = new Set<object>();
    let failed = false;
    while (values.length) {
      const value = values.pop();
      if (value === null || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      try {
        if (value instanceof Tensor) value.dispose();
        else if (!ArrayBuffer.isView(value)) values.push(...Object.values(value));
      } catch {
        failed = true;
      }
    }
    if (failed) throw new EmbeddingError('model_failed');
  };
  return { tokenizer, model, Tensor, release };
})();
void resources.catch(() => {});
port.on('message', (request: { id: number; query: string; texts: string[] }) => {
  void (async () => {
    try {
      const { tokenizer, model, Tensor, release } = await resources;
      const scores: number[] = [];
      // Keep other candidates out of each pair's inference batch.
      for (const text of request.texts) {
        const inputs = tokenizer([request.query], {
          text_pair: [text], padding: true, truncation: true, max_length: 512,
        });
        let output: unknown;
        let normalized: unknown;
        try {
          output = await model(inputs);
          if (output === null || typeof output !== 'object' || !('logits' in output)) {
            throw new EmbeddingError('model_failed');
          }
          const logits = output.logits;
          if (!(logits instanceof Tensor) || logits.dims.length !== 2 || logits.dims[0] !== 1 || logits.dims[1] !== 1) {
            throw new EmbeddingError('model_failed');
          }
          const data = logits.data;
          if (data.length !== 1 || typeof data[0] !== 'number' || !Number.isFinite(data[0])) {
            throw new EmbeddingError('model_failed');
          }
          const probabilities = logits.sigmoid();
          normalized = probabilities;
          const score = probabilities.data[0];
          if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 1) {
            throw new EmbeddingError('model_failed');
          }
          scores.push(score);
        } finally {
          release(inputs, output, normalized);
        }
      }
      port.postMessage({ id: request.id, data: scores });
    } catch (error) {
      port.postMessage({ id: request.id, error: error instanceof EmbeddingError ? error.reason : 'model_failed' });
    }
  })();
});
