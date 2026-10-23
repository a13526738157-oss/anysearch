import { useEffect, useState } from 'react';
import { ArrowLeft, Bookmark, ExternalLink, LoaderCircle, RefreshCw, ShieldCheck, Unlink, X } from 'lucide-react';
import type { DesktopStatus, PairingSession } from '../desktop-contracts.ts';
import type { ChromeProfileDiscovery } from '../../../src/adapters/chrome/profile-contracts.ts';
import { ChromeProfiles } from './ChromeProfiles.tsx';
import { IconButton } from './IconButton.tsx';
import { ActivationSettings } from './ActivationSettings.tsx';

interface Props {
  status: DesktopStatus | null;
  serviceUnavailable?: boolean;
  pairing: PairingSession | null;
  discovery: ChromeProfileDiscovery | null;
  discovering: boolean;
  busy: boolean;
  onBack(): void;
  onPair(profileId?: string): void;
  onDiscover(): void;
  onOpenProfile(profileId: string): void;
  onCancel(): void;
  onRefresh(): void;
  onToggle(sourceId: string, enabled: boolean): void;
  onDisconnect(sourceId: string): void;
  onPermissions(): void;
  onToggleDoubleShift(enabled: boolean): void;
}

export function Sources({ status, serviceUnavailable = false, pairing, discovery, discovering, busy, onBack, onPair, onDiscover, onOpenProfile, onCancel, onRefresh, onToggle, onDisconnect, onPermissions, onToggleDoubleShift }: Props) {
  const [confirmDisconnect, setConfirmDisconnect] = useState<string | null>(null);
  const serviceReady = !serviceUnavailable && status?.service === 'ready';
  const confirmationAvailable = serviceReady && Boolean(status?.sources.some(source => source.sourceId === confirmDisconnect));
  useEffect(() => {
    if (!confirmationAvailable) setConfirmDisconnect(null);
  }, [confirmationAvailable]);
  return <section className="sources-view" aria-label="来源设置">
    <div className="section-toolbar">
      <IconButton label="返回搜索" onClick={onBack}><ArrowLeft size={18} /></IconButton>
      <h1>来源与连接</h1>
      <div className="toolbar-actions"><IconButton label="刷新连接状态" onClick={onRefresh} disabled={busy}><RefreshCw size={17} /></IconButton></div>
    </div>
    <div className="settings-content">
      <h2>Chrome 书签</h2>
      {!status && !serviceUnavailable ? <div className="source-empty" role="status"><LoaderCircle size={20} className="spinner" /><span>正在读取来源状态</span></div>
        : !serviceReady ? <div className="source-empty" role="status"><Bookmark size={25} strokeWidth={1.5} /><span>本地服务暂时不可用{status?.sources.length ? '，以下为上次读取的来源信息' : ''}</span></div>
          : status?.sources.length === 0 && <div className="source-empty"><Bookmark size={25} strokeWidth={1.5} /><span>尚未配对 Chrome 配置</span></div>}
      {status?.sources.map(source => <div className="source-item" key={source.sourceId}>
          <Bookmark size={23} strokeWidth={1.5} className="source-icon" />
          <div className="source-info"><strong>{source.label}</strong>
            <p>{source.bookmarkCount} 个书签<span className="separator">·</span>{serviceReady
              ? source.enabled ? '访问已启用' : '访问已暂停' : '当前访问状态未确认'}</p>
            <p>{source.lastSyncedAt ? `最近同步 ${new Date(source.lastSyncedAt).toLocaleString('zh-CN')}` : '等待首次同步'}</p>
          </div>
          <label className="source-switch" title={source.enabled ? '暂停来源访问' : '恢复来源访问'}>
            <input type="checkbox" checked={source.enabled} disabled={busy || !serviceReady} aria-label={`${source.label} 允许来源访问`}
              onChange={event => onToggle(source.sourceId, event.target.checked)} />
          </label>
          <IconButton label={`断开 ${source.label}`} disabled={busy || !serviceReady} onClick={() => setConfirmDisconnect(source.sourceId)}><Unlink size={16} /></IconButton>
        </div>)}
      {serviceReady && (pairing ? <div className="pairing-session">
        <div className="pairing-heading"><span>Chrome 配对码</span><IconButton label="取消配对" onClick={onCancel} disabled={busy}><X size={16} /></IconButton></div>
        <p className="pairing-profile">{pairing.profileName ? `拟连接：${pairing.profileName}` : '当前 Chrome 配置'}<span>待扩展确认</span></p>
        <output className="pairing-code" aria-label="Chrome 配对码">{pairing.code}</output>
        <p>有效期至 {new Date(pairing.expiresAt).toLocaleTimeString('zh-CN')}</p>
        {pairing.profileId && <button type="button" className="command-button pairing-open" disabled={busy}
          onClick={() => { if (pairing.profileId) onOpenProfile(pairing.profileId); }}><ExternalLink size={16} />打开拟连接配置</button>}
      </div> : !status?.sources.length && <ChromeProfiles discovery={discovery} discovering={discovering}
        disabled={busy || !serviceReady} busy={busy} onDiscover={onDiscover} onPair={onPair} onOpenProfile={onOpenProfile} />)}
      <dl className="connection-details">
        <dt>来源范围</dt><dd>此配置全部现有及新增书签</dd>
        <dt>内容档位</dt><dd>元数据与已采集公开正文分别授权</dd>
        <dt>正文采集</dt><dd>仅主动、单条匿名公开采集，不使用浏览器登录态，不自动批量采集</dd>
        <dt>全局唤起</dt><dd>{status?.hotkey.registered ? '常规热键已注册' : '热键未注册 · 托盘可用'}</dd>
      </dl>
      <button type="button" className="command-button" disabled={busy} onClick={onPermissions}><ShieldCheck size={16} />本机授权</button>
      <ActivationSettings {...(status?.activation ? { activation: status.activation } : {})} disabled={busy} onToggle={onToggleDoubleShift} />
      {confirmDisconnect && <div className="confirmation" role="alertdialog" aria-label="断开来源确认">
        <h2>断开此 Chrome 配置？</h2>
        <p>现有连接与授权将失效。Chrome 原书签不会修改，已提供的内容无法追回。</p>
        <div className="confirmation-actions">
          <button type="button" className="command-button" onClick={() => setConfirmDisconnect(null)}>取消</button>
          <button type="button" className="command-button danger" disabled={busy || !confirmationAvailable} onClick={() => {
            if (confirmationAvailable) onDisconnect(confirmDisconnect);
            setConfirmDisconnect(null);
          }}><Unlink size={16} />断开</button>
        </div>
      </div>}
    </div>
  </section>;
}
