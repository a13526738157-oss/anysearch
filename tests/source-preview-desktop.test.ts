import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ElectronApplication, Page } from 'playwright';
import type { DesktopApi } from '../apps/desktop/desktop-contracts.ts';

const stage = realpathSync(fileURLToPath(new URL('../', import.meta.url)));
const temporaryBase = realpathSync(tmpdir());
const marker = 'ui-jade-20261023';
const folder = 'Synthetic desktop fixtures';
const sourceLabel = 'Synthetic source preview desktop';
const fixtures = [
  { title: `Source preview ${marker} 中文检索与元数据预览`, url: 'https://example.invalid/source-preview-desktop' },
  { title: `Source preview ${marker} ${'ContinuousTitle'.repeat(10)}`, url: 'https://example.invalid/source-preview-desktop-long' },
] as const;

function inside(parent: string, child: string): boolean {
  const tail = relative(parent, child);
  return tail !== '' && tail !== '..' && !tail.startsWith(`..${sep}`) && !isAbsolute(tail);
}

function stagedFile(path: string, parent = stage): string {
  const actual = realpathSync(path);
  assert.ok(inside(parent, actual), 'Runtime/source must remain inside the independent stage');
  assert.ok(lstatSync(actual).isFile());
  return actual;
}

function sanitizeEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (/^(?:ANYSEARCH(?:_|$)|ELECTRON_|GLOBAL_AGENT_|HF_|HUGGINGFACE_|TRANSFORMERS_|NODE_(?:PATH|OPTIONS)$|npm_config_|PLAYWRIGHT_)/iu.test(key)
      || /(?:^|_)(?:https?|all|no)_proxy$/iu.test(key) || /(?:mirror|override)/iu.test(key)) delete process.env[key];
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

async function pidsGone(pids: readonly number[]): Promise<boolean> {
  for (let attempt = 0; attempt < 25; attempt++) {
    const alive = pids.some(pid => {
      try { process.kill(pid, 0); return true; }
      catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
    });
    if (!alive) return true;
    await delay(200);
  }
  return false;
}

async function layout(page: Page) {
  return await page.evaluate(() => {
    const issues: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('document horizontal overflow');
    const textSelectors = ['.search-header', '.source-strip', '.results', '.result-copy strong', '.result-copy > span',
      '.preview-body h1', '.bookmark-properties dd', '.grant-identifiers dd', '.grant-feedback',
      'dialog[open]', 'dialog[open] p', 'dialog[open] code', 'button.command-button'];
    for (const selector of textSelectors) for (const node of document.querySelectorAll<HTMLElement>(selector)) {
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      if (node.scrollWidth > node.clientWidth + 1) issues.push(`${selector}: text/content horizontal overflow`);
      if (selector === 'button.command-button' && node.scrollHeight > node.clientHeight + 1) issues.push('command label vertically clipped');
    }
    for (const selector of ['.search-header', '.source-strip', '.section-toolbar', '.confirmation-actions', '.grant-pages']) {
      for (const group of document.querySelectorAll(selector)) {
        const boxes = [...group.children].map(node => node.getBoundingClientRect()).filter(rect => rect.width && rect.height);
        for (const rect of boxes) if (rect.left < -1 || rect.right > innerWidth + 1) issues.push(`${selector}: child outside viewport`);
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i]!; const b = boxes[j]!;
          if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1
            && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push(`${selector}: sibling overlap`);
        }
      }
    }
    return { width: innerWidth, height: innerHeight, issues };
  });
}

async function resize(application: ElectronApplication, page: Page, width: number): Promise<void> {
  await application.evaluate(({ BrowserWindow }, value) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    if (window.isVisible()) throw new Error('Synthetic desktop must remain hidden');
    window.setResizable(true); window.setContentSize(value, 600); window.setResizable(false);
  }, width);
  await page.waitForFunction(value => innerWidth === value && innerHeight === 600, width);
}

async function capture(application: ElectronApplication, page: Page, file: string, width: number) {
  const measured = await layout(page);
  assert.equal(measured.width, width); assert.equal(measured.height, 600);
  assert.deepEqual(measured.issues, [], 'Measured text/control layout must not overflow or overlap');
  const pixels = await bounded(application.evaluate(async ({ BrowserWindow, nativeImage }, path) => {
    const window = BrowserWindow.getAllWindows()[0]!;
    if (window.isVisible()) throw new Error('Capture must not show the desktop');
    await window.capturePage(undefined, { stayHidden: true, stayAwake: true });
    await new Promise(resolve => setTimeout(resolve, 150));
    const image = await window.capturePage(undefined, { stayHidden: true, stayAwake: true });
    process.getBuiltinModule('node:fs').writeFileSync(path, image.toPNG());
    if (window.isVisible()) throw new Error('Capture showed the desktop');
    const decoded = nativeImage.createFromPath(path);
    const bitmap = decoded.toBitmap(); const colors = new Set<number>(); let visible = 0;
    for (let offset = 0; offset < bitmap.length; offset += 4) {
      if (bitmap[offset + 3]) { visible++; colors.add(bitmap.readUInt32LE(offset)); }
    }
    return { ...decoded.getSize(), uniqueVisibleColors: colors.size, visiblePixels: visible,
      hidden: !window.isVisible(), method: 'capturePage stayHidden/stayAwake, fixed warmup' };
  }, file), 10_000, 'Required hidden screenshot exceeded 10s');
  assert.equal(pixels.hidden, true); assert.ok(pixels.width > 0 && pixels.height > 0);
  assert.ok(pixels.uniqueVisibleColors > 20 && pixels.visiblePixels > pixels.width * pixels.height / 10,
    'Required screenshot must not be blank, uniform or wholly transparent');
  assert.ok(Math.abs(pixels.width / pixels.height - width / 600) < 0.02, 'Screenshot must cover the intended viewport');
  return { file, layout: measured, pixels };
}

test('SOURCE-DESKTOP-01 independent Electron source build renders synthetic search/preview and grant revocation', {
  timeout: 180_000,
  skip: inside(temporaryBase, stage) ? false : 'Requires reviewed TEMP source installation/build; workspace skip is not desktop evidence',
}, async t => {
  assert.equal(realpathSync(process.cwd()), stage);
  sanitizeEnvironment();
  const modules = realpathSync(join(stage, 'node_modules'));
  assert.equal(modules, join(stage, 'node_modules'));
  const playwrightEntry = stagedFile(fileURLToPath(import.meta.resolve('playwright')), modules);
  const electronPackage = stagedFile(join(modules, 'electron/package.json'), modules);
  assert.equal(JSON.parse(readFileSync(electronPackage, 'utf8')).version, '44.9.0');
  // Never require('electron'): its index.js can perform an implicit download when not ready.
  const electronDirectory = dirname(electronPackage);
  const pathFile = stagedFile(join(electronDirectory, 'path.txt'), electronDirectory);
  const executable = stagedFile(join(electronDirectory, 'dist', readFileSync(pathFile, 'utf8').trim()), join(electronDirectory, 'dist'));
  for (const asset of ['main.cjs', 'preload.cjs', 'worker.cjs', 'index.html', 'renderer.js', 'renderer.css']) {
    stagedFile(join(stage, 'dist/desktop', asset));
  }
  const main = stagedFile(join(stage, 'dist/desktop/main.cjs'));
  for (const file of ['src/storage/database.ts', 'src/connectors/broker.ts', 'src/storage/pairing.ts',
    'src/adapters/mcp/setup.ts', 'src/adapters/mcp/connection.ts']) stagedFile(join(stage, file));
  const { _electron: electron } = await import('playwright');
  const { openDatabase } = await import('../src/storage/database.ts');
  const { NativeBroker } = await import('../src/connectors/broker.ts');
  const { beginPairing } = await import('../src/storage/pairing.ts');
  const { provisionCodexConnection } = await import('../src/adapters/mcp/setup.ts');
  const { openConnection } = await import('../src/adapters/mcp/connection.ts');

  const root = realpathSync(mkdtempSync(join(temporaryBase, 'anysearch-source-preview-desktop-data-')));
  const artifacts = realpathSync(mkdtempSync(join(temporaryBase, 'anysearch-source-preview-desktop-evidence-')));
  for (const owned of [root, artifacts]) {
    assert.equal(dirname(owned), temporaryBase);
    assert.ok(inside(temporaryBase, owned) && owned !== stage && !lstatSync(owned).isSymbolicLink());
  }
  const dataDirectory = join(root, 'data'); const chromeDirectory = join(root, 'empty-synthetic-chrome');
  const home = join(root, 'home'); const appData = join(root, 'appdata'); const localAppData = join(root, 'localappdata');
  for (const path of [dataDirectory, chromeDirectory, home, appData, localAppData]) mkdirSync(path);
  const databasePath = join(dataDirectory, 'index.sqlite'); const connectionPath = join(root, 'synthetic-connection.json');
  const screenshots: Array<Awaited<ReturnType<typeof capture>>> = [];
  const errors: string[] = []; let outcome = 'incomplete'; let cleanup = 'retained';
  let application: ElectronApplication | undefined; let closed: Promise<{ code: number | null; signal: NodeJS.Signals | null }> | undefined;
  let safeToRemove = true; let ownedPids: number[] = [];
  const observations: Record<string, unknown> = { stage, playwrightEntry, executable, main, root, artifacts,
    boundary: 'Synthetic hidden Electron/Playwright only; no actual Chrome/Codex, model, hook, clipboard or URL-open acceptance' };
  t.diagnostic(`Synthetic desktop artifacts: ${artifacts}`);
  try {
    const db = openDatabase(databasePath); let sourceId: string;
    try {
      const broker = new NativeBroker(db, `chrome-extension://${'a'.repeat(32)}/`); let sequence = 0;
      const request = (input: Record<string, unknown>) => {
        const reply = broker.handle({ v: 1, id: `desktop-fixture-${++sequence}`, ...input });
        assert.equal(reply.ok, true, 'Production synthetic pairing/sync must succeed');
        if (!reply.ok) throw new Error('Synthetic pairing/sync rejected');
        return reply.result;
      };
      try {
        const paired = request({ type: 'pair', pairingCode: beginPairing(db).code,
          instanceId: 'source-preview-desktop-synthetic-0001', label: sourceLabel });
        sourceId = String(paired.sourceId); assert.match(sourceId, /^chrome:[0-9a-f-]{36}$/u);
        const credentials = { instanceId: 'source-preview-desktop-synthetic-0001', credential: paired.credential };
        const bytes = Buffer.from(JSON.stringify([{ id: '0', title: '', children: [
          { id: '1', parentId: '0', index: 0, title: folder, children: fixtures.map((item, index) => ({
            id: String(index + 2), parentId: '1', index, ...item,
          })) },
        ] }]));
        const begun = request({ type: 'begin', ...credentials, sequence: 1, chunkCount: 1,
          totalBytes: bytes.length, hash: createHash('sha256').update(bytes).digest('hex') });
        request({ type: 'chunk', ...credentials, transferId: begun.transferId, index: 0, data: bytes.toString('base64') });
        const committed = request({ type: 'commit', ...credentials, transferId: begun.transferId });
        assert.equal(committed.sequence, 1); assert.equal(committed.bookmarkCount, fixtures.length);
      } finally { broker.close(); }
    } finally { db.close(); }
    const provisioned = provisionCodexConnection({ databasePath, connectionPath });
    assert.equal(provisioned.sourceId, sourceId); assert.equal(provisioned.contentLevel, 'metadata');
    const authorizeExternal = () => { const connection = openConnection(connectionPath); try { connection.authorize(); } finally { connection.db.close(); } };
    authorizeExternal();
    const env: Record<string, string> = { HOME: home, USERPROFILE: home, APPDATA: appData, LOCALAPPDATA: localAppData,
      TEMP: root, TMP: root, XDG_CONFIG_HOME: appData, XDG_CACHE_HOME: join(root, 'cache'),
      ANYSEARCH_QA: '1', ANYSEARCH_DATA_DIR: dataDirectory, ANYSEARCH_CHROME_USER_DATA_DIR: chromeDirectory,
      ANYSEARCH_MODEL_DIR: join(root, 'missing-model'), ANYSEARCH_RERANKER_DIR: join(root, 'missing-reranker'),
      HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1' };
    for (const key of ['SystemRoot', 'WINDIR', 'SystemDrive', 'PATH', 'PATHEXT']) {
      const value = process.env[key]; if (value !== undefined) env[key] = value;
    }
    safeToRemove = false;
    application = await electron.launch({ executablePath: executable, args: [main, '--disable-background-networking',
      '--disable-component-update', '--disable-sync', '--no-first-run', '--no-default-browser-check'], cwd: stage, env, timeout: 30_000 });
    const child = application.process();
    if (child.pid) ownedPids.push(child.pid);
    closed = new Promise(resolveClosed => { child.once('close', (code, signal) => resolveClosed({ code, signal })); });
    const page = await application.firstWindow(); page.setDefaultTimeout(10_000);
    ownedPids = [...new Set([...ownedPids, ...await application.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid))])];
    page.on('pageerror', error => { errors.push(error.message); });
    await application.evaluate(({ session }) => {
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
    });
    await page.getByRole('combobox', { name: '搜索资料' }).waitFor();
    await page.waitForFunction(async () => (await (window as unknown as { anysearch: DesktopApi }).anysearch.status()).service === 'ready');
    const inspectIsolation = async () => await application!.evaluate(({ app, BrowserWindow, globalShortcut }, entry) => {
      const mainExports = process.getBuiltinModule('node:module').createRequire(entry)(entry) as {
        getQaSideEffects(): { openedUrls: string[]; copiedUrls: string[]; openedProfiles: string[]; hotkeyRegistered: boolean; trayCreated: boolean };
      };
      const window = BrowserWindow.getAllWindows()[0]!;
      return { effects: mainExports.getQaSideEffects(), actualHotkey: globalShortcut.isRegistered('Control+Shift+Space'),
        visible: window.isVisible(), userData: app.getPath('userData'), sessionData: app.getPath('sessionData'),
        electron: process.versions.electron, url: window.webContents.getURL() };
    }, main);
    const initialIsolation = await inspectIsolation();
    assert.deepEqual(initialIsolation.effects, { openedUrls: [], copiedUrls: [], openedProfiles: [], hotkeyRegistered: false, trayCreated: false });
    assert.equal(initialIsolation.actualHotkey, false); assert.equal(initialIsolation.visible, false);
    assert.equal(realpathSync(initialIsolation.userData), realpathSync(dataDirectory));
    assert.equal(realpathSync(initialIsolation.sessionData), realpathSync(join(dataDirectory, 'chromium')));
    assert.equal(initialIsolation.electron, '44.9.0'); observations.runtime = initialIsolation;
    assert.equal(initialIsolation.url, pathToFileURL(join(stage, 'dist/desktop/index.html')).href);
    const status = await page.evaluate(() => (window as unknown as { anysearch: DesktopApi }).anysearch.status());
    assert.equal(status.sources.length, 1); assert.equal(status.sources[0]!.sourceId, sourceId);
    assert.equal(status.sources[0]!.bookmarkCount, fixtures.length); assert.equal(status.hotkey.registered, false);
    assert.equal(status.activation?.supported, false); assert.equal(status.activation?.doubleShift.enabled, false);
    await page.getByRole('button', { name: '关键词', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '关键词', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('combobox', { name: '搜索资料' }).fill(marker);
    await page.waitForFunction(count => document.querySelectorAll('[role="option"]').length === count, fixtures.length);
    for (const fixture of fixtures) assert.equal(await page.getByRole('button', { name: `预览 ${fixture.title}`, exact: true }).count(), 1);
    assert.equal(await page.locator('.semantic-status').count(), 0);
    await resize(application, page, 760);
    screenshots.push(await capture(application, page, join(artifacts, '01-results-760.png'), 760));
    await page.getByRole('button', { name: `预览 ${fixtures[0].title}`, exact: true }).click();
    await page.locator('.bookmark-properties').waitFor();
    assert.equal(await page.locator('.preview-body h1').innerText(), fixtures[0].title);
    assert.equal(await page.locator('.bookmark-properties dd').nth(0).innerText(), fixtures[0].url);
    assert.equal(await page.locator('.bookmark-properties dd').nth(1).innerText(), folder);
    assert.equal(await page.locator('.evidence-label').innerText(), '仅书签信息 · 未取得正文');
    await resize(application, page, 760);
    screenshots.push(await capture(application, page, join(artifacts, '02-preview-760.png'), 760));
    await page.getByRole('button', { name: '返回结果', exact: true }).click();
    await page.getByRole('option').first().waitFor(); await resize(application, page, 390);
    screenshots.push(await capture(application, page, join(artifacts, '03-results-390.png'), 390));
    await page.getByRole('button', { name: `预览 ${fixtures[1].title}`, exact: true }).click();
    await page.locator('.bookmark-properties').waitFor(); await resize(application, page, 390);
    assert.equal(await page.locator('.preview-body h1').innerText(), fixtures[1].title);
    screenshots.push(await capture(application, page, join(artifacts, '04-long-preview-390.png'), 390));
    await page.getByRole('button', { name: '来源与连接', exact: true }).click();
    await page.getByRole('button', { name: '本机授权', exact: true }).click();
    const revokeButton = page.getByRole('button', { name: `撤销授权 ${provisioned.grantId}`, exact: true });
    await revokeButton.waitFor(); await resize(application, page, 390);
    const grants = await page.evaluate(() => (window as unknown as { anysearch: DesktopApi }).anysearch.listGrants());
    assert.equal(grants.items.length, 3); assert.equal(grants.nextCursor, undefined);
    assert.equal(grants.items.filter(item => item.currentDesktopSession).length, 2);
    assert.deepEqual(grants.items.filter(item => item.currentDesktopSession).map(item => item.contentLevel).sort(), ['metadata', 'public_text']);
    for (const grant of grants.items.filter(item => item.currentDesktopSession)) {
      assert.equal(await page.getByRole('button', { name: `撤销授权 ${grant.id}`, exact: true }).count(), 0);
    }
    await revokeButton.click();
    const dialog = page.getByRole('dialog', { name: '撤销此本机授权？', exact: true });
    await dialog.waitFor(); assert.ok((await dialog.innerText()).includes(provisioned.grantId));
    screenshots.push(await capture(application, page, join(artifacts, '05-revoke-dialog-390.png'), 390));
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' }); authorizeExternal();
    assert.equal(await revokeButton.count(), 1);
    await revokeButton.click(); await dialog.waitFor();
    await dialog.getByRole('button', { name: '撤销授权', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const feedback = page.getByText('此授权已撤销。Chrome 同步和本机索引保持不变。', { exact: true });
    await feedback.waitFor();
    const revokedRow = page.locator('.grant-item').filter({ hasText: provisioned.grantId });
    await revokedRow.getByText('已撤销', { exact: true }).waitFor();
    assert.equal(await revokeButton.count(), 0); assert.throws(authorizeExternal, /Access is not authorized/u);
    await revokedRow.scrollIntoViewIfNeeded();
    screenshots.push(await capture(application, page, join(artifacts, '06-revoked-row-390.png'), 390));
    await feedback.scrollIntoViewIfNeeded();
    screenshots.push(await capture(application, page, join(artifacts, '07-revoked-feedback-390.png'), 390));
    const after = await page.evaluate(() => (window as unknown as { anysearch: DesktopApi }).anysearch.listGrants());
    assert.equal(after.items.length, 3); assert.equal(after.items.filter(item => item.revoked).length, 1);
    assert.equal(after.items.find(item => item.id === provisioned.grantId)?.revoked, true);
    assert.ok(after.items.filter(item => item.currentDesktopSession).every(item => !item.revoked));
    await page.getByRole('button', { name: '返回来源与连接', exact: true }).click();
    await page.getByRole('button', { name: '返回搜索', exact: true }).click();
    await page.waitForFunction(count => document.querySelectorAll('[role="option"]').length === count, fixtures.length);
    const finalIsolation = await inspectIsolation();
    assert.deepEqual(finalIsolation.effects, initialIsolation.effects);
    assert.equal(finalIsolation.actualHotkey, false); assert.equal(finalIsolation.visible, false);
    assert.deepEqual(readdirSync(chromeDirectory), [], 'No synthetic or real Chrome Local State is needed');
    assert.equal(existsSync(join(root, 'missing-model')), false); assert.equal(existsSync(join(root, 'missing-reranker')), false);
    const reopened = openDatabase(databasePath, { mustExist: true });
    try {
      const rows = reopened.prepare('SELECT title, url, body, source_id FROM bookmarks ORDER BY url').all();
      assert.deepEqual(rows.map(row => ({ title: row.title, url: row.url })), [...fixtures].sort((a, b) => a.url.localeCompare(b.url)));
      assert.ok(rows.every(row => row.body === '' && row.source_id === sourceId));
      assert.equal(reopened.prepare('SELECT enabled, sequence FROM sources WHERE id = ?').get(sourceId)?.enabled, 1);
      assert.equal(reopened.prepare('SELECT enabled, sequence FROM sources WHERE id = ?').get(sourceId)?.sequence, 1);
    } finally { reopened.close(); }
    assert.deepEqual(errors, []); assert.equal(screenshots.length, 7);
    ownedPids = [...new Set([...ownedPids, ...await application.evaluate(({ app }) => app.getAppMetrics().map(metric => metric.pid))])];
    if (child.pid && !ownedPids.includes(child.pid)) ownedPids.push(child.pid);
    observations.sampledOwnedPids = ownedPids;
    await bounded(application.close(), 20_000, 'Owned Electron close exceeded 20s'); application = undefined;
    const exit = await bounded(closed, 5_000, 'Owned Electron process close unconfirmed');
    observations.exit = exit; assert.equal(exit.code, 0); assert.equal(exit.signal, null);
    safeToRemove = await pidsGone(ownedPids); assert.equal(safeToRemove, true, 'Sampled owned processes remain; retain fixture');
    outcome = 'assertions-completed';
  } catch (error) {
    observations.failure = error instanceof Error ? error.message : String(error); throw error;
  } finally {
    try {
      if (application) {
        await bounded(application.close(), 20_000, 'Cleanup could not close owned Electron');
        if (closed) await bounded(closed, 5_000, 'Cleanup did not observe Electron process close');
        safeToRemove = await pidsGone(ownedPids);
      }
      if (safeToRemove) {
        assert.equal(realpathSync(root), root); assert.equal(dirname(root), temporaryBase);
        assert.ok(inside(temporaryBase, root) && root !== stage && !lstatSync(root).isSymbolicLink());
        rmSync(root, { recursive: true, maxRetries: 5, retryDelay: 200 }); cleanup = 'owned fixture removed';
      }
    } finally {
      assert.equal(realpathSync(artifacts), artifacts); assert.equal(dirname(artifacts), temporaryBase);
      assert.ok(inside(temporaryBase, artifacts) && !lstatSync(artifacts).isSymbolicLink());
      writeFileSync(join(artifacts, 'observations.json'), JSON.stringify({ ...observations, outcome, cleanup, errors, screenshots,
        limits: 'Seven required screenshots plus bounded DOM/pixel checks, not full UX/native/IME/DPI or semantic acceptance. Evidence retained; no gate verdict authored by this runner.' }, null, 2) + '\n');
      t.diagnostic(`Synthetic desktop outcome: ${outcome}; ${cleanup}; evidence retained at ${artifacts}`);
    }
  }
});
