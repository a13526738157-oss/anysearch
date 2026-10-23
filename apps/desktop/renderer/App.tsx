import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Bookmark, LoaderCircle, Search, SlidersHorizontal, X } from 'lucide-react';
import type { SearchMode, SearchResult } from '../../../src/core/contracts.ts';
import type { DesktopStatus, PairingSession } from '../desktop-contracts.ts';
import type { ChromeProfileDiscovery } from '../../../src/adapters/chrome/profile-contracts.ts';
import { IconButton } from './IconButton.tsx';
import { Preview } from './Preview.tsx';
import { ResultList } from './ResultList.tsx';
import { Sources } from './Sources.tsx';
import { GrantPermissions } from './GrantPermissions.tsx';
import { referenceOf } from './resource-reference.ts';
import { errorMessage, invalidateRequestGenerations, isComposingKey, nextSelection } from './ui-state.ts';
import { searchFeedback } from './search-feedback.ts';
import type { DesktopServiceState } from './search-feedback.ts';

export function App() {
  const [status, setStatus] = useState<DesktopStatus | null>(null);
  const [serviceState, setServiceState] = useState<DesktopServiceState>('loading');
  const [query, setQuery] = useState('');
  const [committedQuery, setCommittedQuery] = useState('');
  const [includePublicText, setIncludePublicText] = useState(false);
  const [mode, setMode] = useState<SearchMode>('hybrid');
  const [semanticUnavailable, setSemanticUnavailable] = useState(false);
  const [items, setItems] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [view, setView] = useState<'search' | 'sources' | 'permissions'>('search');
  const [preview, setPreview] = useState<SearchResult | null>(null);
  const [pairing, setPairing] = useState<PairingSession | null>(null);
  const [discovery, setDiscovery] = useState<ChromeProfileDiscovery | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [composingInput, setComposingInput] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const generations = useRef({ search: 0, read: 0 });
  const previousSearchScope = useRef('');
  const discoveryGeneration = useRef(0);
  const statusGeneration = useRef(0);
  const sourceKey = status?.sources.map(source => `${source.sourceId}:${source.enabled}:${source.sequence}`).join('|') ?? '';
  const inputPending = composingInput || query !== committedQuery;

  const dismissPreview = useCallback(() => {
    generations.current = invalidateRequestGenerations(generations.current, 'preview');
    setPreview(null);
  }, []);

  const invalidateResults = useCallback(() => {
    generations.current = invalidateRequestGenerations(generations.current, 'all');
    setPreview(null);
    setItems([]);
    setSelected(-1);
    setSearching(false);
    setSemanticUnavailable(false);
  }, []);

  const refreshStatus = useCallback(async () => {
    const generation = ++statusGeneration.current;
    try {
      const next = await window.anysearch.status();
      if (generation !== statusGeneration.current) return;
      setStatus(next);
      setPairing(next.pairing ?? null);
      setServiceState(next.service);
    } catch {
      if (generation !== statusGeneration.current) return;
      setServiceState('unavailable');
      setPairing(null);
      setStatus(current => current ? { ...current, service: 'unavailable' } : null);
    }
  }, []);

  const refreshDiscovery = useCallback(async () => {
    const generation = ++discoveryGeneration.current;
    setDiscovering(true);
    try {
      const result = await window.anysearch.discoverChromeProfiles();
      if (generation === discoveryGeneration.current) setDiscovery(result);
    } catch {
      if (generation === discoveryGeneration.current) setDiscovery({ state: 'unavailable', profiles: [] });
    } finally {
      if (generation === discoveryGeneration.current) setDiscovering(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'sources' && serviceState === 'ready' && status?.sources.length === 0 && discovery === null && !discovering) {
      void refreshDiscovery();
    }
  }, [view, status, serviceState, discovery, discovering, refreshDiscovery]);

  useEffect(() => {
    void refreshStatus();
    const unsubscribe = window.anysearch.onFocus(() => {
      void refreshStatus();
      setView('search');
      dismissPreview();
      input.current?.focus();
      input.current?.select();
    });
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshStatus();
    }, 5_000);
    return () => { unsubscribe(); window.clearInterval(interval); };
  }, [refreshStatus, dismissPreview]);

  useEffect(() => {
    invalidateResults();
    const generation = generations.current.search;
    const scope = `${committedQuery}\0${sourceKey}\0${serviceState}\0${includePublicText}\0${mode}`;
    if (previousSearchScope.current !== scope) setError('');
    previousSearchScope.current = scope;
    if (view !== 'search' || busy || inputPending || serviceState !== 'ready' || !committedQuery.trim()
      || !status?.sources.some(source => source.enabled)) return;
    setSearching(true);
    const timer = window.setTimeout(() => { void window.anysearch.search(committedQuery, includePublicText, mode).then(response => {
      if (generation !== generations.current.search) return;
      setItems(response.items);
      setSemanticUnavailable(response.semantic?.status === 'unavailable');
      setSelected(response.items.length ? 0 : -1);
    }).catch(reason => {
      if (generation === generations.current.search) setError(errorMessage(reason));
    }).finally(() => {
      if (generation === generations.current.search) setSearching(false);
    }); }, 250);
    return () => { window.clearTimeout(timer); generations.current.search++; };
  }, [committedQuery, sourceKey, serviceState, inputPending, view, busy, includePublicText, mode, invalidateResults]);

  useEffect(() => {
    const expanded = Boolean(query.trim() || preview || view !== 'search');
    void window.anysearch.setLayout(expanded ? 'expanded' : 'compact').catch(() => {});
  }, [query, preview, view]);

  useEffect(() => {
    document.getElementById(`result-${selected}`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2_500);
    return () => { window.clearTimeout(timer); };
  }, [notice]);

  const act = async (operation: () => Promise<unknown>, success?: string): Promise<void> => {
    setError('');
    try { await operation(); if (success) setNotice(success); }
    catch (reason) { setError(errorMessage(reason)); }
  };

  const openItem = (item: SearchResult): void => { void act(() => window.anysearch.open(referenceOf(item))); };
  const copyItem = (item: SearchResult): void => { void act(() => window.anysearch.copy(referenceOf(item)), '网址已复制'); };

  const showPreview = (item: SearchResult): void => {
    setPreview(item);
    setError('');
  };

  const backToSearch = (): void => {
    dismissPreview();
    setView('search');
    input.current?.focus();
  };

  const handleKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (isComposingKey(event.nativeEvent, composing.current)) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (view === 'permissions') setView('sources');
      else if (preview || view === 'sources') backToSearch();
      else void window.anysearch.hide();
      return;
    }
    if (event.target !== input.current || view !== 'search' || preview || !feedback.showResults) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected(current => nextSelection(current, items.length, event.key === 'ArrowDown' ? 1 : -1));
    }
    if (event.key === 'Enter' && items[selected]) {
      event.preventDefault();
      if (event.altKey) showPreview(items[selected]);
      else openItem(items[selected]);
    }
  };

  const manage = async (operation: () => Promise<void>): Promise<void> => {
    invalidateResults();
    setBusy(true);
    await act(operation);
    await refreshStatus();
    setBusy(false);
  };

  const pairedCount = status?.sources.length ?? 0;
  const activeCount = status?.sources.filter(source => source.enabled).length ?? 0;
  const totalBookmarks = status?.sources.reduce((sum, source) => sum + source.bookmarkCount, 0) ?? 0;
  const hasQuery = Boolean(query.trim());
  const feedback = searchFeedback({ service: serviceState, pairedCount, activeCount, bookmarkCount: totalBookmarks,
    hasQuery, inputPending, searching, failed: Boolean(error), resultCount: items.length });
  const sourceLabel = serviceState === 'loading' ? '读取中' : serviceState === 'unavailable' ? '不可用'
    : pairedCount ? activeCount ? '已连接' : '已暂停' : '未配对';

  return <div className="app" onKeyDown={handleKey}>
    <header className="titlebar"><span className="brand">AnySearch</span><span className="local-label">本机资料</span>
      <IconButton label="收起窗口" onClick={() => { void window.anysearch.hide(); }}><X size={15} /></IconButton>
    </header>
    <div className="search-header">
      <Search size={27} className="search-symbol" strokeWidth={1.7} aria-hidden="true" />
      <input ref={input} type="search" aria-label="搜索资料" placeholder="搜索资料" value={query} maxLength={512} autoFocus
        spellCheck={false} autoComplete="off" role="combobox" aria-controls="search-results"
        aria-expanded={feedback.showResults && view === 'search' && !preview} aria-autocomplete="list"
        aria-activedescendant={feedback.showResults && selected >= 0 && !preview && view === 'search' ? `result-${selected}` : undefined}
        onCompositionStart={() => { composing.current = true; setComposingInput(true); invalidateResults(); }}
        onCompositionEnd={event => { composing.current = false; setComposingInput(false);
          setQuery(event.currentTarget.value); setCommittedQuery(event.currentTarget.value); }}
        onChange={event => { const value = event.target.value;
          if (value !== query || composing.current) invalidateResults();
          setError(''); setQuery(value); setView('search');
          if (!composing.current) setCommittedQuery(value); }} />
      {query && <IconButton label="清空搜索" onClick={() => { composing.current = false; setComposingInput(false);
        invalidateResults(); setQuery(''); setCommittedQuery(''); backToSearch(); }}><X size={17} /></IconButton>}
      <IconButton label="来源与连接" aria-pressed={view === 'sources'} onClick={() => { dismissPreview(); setView(view === 'sources' ? 'search' : 'sources'); }}>
        <SlidersHorizontal size={22} strokeWidth={1.7} />
      </IconButton>
    </div>
    <div className="source-strip">
      <button type="button" className="source-summary" onClick={() => { dismissPreview(); setView('sources'); }}>
        <span className={`status-dot ${serviceState === 'ready' && activeCount ? 'active' : ''}`} />Chrome · {sourceLabel}
      </button>
      <label className="body-search-toggle"><input type="checkbox" checked={includePublicText}
        onChange={event => { invalidateResults(); setIncludePublicText(event.target.checked); }} />包含正文</label>
      <div className="search-modes" role="group" aria-label="检索方式">
        <button type="button" aria-pressed={mode === 'hybrid'} onClick={() => { if (mode !== 'hybrid') { invalidateResults(); setMode('hybrid'); } }}>语义</button>
        <button type="button" aria-pressed={mode === 'keyword'} onClick={() => { if (mode !== 'keyword') { invalidateResults(); setMode('keyword'); } }}>关键词</button>
      </div>
      <span className="search-status" role="status" title={feedback.status}>{(feedback.phase === 'searching' || feedback.phase === 'loading') && <LoaderCircle size={15} className="spinner" />}
        <span className="search-status-label">{feedback.status}</span></span>
    </div>
    {semanticUnavailable && view === 'search' && <div className="semantic-status" role="status">语义模型不可用，当前为关键词结果</div>}
    {view === 'permissions' ? <GrantPermissions status={status} serviceUnavailable={serviceState === 'unavailable'} busy={busy}
      onBack={() => setView('sources')} onChanged={() => { void refreshStatus(); }} />
      : view === 'sources' ? <Sources status={status} pairing={pairing} busy={busy} onBack={backToSearch}
      serviceUnavailable={serviceState === 'unavailable'} onPermissions={() => setView('permissions')}
      onToggleDoubleShift={enabled => { void manage(async () => { await window.anysearch.setDoubleShiftEnabled(enabled); }); }}
      discovery={discovery} discovering={discovering} onDiscover={() => { void refreshDiscovery(); }}
      onOpenProfile={profileId => { void act(() => window.anysearch.openChromeProfile(profileId)); }}
      onRefresh={() => { void refreshStatus(); }}
      onPair={profileId => { void manage(async () => { setPairing(await window.anysearch.beginPairing(profileId)); }); }}
      onCancel={() => { void manage(() => window.anysearch.cancelPairing()); }}
      onToggle={(sourceId, enabled) => { void manage(() => window.anysearch.setSourceEnabled(sourceId, enabled)); }}
      onDisconnect={sourceId => { void manage(() => window.anysearch.disconnectSource(sourceId)); }} />
      : preview ? <Preview key={`${preview.id}:${preview.snapshotId}:${preview.contentLevel}`} item={preview} onBack={backToSearch}
        onOpen={openItem} onCopy={copyItem} />
        : hasQuery && (feedback.showResults ? <ResultList items={items} selected={selected} onSelect={setSelected}
          onPreview={showPreview} onOpen={openItem} onCopy={copyItem} />
          : <div className="empty-state">
            {feedback.phase === 'searching' || feedback.phase === 'loading' ? <LoaderCircle size={27} className="spinner" /> : <Bookmark size={30} strokeWidth={1.5} />}
            <h1>{feedback.title}</h1>
            {feedback.canConnect && <button type="button" className="command-button" onClick={() => setView('sources')}>连接 Chrome</button>}
          </div>)}
    {(error || notice) && <div className={`message ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>{error || notice}</div>}
  </div>;
}
