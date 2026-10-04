import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { PlatformOverride } from '@atlas/domain';

export interface TenancyStore {
  schoolId: string | null;
  /**
   * The raw subdomain label TenancyMiddleware parsed from the Host header
   * (ADR-0005), even when it didn't resolve to a known School — e.g. an
   * unrecognised subdomain. Kept distinct from `schoolId` so a future
   * consumer (B1's `GET /v1/tenant/resolve`) can tell "no subdomain was
   * present" apart from "a subdomain was present but no school matches
   * it", which need different responses.
   */
  subdomain: string | null;
  /**
   * B21: the school's platform override, read in the same lookup that
   * resolved the tenant (one `schools` read per request instead of two).
   * `undefined` when not loaded — AuthGuard then reads it itself.
   */
  platformOverride?: PlatformOverride;
  /**
   * B22: the school lookup itself failed (database briefly unreachable).
   * Reading `schoolId` then throws, so the request answers 503 + Retry-After
   * instead of carrying on as if the host named no school — which would
   * have signed a mid-exam student out with a 401.
   */
  lookupFailed?: boolean;
}

/** Mapped to 503 SERVICE_UNAVAILABLE by the global exception filter. */
export class TenantLookupUnavailableError extends Error {
  constructor() {
    super('The school for this request could not be looked up.');
    this.name = 'TenantLookupUnavailableError';
  }
}

/**
 * Request-scoped tenant context. Resolution itself — Host-header subdomain
 * parsing against School.subdomain — lives in TenancyMiddleware
 * (ADR-0005); this service only holds the result for the duration of the
 * request via AsyncLocalStorage, so repository/service code reads it
 * instead of threading `schoolId` through every function signature by
 * hand.
 */
@Injectable()
export class TenancyContextService {
  private readonly storage = new AsyncLocalStorage<TenancyStore>();

  run<T>(store: TenancyStore, fn: () => T): T {
    return this.storage.run(store, fn);
  }

  get schoolId(): string | null {
    const store = this.storage.getStore();
    if (store?.lookupFailed) throw new TenantLookupUnavailableError();
    return store?.schoolId ?? null;
  }

  get platformOverride(): PlatformOverride | undefined {
    return this.storage.getStore()?.platformOverride;
  }

  get subdomain(): string | null {
    return this.storage.getStore()?.subdomain ?? null;
  }

  requireSchoolId(): string {
    const id = this.schoolId;
    if (!id) {
      throw new Error(
        'No tenant context is active. requireSchoolId() must be called within a request scoped by TenancyMiddleware.',
      );
    }
    return id;
  }
}
