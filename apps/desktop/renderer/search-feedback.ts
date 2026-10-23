export type DesktopServiceState = 'loading' | 'ready' | 'unavailable';
export type SearchPhase = 'loading' | 'unavailable' | 'unpaired' | 'paused' | 'idle'
  | 'input' | 'searching' | 'results' | 'failed' | 'empty';

interface SearchFeedbackInput {
  service: DesktopServiceState;
  pairedCount: number;
  activeCount: number;
  bookmarkCount: number;
  hasQuery: boolean;
  inputPending: boolean;
  searching: boolean;
  failed: boolean;
  resultCount: number;
}

export function searchFeedback(input: SearchFeedbackInput): {
  phase: SearchPhase; title: string; status: string; canConnect: boolean; showResults: boolean;
} {
  let phase: SearchPhase;
  let title: string;
  let status: string;
  if (input.service === 'loading') {
    phase = 'loading'; title = '正在连接本地服务'; status = '读取状态中';
  } else if (input.service === 'unavailable') {
    phase = 'unavailable'; title = '本地服务暂时不可用'; status = '服务不可用';
  } else if (!input.pairedCount) {
    phase = 'unpaired'; title = '尚未连接书签'; status = '等待连接';
  } else if (!input.activeCount) {
    phase = 'paused'; title = '来源访问已暂停'; status = '访问已暂停';
  } else if (!input.hasQuery) {
    phase = 'idle'; title = ''; status = `${input.bookmarkCount} 个书签`;
  } else if (input.inputPending) {
    phase = 'input'; title = '正在输入'; status = '等待输入完成';
  } else if (input.searching) {
    phase = 'searching'; title = '正在查找'; status = '查找中';
  } else if (input.resultCount) {
    phase = 'results'; title = ''; status = `${input.resultCount} 条候选`;
  } else if (input.failed) {
    phase = 'failed'; title = '检索未完成'; status = '检索未完成';
  } else {
    phase = 'empty'; title = '未找到匹配的书签'; status = '0 条候选';
  }
  return { phase, title, status, canConnect: phase === 'unpaired', showResults: phase === 'results' };
}
