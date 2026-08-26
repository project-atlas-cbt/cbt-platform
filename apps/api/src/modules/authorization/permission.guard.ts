import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { AuthorizationService } from './authorization.service.js';
import { REQUIRE_PERMISSION_KEY } from './decorators.js';
import type { AuthorizedActor } from './authorization.types.js';

export function actorFromAuthenticatedUser(user: AuthenticatedUser): AuthorizedActor {
  // AuthGuard only ever produces a school-scoped actor today — there is no
  // Software Admin login endpoint anywhere until at least B3 (2026-08-26
  // decision). This is the one place that changes when B3 adds one.
  return {
    kind: 'SCHOOL',
    userId: user.userId,
    schoolId: user.schoolId,
    membershipId: user.membershipId,
    roles: user.roles,
  };
}

/**
 * Runs after AuthGuard (see the `@Authorized()` decorator, which orders
 * them) and evaluates the route's declared `@RequirePermission(...)`
 * against AuthorizationService. Never runs standalone against an
 * unauthenticated request — `req.user` must already be set.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly authz: AuthorizationService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionId = this.reflector.getAllAndOverride<string>(REQUIRE_PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!permissionId) {
      // Unreachable once every route is annotated (PolicyCoverageService's
      // startup assertion enforces that at boot) — fails closed regardless,
      // per B2's own default-deny requirement, rather than trusting the
      // assertion alone.
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'This route declares no authorization policy.',
      });
    }

    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (!req.user) {
      throw new AppHttpException({ code: 'UNAUTHENTICATED', message: 'Authentication required.' });
    }

    const decision = await this.authz.evaluate(actorFromAuthenticatedUser(req.user), permissionId);
    if (decision.allowed) return true;

    if (decision.outcome === 'NOT_FOUND') {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Resource not found.' });
    }
    throw new AppHttpException({
      code: 'FORBIDDEN',
      message: 'You do not have permission to perform this action.',
    });
  }
}
