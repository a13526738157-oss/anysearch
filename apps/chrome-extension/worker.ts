/// <reference types="chrome" />
import { NATIVE_HOST_NAME } from '../../src/connectors/protocol.ts';
import { ExtensionController } from './controller.ts';
import { isOrdinaryContext, isTrustedPopup } from './context.ts';
import { NativeRpc } from './native-rpc.ts';
import { SyncClient, SyncError } from './sync-client.ts';

const STATE_KEY = 'anysearch.connection.v1';
const RECONCILE_ALARM = 'anysearch.reconcile';
const RETRY_ALARM = 'anysearch.retry';
const RECONCILE_MINUTES = 60;
let readiness: Promise<void> | undefined;

async function scheduleRetry(code: string): Promise<void> {
  await chrome.alarms.create(RETRY_ALARM, { delayInMinutes: code === 'ACCESS_DENIED' ? RECONCILE_MINUTES : 1 });
}

const rpc = new NativeRpc(
  () => chrome.runtime.connectNative(NATIVE_HOST_NAME),
  () => { void chrome.runtime.lastError; },
);
const client = new SyncClient(rpc);
const controller = new ExtensionController({
  load: async () => (await chrome.storage.local.get(STATE_KEY))[STATE_KEY] as unknown,
  save: async (state) => { await chrome.storage.local.set({ [STATE_KEY]: state }); },
  newId: () => crypto.randomUUID(),
  pair: (instanceId, code, label, selectionToken) => client.pair(instanceId, code, label, selectionToken),
  synchronize: (instanceId, pairing, assertSnapshotAllowed) => client.synchronize(instanceId, pairing,
    () => chrome.bookmarks.getTree(), assertSnapshotAllowed),
  scheduleRetry,
});

async function updateStatusBadge() {
  const status = await controller.status();
  await chrome.action.setBadgeText({ text: status.error === null ? '' : '!' });
  return status;
}

function background(work: () => Promise<unknown>): void {
  void ensureReady().then(async () => {
    await work();
    await updateStatusBadge();
  }).catch(() => {
    void chrome.action.setBadgeText({ text: '!' }).catch(() => {});
  });
}

// Register listeners before the first asynchronous storage operation.
chrome.bookmarks.onCreated.addListener(() => background(() => controller.changed()));
chrome.bookmarks.onChanged.addListener(() => background(() => controller.changed()));
chrome.bookmarks.onMoved.addListener(() => background(() => controller.changed()));
chrome.bookmarks.onChildrenReordered.addListener(() => background(() => controller.changed()));
chrome.bookmarks.onRemoved.addListener(() => background(() => controller.changed()));
chrome.bookmarks.onImportBegan.addListener(() => {
  controller.setImporting(true);
  background(() => controller.changed());
});
chrome.bookmarks.onImportEnded.addListener(() => {
  controller.setImporting(false);
  background(() => controller.changed());
});
chrome.runtime.onStartup.addListener(() => background(() => controller.changed()));
chrome.runtime.onInstalled.addListener(() => background(() => controller.changed()));
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RECONCILE_ALARM || alarm.name === RETRY_ALARM) background(() => controller.changed());
});
chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
  if (!isTrustedPopup(sender, chrome.runtime.id, chrome.runtime.getURL('popup.html'))) return false;
  if (!isOrdinaryContext(chrome.extension.inIncognitoContext, sender)) {
    respond({ ok: false, error: 'unsupported_context' });
    return false;
  }
  void ensureReady().then(async () => {
    if (message === null || typeof message !== 'object') throw new SyncError('invalid_command');
    const command = message as { type?: unknown; code?: unknown; label?: unknown; selectionToken?: unknown };
    if (command.type === 'pairing-info' && typeof command.code === 'string'
      && command.code.trim().length > 0 && command.code.length <= 128) {
      if ((await controller.status()).paired) throw new SyncError('already_paired');
      respond({ ok: true, pairingInfo: await client.pairingInfo(command.code.trim()) });
      return;
    }
    if (command.type === 'pair' && typeof command.code === 'string'
      && (command.label === undefined || typeof command.label === 'string')
      && (command.selectionToken === undefined || typeof command.selectionToken === 'string')) {
      await controller.pair(command.code, command.label, command.selectionToken);
    } else if (command.type === 'refresh') {
      await controller.changed();
    } else if (command.type === 'resume-after-import') {
      await controller.resumeAfterImport();
    } else if (command.type === 'reset-pairing') {
      await controller.resetPairing();
    } else if (command.type !== 'status') {
      throw new SyncError('invalid_command');
    }
    respond({ ok: true, status: await updateStatusBadge() });
  }).catch((error: unknown) => {
    respond({ ok: false, error: error instanceof SyncError ? error.code : 'connection_unavailable' });
  });
  return true;
});

function ensureReady(): Promise<void> {
  readiness ??= (async () => {
    if (!isOrdinaryContext(chrome.extension.inIncognitoContext)) throw new SyncError('unsupported_context');
    await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    if (await chrome.alarms.get(RECONCILE_ALARM) === undefined) {
      await chrome.alarms.create(RECONCILE_ALARM, { periodInMinutes: RECONCILE_MINUTES });
    }
    await controller.status();
  })().catch(async (error: unknown) => {
    if (!(error instanceof SyncError && error.code === 'unsupported_context')) {
      await scheduleRetry(error instanceof SyncError ? error.code : 'connection_unavailable').catch(() => {});
    }
    readiness = undefined;
    throw error;
  });
  return readiness;
}
background(() => controller.start());
