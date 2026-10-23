import { MIMEType } from 'node:util';
import { Readability } from '@mozilla/readability';
import { DOMParser } from 'linkedom';
import { captureError } from './capture-error.ts';
import { captureLimits } from './capture-limits.ts';
import type { PublicResponse } from './public-http.ts';

export function hasRestrictedDirective(value: string): boolean {
  return /(?:^|[\s,:;])(noindex|nosnippet|noarchive|none)(?=$|[\s,;])/i.test(value) || /max-snippet\s*:\s*0(?:\D|$)/i.test(value);
}

export function decodeResponse(response: PublicResponse, robots = false): { text: string; html: boolean } {
  let mime: MIMEType;
  try { mime = new MIMEType(response.headers['content-type'] ?? ''); }
  catch { throw captureError('CAPTURE_UNSUPPORTED_CONTENT'); }
  if (mime.essence !== 'text/plain' && (robots || mime.essence !== 'text/html')) throw captureError('CAPTURE_UNSUPPORTED_CONTENT');
  try {
    return { text: new TextDecoder(mime.params.get('charset') ?? 'utf-8', { fatal: true }).decode(response.body), html: mime.essence === 'text/html' };
  } catch { throw captureError('CAPTURE_UNSUPPORTED_CONTENT'); }
}

export function cleanText(text: string): string {
  const lines: string[] = [];
  const paragraphs = text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').split('\n');
  for (const paragraph of paragraphs) {
    let remaining = paragraph.replace(/[^\S\n]+/g, ' ').trim();
    while (remaining.length > captureLimits.lineCharacters) {
      let end: number = captureLimits.lineCharacters;
      if (/[\uD800-\uDBFF]/.test(remaining[end - 1]!)) end--;
      const space = remaining.lastIndexOf(' ', end);
      if (space >= end / 2) end = space;
      lines.push(remaining.slice(0, end).trimEnd());
      remaining = remaining.slice(end).trimStart();
    }
    if (remaining) lines.push(remaining);
  }
  const result = lines.join('\n');
  if (result.length > captureLimits.textCharacters) throw captureError('CAPTURE_TOO_LARGE');
  if (!result.trim()) throw captureError('CAPTURE_NO_TEXT');
  return result;
}

export function extractText(response: PublicResponse): string {
  const robots = response.headers['x-robots-tag'];
  if (hasRestrictedDirective(Array.isArray(robots) ? robots.join(',') : robots ?? '') ||
      /(?:^|,)\s*(?:private|no-store)(?:\s|,|=|$)/i.test(response.headers['cache-control'] ?? '') ||
      response.headers['www-authenticate']) throw captureError('CAPTURE_SITE_RESTRICTED');
  const { text, html } = decodeResponse(response);
  if (!html) return cleanText(text);

  // LinkeDOM parses a detached document: scripts and external resources are never run.
  const document = new DOMParser().parseFromString(text, 'text/html') as unknown as Document;
  if (document.querySelectorAll('*').length > captureLimits.domElements) throw captureError('CAPTURE_TOO_LARGE');
  for (const meta of document.querySelectorAll('meta')) {
    const name = (meta.getAttribute('name') ?? '').toLowerCase();
    if ((/robots|anysearch|googlebot|bingbot/.test(name) && hasRestrictedDirective(meta.getAttribute('content') ?? '')) ||
        (meta.getAttribute('http-equiv') ?? '').toLowerCase() === 'refresh') throw captureError('CAPTURE_SITE_RESTRICTED');
  }
  if (document.querySelector('input[type="password" i], input[autocomplete="current-password" i], input[autocomplete="new-password" i]')) {
    throw captureError('CAPTURE_SITE_RESTRICTED');
  }
  for (const form of document.querySelectorAll('form')) {
    if (/login|sign[-_]?in|oauth|authenticate/i.test(form.getAttribute('action') ?? '') || form.querySelector('input[autocomplete="username" i]')) {
      throw captureError('CAPTURE_SITE_RESTRICTED');
    }
  }
  for (const element of document.querySelectorAll('script, style, noscript, iframe, object, embed, form, input, button, [hidden], [aria-hidden="true"]')) element.remove();
  let article: ReturnType<Readability<Node>['parse']>;
  try {
    article = new Readability<Node>(document, {
      maxElemsToParse: captureLimits.domElements, disableJSONLD: true, charThreshold: 100,
      serializer: node => node,
    }).parse();
  } catch { throw captureError('CAPTURE_NO_TEXT'); }
  if (!article?.content) throw captureError('CAPTURE_NO_TEXT');
  const content = article.content as Element;
  for (const block of content.querySelectorAll('p, div, section, article, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr, br')) {
    block.insertBefore(document.createTextNode('\n'), block.firstChild);
    block.appendChild(document.createTextNode('\n'));
  }
  return cleanText(content.textContent ?? '');
}
