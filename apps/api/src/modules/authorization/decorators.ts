import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity/auth.guard.js';
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
