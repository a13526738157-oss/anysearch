import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';

export const extensionIdSchema = z.string().regex(/^[a-p]{32}$/);
const configurationSchema = z.object({
  version: z.literal(1),
  extensionId: extensionIdSchema,
  dataDirectory: z.string().refine(isAbsolute),
}).strict();

export type NativeConfiguration = z.infer<typeof configurationSchema>;

export function readNativeConfiguration(path: string): NativeConfiguration {
  if (!isAbsolute(path) || !statSync(path).isFile() || statSync(path).size > 4096) throw new Error('Invalid native configuration.');
  const value = configurationSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  if (!statSync(value.dataDirectory).isDirectory()) throw new Error('Invalid native data directory.');
  const dataDirectory = realpathSync(value.dataDirectory);
  const databasePath = join(dataDirectory, 'index.sqlite');
  if (!existsSync(databasePath) || !statSync(databasePath).isFile()) throw new Error('An initialized database is required.');
  if (realpathSync(databasePath) !== databasePath) throw new Error('Unexpected native database target.');
  return { ...value, dataDirectory };
}

export function parseNativeArguments(args: string[]): { configurationPath: string; origin: string } {
  if (args.length < 3 || args.length > 4 || args[0] !== '--config' || !args[1] || !args[2]
      || (args[3] !== undefined && !/^--parent-window=\d+$/.test(args[3]))) {
    throw new Error('Invalid native arguments.');
  }
  return { configurationPath: args[1], origin: args[2] };
}

export function requireNativeOrigin(origin: string, extensionId: string): void {
  extensionIdSchema.parse(extensionId);
  if (origin !== `chrome-extension://${extensionId}/`) throw new Error('Unapproved native origin.');
}
