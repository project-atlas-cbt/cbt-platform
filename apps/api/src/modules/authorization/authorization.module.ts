import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { IdentityModule } from '../identity/identity.module.js';
import { OperationsModule } from '../operations/operations.module.js';
import { AuthorizationController } from './authorization.controller.js';
import { AuthorizationService } from './authorization.service.js';
import { BreakGlassService } from './break-glass.service.js';
import { PermissionGuard } from './permission.guard.js';
import { PolicyCoverageService } from './policy-coverage.service.js';
import { ScopeResolverRegistry } from './scope-resolvers.js';

/**
 * B2 — Authorization & Tenancy Engine. "Domains / modules affected:
 * AuthorizationModule, cross-cutting into every other module. Owns no
 * business data" (backend-roadmap.md). @Global() so PermissionGuard and
 * AuthorizationService are reachable from any module's `@Authorized()`
 * decorator without each one importing this module explicitly — same
 * pattern as TenancyModule/SecurityModule.
 *
 * Imports IdentityModule for AuthGuard: `@Authorized()` bundles
 * `@UseGuards(AuthGuard, PermissionGuard)`, and AuthorizationController's
 * own `me/permissions` route uses it — a guard class passed to
 * `@UseGuards` is resolved from the *providing* module's DI graph, so
 * AuthGuard must be reachable here, not just importable as a TS type.
 * Not circular: IdentityModule only imports this module's *decorators* as
 * plain TypeScript, never AuthorizationModule itself as a Nest module.
 */
@Global()
@Module({
  imports: [DiscoveryModule, OperationsModule, IdentityModule],
  controllers: [AuthorizationController],
  providers: [
    ScopeResolverRegistry,
    AuthorizationService,
    PermissionGuard,
    PolicyCoverageService,
    BreakGlassService,
  ],
  exports: [ScopeResolverRegistry, AuthorizationService, PermissionGuard, BreakGlassService],
})
export class AuthorizationModule {}
