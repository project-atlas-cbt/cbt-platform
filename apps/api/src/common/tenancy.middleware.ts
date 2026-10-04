import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@atlas/db';
import type { Env } from '@atlas/config';
import { enrichLogContext } from '@atlas/observability';
import { TenancyContextService } from './tenancy-context.service.js';
import { parseTenantSubdomain } from './subdomain.js';

/**
 * ADR-0005: the tenant is resolved from the Host header's subdomain, at
 * the edge, before authentication — not from a client-supplied identifier.
 * `School` itself carries no Row-Level Security (ADR-0023's RLS applies to
 * tables *below* School), so this lookup runs with no tenant context set,
 * which is correct: resolving the tenant is what establishes that context
 * for every table below it, not something that can depend on it already
 * existing.
 *
 * Production wildcard DNS/TLS provisioning is deferred to B23 (ADR-0005's
 * own "Required changes" table) — this middleware only needs a Host
 * header to arrive with the right value, however it got there. Locally
 * and in integration tests, that's driven directly (see subdomain.test.ts
 * and tenancy.middleware.integration.test.ts); for real browser testing,
 * see docs/operations/domain-plan.md's PLATFORM_ROOT_DOMAIN convention.
 *
 * A request with no resolvable subdomain (a platform host, the bare root
 * domain, or plain "localhost" in native dev) is not an error here — it
 * simply carries no tenant context. Nothing downstream that actually
 * needs a school id trusts an absent one silently: TenancyContextService
 * .requireSchoolId() throws if called without one, and B1/B2 build the
 * real authorization enforcement on top of that.
 */
@Injectable()
export class TenancyMiddleware implements NestMiddleware {
  private readonly logger = new Logger('TenancyMiddleware');

  constructor(
    private readonly tenancy: TenancyContextService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  use(req: FastifyRequest['raw'], _res: FastifyReply['raw'], next: () => void): void {
    const rootDomain = this.config.get('PLATFORM_ROOT_DOMAIN', { infer: true });
    const subdomain = parseTenantSubdomain(req.headers.host, rootDomain);

    if (!subdomain) {
      this.tenancy.run({ schoolId: null, subdomain: null }, next);
      return;
    }

    // Deliberately not awaited by the caller — Nest's Fastify adapter
    // invokes middleware `use()` fire-and-forget and relies on `next()`
    // being called eventually, exactly like the existing correlation-id
    // and (formerly header-based) tenancy middleware already did; the
    // request genuinely pauses here because nothing downstream runs until
    // `next()` fires, async or not.
    prisma.school
      .findUnique({ where: { subdomain }, select: { id: true, platformOverride: true } })
      .then((school) => {
        if (school) enrichLogContext({ schoolId: school.id });
        this.tenancy.run(
          {
            schoolId: school?.id ?? null,
            subdomain,
            ...(school && { platformOverride: school.platformOverride }),
          },
          next,
        );
      })
      .catch((err: unknown) => {
        // A lookup failure does not fail the request here — this is a
        // resolution primitive, and routes that never read the tenant
        // (health probes) must keep working. B22: it is flagged, so any
        // route that does read the tenant answers 503 + Retry-After (the
        // client retries) rather than treating the host as naming no
        // school, which signed mid-exam students out with a 401.
        this.logger.warn({ msg: 'School lookup failed for subdomain', err, subdomain });
        this.tenancy.run({ schoolId: null, subdomain, lookupFailed: true }, next);
      });
  }
}
