import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

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
    return this.storage.getStore()?.schoolId ?? null;
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
