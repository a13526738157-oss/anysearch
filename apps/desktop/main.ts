import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, shell, Tray } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { DesktopBackendClient } from './backend-client.ts';
import { DESKTOP_CHANNELS as channels, parseLayout, parseProfileId, parseReadRequest, parseReference, parseResourceId, parseSearchRequest, parseSourceToggle, safeExternalUrl } from './desktop-contracts.ts';
import type { DesktopStatus, PairingSession, WindowLayout } from './desktop-contracts.ts';
import type { ReadResponse } from '../../src/core/contracts.ts';
import type { PairedSource } from '../../src/connectors/protocol.ts';
import { applyProgrammaticBounds, centeredWindowBounds } from './window-bounds.ts';
import { chromeProfileLaunchArguments, launchChromeProfile } from './chrome-launcher.ts';
import { parseGrantId, parseGrantPageRequest } from './permissions-contracts.ts';
import { createStartupReporter } from './startup-receipt.ts';
import { parseDoubleShiftEnabled } from './activation-contracts.ts';
import type { DesktopActivationStatus } from './activation-contracts.ts';
import { WindowsActivationClient } from './windows-activation.ts';

const QA_MODE = process.env.ANYSEARCH_QA === '1';
const startup = createStartupReporter();
const ACCELERATOR = 'Control+Shift+Space';
const WINDOW_SIZE = Object.freeze({ width: 760, compact: 148, expanded: 600 });
const entryPath = join(__dirname, 'index.html');
const entryUrl = pathToFileURL(entryPath).href;
const dataDirectory = resolve(process.env.ANYSEARCH_DATA_DIR ?? join(__dirname, '../../.local/desktop'));
const qaEffects: { openedUrls: string[]; copiedUrls: string[]; openedProfiles: string[] } = { openedUrls: [], copiedUrls: [], openedProfiles: [] };
let window: BrowserWindow | null = null;
let tray: Tray | null = null;
let backend: DesktopBackendClient;
let quitting = false;
let hotkeyRegistered = false;
let nativeMaterial = false;
let windowGeneration = 0;
let windowAction: 'show' | 'hide' | undefined;
let activationChange: Promise<DesktopActivationStatus> | undefined;
const activation = new WindowsActivationClient({ qaMode: QA_MODE, onToggle: () => { requestToggle(); } });

if (QA_MODE && !process.env.ANYSEARCH_DATA_DIR) throw new Error('QA requires an explicit temporary ANYSEARCH_DATA_DIR.');
mkdirSync(dataDirectory, { recursive: true });
app.setPath('userData', dataDirectory);
app.setPath('sessionData', join(dataDirectory, 'chromium'));
app.setName('AnySearch');

export function getQaSideEffects(): Readonly<typeof qaEffects & { hotkeyRegistered: boolean; trayCreated: boolean }> {
  if (!QA_MODE) throw new Error('QA is disabled.');
  return { ...structuredClone(qaEffects), hotkeyRegistered, trayCreated: tray !== null };
}

function requireSender(event: IpcMainInvokeEvent): void {
  if (!window || window.isDestroyed() || event.sender !== window.webContents
    || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== entryUrl) {
    throw new Error('UNTRUSTED_SENDER');
  }
}

async function showWindow(): Promise<void> {
  const target = window;
  if (quitting || activationChange || !target || target.isDestroyed()) return;
  const generation = ++windowGeneration;
  windowAction = 'show';
  try {
    if (!target.isFocused()) await activation.capture();
    if (quitting || generation !== windowGeneration || target !== window || target.isDestroyed()) return;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const { width, height } = target.getBounds();
    applyProgrammaticBounds(target, centeredWindowBounds(area, { width, height }));
    target.show();
    target.focus();
    target.webContents.send(channels.focus);
  } finally {
    if (generation === windowGeneration) windowAction = undefined;
  }
}

async function hideWindow(): Promise<void> {
  const target = window;
  if (quitting || activationChange || !target || target.isDestroyed()) return;
  const generation = ++windowGeneration;
  windowAction = 'hide';
  try {
    // Restore while still foreground; the helper rechecks ownership before focusing.
    if (target.isFocused()) await activation.restore();
    if (quitting || generation !== windowGeneration || target !== window || target.isDestroyed()) return;
    target.hide();
  } finally {
    if (generation === windowGeneration) windowAction = undefined;
  }
}

function requestShow(): void { void showWindow().catch(() => {}); }
function requestHide(): void { void hideWindow().catch(() => {}); }
function requestToggle(): void {
  if (quitting) return;
  if (windowAction === 'show' || (windowAction === undefined && window?.isVisible() && window.isFocused())) requestHide();
  else requestShow();
}

function resizeWindow(layout: WindowLayout): void {
  if (!window || window.isDestroyed()) return;
  const area = screen.getDisplayMatching(window.getBounds()).workArea;
  const width = Math.min(WINDOW_SIZE.width, area.width);
  const height = Math.min(WINDOW_SIZE[layout], area.height);
  const bounds = window.getBounds();
  applyProgrammaticBounds(window, { x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height)), width, height });
}

function registerIpc(): void {
  const handle = (channel: string, operation: (...args: unknown[]) => unknown): void => {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      requireSender(event);
      return operation(...args);
    });
  };
  handle(channels.status, async (): Promise<DesktopStatus> => {
    const shared = { hotkey: { accelerator: ACCELERATOR, registered: hotkeyRegistered }, nativeMaterial, activation: activation.status() };
    try {
      const result = await backend.request('status') as { sources: PairedSource[]; pairing?: PairingSession };
      return { ...result, ...shared, service: 'ready' };
    } catch {
      return { ...shared, sources: [], service: 'unavailable', error: 'SERVICE_UNAVAILABLE' };
    }
  });
  handle(channels.search, query => backend.request('search', parseSearchRequest(query)));
  handle(channels.read, reference => backend.request('read', parseReadRequest(reference)));
  handle(channels.startCapture, reference => backend.request('startCapture', parseReference(reference)));
  handle(channels.captureStatus, id => backend.request('captureStatus', parseResourceId(id)));
  handle(channels.cancelCapture, id => backend.request('cancelCapture', parseResourceId(id)));
  handle(channels.discoverProfiles, () => backend.request('discoverChromeProfiles'));
  handle(channels.beginPairing, profileId => backend.request('beginPairing', profileId === undefined ? undefined : parseProfileId(profileId)));
  handle(channels.openProfile, async profileId => {
    const id = parseProfileId(profileId);
    const target = await backend.request('resolveChromeProfile', id) as { userDataDirectory: string; directoryName: string };
    chromeProfileLaunchArguments(target);
    if (QA_MODE) qaEffects.openedProfiles.push(id);
    else await launchChromeProfile(target);
  });
  handle(channels.cancelPairing, () => backend.request('cancelPairing'));
  handle(channels.setSourceEnabled, (sourceId, enabled) => backend.request('setSourceEnabled', parseSourceToggle(sourceId, enabled)));
  handle(channels.disconnectSource, sourceId => backend.request('disconnectSource', { sourceId: parseSourceToggle(sourceId, false).sourceId }));
  handle(channels.listGrants, request => backend.request('listGrants', parseGrantPageRequest(request)));
  handle(channels.revokeGrant, grantId => backend.request('revokeGrant', parseGrantId(grantId)));
  handle(channels.setDoubleShiftEnabled, value => {
    const enabled = parseDoubleShiftEnabled(value);
    if (quitting) throw new Error('ACTIVATION_UNAVAILABLE');
    if (activationChange || windowAction) throw new Error('ACTIVATION_BUSY');
    activationChange = (async () => {
      if (enabled && !activation.status().doubleShift.enabled) {
        const target = window;
        if (!activation.status().supported || !target || target.isDestroyed()) throw new Error('ACTIVATION_UNAVAILABLE');
        const confirmation = await dialog.showMessageBox(target, {
          type: 'question', buttons: ['取消', '启用'], defaultId: 0, cancelId: 0, noLink: true,
          message: '允许在本机检测双 Shift 手势？',
          detail: '仅本次应用运行有效。其他按键只中断手势，不记录或输出输入内容；不拦截或注入按键。',
        });
        if (confirmation.response !== 1) return activation.status();
      }
      if (quitting) throw new Error('ACTIVATION_UNAVAILABLE');
      try { return await activation.setDoubleShiftEnabled(enabled); }
      catch {
        await activation.close().catch(() => {});
        throw new Error('ACTIVATION_UNAVAILABLE');
      }
    })().finally(() => { activationChange = undefined; });
    return activationChange;
  });
  handle(channels.open, async reference => {
    const item = await backend.request('read', parseReference(reference)) as ReadResponse;
    const url = safeExternalUrl(item.url);
    if (QA_MODE) qaEffects.openedUrls.push(url);
    else await shell.openExternal(url, { activate: true });
  });
  handle(channels.copy, async reference => {
    const item = await backend.request('read', parseReference(reference)) as ReadResponse;
    const url = safeExternalUrl(item.url);
    if (QA_MODE) qaEffects.copiedUrls.push(url);
    else clipboard.writeText(url);
  });
  handle(channels.hide, hideWindow);
  handle(channels.setLayout, layout => { resizeWindow(parseLayout(layout)); });
}

function createTrayIcon() {
  const size = 32;
  const bitmap = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const radius = Math.hypot(x - 13, y - 13);
    const handle = x >= 19 && x <= 28 && y >= 19 && y <= 28 && Math.abs(x - y) <= 2;
    if ((radius >= 7 && radius <= 10) || handle) {
      const offset = (y * size + x) * 4;
      bitmap[offset] = 145; bitmap[offset + 1] = 126; bitmap[offset + 2] = 101; bitmap[offset + 3] = 255;
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 1 });
}

async function createWindow(): Promise<void> {
  window = new BrowserWindow({
    width: WINDOW_SIZE.width, height: WINDOW_SIZE.compact, minWidth: 320, minHeight: 148,
    frame: false, resizable: false, maximizable: false, fullscreenable: false, show: false,
    skipTaskbar: true, title: 'AnySearch', backgroundColor: '#f5f7f9',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true,
      nodeIntegration: false, webSecurity: true, webviewTag: false,
      devTools: QA_MODE, spellcheck: false, backgroundThrottling: !QA_MODE,
    },
  });
  if (process.platform === 'win32') {
    try {
      window.setBackgroundMaterial('acrylic');
      window.setBackgroundColor('#00000000');
      nativeMaterial = true;
    } catch { nativeMaterial = false; }
  }
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => { event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => { event.preventDefault(); });
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => { callback(false); });
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.on('will-download', event => { event.preventDefault(); });
  window.on('close', event => {
    if (!quitting) { event.preventDefault(); requestHide(); }
  });
  await window.loadFile(entryPath);
  if (!QA_MODE) await showWindow();
}

const singleInstance = QA_MODE || app.requestSingleInstanceLock();
if (!singleInstance) { startup.report('already-running'); app.quit(); }
else {
  app.on('second-instance', requestShow);
  void app.whenReady().then(async () => {
    backend = new DesktopBackendClient(dataDirectory);
    await backend.request('status');
    await activation.start().catch(() => {});
    registerIpc();
    await createWindow();
    if (!QA_MODE) {
      hotkeyRegistered = globalShortcut.register(ACCELERATOR, requestToggle);
      tray = new Tray(createTrayIcon());
      tray.setToolTip('AnySearch');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: '打开 AnySearch', click: requestShow },
        { label: hotkeyRegistered ? '全局快捷键已注册' : '快捷键注册失败', enabled: false },
        { type: 'separator' },
        { label: '退出 AnySearch', click: () => { app.quit(); } },
      ]));
      tray.on('click', requestShow);
    }
    screen.on('display-removed', () => { if (window) resizeWindow(window.getBounds().height > WINDOW_SIZE.compact ? 'expanded' : 'compact'); });
    startup.report('ready');
  }).catch(() => {
    startup.report('error');
    process.stderr.write('AnySearch desktop startup failed.\n');
    app.exit(1);
  });
  app.on('before-quit', event => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    windowGeneration++;
    windowAction = undefined;
    if (!QA_MODE) globalShortcut.unregisterAll();
    tray?.destroy();
    void Promise.allSettled([activation.close(), backend ? backend.close() : Promise.resolve()]).then(results => {
      if (results.some(result => result.status === 'rejected')) {
        process.stderr.write('AnySearch could not close all local resources cleanly.\n');
        app.exit(1);
      } else app.quit();
    });
  });
  app.on('window-all-closed', () => {});
}
