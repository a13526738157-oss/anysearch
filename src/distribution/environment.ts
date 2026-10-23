import { join } from 'node:path';

export function releaseEnvironment(root: string, source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  const removed = /^(?:NODE_|ELECTRON_|ANYSEARCH_|HF_|HUGGINGFACE_|TRANSFORMERS_|ORT_|ONNXRUNTIME_|GLOBAL_AGENT_|npm_)/iu;
  for (const [key, value] of Object.entries(source)) {
    if (!removed.test(key) && key.toLowerCase() !== 'path') environment[key] = value;
  }
  const windows = source.SystemRoot ?? 'C:\\Windows';
  environment.PATH = [join(root, 'runtime/node'), join(root, 'runtime/electron'),
    join(root, 'node_modules/onnxruntime-node/bin/napi-v6/win32/x64'),
    join(root, 'node_modules/@img/sharp-win32-x64/lib'), join(windows, 'System32'), windows].join(';');
  environment.ANYSEARCH_MODEL_DIR = join(root, '.models/multilingual-e5-small');
  environment.ANYSEARCH_RERANKER_DIR = join(root, '.models/bge-reranker-v2-m3');
  return environment;
}
