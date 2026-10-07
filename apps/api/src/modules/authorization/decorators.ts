import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity/auth.guard.js';
import { ActiveSubscriptionGuard } from '../platform/active-subscription.guard.js';
import { PlatformAuthGuard } from '../platform/platform-auth.guard.js';
import { PermissionGuard } from './permission.guard.js';

export const REQUIRE_PERMISSION_KEY = 'atlas:requirePermission';
export const PUBLIC_ROUTE_KEY = 'atlas:publicRoute';

/**
 * Declares which PERMISSION_TABLE row (@atlas/domain) this route enforces.
 * PolicyCoverageService's startup assertion fails app boot if any route
 * declares neither this nor `@PublicRoute()` (B2 DoD item 2, "default
 * deny... enforced by a startup assertion that every route declares one").
 */
export const RequirePermission = (permissionId: string) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permissionId);

/**
 * Marks a route as intentionally outside the permission table — pre-
 * authentication endpoints (login, tenant/resolve, password-reset
 * request/confirm) and liveness/readiness probes. Requires a reason so a
 * future reviewer can tell "deliberately public" from "forgotten".
 */
export const PublicRoute = (reason: string) => SetMetadata(PUBLIC_ROUTE_KEY, reason);

/**
 * Convenience combinator for the common case: authenticate (AuthGuard),
 * then authorize against one PERMISSION_TABLE row (PermissionGuard), in
 * that order — Nest runs @UseGuards' array left to right, and
 * PermissionGuard reads `req.user` (roles included), which only AuthGuard
 * populates.
 */
export function Authorized(permissionId: string) {
  return applyDecorators(RequirePermission(permissionId), UseGuards(AuthGuard, PermissionGuard));
}

/**
 * `@Authorized`, plus ADR-0015's subscription gate (P1-3): for a write the
 * `EXPIRED` profile blocks once the grace period has ended — creating or
 * changing exams and questions, imports, and opening sittings. Runs after
 * authentication and permission, so neither is bypassed or leaked.
 */
export function AuthorizedWrite(permissionId: string) {
  return applyDecorators(
    RequirePermission(permissionId),
    UseGuards(AuthGuard, PermissionGuard, ActiveSubscriptionGuard),
  );
}

/**
 * B3: the platform-scoped equivalent of `@Authorized` — authenticate via
 * PlatformAuthGuard (Software Admin's session, not a school one) before
 * PermissionGuard. Mutually exclusive with `@Authorized` by construction:
 * AuthGuard requires a resolved tenant (TenancyContextService.schoolId) to
 * even attempt session resolution, PlatformAuthGuard needs no tenant at
 * all — a route only ever declares one or the other, never both.
 */
export function AuthorizedPlatform(permissionId: string) {
  return applyDecorators(
    RequirePermission(permissionId),
    UseGuards(PlatformAuthGuard, PermissionGuard),
  );
}
