import type { ContentLevel } from '../../src/core/contracts.ts';

export const GRANT_PAGE_SIZE = 20;

export interface DesktopGrantSummary {
  id: string;
  sourceId: string;
  contentLevel: ContentLevel;
  revoked: boolean;
  sourceEnabled: boolean;
  currentDesktopSession: boolean;
}

export interface DesktopGrantPage {
  items: DesktopGrantSummary[];
  nextCursor?: string;
}

export interface GrantPageRequest {
  afterId?: string;
}

export function parseGrantId(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('INVALID_GRANT');
  }
  return value;
}

export function parseGrantPageRequest(value: unknown): GrantPageRequest {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('INVALID_GRANT_PAGE');
  const request = value as Record<string, unknown>;
  if (Object.keys(request).some(key => key !== 'afterId')) throw new Error('INVALID_GRANT_PAGE');
  return request.afterId === undefined ? {} : { afterId: parseGrantId(request.afterId) };
}
