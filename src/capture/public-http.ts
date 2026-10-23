import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { checkServerIdentity } from 'node:tls';
import ipaddr from 'ipaddr.js';
import { captureError, checkSignal } from './capture-error.ts';
import { captureUserAgent } from './capture-limits.ts';
import type { PublicTextOptions } from './contracts.ts';
import { publicAddress, publicUrl, type PublicAddress } from './public-url.ts';

export interface PublicResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}
export type PublicRequest = (
  url: URL, address: PublicAddress, maxBytes: number, options: PublicTextOptions,
) => Promise<PublicResponse>;

export function pinnedRequestOptions(url: URL, address: PublicAddress): https.RequestOptions & { autoSelectFamily: false } {
  publicUrl(url.href);
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  publicAddress(address.address);
  return {
    protocol: url.protocol, hostname, port: url.protocol === 'https:' ? 443 : 80,
    path: url.pathname, method: 'GET', family: address.family, autoSelectFamily: false,
    lookup: (_host, _options, callback) => callback(null, address.address, address.family),
    servername: isIP(hostname) ? '' : hostname,
    rejectUnauthorized: true,
    checkServerIdentity: (_host, certificate) => checkServerIdentity(hostname, certificate),
    maxHeaderSize: 16 * 1024,
    headers: {
      Host: url.host, 'User-Agent': captureUserAgent, Accept: 'text/html, text/plain;q=0.9',
      'Accept-Encoding': 'identity', Connection: 'close',
    },
  };
}

export const requestPublic: PublicRequest = async (url, address, maxBytes, options) => {
  checkSignal(options.signal);
  options.assertCurrent();
  const secure = url.protocol === 'https:';
  const agent = secure ? new https.Agent({ keepAlive: false, proxyEnv: {} }) : new http.Agent({ keepAlive: false, proxyEnv: {} });
  try {
    return await new Promise<PublicResponse>((resolve, reject) => {
      const request = (secure ? https : http).request({ ...pinnedRequestOptions(url, address), agent, signal: options.signal }, response => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        const fail = (error: unknown): void => {
          response.destroy();
          request.destroy();
          reject(error);
        };
        try {
          const remote = response.socket.remoteAddress;
          if (!remote || ipaddr.process(remote).toString() !== ipaddr.process(address.address).toString()) {
            throw captureError('CAPTURE_UNSAFE_URL');
          }
          const encoding = response.headers['content-encoding'];
          if (encoding && encoding.toLowerCase() !== 'identity') throw captureError('CAPTURE_UNSUPPORTED_CONTENT');
          const length = response.headers['content-length'];
          if (length && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw captureError('CAPTURE_TOO_LARGE');
        } catch (error) { fail(error); return; }
        response.on('data', (chunk: Buffer) => {
          try {
            checkSignal(options.signal);
            options.assertCurrent();
            bytes += chunk.length;
            if (bytes > maxBytes) throw captureError('CAPTURE_TOO_LARGE');
            chunks.push(chunk);
          } catch (error) { fail(error); }
        });
        response.on('error', reject);
        response.on('end', () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body: Buffer.concat(chunks) }));
      });
      request.on('error', reject);
      request.on('upgrade', (_response, socket) => { socket.destroy(); reject(captureError('CAPTURE_UNSUPPORTED_CONTENT')); });
      request.end();
    });
  } finally { agent.destroy(); }
};
