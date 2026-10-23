import type { ContentLevel, ReadRequest, ReadResponse, SearchMode, SearchResponse } from '../../src/core/contracts.ts';
import type { CaptureStatus } from '../../src/capture/contracts.ts';
import type { PairedSource } from '../../src/connectors/protocol.ts';
import type { ChromeProfileDiscovery } from '../../src/adapters/chrome/profile-contracts.ts';
import type { DesktopGrantPage } from './permissions-contracts.ts';
import type { DesktopActivationStatus } from './activation-contracts.ts';

export interface PairingSession {
  code: string;
  expiresAt: string;
  profileName?: string;
  profileId?: string;
}

export interface DesktopStatus {
  sources: PairedSource[];
  service: 'ready' | 'unavailable';
  hotkey: { accelerator: string; registered: boolean };
  nativeMaterial: boolean;
  activation?: DesktopActivationStatus;
  pairing?: PairingSession;
  error?: string;
}

export type ResourceReference = Pick<ReadRequest, 'id' | 'snapshotId'> & { contentLevel?: ContentLevel };
export type DesktopReadResponse = ReadResponse & { hasMore?: boolean };
export interface DesktopSearchRequest { query: string; includePublicText: boolean; mode?: SearchMode }
export interface DesktopReadRequest { reference: ResourceReference; lineStart?: number }
export type WindowLayout = 'compact' | 'expanded';

export interface DesktopApi {
  status(): Promise<DesktopStatus>;
  search(query: string, includePublicText?: boolean, mode?: SearchMode): Promise<SearchResponse>;
  read(reference: ResourceReference, lineStart?: number): Promise<DesktopReadResponse>;
  startCapture(reference: ResourceReference): Promise<CaptureStatus>;
  captureStatus(id: string): Promise<CaptureStatus>;
  cancelCapture(id: string): Promise<CaptureStatus>;
  discoverChromeProfiles(): Promise<ChromeProfileDiscovery>;
  openChromeProfile(profileId: string): Promise<void>;
  beginPairing(profileId?: string): Promise<PairingSession>;
  cancelPairing(): Promise<void>;
  setSourceEnabled(sourceId: string, enabled: boolean): Promise<void>;
  disconnectSource(sourceId: string): Promise<void>;
  listGrants(afterId?: string): Promise<DesktopGrantPage>;
  revokeGrant(grantId: string): Promise<void>;
  setDoubleShiftEnabled(enabled: boolean): Promise<DesktopActivationStatus>;
  open(reference: ResourceReference): Promise<void>;
  copy(reference: ResourceReference): Promise<void>;
  hide(): Promise<void>;
  setLayout(layout: WindowLayout): Promise<void>;
  onFocus(listener: () => void): () => void;
}

export const DESKTOP_CHANNELS = Object.freeze({
  status: 'anysearch:status', search: 'anysearch:search', read: 'anysearch:read',
  startCapture: 'anysearch:start-capture', captureStatus: 'anysearch:capture-status', cancelCapture: 'anysearch:cancel-capture',
  beginPairing: 'anysearch:begin-pairing', cancelPairing: 'anysearch:cancel-pairing',
  setSourceEnabled: 'anysearch:set-source-enabled', open: 'anysearch:open',
  disconnectSource: 'anysearch:disconnect-source',
  listGrants: 'anysearch:list-grants', revokeGrant: 'anysearch:revoke-grant',
  setDoubleShiftEnabled: 'anysearch:set-double-shift-enabled',
  copy: 'anysearch:copy', hide: 'anysearch:hide', setLayout: 'anysearch:layout',
  focus: 'anysearch:focus',
  discoverProfiles: 'anysearch:discover-profiles', openProfile: 'anysearch:open-profile',
});

export function parseProfileId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('INVALID_PROFILE');
  return value;
}

export function parseReference(value: unknown): ResourceReference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('INVALID_REFERENCE');
  const reference = value as Record<string, unknown>;
  if (Object.keys(reference).some(key => key !== 'id' && key !== 'snapshotId' && key !== 'contentLevel')
    || typeof reference.id !== 'string' || !/^[a-f0-9]{64}$/.test(reference.id)
    || typeof reference.snapshotId !== 'string' || !/^[a-f0-9]{64}$/.test(reference.snapshotId)
    || (reference.contentLevel !== undefined && reference.contentLevel !== 'metadata' && reference.contentLevel !== 'public_text')) {
    throw new Error('INVALID_REFERENCE');
  }
  return { id: reference.id, snapshotId: reference.snapshotId,
    ...(reference.contentLevel === undefined ? {} : { contentLevel: reference.contentLevel }) };
}

export function parseResourceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('INVALID_REFERENCE');
  return value;
}

export function parseSearchRequest(value: unknown): DesktopSearchRequest {
  if (typeof value === 'string') return { query: parseQuery(value), includePublicText: false };
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('INVALID_QUERY');
  const request = value as Record<string, unknown>;
  if (Object.keys(request).some(key => key !== 'query' && key !== 'includePublicText' && key !== 'mode')
    || typeof request.includePublicText !== 'boolean'
    || (request.mode !== undefined && request.mode !== 'hybrid' && request.mode !== 'keyword')) throw new Error('INVALID_QUERY');
  return { query: parseQuery(request.query), includePublicText: request.includePublicText,
    ...(request.mode === undefined ? {} : { mode: request.mode }) };
}

export function parseReadRequest(value: unknown): DesktopReadRequest {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || !('reference' in value)) {
    return { reference: parseReference(value) };
  }
  const request = value as Record<string, unknown>;
  if (Object.keys(request).some(key => key !== 'reference' && key !== 'lineStart')
    || (request.lineStart !== undefined && (typeof request.lineStart !== 'number'
      || !Number.isSafeInteger(request.lineStart) || request.lineStart < 1))) throw new Error('INVALID_RANGE');
  return { reference: parseReference(request.reference),
    ...(request.lineStart === undefined ? {} : { lineStart: request.lineStart as number }) };
}

export function safeExternalUrl(value: string): string {
  if (typeof value !== 'string' || value.length > 8192 || /[\u0000-\u0020\u007f]/.test(value)) throw new Error('UNSAFE_URL');
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname) {
    throw new Error('UNSAFE_URL');
  }
  return url.href;
}

export function parseQuery(value: unknown): string {
  if (typeof value !== 'string' || value.length > 512 || value.includes('\0')) throw new Error('INVALID_QUERY');
  return value;
}

export function parseSourceToggle(sourceId: unknown, enabled: unknown): { sourceId: string; enabled: boolean } {
  if (typeof sourceId !== 'string' || sourceId.length < 1 || sourceId.length > 256 || sourceId.includes('\0')
    || typeof enabled !== 'boolean') throw new Error('INVALID_SOURCE');
  return { sourceId, enabled };
}

export function parseLayout(value: unknown): WindowLayout {
  if (value !== 'compact' && value !== 'expanded') throw new Error('INVALID_LAYOUT');
  return value;
}
