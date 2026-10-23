import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createCodexConfigPatch } from '../src/adapters/mcp/codex-config.ts';
import { connectionContentLevel, openConnection, readConnectionFile, requireCanonicalPath } from '../src/adapters/mcp/connection.ts';
import { provisionCodexConnection, revokeCodexConnection } from '../src/adapters/mcp/setup.ts';
import { contentAccessProfile } from '../src/adapters/mcp/content-access.ts';
import { parseSetupArguments } from '../src/adapters/mcp/setup-arguments.ts';
import type { ContentLevel } from '../src/core/contracts.ts';

const root = realpathSync(resolve(import.meta.dirname, '..'));
const databasePath = join(root, '.local', 'desktop', 'index.sqlite');

function selectedConnectionPath(contentLevel: ContentLevel): string {
  return join(root, '.local', 'codex-connection', contentAccessProfile(contentLevel).connectionFileName);
}

function requireSelectedLevel(connectionPath: string, contentLevel: ContentLevel): void {
  if (connectionContentLevel(readConnectionFile(connectionPath)) !== contentLevel) {
    throw new Error('CONNECTION_CONTENT_LEVEL_MISMATCH');
  }
}

function verifyPermissions(): void {
  if (process.platform !== 'win32') throw new Error('WINDOWS_SETUP_REQUIRED');
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  // PowerShell 7's inherited module path is incompatible with the Windows PowerShell ACL cmdlets.
  const check = spawnSync(executable, ['-NoProfile', '-NonInteractive', '-File', join(root, 'scripts', 'codex-permissions.ps1')],
    { windowsHide: true, encoding: 'utf8', timeout: 10_000,
      env: { ...process.env, PSModulePath: join(dirname(executable), 'Modules') } });
  if (check.error || check.status !== 0) throw new Error('CREDENTIAL_ACL_NOT_VERIFIED');
}

function preview(contentLevel: ContentLevel): object {
  const connectionPath = selectedConnectionPath(contentLevel);
  const { serverName } = contentAccessProfile(contentLevel);
  const home = process.env.CODEX_HOME ?? join(process.env.USERPROFILE ?? '', '.codex');
  const configPath = requireCanonicalPath(join(home, 'config.toml'), 'file');
  if (lstatSync(configPath).size > 1024 * 1024) throw new Error('CODEX_CONFIG_TOO_LARGE');
  const original = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(readFileSync(configPath));
  const bundlePath = requireCanonicalPath(join(root, 'dist', 'mcp', 'main.cjs'), 'file');
  const patch = createCodexConfigPatch(original, { nodePath: process.execPath, bundlePath, connectionPath,
    projectDirectory: root, contentLevel });
  const planDirectory = join(root, '.local', 'codex-setup');
  requireCanonicalPath(join(root, '.local'), 'directory');
  mkdirSync(planDirectory, { recursive: true });
  requireCanonicalPath(planDirectory, 'directory');
  const planPath = join(planDirectory, `plan-${randomUUID()}.json`);
  writeFileSync(planPath, JSON.stringify({ version: 1, configPath, originalSha256: patch.originalSha256,
    resultSha256: patch.resultSha256, appendedText: patch.appendedText }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { operation: 'preview', changed: patch.changed, configPath, planPath, connectionPath,
    tools: ['search', 'read'], contentLevel, serverName, userWideConfiguration: true,
    existingConfigurationPreserved: true, server: patch.server };
}

function status(contentLevel: ContentLevel): object {
  const connectionPath = selectedConnectionPath(contentLevel);
  if (!existsSync(connectionPath)) return { operation: 'status', configured: false };
  verifyPermissions();
  requireSelectedLevel(connectionPath, contentLevel);
  const connection = readConnectionFile(connectionPath);
  const opened = openConnection(connectionPath);
  try {
    const source = opened.db.prepare(`SELECT s.sequence, b.last_synced_at,
      (SELECT COUNT(*) FROM bookmarks m WHERE m.source_id=s.id) AS bookmark_count
      FROM sources s JOIN chrome_bindings b ON b.source_id=s.id WHERE s.id=?`).get(connection.sourceId);
    return { operation: 'status', configured: true, authorized: true, contentLevel,
      sourceId: connection.sourceId, grantId: connection.grantId, source };
  } finally { opened.db.close(); }
}

try {
  const { operation, contentLevel } = parseSetupArguments(process.argv.slice(2));
  const connectionPath = selectedConnectionPath(contentLevel);
  let result: object;
  if (operation === 'preview') result = preview(contentLevel);
  else if (operation === 'status') result = status(contentLevel);
  else if (operation === 'provision') {
    verifyPermissions();
    result = { operation, ...provisionCodexConnection({ databasePath, connectionPath, contentLevel,
      verifyConnectionFile: verifyPermissions }) };
  } else if (operation === 'revoke') {
    verifyPermissions();
    requireSelectedLevel(connectionPath, contentLevel);
    result = { operation, ...revokeCodexConnection(connectionPath) };
  } else throw new Error('EXPLICIT_APPLY_REQUIRED');
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  const safe = error instanceof Error && /^[A-Z_]{3,80}$/.test(error.message) ? error.message : 'CONNECTION_SETUP_FAILED';
  process.stderr.write(`AnySearch Codex setup: ${safe}. No credentials or config contents are shown.\n`);
  process.exitCode = 1;
}
