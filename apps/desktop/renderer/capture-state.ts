import { errorMessage } from './ui-state.ts';

const captureErrors: Record<string, string> = {
  CAPTURE_UNSAFE_URL: '此网址不支持公开采集，或包含参数、受限地址。',
  CAPTURE_NETWORK: '网页连接失败，请稍后重试。',
  CAPTURE_TIMEOUT: '网页响应超时，请稍后重试。',
  CAPTURE_CANCELLED: '采集已取消。',
  CAPTURE_ROBOTS_DENIED: '网站规则不允许采集此页面。',
  CAPTURE_SITE_RESTRICTED: '此页面需要登录，或网站限制正文采集。',
  CAPTURE_REDIRECT: '页面跳转超出允许范围，未采集正文。',
  CAPTURE_TOO_LARGE: '页面过大，未采集正文。',
  CAPTURE_UNSUPPORTED_CONTENT: '此页面不是支持的网页或纯文本格式。',
  CAPTURE_NO_TEXT: '未找到可读取的公开正文。',
  CAPTURE_BUSY: '已有采集任务正在进行，请稍后重试。',
};

export function captureErrorMessage(error: unknown): string {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  const code = Object.keys(captureErrors).find(key => message.includes(key));
  return code ? captureErrors[code]! : errorMessage(new Error(message));
}

export function invalidatesPreview(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ACCESS_DENIED|SOURCE_UNAVAILABLE|STALE_SNAPSHOT|NOT_FOUND/.test(message);
}
