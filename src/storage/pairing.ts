import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { requireValue } from '../core/errors.ts';
import { sha256 } from '../core/hash.ts';
import { SYNC_LIMITS } from '../connectors/protocol.ts';
import type { PairedSource } from '../connectors/protocol.ts';
import { transaction } from './database.ts';

export function beginPairing(db: DatabaseSync, now = Date.now(), profileName?: string): { code: string; expiresAt: string; profileName?: string } {
  requireValue(profileName === undefined || (profileName.trim().length > 0 && profileName.length <= 80
    && !/[\u0000-\u001f\u007f]/.test(profileName)), 'INVALID_REQUEST', 'Invalid profile display name.');
  requireValue(!db.prepare('SELECT 1 FROM chrome_bindings WHERE revoked = 0').get(),
    'SOURCE_ALREADY_PAIRED', 'Disconnect the current profile before pairing another.');
  const code = randomBytes(24).toString('base64url');
  const expires = now + SYNC_LIMITS.pairingLifetimeMs;
  transaction(db, () => {
    db.exec('DELETE FROM pairing_codes');
    db.prepare('INSERT INTO pairing_codes(code_hash, expires_at, profile_name) VALUES (?, ?, ?)').run(sha256(code), expires, profileName ?? null);
  });
  return { code, expiresAt: new Date(expires).toISOString(), ...(profileName ? { profileName } : {}) };
}

export function cancelPairing(db: DatabaseSync): void { db.exec('DELETE FROM pairing_codes'); }

export function getPairingInfo(db: DatabaseSync, origin: string, code: string, now = Date.now()):
  { expiresAt: string; profileName?: string; selectionToken?: string } {
  requireValue(/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin), 'ACCESS_DENIED', 'Connection is not authorized.');
  requireValue(/^[A-Za-z0-9_-]{32}$/.test(code), 'PAIRING_EXPIRED', 'Pairing code is invalid or expired.');
  const row = db.prepare('SELECT expires_at, profile_name FROM pairing_codes WHERE code_hash = ?').get(sha256(code));
  requireValue(row && Number(row.expires_at) > now, 'PAIRING_EXPIRED', 'Pairing code is invalid or expired.');
  const profileName = row.profile_name === null ? undefined : String(row.profile_name);
  return { expiresAt: new Date(Number(row.expires_at)).toISOString(), ...(profileName ? {
    profileName, selectionToken: sha256(JSON.stringify([sha256(code), profileName, row.expires_at])),
  } : {}) };
}

export function pairSource(db: DatabaseSync, origin: string, code: string, instanceId: string, label: string, now = Date.now(), selectionToken?: string):
  { sourceId: string; credential: string; sequence: number } {
  requireValue(/^chrome-extension:\/\/[a-p]{32}\/$/.test(origin), 'ACCESS_DENIED', 'Connection is not authorized.');
  requireValue(/^[A-Za-z0-9_-]{32}$/.test(code) && /^[A-Za-z0-9-]{16,128}$/.test(instanceId)
    && label.trim().length > 0 && label.length <= 80, 'INVALID_REQUEST', 'Invalid pairing request.');
  return transaction(db, () => {
    const info = getPairingInfo(db, origin, code, now);
    // This confirms the displayed intent, not the caller's on-disk Chrome profile path.
    requireValue(!info.selectionToken || selectionToken === info.selectionToken,
      'PAIRING_CONFIRMATION_REQUIRED', 'Confirm the selected profile in the Chrome extension before connecting.');
    requireValue(!db.prepare('SELECT 1 FROM chrome_bindings WHERE revoked = 0').get(),
      'SOURCE_ALREADY_PAIRED', 'A Chrome profile is already paired.');
    const sourceId = `chrome:${randomUUID()}`;
    const credential = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sources(id) VALUES (?)').run(sourceId);
    db.prepare(`INSERT INTO chrome_bindings(source_id, instance_id, origin, credential_hash, label)
      VALUES (?, ?, ?, ?, ?)`).run(sourceId, instanceId, origin, sha256(credential), label.trim());
    db.exec('DELETE FROM pairing_codes');
    return { sourceId, credential, sequence: 0 };
  });
}

export function authorizeConnector(db: DatabaseSync, origin: string, instanceId: string, credential: string): string {
  const row = db.prepare(`SELECT b.source_id FROM chrome_bindings b JOIN sources s ON s.id = b.source_id
    WHERE b.origin = ? AND b.instance_id = ? AND b.credential_hash = ? AND b.revoked = 0 AND s.enabled = 1`)
    .get(origin, instanceId, sha256(credential));
  requireValue(row, 'ACCESS_DENIED', 'Connection is not authorized or is paused.');
  return String(row.source_id);
}

export function listSources(db: DatabaseSync): PairedSource[] {
  return db.prepare(`SELECT s.id, s.sequence, s.enabled, c.label, c.last_synced_at,
    (SELECT COUNT(*) FROM bookmarks b WHERE b.source_id = s.id) AS bookmark_count
    FROM sources s JOIN chrome_bindings c ON c.source_id = s.id WHERE c.revoked = 0 ORDER BY c.source_id`).all()
    .map(row => ({ sourceId: String(row.id), label: String(row.label), enabled: row.enabled === 1,
      sequence: Number(row.sequence), bookmarkCount: Number(row.bookmark_count),
      lastSyncedAt: row.last_synced_at === null ? null : String(row.last_synced_at) }));
}

export function setSourceEnabled(db: DatabaseSync, sourceId: string, enabled: boolean): void {
  requireValue(db.prepare('SELECT 1 FROM chrome_bindings WHERE source_id = ? AND revoked = 0').get(sourceId),
    'SOURCE_UNAVAILABLE', 'Source is not available.');
  db.prepare('UPDATE sources SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, sourceId);
}

export function disconnectSource(db: DatabaseSync, sourceId: string): void {
  transaction(db, () => {
    db.prepare('UPDATE chrome_bindings SET revoked = 1 WHERE source_id = ?').run(sourceId);
    db.prepare('UPDATE sources SET enabled = 0 WHERE id = ?').run(sourceId);
    db.prepare('UPDATE grants SET revoked = 1 WHERE source_id = ?').run(sourceId);
    cancelPairing(db);
  });
}
