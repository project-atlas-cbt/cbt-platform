import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import { TenancyContextService } from '../../common/tenancy-context.service.js';
import { SessionService } from './session.service.js';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from './decorators.js';

export interface AuthenticatedUser {
  userId: string;
  schoolId: string;
  membershipId: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by AuthGuard once a session resolves to a live, ACTIVE user + membership. */
    user?: AuthenticatedUser;
  }
}

/**
 * Resolves the session cookie into `request.user`, live against the
 * database on every call — roles and status are never trusted from the
 * session row itself (09 §25; ADR-0022's own requirement). A single generic
 * UNAUTHENTICATED failure covers every rejection reason (no session,
 * unknown user, inactive membership, suspended account) — the caller
 * outside this guard cannot distinguish them, matching IdentityService's
 * login-side enumeration-resistance approach (see evaluateLogin's comment)
 * with the same rationale: a guarded route is exactly where account-state
 * probing would otherwise leak through a session that used to be valid.
 *
 * Also enforces B1 DoD item 8 (forced first-login password change): a
 * MUST_CHANGE_PASSWORD/MUST_SET_PASSWORD user is rejected with
 * PASSWORD_CHANGE_REQUIRED on every guarded route except the one carrying
 * @AllowPendingPasswordChange() — centrally, so no controller can forget it.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly tenancy: TenancyContextService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const schoolId = this.tenancy.schoolId;
    const unauthenticated = () =>
      new AppHttpException({ code: 'UNAUTHENTICATED', message: 'Authentication required.' });

    if (!schoolId) throw unauthenticated();

    const session = await this.sessions.resolve(req, schoolId);
    if (!session) throw unauthenticated();

    const [user, membership] = await Promise.all([
      prisma.user.findUnique({ where: { id: session.userId } }),
      withTenant(prisma, schoolId, (tx) =>
        tx.schoolMembership.findFirst({
          where: { userId: session.userId, schoolId, status: 'ACTIVE' },
        }),
      ),
    ]);

    if (!user || user.status !== 'ACTIVE' || !membership) throw unauthenticated();

    const allowPending = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PENDING_PASSWORD_CHANGE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (user.credentialState !== 'OK' && !allowPending) {
      throw new AppHttpException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'A password change is required before continuing.',
      });
    }

    req.user = {
      userId: user.id,
      schoolId,
      membershipId: membership.id,
      sessionId: session.sessionId,
    };
    return true;
  }
}
