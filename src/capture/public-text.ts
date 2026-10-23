import { setTimeout as wait } from 'node:timers/promises';
import robotsParser from 'robots-parser';
import { ServiceError } from '../core/errors.ts';
import { abortable, captureError, checkSignal } from './capture-error.ts';
import { captureLimits, captureUserAgent } from './capture-limits.ts';
import type { PublicTextFetcher, PublicTextOptions } from './contracts.ts';
import { decodeResponse, extractText } from './extract-text.ts';
import { requestPublic, type PublicRequest, type PublicResponse } from './public-http.ts';
import { lookupAddresses, publicUrl, resolvePublicAddress, type AddressLookup } from './public-url.ts';

// The package's CommonJS declaration is interpreted as a namespace by NodeNext.
const parseRobots = robotsParser as unknown as (url: string, text: string) => {
  isAllowed(url: string, agent: string): boolean | undefined;
  getCrawlDelay(agent: string): number | undefined;
};

interface FetchDependencies {
  lookup: AddressLookup;
  request: PublicRequest;
  wait: (milliseconds: number, signal: AbortSignal) => Promise<void>;
}

const productionDependencies: FetchDependencies = {
  lookup: lookupAddresses, request: requestPublic,
  wait: async (milliseconds, signal) => { await wait(milliseconds, undefined, { signal }); },
};

export function createPublicTextFetcher(dependencies: FetchDependencies): PublicTextFetcher {
  let nextRequestAt = 0;
  return async (input, caller) => {
    const controller = new AbortController();
    const deadline = Date.now() + captureLimits.deadlineMs;
    const cancel = (): void => controller.abort(captureError('CAPTURE_CANCELLED'));
    const timer = setTimeout(() => controller.abort(captureError('CAPTURE_TIMEOUT')), captureLimits.deadlineMs);
    caller.signal.addEventListener('abort', cancel, { once: true });
    if (caller.signal.aborted) cancel();
    const options: PublicTextOptions = {
      signal: controller.signal,
      assertCurrent: () => {
        if (Date.now() >= deadline) throw captureError('CAPTURE_TIMEOUT');
        checkSignal(controller.signal);
        caller.assertCurrent();
      },
    };
    try {
      options.assertCurrent();
      const original = publicUrl(input);
      const robotsUrl = new URL('/robots.txt', original);
      let intervalMs = captureLimits.requestIntervalMs as number;
      const request = async (url: URL, maxBytes: number): Promise<PublicResponse> => {
        options.assertCurrent();
        const delay = Math.max(0, nextRequestAt - Date.now());
        nextRequestAt = Math.max(Date.now(), nextRequestAt) + intervalMs;
        if (delay) await abortable(dependencies.wait(delay, options.signal), options.signal);
        options.assertCurrent();
        const address = await resolvePublicAddress(url, options, dependencies.lookup);
        options.assertCurrent();
        return abortable(dependencies.request(url, address, maxBytes, options), options.signal);
      };
      const follow = async (
        initial: URL, maxBytes: number, permitted: (url: URL) => boolean,
      ): Promise<PublicResponse> => {
        let url = initial;
        for (let hop = 0; hop <= captureLimits.redirects; hop++) {
          options.assertCurrent();
          if (!permitted(url)) throw captureError('CAPTURE_ROBOTS_DENIED');
          const response = await request(url, maxBytes);
          if (![301, 302, 303, 307, 308].includes(response.status)) return response;
          if (hop === captureLimits.redirects || !response.headers.location) throw captureError('CAPTURE_REDIRECT');
          let next: URL;
          try { next = publicUrl(new URL(response.headers.location, url).href); }
          catch { throw captureError('CAPTURE_REDIRECT'); }
          if (next.origin !== original.origin) throw captureError('CAPTURE_REDIRECT');
          url = next;
        }
        throw captureError('CAPTURE_REDIRECT');
      };
      const robotsResponse = await follow(robotsUrl, captureLimits.robotsBytes, () => true);
      let permitted: (url: URL) => boolean = () => true;
      if (robotsResponse.status !== 404) {
        if (robotsResponse.status !== 200) throw captureError('CAPTURE_ROBOTS_DENIED');
        const robotsText = decodeResponse(robotsResponse, true).text;
        if (robotsText.trim() && !/^\s*user-agent\s*:\s*\S+/im.test(robotsText)) throw captureError('CAPTURE_ROBOTS_DENIED');
        const rules = parseRobots(robotsUrl.href, robotsText);
        permitted = url => rules.isAllowed(url.href, captureUserAgent) === true;
        const delay = rules.getCrawlDelay(captureUserAgent);
        if (delay !== undefined) {
          if (!Number.isFinite(delay) || delay < 0 || delay * 1_000 >= captureLimits.deadlineMs) throw captureError('CAPTURE_ROBOTS_DENIED');
          intervalMs = Math.max(intervalMs, delay * 1_000);
          nextRequestAt = Math.max(nextRequestAt, Date.now() + intervalMs);
        }
      }
      const response = await follow(original, captureLimits.responseBytes, permitted);
      options.assertCurrent();
      if ([401, 403, 407].includes(response.status)) throw captureError('CAPTURE_SITE_RESTRICTED');
      if (response.status !== 200) throw captureError('CAPTURE_NETWORK');
      const text = extractText(response);
      options.assertCurrent();
      return text;
    } catch (error) {
      checkSignal(controller.signal);
      if (error instanceof ServiceError) throw error;
      throw captureError('CAPTURE_NETWORK');
    } finally {
      clearTimeout(timer);
      caller.signal.removeEventListener('abort', cancel);
    }
  };
}

export const fetchPublicText: PublicTextFetcher = createPublicTextFetcher(productionDependencies);
