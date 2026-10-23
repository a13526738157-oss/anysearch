export function nextSelection(current: number, count: number, direction: -1 | 1): number {
  if (count === 0) return -1;
  if (current < 0) return direction > 0 ? 0 : count - 1;
  return (current + direction + count) % count;
}

export interface RequestGenerations { search: number; read: number }

export function invalidateRequestGenerations(current: RequestGenerations, scope: 'preview' | 'all'): RequestGenerations {
  return { search: current.search + (scope === 'all' ? 1 : 0), read: current.read + 1 };
}

export function isComposingKey(event: { isComposing: boolean; keyCode?: number }, composing: boolean): boolean {
  return composing || event.isComposing || event.keyCode === 229;
}

export function displayHost(url: string): string {
  try { return new URL(url).hostname; } catch { return '无效网址'; }
}

export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : '';
  if (text.includes('ACTIVATION_BUSY')) return '原生唤起设置正在更新，请稍后重试。';
  if (text.includes('ACTIVATION_UNAVAILABLE')) return '原生唤起暂时不可用，常规热键和托盘仍可使用。';
  if (text.includes('STALE_SNAPSHOT')) return '资料已更新，请重新搜索。';
  if (text.includes('ACCESS_DENIED') || text.includes('SOURCE_UNAVAILABLE')) return '来源访问已暂停。';
  if (text.includes('NOT_FOUND')) return '资料已不在当前来源中。';
  if (text.includes('UNSAFE_URL')) return '此地址不允许在浏览器中打开。';
  if (text.includes('PAIRING')) return '配对未完成，请重新生成配对码。';
  if (text.includes('PROFILE_UNAVAILABLE') || text.includes('INVALID_PROFILE')) return '此 Chrome 配置已不可用，请刷新列表重新选择。';
  if (text.includes('CHROME_NOT_FOUND') || text.includes('CHROME_LAUNCH_FAILED')) return '无法自动打开 Chrome，请在所选配置中打开扩展。';
  return '本地服务暂时不可用，请重试。';
}
