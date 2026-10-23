import { join } from 'node:path';
import { NativeBroker } from '../../connectors/broker.ts';
import { openDatabase } from '../../storage/database.ts';
import { parseNativeArguments, readNativeConfiguration, requireNativeOrigin } from './configuration.ts';
import { serveNativeSession } from './transport.ts';

async function main(): Promise<void> {
  const { configurationPath, origin } = parseNativeArguments(process.argv.slice(2));
  const configuration = readNativeConfiguration(configurationPath);
  requireNativeOrigin(origin, configuration.extensionId);
  const db = openDatabase(join(configuration.dataDirectory, 'index.sqlite'), { mustExist: true });
  const stop = (): void => { process.stdin.destroy(); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  // Pipe errors must reach the transport promise rather than leak an uncaught stack.
  const outputError = (): void => { process.stdin.destroy(new Error('Native output failed.')); };
  process.stdout.on('error', outputError);
  try {
    const broker = new NativeBroker(db, origin);
    await serveNativeSession(process.stdin, process.stdout, broker);
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    process.stdout.removeListener('error', outputError);
    db.close();
  }
}

void main().catch(() => {
  process.stderr.write('AnySearch native host failed: check local connection setup.\n');
  process.exitCode = 1;
});
