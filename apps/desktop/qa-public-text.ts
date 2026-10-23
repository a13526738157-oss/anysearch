import { setTimeout as delay } from 'node:timers/promises';
import type { PublicTextFetcher } from '../../src/capture/contracts.ts';
import { ServiceError } from '../../src/core/errors.ts';

// Selected only by the desktop worker's two explicit QA flags; never performs network I/O.
export const qaPublicTextFetcher: PublicTextFetcher = async (value, options) => {
  const url = new URL(value);
  if (url.origin !== 'https://public-text-qa.invalid' || url.search
    || !['/article', '/slow', '/denied'].includes(url.pathname)) {
    throw new ServiceError('CAPTURE_UNSAFE_URL', 'Synthetic capture target required.');
  }
  options.assertCurrent();
  if (url.pathname === '/denied') throw new ServiceError('CAPTURE_ROBOTS_DENIED', 'Synthetic site restriction.');
  try {
    await delay(url.pathname === '/slow' ? 30_000 : 250, undefined, { signal: options.signal });
  } catch {
    throw new ServiceError('CAPTURE_CANCELLED', 'Synthetic capture cancelled.');
  }
  options.assertCurrent();
  return Array.from({ length: 120 }, (_, index) => {
    if (index === 1) return '<script>window.__captureInjected = true</script>';
    return `Synthetic public article, line ${index + 1}. ${index === 0 ? '\u6b63\u6587\u4e13\u5c5e\u68c0\u7d22\u8bcd' : 'Local evidence stays separate from bookmark metadata.'}`;
  }).join('\n');
};
