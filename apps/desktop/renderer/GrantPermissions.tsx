import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Ban, ChevronLeft, ChevronRight, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import type { DesktopStatus } from '../desktop-contracts.ts';
import type { DesktopGrantPage, DesktopGrantSummary } from '../permissions-contracts.ts';
import { IconButton } from './IconButton.tsx';
import './grant-permissions.css';

interface Props {
  status: DesktopStatus | null;
  serviceUnavailable?: boolean;
  busy: boolean;
  onBack(): void;
  onChanged(): void;
}

function levelLabel(grant: DesktopGrantSummary): string {
  return grant.contentLevel === 'public_text' ? '元数据与已采集公开正文' : '元数据';
}

function revokeError(reason: unknown): string {
  const code = reason instanceof Error ? reason.message : '';
  if (code.includes('CURRENT_SESSION_GRANT')) return '当前桌面会话授权不可从此处撤销。';
  if (code.includes('GRANT_UNAVAILABLE')) return '此授权已不可用，列表状态需要重新读取。';
  return '撤销结果未确认。请重新读取授权状态，不要假定撤销已生效。';
}

export function GrantPermissions({ status, serviceUnavailable = false, busy, onBack, onChanged }: Props) {
  const [page, setPage] = useState<DesktopGrantPage | null>(null);
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [confirmation, setConfirmation] = useState<DesktopGrantSummary | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const active = useRef(true);
  const mutation = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const afterId = cursors.at(-1);
  const ready = !serviceUnavailable && status?.service === 'ready';
  const sourceState = status?.sources.map(source => `${source.sourceId}:${source.enabled}`).join('|') ?? '';

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; generation.current++; };
  }, []);

  const loadPage = useCallback(async (): Promise<void> => {
    const request = ++generation.current;
    setLoading(true);
    setPage(null);
    setConfirmation(null);
    setError('');
    try {
      const result = await window.anysearch.listGrants(afterId);
      if (active.current && generation.current === request) setPage(result);
    } catch {
      if (active.current && generation.current === request) setError('授权清单读取失败，当前状态未确认。');
    } finally {
      if (active.current && generation.current === request) setLoading(false);
    }
  }, [afterId]);

  useEffect(() => {
    if (ready) void loadPage();
    else {
      generation.current++;
      setPage(null);
      setConfirmation(null);
      setLoading(false);
      setError('');
    }
    return () => { generation.current++; };
  }, [ready, sourceState, loadPage]);

  useEffect(() => {
    if (confirmation && !dialog.current?.open) dialog.current?.showModal();
    else if (!confirmation && dialog.current?.open) dialog.current.close();
  }, [confirmation]);

  const revoke = async (): Promise<void> => {
    if (!confirmation || confirmation.currentDesktopSession || confirmation.revoked || mutation.current) return;
    mutation.current = true;
    setRevoking(true);
    setError('');
    setNotice('');
    try {
      await window.anysearch.revokeGrant(confirmation.id);
      onChanged();
      if (active.current) {
        setConfirmation(null);
        setNotice('此授权已撤销。Chrome 同步和本机索引保持不变。');
        await loadPage();
      }
    } catch (reason) {
      if (active.current) { setConfirmation(null); setError(revokeError(reason)); }
    } finally {
      mutation.current = false;
      if (active.current) setRevoking(false);
    }
  };

  const working = busy || loading || revoking;
  const changePage = (next: Array<string | undefined>): void => {
    generation.current++;
    setPage(null);
    setLoading(true);
    setConfirmation(null);
    setNotice('');
    setError('');
    setCursors(next);
  };

  return <section className="grant-permissions" aria-label="本机授权">
    <div className="section-toolbar">
      <IconButton label="返回来源与连接" onClick={onBack} disabled={revoking}><ArrowLeft size={18} /></IconButton>
      <h1>本机授权</h1>
      <div className="toolbar-actions"><IconButton label="重新读取授权状态" disabled={working || !ready}
        onClick={() => { setNotice(''); void loadPage(); }}><RefreshCw size={17} /></IconButton></div>
    </div>
    <div className="grant-content">
      <dl className="grant-boundaries">
        <dt>范围</dt><dd>各授权对应来源的全部现有及新增书签，内容档位分别列出。</dd>
        <dt>撤销</dt><dd>仅阻止后续访问；已进入 Agent 上下文的内容无法追回。不修改原书签。</dd>
        <dt>身份</dt><dd>本机授权不代表某个应用或聊天的已认证身份。</dd>
      </dl>
      {!ready ? <p className="grant-state" role="status">{serviceUnavailable || status?.service === 'unavailable'
        ? '本地服务不可用，无法读取授权状态。' : '等待本地服务。'}</p>
        : loading ? <p className="grant-state" role="status"><LoaderCircle size={17} className="spinner" />正在读取授权状态</p>
          : page && (page.items.length ? <ul className="grant-list" aria-label="当前页授权">
            {page.items.map(grant => {
              const source = status?.sources.find(item => item.sourceId === grant.sourceId);
              const sourceLabel = source?.label ?? '其他或已断开的来源';
              const sourceAvailability = grant.sourceEnabled ? '来源访问已启用'
                : source ? '来源访问已暂停' : '来源已断开或不可用';
              return <li className="grant-item" key={grant.id}>
                <ShieldCheck size={20} strokeWidth={1.6} className="grant-icon" aria-hidden="true" />
                <div className="grant-details">
                  <h2>{levelLabel(grant)}</h2>
                  <p>{sourceLabel}</p>
                  <div className="grant-flags">
                    <span className={grant.revoked ? 'danger' : grant.sourceEnabled ? 'grant-effective' : ''}>
                      {grant.revoked ? '已撤销' : grant.sourceEnabled ? '授权有效' : '授权保留，当前不可访问'}
                    </span>
                    <span>{sourceAvailability}</span>
                    {grant.currentDesktopSession && <span className="grant-session"><LockKeyhole size={12} />当前桌面会话 · 此处不可撤销</span>}
                  </div>
                  <dl className="grant-identifiers"><dt>授权 ID</dt><dd><code>{grant.id}</code></dd>
                    <dt>来源 ID</dt><dd><code>{grant.sourceId}</code></dd></dl>
                </div>
                {!grant.currentDesktopSession && !grant.revoked && <IconButton label={`撤销授权 ${grant.id}`}
                  disabled={working} className="danger" onClick={() => { setNotice(''); setConfirmation(grant); }}><Ban size={17} /></IconButton>}
              </li>;
            })}
          </ul> : <p className="grant-state" role="status">{cursors.length > 1 ? '此页没有授权记录。' : '尚无本机授权记录。'}</p>)}
      {(error || notice) && <p className={`grant-feedback ${error ? 'danger' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</p>}
    </div>
    <nav className="grant-pages" aria-label="授权分页">
      <IconButton label="上一页授权" disabled={working || cursors.length <= 1 || !ready}
        onClick={() => changePage(cursors.slice(0, -1))}><ChevronLeft size={18} /></IconButton>
      <span>{page ? `第 ${cursors.length} 页 · 本页 ${page.items.length} 项${page.nextCursor ? ' · 后有更多' : ' · 已到末页'}` : `第 ${cursors.length} 页 · 状态未读取`}</span>
      <IconButton label="下一页授权" disabled={working || !page?.nextCursor || !ready}
        onClick={() => { if (page?.nextCursor) changePage([...cursors, page.nextCursor]); }}><ChevronRight size={18} /></IconButton>
    </nav>
    <dialog ref={dialog} className="grant-revoke-dialog" aria-labelledby="grant-revoke-title" aria-describedby="grant-revoke-description"
      onCancel={event => { event.preventDefault(); if (!revoking) setConfirmation(null); }}
      onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <h2 id="grant-revoke-title">撤销此本机授权？</h2>
      <p className="grant-revoke-level">{confirmation ? levelLabel(confirmation) : ''}</p>
      <code className="grant-revoke-id">{confirmation?.id}</code>
      <p id="grant-revoke-description">仅此授权停止后续访问，Chrome 同步、本机索引和其他授权不受影响。已提供的内容无法追回；此操作不会自动恢复授权。</p>
      <div className="confirmation-actions">
        <button type="button" className="command-button" autoFocus disabled={revoking} onClick={() => setConfirmation(null)}>取消</button>
        <button type="button" className="command-button danger" disabled={revoking || busy || !ready} onClick={() => { void revoke(); }}>
          {revoking ? <LoaderCircle size={15} className="spinner" /> : <Ban size={15} />}撤销授权
        </button>
      </div>
    </dialog>
  </section>;
}
