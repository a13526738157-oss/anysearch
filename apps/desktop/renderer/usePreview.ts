import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureStatus } from '../../../src/capture/contracts.ts';
import type { SearchResult } from '../../../src/core/contracts.ts';
import type { DesktopReadResponse } from '../desktop-contracts.ts';
import { captureErrorMessage, invalidatesPreview } from './capture-state.ts';
import { referenceOf } from './resource-reference.ts';

const POLL_INTERVAL_MS = 750;

function sameContentVersion(left: SearchResult, right: SearchResult): boolean {
  return left.id === right.id && left.snapshotId === right.snapshotId && left.contentLevel === right.contentLevel;
}

export function usePreview(initialItem: SearchResult) {
  const [item, setItem] = useState(initialItem);
  const [content, setContent] = useState<DesktopReadResponse | null>(null);
  const [capture, setCapture] = useState<CaptureStatus | null>(null);
  const [reading, setReading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [unavailable, setUnavailable] = useState(false);
  const [pageStarts, setPageStarts] = useState([1]);
  const [pageIndex, setPageIndex] = useState(0);
  const currentItem = useRef(initialItem);
  const lifetime = useRef(0);
  const readVersion = useRef(0);
  const statusVersion = useRef(0);
  const captureAction = useRef(false);
  const searchPositionValid = useRef(true);

  const reportError = useCallback((reason: unknown) => {
    setError(captureErrorMessage(reason));
    if (invalidatesPreview(reason)) {
      searchPositionValid.current = false;
      readVersion.current++;
      setContent(null);
      setReading(false);
      setUnavailable(true);
      setCapture(null);
    }
  }, []);

  const readPage = useCallback(async (nextItem: SearchResult, lineStart = 1, starts = [1], index = 0) => {
    const owner = lifetime.current;
    const version = ++readVersion.current;
    setReading(true);
    setContent(null);
    try {
      const result = await window.anysearch.read(referenceOf(nextItem), lineStart);
      if (owner !== lifetime.current || version !== readVersion.current) return;
      setContent(result);
      setPageStarts(starts);
      setPageIndex(index);
    } catch (reason) {
      if (owner === lifetime.current && version === readVersion.current) reportError(reason);
    } finally {
      if (owner === lifetime.current && version === readVersion.current) setReading(false);
    }
  }, [reportError]);

  const applyStatus = useCallback((next: CaptureStatus, initial = false) => {
    setCapture(next);
    const nextItem = next.item;
    const changed = !sameContentVersion(nextItem, currentItem.current);
    if (!sameContentVersion(nextItem, initialItem)) searchPositionValid.current = false;
    currentItem.current = nextItem;
    setItem(nextItem);
    if (initial || changed) {
      setPageStarts([1]);
      setPageIndex(0);
      void readPage(nextItem);
    }
  }, [initialItem, readPage]);

  useEffect(() => {
    const owner = ++lifetime.current;
    const version = ++statusVersion.current;
    void window.anysearch.captureStatus(initialItem.id).then(next => {
      if (owner === lifetime.current && version === statusVersion.current) applyStatus(next, true);
    }).catch(reason => {
      if (owner !== lifetime.current || version !== statusVersion.current) return;
      reportError(reason);
      if (!invalidatesPreview(reason)) void readPage(initialItem);
    });
    return () => { lifetime.current++; readVersion.current++; statusVersion.current++; };
  }, [initialItem, applyStatus, readPage, reportError]);

  useEffect(() => {
    if (capture?.state !== 'running' || pending || unavailable) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (captureAction.current) return;
      const owner = lifetime.current;
      const version = ++statusVersion.current;
      try {
        const next = await window.anysearch.captureStatus(initialItem.id);
        if (!cancelled && owner === lifetime.current && version === statusVersion.current) applyStatus(next);
      } catch (reason) {
        if (!cancelled && owner === lifetime.current && version === statusVersion.current) {
          reportError(reason);
          setCapture(null);
        }
      }
      if (!cancelled) timer = setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
    };
    timer = setTimeout(() => { void poll(); }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [capture?.state, pending, unavailable, initialItem.id, applyStatus, reportError]);

  const changeCapture = async (cancel: boolean) => {
    if (captureAction.current) return;
    captureAction.current = true;
    const owner = lifetime.current;
    const version = ++statusVersion.current;
    setPending(true);
    setError('');
    try {
      const next = await (cancel ? window.anysearch.cancelCapture(item.id) : window.anysearch.startCapture(referenceOf(currentItem.current)));
      if (owner === lifetime.current && version === statusVersion.current) applyStatus(next);
    } catch (reason) {
      if (owner === lifetime.current && version === statusVersion.current) reportError(reason);
    } finally {
      if (owner === lifetime.current) {
        captureAction.current = false;
        setPending(false);
      }
    }
  };

  const navigationDisabled = reading || pending || unavailable || item.contentLevel !== 'public_text';
  const searchMatch = initialItem.match ?? initialItem.semanticMatch;
  const matchLocation = searchPositionValid.current && sameContentVersion(initialItem, item)
    && item.contentLevel === 'public_text' && searchMatch
    && Number.isSafeInteger(searchMatch.lineStart) && searchMatch.lineStart >= 1 ? searchMatch : null;
  const matchLabel = initialItem.match ? '定位字面命中' : initialItem.semanticMatch ? '定位相关段落' : '定位检索片段';
  const canLocateMatch = !navigationDisabled && matchLocation !== null;
  const canReturnToStart = !navigationDisabled && (content?.lineStart ?? pageStarts[pageIndex]) !== 1;
  const canPreviousPage = !navigationDisabled && pageIndex > 0;
  const canNextPage = !navigationDisabled && (pageStarts[pageIndex + 1] !== undefined || Boolean(content?.hasMore));

  const navigateToLine = (lineStart: number) => {
    if (navigationDisabled || captureAction.current || !sameContentVersion(item, currentItem.current)) return;
    setError('');
    if (pageStarts[pageIndex] === lineStart) {
      void readPage(currentItem.current, lineStart, pageStarts, pageIndex);
    } else {
      void readPage(currentItem.current, lineStart, [...pageStarts.slice(0, pageIndex + 1), lineStart], pageIndex + 1);
    }
  };
  const locateMatch = () => {
    if (!canLocateMatch || !matchLocation || !searchPositionValid.current
      || !sameContentVersion(initialItem, currentItem.current)) return;
    navigateToLine(matchLocation.lineStart);
  };
  const returnToStart = () => {
    if (canReturnToStart) navigateToLine(1);
  };
  const nextPage = () => {
    if (!canNextPage || captureAction.current || !sameContentVersion(item, currentItem.current)) return;
    const recordedStart = pageStarts[pageIndex + 1];
    setError('');
    if (recordedStart !== undefined) {
      void readPage(currentItem.current, recordedStart, pageStarts, pageIndex + 1);
      return;
    }
    if (!content?.hasMore) return;
    const start = content.lineEnd + 1;
    void readPage(currentItem.current, start, [...pageStarts.slice(0, pageIndex + 1), start], pageIndex + 1);
  };
  const previousPage = () => {
    if (!canPreviousPage || captureAction.current || !sameContentVersion(item, currentItem.current)) return;
    setError('');
    void readPage(currentItem.current, pageStarts[pageIndex - 1], pageStarts, pageIndex - 1);
  };

  return { item, content, capture, reading, pending, error, unavailable, pageIndex,
    matchLabel, canLocateMatch, canReturnToStart, canNextPage, canPreviousPage, locateMatch, returnToStart,
    start: () => { void changeCapture(false); }, cancel: () => { void changeCapture(true); }, nextPage, previousPage };
}
