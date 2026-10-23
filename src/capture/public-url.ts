import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { abortable, captureError, checkSignal } from './capture-error.ts';
import type { PublicTextOptions } from './contracts.ts';

export interface PublicAddress { address: string; family: 4 | 6 }
export type AddressLookup = (hostname: string) => Promise<readonly { address: string; family: number }[]>;
export const lookupAddresses: AddressLookup = hostname => lookup(hostname, { all: true, verbatim: true });

export function publicAddress(address: string): PublicAddress {
  const family = isIP(address);
  if ((family !== 4 && family !== 6) || ipaddr.parse(address).range() !== 'unicast') {
    throw captureError('CAPTURE_UNSAFE_URL');
  }
  return { address, family };
}

export function publicUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw captureError('CAPTURE_UNSAFE_URL'); }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  // Query parameters can carry bearer credentials under arbitrary names.
  if (!['http:', 'https:'].includes(url.protocol) || url.port || url.username || url.password ||
      url.search || input.length > 8_192 || /[\x00-\x20\\]/.test(input) || host.endsWith('.') ||
      /(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)) {
    throw captureError('CAPTURE_UNSAFE_URL');
  }
  if (isIP(host)) publicAddress(host);
  else if (!host.includes('.') || host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw captureError('CAPTURE_UNSAFE_URL');
  }
  url.hash = '';
  return url;
}

export async function resolvePublicAddress(
  url: URL, options: PublicTextOptions, resolve: AddressLookup = lookupAddresses,
): Promise<PublicAddress> {
  checkSignal(options.signal);
  options.assertCurrent();
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const answers = isIP(hostname) ? [publicAddress(hostname)] : await abortable(resolve(hostname), options.signal);
  checkSignal(options.signal);
  options.assertCurrent();
  if (answers.length === 0 || answers.length > 64) throw captureError('CAPTURE_UNSAFE_URL');
  const validated = answers.map(answer => {
    const address = publicAddress(answer.address);
    if (address.family !== answer.family) throw captureError('CAPTURE_UNSAFE_URL');
    return address;
  });
  return validated[0]!;
}
