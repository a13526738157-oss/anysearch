import { ArrowLeft, ArrowUpToLine, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileText, LoaderCircle, LocateFixed, RefreshCw, Square } from 'lucide-react';
import type { SearchResult } from '../../../src/core/contracts.ts';
import { IconButton } from './IconButton.tsx';
import { displayHost } from './ui-state.ts';
import { captureErrorMessage } from './capture-state.ts';
import { usePreview } from './usePreview.ts';

interface Props {
  item: SearchResult;
  onBack(): void;
  onOpen(item: SearchResult): void;
  onCopy(item: SearchResult): void;
}

export function Preview({ item: initialItem, onBack, onOpen, onCopy }: Props) {
  const preview = usePreview(initialItem);
  const { item, content, capture, reading, pending, unavailable, error } = preview;
  const running = capture?.state === 'running';
  const hasText = capture?.hasReadableText || item.contentLevel === 'public_text';
  const captureMessage = running ? '正在采集公开正文' : capture?.state === 'failed'
    ? captureErrorMessage(capture.errorCode) : hasText ? '已取得公开正文' : '尚未采集正文';
  return <section className="preview" aria-label="资料预览">
    <div className="section-toolbar">
      <IconButton label="返回结果" autoFocus onClick={onBack}><ArrowLeft size={18} /></IconButton>
      <span>资料预览</span>
      <div className="toolbar-actions">
        {item.contentLevel === 'public_text' && <>
          <IconButton label={preview.matchLabel} disabled={!preview.canLocateMatch} onClick={preview.locateMatch}><LocateFixed size={18} /></IconButton>
          <IconButton label="回到开头" disabled={!preview.canReturnToStart} onClick={preview.returnToStart}><ArrowUpToLine size={18} /></IconButton>
        </>}
        <IconButton label="打开原网页" disabled={unavailable} onClick={() => onOpen(item)}><ExternalLink size={18} /></IconButton>
        <IconButton label="复制网址" disabled={unavailable} onClick={() => onCopy(item)}><Copy size={18} /></IconButton>
      </div>
    </div>
    <div className="preview-body">
      <h1>{item.title}</h1>
      <p className="preview-origin">{displayHost(item.url)}<span className="separator">·</span>{item.folderPath.join(' / ') || 'Chrome 书签'}</p>
      <div className="evidence-label"><FileText size={14} />{item.contentLevel === 'metadata' ? '仅书签信息 · 未取得正文' : '公开网页正文'}</div>
      <div className="capture-controls">
        <span className={`capture-status ${capture?.state === 'failed' ? 'danger' : ''}`} role="status">
          {running && <LoaderCircle className="spinner" size={15} />}{captureMessage}
        </span>
        {running ? <button type="button" className="command-button" onClick={preview.cancel} disabled={pending || unavailable}>
          <Square size={14} />取消采集</button>
          : <button type="button" className="command-button" onClick={preview.start} disabled={pending || unavailable || !capture}>
            {hasText ? <RefreshCw size={15} /> : <Download size={15} />}{hasText ? '重新采集正文' : '采集公开正文'}</button>}
      </div>
      {error && <p className="preview-error danger" role="alert">{error}</p>}
      {reading ? <div className="loading-preview"><LoaderCircle className="spinner" size={20} /><span>读取中</span></div>
        : content && (content.contentLevel === 'metadata' ? <dl className="excerpt bookmark-properties">
          <dt>网址</dt><dd>{content.url}</dd>
          <dt>书签目录</dt><dd>{content.folderPath.join(' / ') || '未分类'}</dd>
        </dl> : <pre className="excerpt">{content.text}</pre>)}
      {content && <dl className="snapshot-meta">
        <dt>内容层级</dt><dd>{content.contentLevel === 'metadata' ? '书签元数据' : `第 ${content.lineStart}–${content.lineEnd} 行${content.truncated ? ' · 片段' : ''}`}</dd>
        <dt>快照</dt><dd>{content.snapshotId.slice(0, 16)}</dd>
      </dl>}
    </div>
    {item.contentLevel === 'public_text' && <nav className="preview-pages" aria-label="正文分段">
      <IconButton label="上一段" disabled={!preview.canPreviousPage} onClick={preview.previousPage}><ChevronLeft size={18} /></IconButton>
      <span>{content ? `第 ${content.lineStart}–${content.lineEnd} 行` : reading ? '读取中' : '正文暂不可用'}</span>
      <IconButton label="下一段" disabled={!preview.canNextPage} onClick={preview.nextPage}><ChevronRight size={18} /></IconButton>
    </nav>}
  </section>;
}
