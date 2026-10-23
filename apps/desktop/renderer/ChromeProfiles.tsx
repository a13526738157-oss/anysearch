import { useEffect, useState } from 'react';
import { ExternalLink, Link2, LoaderCircle, Monitor, RefreshCw } from 'lucide-react';
import type { ChromeProfileDiscovery } from '../../../src/adapters/chrome/profile-contracts.ts';
import { IconButton } from './IconButton.tsx';
import {
  profilePairingTarget, reconcileProfileSelection, selectedChromeProfile,
  type ProfileSelection,
} from './profile-picker-state.ts';

interface Props {
  discovery: ChromeProfileDiscovery | null;
  discovering: boolean;
  disabled: boolean;
  busy: boolean;
  onDiscover(): void;
  onPair(profileId?: string): void;
  onOpenProfile(profileId: string): void;
}

export function ChromeProfiles({ discovery, discovering, disabled, busy, onDiscover, onPair, onOpenProfile }: Props) {
  const [selected, setSelected] = useState<ProfileSelection>(() => reconcileProfileSelection(null, discovery));
  useEffect(() => {
    setSelected(previous => reconcileProfileSelection(previous, discovery));
  }, [discovery]);
  const profile = selectedChromeProfile(selected, discovery);
  const target = profilePairingTarget(selected, discovery);
  const profiles = discovery?.state === 'ready' ? discovery.profiles : [];
  const pending = disabled || discovering;

  return <div className="chrome-profiles">
    <div className="profile-picker-heading">
      <h3>连接配置</h3>
      <IconButton label="刷新 Chrome 配置列表" onClick={onDiscover} disabled={pending}>
        <RefreshCw size={16} className={discovering ? 'spinner' : ''} />
      </IconButton>
    </div>
    <div className="discovery-status" role="status">
      {discovering ? <><LoaderCircle className="spinner" size={14} />正在识别本机 Chrome 配置</>
        : discovery?.state === 'unavailable' ? '暂时无法读取 Chrome 配置列表'
        : discovery?.state === 'not-found' || (discovery?.state === 'ready' && profiles.length === 0) ? '未发现本机 Chrome 配置'
        : discovery === null ? '尚未读取 Chrome 配置列表'
        : `${profiles.length} 个本机配置`}
    </div>
    <fieldset className="profile-options" disabled={pending}>
      <legend className="visually-hidden">待连接的 Chrome 配置</legend>
      {profiles.map(item => <label className="profile-option" key={item.id}>
        <input type="radio" name="chrome-profile" value={item.id}
          checked={selected?.kind === 'profile' && selected.profileId === item.id}
          onChange={() => setSelected({ kind: 'profile', profileId: item.id })} />
        <span className="profile-option-copy"><strong>{item.name}</strong><span>{item.directoryName}</span></span>
      </label>)}
      <label className="profile-option current-profile-option">
        <input type="radio" name="chrome-profile" value="current-chrome" checked={selected?.kind === 'current'}
          onChange={() => setSelected({ kind: 'current' })} />
        <Monitor size={17} className="current-profile-icon" />
        <span className="profile-option-copy"><strong>从当前 Chrome 连接</strong><span>配置待扩展确认</span></span>
      </label>
    </fieldset>
    <div className="profile-picker-actions">
      <button type="button" className="command-button" disabled={pending || target === null}
        onClick={() => { if (target) onPair(target.profileId); }}>
        {busy ? <LoaderCircle className="spinner" size={17} /> : <Link2 size={17} />}生成配对码
      </button>
      {profile && <button type="button" className="command-button" disabled={pending} onClick={() => onOpenProfile(profile.id)}>
        <ExternalLink size={16} />打开此配置
      </button>}
    </div>
  </div>;
}
