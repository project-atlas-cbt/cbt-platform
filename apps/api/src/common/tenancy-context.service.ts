import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export interface TenancyStore {
  schoolId: string | null;
}

/**
 * Request-scoped school context (B0 scope). Real resolution — subdomain at
 * login, session-carried thereafter — is ADR-0005 / B1. B0 only needs the
 * primitive: an AsyncLocalStorage-backed context that TenancyMiddleware
 * populates and that repository/service code reads instead of threading
 * `schoolId` through every function signature by hand.
 */
@Injectable()
export class TenancyContextService {
  private readonly storage = new AsyncLocalStorage<TenancyStore>();

  run<T>(schoolId: string | null, fn: () => T): T {
    return this.storage.run({ schoolId }, fn);
  }

  get schoolId(): string | null {
    return this.storage.getStore()?.schoolId ?? null;
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
