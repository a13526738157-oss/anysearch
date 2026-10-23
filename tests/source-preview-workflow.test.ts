import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client as SdkClient } from '@modelcontextprotocol/sdk/client/index.js';
import type { StdioClientTransport as SdkTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ReadResponse, SearchResponse } from '../src/core/contracts.ts';

const stage = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const temporaryBase = realpathSync(tmpdir());
const marker = 'jade-marker-853';
const title = `Synthetic source preview ${marker}`;
const sourceUrl = 'https://example.invalid/source-preview-fixture';
const folder = 'Source preview fixtures';
const metadata = JSON.stringify({ title, url: sourceUrl, folderPath: [folder] }, null, 2);
const startupDiagnostic = 'AnySearch MCP startup failed: check local connection setup.\n';

function inside(parent: string, child: string): boolean {
  const tail = relative(parent, child);
  return tail !== '' && tail !== '..' && !tail.startsWith(`..${sep}`) && !isAbsolute(tail);
}

function localFile(path: string, parent = stage): string {
  const actual = realpathSync(path);
  assert.ok(inside(parent, actual), 'Source/dependency must resolve inside the staged copy');
  assert.ok(lstatSync(actual).isFile(), 'Expected a staged regular file');
  return actual;
}

function sanitizeEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (/^(?:ANYSEARCH(?:_|$)|HF_|HUGGINGFACE_|TRANSFORMERS_|NODE_(?:PATH|OPTIONS)$|ELECTRON_RUN_AS_NODE$)/iu.test(key)) {
      delete process.env[key];
    }
  }
}

async function bounded<T>(work: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

interface Session {
  client: SdkClient;
  transport: SdkTransport;
  closed: Promise<void>;
}

async function restartWithRevokedConnection(main: string, connection: string, env: Record<string, string>,
  observeClosed: (closed: boolean) => void) {
  return await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveRun, reject) => {
    const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', main, '--connection', connection], {
      cwd: stage, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    observeClosed(false);
    let stdout = ''; let stderr = ''; let expired = false;
    const timer = setTimeout(() => { expired = true; child.kill(); }, 10_000);
    const terminal = setTimeout(() => reject(new Error('Owned restarted MCP close unconfirmed after 15s; TEMP retained')), 15_000);
    child.stdout.on('data', data => { stdout += String(data); });
    child.stderr.on('data', data => { stderr += String(data); });
    child.once('error', error => { clearTimeout(timer); clearTimeout(terminal); reject(error); });
    child.once('close', code => {
      clearTimeout(timer); clearTimeout(terminal); observeClosed(true);
      if (expired) reject(new Error('Owned restarted MCP exceeded 10s; no successful revocation verdict'));
      else resolveRun({ code, stdout, stderr });
    });
  });
}

// Root regression may discover this file, but only the reviewed TEMP copy is the installation proof.
test('SOURCE-DEMO-01 staged source -> production pairing -> SDK citation -> live and restarted revocation', {
  timeout: 60_000,
  skip: inside(temporaryBase, stage) ? false : 'Requires reviewed independent TEMP source installation; not evidence from the workspace',
}, async t => {
  assert.equal(realpathSync(process.cwd()), stage, 'Run from the staged source root');
  sanitizeEnvironment();
  const modules = realpathSync(join(stage, 'node_modules'));
  assert.equal(modules, join(stage, 'node_modules'), 'Staged node_modules must not be an external link');
  const sdkFiles = [
    '@modelcontextprotocol/sdk/client/index.js',
    '@modelcontextprotocol/sdk/client/stdio.js',
    '@modelcontextprotocol/sdk/server/stdio.js',
    'zod',
  ].map(specifier => localFile(fileURLToPath(import.meta.resolve(specifier)), modules));
  const main = localFile(join(stage, 'src/adapters/mcp/main.ts'));
  for (const source of ['src/storage/database.ts', 'src/storage/pairing.ts', 'src/connectors/broker.ts', 'src/adapters/mcp/setup.ts']) {
    localFile(join(stage, source));
  }
  t.diagnostic(JSON.stringify({ stage, sdkFiles, main, level: 'synthetic source/SDK, not Chrome/Codex/Electron' }));

  const { openDatabase } = await import('../src/storage/database.ts');
  const { NativeBroker } = await import('../src/connectors/broker.ts');
  const { beginPairing } = await import('../src/storage/pairing.ts');
  const { provisionCodexConnection, revokeCodexConnection } = await import('../src/adapters/mcp/setup.ts');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const root = realpathSync(mkdtempSync(join(temporaryBase, 'anysearch-source-preview-workflow-')));
  assert.equal(dirname(root), temporaryBase);
  assert.ok(inside(temporaryBase, root) && root !== stage);
  const data = join(root, 'data'); mkdirSync(data);
  const missingModel = join(root, 'missing-model');
  const missingReranker = join(root, 'missing-reranker');
  const childEnv: Record<string, string> = {
    TEMP: root, TMP: root, HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root,
    ANYSEARCH_MODEL_DIR: missingModel, ANYSEARCH_RERANKER_DIR: missingReranker,
    HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1',
  };
  for (const key of ['SystemRoot', 'WINDIR', 'SystemDrive', 'PATH', 'PATHEXT']) {
    const value = process.env[key];
    if (value !== undefined) childEnv[key] = value;
  }
  const databasePath = join(data, 'index.sqlite');
  const connectionPath = join(root, 'synthetic-connection.json');
  let db: ReturnType<typeof openDatabase> | undefined;
  let session: Session | undefined;
  let removable = true;
  try {
    db = openDatabase(databasePath);
    const broker = new NativeBroker(db, `chrome-extension://${'a'.repeat(32)}/`);
    let sequence = 0;
    const request = (input: Record<string, unknown>) => {
      const response = broker.handle({ v: 1, id: `source-preview-${++sequence}`, ...input });
      assert.equal(response.ok, true, 'Synthetic native protocol request must succeed');
      if (!response.ok) throw new Error('Synthetic native protocol request rejected');
      return response.result;
    };
    let sourceId: string;
    try {
      const paired = request({ type: 'pair', pairingCode: beginPairing(db).code,
        instanceId: 'source-preview-synthetic-instance-0001', label: 'Synthetic source preview' });
      assert.equal(typeof paired.sourceId, 'string');
      sourceId = String(paired.sourceId);
      assert.match(sourceId, /^chrome:[0-9a-f-]{36}$/u);
      const credentials = { instanceId: 'source-preview-synthetic-instance-0001', credential: paired.credential };
      const bytes = Buffer.from(JSON.stringify([{ id: '0', title: '', children: [
        { id: '1', parentId: '0', index: 0, title: folder, children: [
          { id: '2', parentId: '1', index: 0, title, url: sourceUrl },
        ] },
      ] }]));
      const begun = request({ type: 'begin', ...credentials, sequence: 1,
        hash: createHash('sha256').update(bytes).digest('hex'), totalBytes: bytes.length, chunkCount: 1 });
      assert.equal(begun.nextIndex, 0);
      const chunked = request({ type: 'chunk', ...credentials, transferId: begun.transferId, index: 0, data: bytes.toString('base64') });
      assert.equal(chunked.nextIndex, 1);
      const committed = request({ type: 'commit', ...credentials, transferId: begun.transferId });
      assert.equal(committed.bookmarkCount, 1); assert.equal(committed.sequence, 1);
      assert.equal(typeof committed.lastSyncedAt, 'string');
    } finally { broker.close(); }
    const provisioned = provisionCodexConnection({ databasePath, connectionPath });
    assert.equal(provisioned.sourceId, sourceId); assert.equal(provisioned.contentLevel, 'metadata');
    assert.equal(provisioned.reused, false);
    const originalConnection = readFileSync(connectionPath);
    const transport = new StdioClientTransport({ command: process.execPath,
      args: ['--disable-warning=ExperimentalWarning', main, '--connection', connectionPath],
      cwd: stage, env: childEnv, stderr: 'pipe' });
    let stderr = '';
    transport.stderr?.on('data', data => { stderr += String(data); });
    const client = new Client({ name: 'synthetic-source-preview-consumer', version: '1' });
    let observedClose: (() => void) | undefined;
    const closed = new Promise<void>(resolveClosed => { observedClose = resolveClosed; });
    let protocolClose: (() => void) | undefined;
    // Preserve actual child-close observation when Client.connect assigns its callback.
    Object.defineProperty(transport, 'onclose', {
      configurable: true,
      get: () => {
        const handler = protocolClose;
        return () => { removable = true; observedClose?.(); handler?.(); };
      },
      set: (handler: (() => void) | undefined) => { protocolClose = handler; },
    });
    session = { client, transport, closed };
    removable = false;
    await client.connect(transport, { timeout: 5_000 });
    assert.equal(typeof transport.pid, 'number', 'SDK must launch a real staged production MCP process');

    const searched = await client.callTool({ name: 'search', arguments: { query: marker, mode: 'keyword' } });
    assert.notEqual(searched.isError, true); assert.ok(searched.structuredContent);
    const result = searched.structuredContent as unknown as SearchResponse;
    assert.equal(result.mode, 'keyword'); assert.equal(result.evidenceCompleteness, 'partial');
    assert.equal(result.untrustedContent, true); assert.equal(result.items.length, 1);
    const item = result.items[0]!;
    assert.match(item.id, /^[0-9a-f]{64}$/u); assert.match(item.snapshotId, /^[0-9a-f]{64}$/u);
    assert.equal(item.sourceId, sourceId); assert.equal(item.title, title); assert.equal(item.url, sourceUrl);
    assert.deepEqual(item.folderPath, [folder]); assert.equal(item.contentLevel, 'metadata');
    const read = await client.callTool({ name: 'read', arguments: { id: item.id, snapshotId: item.snapshotId } });
    assert.notEqual(read.isError, true); assert.ok(read.structuredContent);
    const evidence = read.structuredContent as unknown as ReadResponse;
    assert.equal(evidence.id, item.id); assert.equal(evidence.sourceId, sourceId);
    assert.equal(evidence.snapshotId, item.snapshotId); assert.equal(evidence.url, sourceUrl);
    assert.equal(evidence.title, title); assert.equal(evidence.contentLevel, 'metadata');
    assert.equal(evidence.text, metadata); assert.equal(evidence.lineStart, 1);
    assert.equal(evidence.lineEnd, metadata.split('\n').length); assert.equal(evidence.truncated, false);
    assert.equal(evidence.sha256, createHash('sha256').update(metadata).digest('hex'));
    assert.equal(evidence.untrustedContent, true); assert.equal(evidence.applicability, 'unknown');
    const citation = `[${evidence.title}](${evidence.url}) [source ${evidence.sourceId}; snapshot ${evidence.snapshotId}; index ${evidence.lineStart}-${evidence.lineEnd}; metadata only]`;
    assert.equal(citation, `[${title}](${sourceUrl}) [source ${sourceId}; snapshot ${item.snapshotId}; index 1-${metadata.split('\n').length}; metadata only]`);
    t.diagnostic(JSON.stringify({ citation, provenance: 'synthetic metadata; not fetched page text or actual Codex output' }));

    const revoked = revokeCodexConnection(connectionPath);
    assert.equal(revoked.revoked, true); assert.equal(revoked.grantId, provisioned.grantId);
    assert.ok(originalConnection.equals(readFileSync(connectionPath)), 'Revocation must not replace the connection');
    for (const request of [
      { name: 'search', arguments: { query: marker, mode: 'keyword' } },
      { name: 'read', arguments: { id: item.id, snapshotId: item.snapshotId } },
    ]) {
      const denied = await client.callTool(request);
      assert.equal(denied.isError, true); assert.equal(denied.structuredContent, undefined);
      assert.deepEqual(denied.content, [{ type: 'text', text: JSON.stringify({ error: {
        code: 'ACCESS_DENIED', message: 'Access is not authorized.',
      } }) }]);
      assert.ok(!JSON.stringify(denied).includes(marker) && !JSON.stringify(denied).includes(sourceUrl));
    }
    await client.close();
    await bounded(closed, 5_000, 'Owned SDK MCP did not report actual process close; retain TEMP evidence');
    assert.equal(stderr, '', 'Normal production MCP must keep diagnostics empty');
    session = undefined;
    const restarted = await restartWithRevokedConnection(main, connectionPath, childEnv, closed => { removable = closed; });
    assert.equal(restarted.code, 1); assert.equal(restarted.stdout, '');
    assert.equal(restarted.stderr, startupDiagnostic);
    assert.ok(originalConnection.equals(readFileSync(connectionPath)), 'Restart uses the same revoked connection bytes');
    assert.equal(existsSync(missingModel), false); assert.equal(existsSync(missingReranker), false);
  } finally {
    try {
      if (session) {
        await session.client.close(); await session.transport.close();
        await bounded(session.closed, 5_000, 'Owned SDK MCP close not observed; TEMP retained');
      }
    } finally {
      db?.close();
      if (removable) {
        // Only this exact created root is removable; never delete the reviewed source stage.
        assert.equal(realpathSync(root), root); assert.equal(dirname(root), temporaryBase);
        assert.ok(inside(temporaryBase, root) && root !== stage && !lstatSync(root).isSymbolicLink());
        rmSync(root, { recursive: true, force: false });
      } else { t.diagnostic(`Owned MCP close unconfirmed; synthetic TEMP retained at ${root}`); }
    }
  }
});
