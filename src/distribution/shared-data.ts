import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_APPLICATION_ID, DATA_SCHEMA_VERSION, fail } from './contracts.ts';
import { existingDirectory, independent, localPath, regularFile } from './paths.ts';

export function resolveSharedDataDirectory(packageDirectory: string, requested: string): string {
  const root = existingDirectory(packageDirectory);
  if (basename(root) !== 'payload') fail('RELEASE_PAYLOAD_DIRECTORY_REQUIRED');
  const directory = localPath(requested);
  independent(dirname(dirname(root)), directory);
  return directory;
}

export function requireCompatibleData(directory: string, options: { mustExist?: boolean } = {}): void {
  if (!existsSync(directory)) {
    if (options.mustExist) fail('RELEASE_EXISTING_DATA_REQUIRED');
    return;
  }
  existingDirectory(directory);
  const database = join(directory, 'index.sqlite');
  if (!existsSync(database)) {
    if (options.mustExist) fail('RELEASE_EXISTING_DATA_REQUIRED');
    if (readdirSync(directory).length) fail('RELEASE_EXISTING_DATA_WITHOUT_DATABASE');
    return;
  }
  const db = new DatabaseSync(regularFile(database), { readOnly: true, allowExtension: false, timeout: 3000 });
  try {
    const application = Number(db.prepare('PRAGMA application_id').get()?.application_id);
    const schema = Number(db.prepare('PRAGMA user_version').get()?.user_version);
    if (application !== DATA_APPLICATION_ID || schema !== DATA_SCHEMA_VERSION) fail('RELEASE_DATA_SCHEMA_INCOMPATIBLE');
  } finally { db.close(); }
}
