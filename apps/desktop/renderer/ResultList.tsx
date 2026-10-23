import { Bookmark, Copy, ExternalLink } from 'lucide-react';
import type { SearchResult } from '../../../src/core/contracts.ts';
import { IconButton } from './IconButton.tsx';
import { displayHost } from './ui-state.ts';

interface Props {
  items: SearchResult[];
  selected: number;
  onSelect(index: number): void;
  onPreview(item: SearchResult): void;
  onOpen(item: SearchResult): void;
  onCopy(item: SearchResult): void;
}

export function ResultList({ items, selected, onSelect, onPreview, onOpen, onCopy }: Props) {
  return <div className="results" role="listbox" id="search-results" aria-label="搜索结果">
    {items.map((item, index) => <div key={item.id} id={`result-${index}`} role="option" aria-selected={index === selected}
      className={`result-row ${index === selected ? 'selected' : ''}`} onMouseEnter={() => onSelect(index)}>
      <button type="button" className="result-main" onClick={() => { onSelect(index); onPreview(item); }}
        aria-label={`预览 ${item.title}`}>
        <Bookmark className="resource-icon" size={27} strokeWidth={1.6} aria-hidden="true" />
        <span className="result-copy">
          <strong>{item.title || displayHost(item.url)}</strong>
          <span>{item.folderPath.length ? item.folderPath.join(' / ') : 'Chrome 书签'}</span>
          <span className="result-detail">{displayHost(item.url)}<span className="separator">·</span>
            {item.contentLevel === 'metadata' ? '仅书签信息' : '公开网页正文'}</span>
        </span>
      </button>
      <div className="row-actions">
        <IconButton label={`打开 ${item.title}`} onClick={() => onOpen(item)}><ExternalLink size={17} /></IconButton>
        <IconButton label={`复制 ${item.title} 的网址`} onClick={() => onCopy(item)}><Copy size={17} /></IconButton>
      </div>
    </div>)}
  </div>;
}
