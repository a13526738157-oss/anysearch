/// <reference types="chrome" />
import { DEFAULT_PROFILE_LABEL, isOrdinaryContext, profileLabel } from './context.ts';
import type { ExtensionStatus } from './controller.ts';
import type { PairingInfo } from './sync-client.ts';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (result === null) throw new Error('Missing popup element');
  return result as T;
}

const form = element<HTMLFormElement>('pair-form');
const code = element<HTMLInputElement>('code');
const label = element<HTMLInputElement>('label');
const confirmation = element<HTMLInputElement>('confirm-profile');
const pairButton = element<HTMLButtonElement>('pair-button');
const refreshButton = element<HTMLButtonElement>('refresh-button');
const resetButton = element<HTMLButtonElement>('reset-button');
const resumeButton = element<HTMLButtonElement>('resume-import-button');
const errorElement = element('error');
let busy = false;
let pairingInfo: PairingInfo | undefined;
let verifiedCode: string | undefined;
let localError: string | null = null;
let pollingError: string | null = null;
let statusError: string | null = null;
let syncing = false;
let importing = false;
let polling = false;
let statusGeneration = 0;

const messages: Record<string, string> = {
  ACCESS_DENIED: '来源已暂停或无访问权限。请在桌面端核对授权。',
  PAIRING_EXPIRED: '配对码无效或已过期。',
  PAIRING_CONFIRMATION_REQUIRED: '请重新核对桌面所选配置，再确认配对。',
  SOURCE_ALREADY_PAIRED: '已有配置完成配对，请在桌面端检查连接。',
  already_paired: '此扩展已配对，请在桌面端检查连接。',
  unsupported_context: '请在普通 Chrome 配置窗口中配对，不支持无痕或访客窗口。',
  invalid_local_state: '本地连接状态无效，同步已停止。',
  invalid_pairing_input: '请填写有效配对码，备注名不能超过 80 个字符。',
  snapshot_too_large: '书签数据超过当前传输上限，已保留上次成功索引。',
  invalid_response: '本地服务响应异常，已保留上次成功索引。',
};

function renderError(): void {
  const error = localError ?? pollingError ?? statusError;
  errorElement.hidden = error === null;
  errorElement.textContent = error === null ? '' : messages[error] ?? '暂时无法同步，请检查本地服务连接。上次成功索引保持不变。';
}

function renderControls(): void {
  pairButton.disabled = busy || (pairingInfo !== undefined && !confirmation.checked);
  pairButton.textContent = pairingInfo === undefined ? '核对配对' : '确认此配置并同步';
  code.disabled = busy;
  label.disabled = busy;
  confirmation.disabled = busy;
  refreshButton.disabled = busy || syncing || importing;
  resetButton.disabled = busy || syncing || importing;
  resumeButton.disabled = busy || syncing;
}

function clearPairingInfo(): void {
  pairingInfo = undefined;
  verifiedCode = undefined;
  confirmation.checked = false;
  element('pair-confirmation').hidden = true;
  element('selected-profile').textContent = '';
  label.placeholder = DEFAULT_PROFILE_LABEL;
  renderControls();
}

function render(status: ExtensionStatus): void {
  form.hidden = status.paired;
  element('paired').hidden = !status.paired;
  element('source-label').textContent = status.label ?? '';
  element('last-sync').textContent = status.lastSyncedAt === null
    ? '尚未同步'
    : new Date(status.lastSyncedAt).toLocaleString('zh-CN');
  element('status').textContent = !status.paired ? '尚未配对'
    : status.importing ? '等待书签导入结束，同步已暂停' : status.syncing ? '正在同步' : status.dirty ? '等待同步' : '已同步';
  syncing = status.syncing;
  importing = status.importing === true;
  resumeButton.hidden = !importing;
  resetButton.hidden = status.error !== 'ACCESS_DENIED';
  statusError = status.paired ? status.error : null;
  if (status.paired) {
    code.value = '';
    clearPairingInfo();
  }
  renderError();
  renderControls();
}

async function requestStatus(command: Record<string, string>): Promise<ExtensionStatus> {
  const response = await chrome.runtime.sendMessage(command) as { ok: boolean; status?: ExtensionStatus; error?: string };
  if (!response.ok || response.status === undefined) throw new Error(response.error ?? 'connection_unavailable');
  return response.status;
}

async function request(command: Record<string, string>): Promise<void> {
  render(await requestStatus(command));
}

async function command(work: () => Promise<void>): Promise<void> {
  busy = true;
  statusGeneration++;
  localError = null;
  renderControls();
  renderError();
  try {
    await work();
  } catch (error) {
    localError = error instanceof Error ? error.message : 'connection_unavailable';
    if (localError === 'PAIRING_EXPIRED' || localError === 'PAIRING_CONFIRMATION_REQUIRED') clearPairingInfo();
    renderError();
  } finally {
    busy = false;
    renderControls();
  }
}

async function submitPairing(): Promise<void> {
  const pairingCode = code.value.trim();
  if (pairingInfo === undefined || verifiedCode !== pairingCode) {
    clearPairingInfo();
    const response = await chrome.runtime.sendMessage({ type: 'pairing-info', code: pairingCode }) as {
      ok: boolean; pairingInfo?: PairingInfo; error?: string;
    };
    if (!response.ok || response.pairingInfo === undefined) throw new Error(response.error ?? 'connection_unavailable');
    pairingInfo = response.pairingInfo;
    verifiedCode = pairingCode;
    const selectedName = pairingInfo.profileName;
    element('selected-profile').textContent = selectedName === undefined
      ? '配对来源：此扩展所在的当前普通 Chrome 配置'
      : `桌面所选配置：${selectedName}`;
    element('confirmation-label').textContent = selectedName === undefined
      ? '我确认连接当前窗口使用的普通配置'
      : '我确认当前窗口使用的就是桌面所选配置';
    label.placeholder = profileLabel(undefined, selectedName);
    element('pair-confirmation').hidden = false;
    return;
  }
  if (!confirmation.checked) return;
  if (Date.parse(pairingInfo.expiresAt) <= Date.now()) throw new Error('PAIRING_EXPIRED');
  await request({
    type: 'pair', code: pairingCode, label: profileLabel(label.value, pairingInfo.profileName),
    ...(pairingInfo.selectionToken === undefined ? {} : { selectionToken: pairingInfo.selectionToken }),
  });
}

if (!isOrdinaryContext(chrome.extension.inIncognitoContext)) {
  localError = 'unsupported_context';
  element('status').textContent = '此窗口不支持配对';
  renderError();
} else {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!busy) void command(submitPairing);
  });
  code.addEventListener('input', () => {
    clearPairingInfo();
    localError = null;
    renderError();
  });
  confirmation.addEventListener('change', renderControls);
  refreshButton.addEventListener('click', () => { void command(() => request({ type: 'refresh' })); });
  resumeButton.addEventListener('click', () => {
    if (confirm('确认 Chrome 的书签导入已经结束或取消？仍在导入时请取消，以免同步不完整的书签树。')) {
      void command(() => request({ type: 'resume-after-import' }));
    }
  });
  resetButton.addEventListener('click', () => {
    if (confirm('清除此扩展的配对连接？这不会撤销桌面端已有授权。')) {
      void command(() => request({ type: 'reset-pairing' }));
    }
  });
  const poll = async (): Promise<void> => {
    if (busy || polling) return;
    polling = true;
    const generation = statusGeneration;
    try {
      const status = await requestStatus({ type: 'status' });
      // A command owns newer state even after its busy phase has ended.
      if (busy || generation !== statusGeneration) return;
      pollingError = null;
      render(status);
    } catch {
      if (busy || generation !== statusGeneration) return;
      pollingError = 'connection_unavailable';
      renderError();
    } finally {
      polling = false;
    }
  };
  void poll();
  setInterval(() => { if (!busy) void poll(); }, 1_000);
}
