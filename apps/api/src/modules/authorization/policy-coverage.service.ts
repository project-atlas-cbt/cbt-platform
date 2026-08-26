import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import { PUBLIC_ROUTE_KEY, REQUIRE_PERMISSION_KEY } from './decorators.js';

// @nestjs/common's own constants.ts (PATH_METADATA) has no stable subpath
// export under this project's NodeNext module resolution — the literal
// value ('path', set by every @Get/@Post/etc. decorator) is stable public
// API regardless, so it's inlined here rather than fought over.
const PATH_METADATA = 'path';

/**
 * B2 DoD item 2 / Security work: "Default deny: an endpoint without an
 * explicit policy fails closed, enforced by a startup assertion that every
 * route declares one." Runs on every app boot (any harness that calls
 * `NestFactory.create(AppModule)` — the real server and every integration
 * test alike, following HttpExceptionFilter's own B1-established
 * precedent for cross-cutting assertions), not only in a dedicated CI
 * step, so a forgotten policy is loud immediately rather than discovered
 * later by a security-suite gap.
 *
 * Distinguishes an actual HTTP route handler (has PATH_METADATA — set by
 * @Get/@Post/etc.) from an ordinary prototype method (a controller's
 * private helper) by checking for that metadata, not just "any method on
 * a controller class" — MetadataScanner.getAllMethodNames returns both.
 */
@Injectable()
export class PolicyCoverageService implements OnApplicationBootstrap {
  private readonly logger = new Logger('PolicyCoverage');

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onApplicationBootstrap(): void {
    this.assertFullCoverage();
  }

  assertFullCoverage(): void {
    const violations: string[] = [];
    let routeCount = 0;

    for (const wrapper of this.discovery.getControllers()) {
      const instance: unknown = wrapper.instance;
      const metatype: unknown = wrapper.metatype;
      if (!instance || typeof metatype !== 'function') continue;
      const prototype = Object.getPrototypeOf(instance) as object;

      for (const methodName of this.scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, unknown>)[methodName];
        if (typeof handler !== 'function') continue;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue; // not an HTTP route

        routeCount += 1;
        const hasPermission = Boolean(this.reflector.get(REQUIRE_PERMISSION_KEY, handler));
        const hasPublicRoute = Boolean(this.reflector.get(PUBLIC_ROUTE_KEY, handler));

        if (!hasPermission && !hasPublicRoute) {
          violations.push(`${metatype.name}.${methodName}`);
        }
      }
    }

    if (violations.length > 0) {
      const message =
        `Authorization policy coverage failed: ${violations.length} route handler(s) declare neither ` +
        `@RequirePermission(...)/@Authorized(...) nor @PublicRoute(...):\n` +
        violations.map((v) => `  - ${v}`).join('\n') +
        '\nEvery route must declare an explicit policy (B2 default-deny requirement, backend-roadmap.md).';
      this.logger.error(message);
      throw new Error(message);
    }

    this.logger.log(`Authorization policy coverage OK — ${routeCount} route(s) checked.`);
  }
}
