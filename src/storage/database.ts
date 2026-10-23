import { DatabaseSync } from 'node:sqlite';
import { statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { requireValue } from '../core/errors.ts';
import { createStoredSearchText } from './search-text.ts';

const applicationId = 0x41535931;
const schemaVersion = 4;

export function openDatabase(path: string, options: { existingOnly?: boolean; mustExist?: boolean } = {}): DatabaseSync {
  if (options.mustExist) requireValue(statSync(path).isFile(), 'INVALID_DATABASE', 'Expected an existing database.');
  const db = new DatabaseSync(path, { allowExtension: false, timeout: 3000, readOnly: options.existingOnly ?? false });
  try {
    const foundId = Number(db.prepare('PRAGMA application_id').get()?.application_id);
    const foundVersion = Number(db.prepare('PRAGMA user_version').get()?.user_version);
    const hasObjects = Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' LIMIT 1").get());
    if (!options.existingOnly && !options.mustExist && foundId === applicationId && [1, 2, 3].includes(foundVersion)) {
      transaction(db, () => {
        validateCoreSchema(db);
        db.prepare('SELECT metadata FROM bookmark_fts LIMIT 0');
        if (foundVersion === 1) db.exec(connectorSchema);
        else {
          validateV2Schema(db);
          if (foundVersion === 2) db.exec('ALTER TABLE pairing_codes ADD COLUMN profile_name TEXT');
        }
        db.prepare('SELECT profile_name FROM pairing_codes LIMIT 0');
        migrateSearchIndex(db);
        validateSchema(db);
        db.exec(`PRAGMA user_version = ${schemaVersion};`);
      });
    } else if (foundId !== applicationId || foundVersion !== schemaVersion) {
      requireValue(!options.existingOnly && !options.mustExist && foundId === 0 && foundVersion === 0 && !hasObjects,
        'INVALID_DATABASE', 'Expected an initialized AnySearch database with the supported schema.');
      transaction(db, () => {
        db.exec(schema);
        db.exec(connectorSchema);
        db.exec(`PRAGMA application_id = ${applicationId}; PRAGMA user_version = ${schemaVersion};`);
      });
    }
    validateSchema(db);
    db.exec('PRAGMA foreign_keys = ON');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

function validateSchema(db: DatabaseSync): void {
  validateV2Schema(db);
  db.prepare('SELECT profile_name FROM pairing_codes LIMIT 0');
  db.prepare('SELECT search_text FROM bookmarks LIMIT 0');
  db.prepare('SELECT search_text FROM bookmark_fts LIMIT 0');
}

function validateV2Schema(db: DatabaseSync): void {
  validateCoreSchema(db);
  db.prepare('SELECT code_hash, expires_at FROM pairing_codes LIMIT 0');
  db.prepare('SELECT source_id, instance_id, origin, credential_hash, label, last_synced_at, revoked FROM chrome_bindings LIMIT 0');
}

function validateCoreSchema(db: DatabaseSync): void {
  db.prepare('SELECT id, sequence, enabled FROM sources LIMIT 0');
  db.prepare('SELECT id, source_id, node_id, title, url, folder_path, metadata, body, capture_revision, seen_sequence FROM bookmarks LIMIT 0');
  db.prepare('SELECT id, body FROM bookmark_fts LIMIT 0');
  db.prepare('SELECT id, token_hash, source_id, content_level, revoked FROM grants LIMIT 0');
}

function migrateSearchIndex(db: DatabaseSync): void {
  db.exec("ALTER TABLE bookmarks ADD COLUMN search_text TEXT NOT NULL DEFAULT ''");
  const rows = db.prepare('SELECT id, title, url, folder_path FROM bookmarks').all();
  const update = db.prepare('UPDATE bookmarks SET search_text = ? WHERE id = ?');
  for (const row of rows) {
    const text = createStoredSearchText({ title: String(row.title), url: String(row.url), folder_path: String(row.folder_path) });
    update.run(text, row.id!);
  }
  // Only derived search data changes; metadata evidence, snapshots, and grants stay intact.
  db.exec('DROP TABLE bookmark_fts');
  db.exec(searchIndexSchema);
  db.exec('INSERT INTO bookmark_fts(id, search_text, body) SELECT id, search_text, body FROM bookmarks');
}

const searchIndexSchema = `
  CREATE VIRTUAL TABLE bookmark_fts USING fts5(
    id UNINDEXED, search_text, body, tokenize='trigram'
  );
`;

const connectorSchema = `
  CREATE TABLE pairing_codes (code_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, profile_name TEXT) STRICT;
  CREATE TABLE chrome_bindings (
    source_id TEXT PRIMARY KEY REFERENCES sources(id),
    instance_id TEXT NOT NULL,
    origin TEXT NOT NULL,
    credential_hash TEXT UNIQUE NOT NULL,
    label TEXT NOT NULL,
    last_synced_at TEXT,
    revoked INTEGER NOT NULL DEFAULT 0
  ) STRICT;
`;

const schema = `
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 1
    ) STRICT;
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL REFERENCES sources(id),
      node_id TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      metadata TEXT NOT NULL,
      search_text TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      capture_revision TEXT NOT NULL,
      seen_sequence INTEGER NOT NULL,
      UNIQUE(source_id, node_id)
    ) STRICT;
    ${searchIndexSchema}
    CREATE TABLE IF NOT EXISTS grants (
      id TEXT PRIMARY KEY,
      token_hash TEXT UNIQUE NOT NULL,
      source_id TEXT NOT NULL REFERENCES sources(id),
      content_level TEXT NOT NULL CHECK(content_level IN ('metadata', 'public_text')),
      revoked INTEGER NOT NULL DEFAULT 0
    ) STRICT;
  `;

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  const savepoint = db.isTransaction ? `nested_${randomUUID().replaceAll('-', '')}` : null;
  db.exec(savepoint ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec(savepoint ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
    return result;
  } catch (error) {
    if (savepoint) db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}; RELEASE SAVEPOINT ${savepoint}`);
    else db.exec('ROLLBACK');
    throw error;
  }
}
