import { createHash } from 'node:crypto';
import { posix, win32 } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse, stringify, type TomlTable, type TomlValue } from 'smol-toml';
import type { ContentLevel } from '../../core/contracts.ts';
import { contentAccessProfile } from './content-access.ts';

export interface CodexConfigOptions {
  nodePath: string;
  bundlePath: string;
  connectionPath: string;
  projectDirectory: string;
  contentLevel?: ContentLevel;
}

export interface CodexConfigPatch {
  changed: boolean;
  originalSha256: string;
  resultSha256: string;
  content: string;
  appendedText: string;
  server: TomlTable;
}

function parseConfig(text: string, errorCode: string): TomlTable {
  try {
    return parse(text, { integersAsBigInt: 'asNeeded', unsafeKeyBehaviour: 'throw' });
  } catch {
    // Parser diagnostics can contain unrelated configuration values.
    throw new Error(errorCode);
  }
}

function isTable(value: TomlValue | undefined): value is TomlTable {
  return typeof value === 'object' && value !== null
    && [null, Object.prototype].includes(Object.getPrototypeOf(value));
}

function requireAbsolutePath(value: string): string {
  const absolute = typeof value === 'string' && (
    posix.isAbsolute(value) || (win32.isAbsolute(value) && win32.parse(value).root.length > 1)
  );
  if (!absolute || value.length > 32_767 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('CODEX_CONFIG_INVALID_PATH');
  }
  return value;
}

export function hashCodexConfig(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function assertCodexConfigSnapshot(currentText: string, expectedSha256: string): void {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256) || hashCodexConfig(currentText) !== expectedSha256) {
    throw new Error('CODEX_CONFIG_CONCURRENT_CHANGE');
  }
}

export function createCodexConfigPatch(originalText: string, options: CodexConfigOptions): CodexConfigPatch {
  const { serverName } = contentAccessProfile(options.contentLevel);
  const before = parseConfig(originalText, 'CODEX_CONFIG_INVALID');
  const servers = before.mcp_servers;
  if (servers !== undefined && !isTable(servers)) throw new Error('CODEX_CONFIG_CONFLICT');
  const server: TomlTable = {
    command: requireAbsolutePath(options.nodePath),
    args: [requireAbsolutePath(options.bundlePath), '--connection', requireAbsolutePath(options.connectionPath)],
    cwd: requireAbsolutePath(options.projectDirectory),
    enabled: true,
    enabled_tools: ['search', 'read'],
    default_tools_approval_mode: 'prompt',
    tools: {
      search: { approval_mode: 'approve' },
      read: { approval_mode: 'approve' },
    },
  };
  const originalSha256 = hashCodexConfig(originalText);
  if (servers && Object.hasOwn(servers, serverName)) {
    if (!isDeepStrictEqual(servers[serverName], server, { skipPrototype: true })) throw new Error('CODEX_CONFIG_CONFLICT');
    return { changed: false, originalSha256, resultSha256: originalSha256, content: originalText, appendedText: '', server };
  }

  const newline = originalText.includes('\r\n') ? '\r\n' : '\n';
  const separator = originalText.length === 0 ? '' : originalText.endsWith('\n') ? newline : newline + newline;
  const block = stringify({ mcp_servers: { [serverName]: server } }).replaceAll('\n', newline);
  const appendedText = `${separator}# AnySearch local read-only bookmark connection.${newline}${block}${newline}`;
  const content = originalText + appendedText;
  const after = parseConfig(content, 'CODEX_CONFIG_APPEND_UNSAFE');
  const expected = { ...before, mcp_servers: { ...servers, [serverName]: server } };
  // An append must not redefine an inline table or alter any existing value.
  if (!isDeepStrictEqual(after, expected, { skipPrototype: true })) throw new Error('CODEX_CONFIG_APPEND_UNSAFE');
  return { changed: true, originalSha256, resultSha256: hashCodexConfig(content), content, appendedText, server };
}
