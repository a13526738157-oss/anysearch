import { mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { CaptureStatus, PublicTextFetcher } from '../../src/capture/contracts.ts';
import { fetchPublicText } from '../../src/capture/public-text.ts';
import { discoverChromeProfiles, resolveDiscoveredProfile } from '../../src/adapters/chrome/profiles.ts';
import type { ChromeProfileDiscoveryOptions } from '../../src/adapters/chrome/profile-contracts.ts';
import { AnySearchService } from '../../src/core/service.ts';
import { RetrievalService } from '../../src/retrieval/service.ts';
import type { EmbeddingProvider, RerankingProvider, VectorCache } from '../../src/retrieval/contracts.ts';
import type { ContentLevel } from '../../src/core/contracts.ts';
import { requireValue, ServiceError } from '../../src/core/errors.ts';
import { openDatabase, transaction } from '../../src/storage/database.ts';
import { authorize, issueGrant, listGrantSummaries, revokeExistingGrant, revokeGrant } from '../../src/storage/grants.ts';
import { beginPairing, cancelPairing, disconnectSource, listSources, setSourceEnabled } from '../../src/storage/pairing.ts';
import type { PairingSession, ResourceReference } from './desktop-contracts.ts';
import { parseProfileId, parseReadRequest, parseReference, parseResourceId, parseSearchRequest, parseSourceToggle } from './desktop-contracts.ts';
import { CaptureManager } from './capture-manager.ts';
import { GRANT_PAGE_SIZE, parseGrantId, parseGrantPageRequest } from './permissions-contracts.ts';
import type { DesktopGrantPage } from './permissions-contracts.ts';

const sourceSchema = z.object({ sourceId: z.string().min(1).max(128) }).strict();

export interface DesktopBackendOptions {
  fetchPublicText?: PublicTextFetcher;
  embedder?: EmbeddingProvider;
  cache?: VectorCache;
  reranker?: RerankingProvider;
}

export class DesktopBackend {
  private readonly db;
  private readonly service: AnySearchService;
  private readonly retrieval: RetrievalService | undefined;
  private searchTask: AbortController | undefined;
  private pairing: PairingSession | undefined;
  private pairingGeneration = 0;
  private closed = false;
  private readonly grants = new Map<string, { id: string; capability: string; sourceId: string }>();
  private readonly discoveryOptions: ChromeProfileDiscoveryOptions;
  private readonly captures: CaptureManager;

  constructor(dataDirectory: string, discoveryOptions: ChromeProfileDiscoveryOptions = {}, options: DesktopBackendOptions = {}) {
    requireValue(isAbsolute(dataDirectory), 'INVALID_DIRECTORY', 'Expected an absolute data directory.');
    mkdirSync(dataDirectory, { recursive: true });
    this.db = openDatabase(join(dataDirectory, 'index.sqlite'));
    this.service = new AnySearchService(this.db);
    this.retrieval = options.embedder ? new RetrievalService(this.db, {
      embedder: options.embedder, ...(options.cache ? { cache: options.cache } : {}),
      ...(options.reranker ? { reranker: options.reranker } : {}),
    }) : undefined;
    this.captures = new CaptureManager(this.db, options.fetchPublicText ?? fetchPublicText);
    this.discoveryOptions = discoveryOptions;
    // One-time pairing sessions are intentionally invalid across desktop restarts.
    cancelPairing(this.db);
  }

  handle(method: string, args: unknown): unknown {
    requireValue(!this.closed, 'SERVICE_CLOSED', 'The local service is closed.');
    switch (method) {
      case 'status': {
        const sources = listSources(this.db);
        if (this.pairing && (Date.parse(this.pairing.expiresAt) <= Date.now() || sources.length > 0)) {
          this.pairing = undefined;
          cancelPairing(this.db);
        }
        return { sources, ...(this.pairing ? { pairing: this.pairing } : {}) };
      }
      case 'listGrants': {
        const { afterId } = parseGrantPageRequest(args);
        const page = listGrantSummaries(this.db, GRANT_PAGE_SIZE, afterId);
        const sessionIds = new Set([...this.grants.values()].map(grant => grant.id));
        return { ...page, items: page.items.map(grant => ({ ...grant,
          currentDesktopSession: sessionIds.has(grant.id),
        })) } satisfies DesktopGrantPage;
      }
      case 'revokeGrant': {
        const id = parseGrantId(args);
        requireValue(![...this.grants.values()].some(grant => grant.id === id),
          'CURRENT_SESSION_GRANT', 'Current desktop session grants cannot be revoked from this entry.');
        revokeExistingGrant(this.db, id);
        return null;
      }
      case 'discoverChromeProfiles': return discoverChromeProfiles(this.discoveryOptions);
      case 'resolveChromeProfile': return this.resolveProfile(parseProfileId(args));
      case 'beginPairing': {
        if (args !== undefined) return this.pairWithProfile(parseProfileId(args));
        this.pairingGeneration++;
        this.pairing = beginPairing(this.db);
        return this.pairing;
      }
      case 'cancelPairing': this.pairingGeneration++; this.pairing = undefined; cancelPairing(this.db); return null;
      case 'setSourceEnabled': {
        const input = z.object({ sourceId: z.string(), enabled: z.boolean() }).strict().parse(args);
        const parsed = parseSourceToggle(input.sourceId, input.enabled);
        if (!parsed.enabled) this.captures.abortSource(parsed.sourceId);
        setSourceEnabled(this.db, parsed.sourceId, parsed.enabled);
        return null;
      }
      case 'disconnectSource': {
        const { sourceId } = sourceSchema.parse(args);
        this.captures.abortSource(sourceId);
        disconnectSource(this.db, sourceId);
        for (const [key, grant] of this.grants) if (grant.sourceId === sourceId) this.grants.delete(key);
        return null;
      }
      case 'search': {
        this.searchTask?.abort();
        const input = parseSearchRequest(args);
        const query = input.query.trim();
        if (!query) return { mode: 'keyword', items: [], evidenceCompleteness: 'partial', untrustedContent: true };
        const source = listSources(this.db).find(item => item.enabled);
        if (!source) return { mode: 'keyword', items: [], evidenceCompleteness: 'partial', untrustedContent: true };
        const capability = this.capability(source.sourceId, input.includePublicText ? 'public_text' : 'metadata');
        if (!this.retrieval) return this.service.search(capability, query, 20);
        this.searchTask = new AbortController();
        return this.retrieval.search(capability, query, 20, input.mode ?? 'hybrid', this.searchTask.signal);
      }
      case 'read': {
        const { reference, lineStart } = parseReadRequest(args);
        const sourceId = this.enabledSource();
        const capability = this.capability(sourceId, this.referenceLevel(reference));
        const result = this.service.read(capability, {
          id: reference.id, snapshotId: reference.snapshotId, lineStart: lineStart ?? 1, maxLines: 40,
        });
        let hasMore = true;
        try { this.service.read(capability, { ...reference, lineStart: result.lineEnd + 1, maxLines: 1 }); }
        catch (error) {
          if (error instanceof ServiceError && error.code === 'INVALID_RANGE') hasMore = false;
          else throw error;
        }
        return { ...result, hasMore };
      }
      case 'startCapture': {
        const reference = parseReference(args);
        const sourceId = this.enabledSource();
        this.service.read(this.capability(sourceId, this.referenceLevel(reference)), { ...reference, maxLines: 1 });
        return this.captureResult(sourceId, () => this.captures.start(sourceId, reference.id));
      }
      case 'captureStatus': {
        const sourceId = this.enabledSource();
        const id = parseResourceId(args);
        return this.captureResult(sourceId, () => this.captures.status(sourceId, id));
      }
      case 'cancelCapture': {
        const sourceId = this.enabledSource();
        const id = parseResourceId(args);
        return this.captureResult(sourceId, () => this.captures.cancel(sourceId, id));
      }
      default: throw new Error('UNKNOWN_METHOD');
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pairingGeneration++;
    this.searchTask?.abort();
    this.captures.close();
    try {
      transaction(this.db, () => {
        for (const grant of this.grants.values()) revokeGrant(this.db, grant.id);
        cancelPairing(this.db);
      });
    } finally { this.db.close(); }
  }

  private capability(sourceId: string, contentLevel: ContentLevel = 'metadata'): string {
    const key = JSON.stringify([sourceId, contentLevel]);
    let grant = this.grants.get(key);
    if (!grant) { grant = { ...issueGrant(this.db, sourceId, contentLevel), sourceId }; this.grants.set(key, grant); }
    return grant.capability;
  }

  private enabledSource(): string {
    const source = listSources(this.db).find(item => item.enabled);
    requireValue(source, 'ACCESS_DENIED', 'Source is not available.');
    return source.sourceId;
  }

  private referenceLevel(reference: ResourceReference): ContentLevel {
    return reference.contentLevel ?? 'metadata';
  }

  private captureResult(sourceId: string, operation: () => CaptureStatus): CaptureStatus {
    const capability = this.capability(sourceId, 'public_text');
    authorize(this.db, capability);
    const result = operation();
    authorize(this.db, capability);
    return result;
  }

  private async resolveProfile(profileId: string) {
    const profile = await resolveDiscoveredProfile(this.discoveryOptions, profileId);
    requireValue(profile, 'PROFILE_UNAVAILABLE', 'The selected Chrome profile is no longer available.');
    return profile;
  }

  private async pairWithProfile(profileId: string): Promise<PairingSession> {
    const generation = ++this.pairingGeneration;
    const profile = await this.resolveProfile(profileId);
    requireValue(!this.closed && generation === this.pairingGeneration, 'PAIRING_CANCELLED', 'Pairing was cancelled.');
    this.pairing = { ...beginPairing(this.db, Date.now(), profile.name), profileId };
    return this.pairing;
  }
}
