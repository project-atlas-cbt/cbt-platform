import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { enrichLogContext } from '@atlas/observability';
import { AppHttpException } from '../../common/app-http-exception.js';
import { TenancyContextService } from '../../common/tenancy-context.service.js';
import { AccessGateService } from '../platform/access-gate.service.js';
import { SessionService, isLiveSession } from './session.service.js';
import { ALLOW_PENDING_PASSWORD_CHANGE_KEY } from './decorators.js';

export interface AuthenticatedUser {
  kind: 'SCHOOL';
  userId: string;
  schoolId: string;
  membershipId: string;
  sessionId: string;
  /** Active RoleAssignment.role values for this membership, read live in
   * the same request (B2's AuthorizationService reads this, never a
   * decoded token — 09 §25). */
  roles: Role[];
}

/** B3: Software Admin's authenticated identity — no schoolId/membershipId,
 * mirroring PlatformRoleAssignment's own tenant-independence. Set by
 * PlatformAuthGuard (apps/api/src/modules/platform/platform-auth.guard.ts),
 * never by this file's AuthGuard. */
export interface AuthenticatedPlatformUser {
  kind: 'PLATFORM';
  userId: string;
  sessionId: string;
  roles: Role[];
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by AuthGuard (school-scoped) or PlatformAuthGuard (Software
     * Admin) once a session resolves to a live, ACTIVE identity. The two
     * guards are mutually exclusive by construction — AuthGuard only ever
     * succeeds when a tenant is resolved, PlatformAuthGuard only when one
     * isn't — so a route is never guarded by both. */
    user?: AuthenticatedUser | AuthenticatedPlatformUser;
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
    private readonly accessGate: AccessGateService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const schoolId = this.tenancy.schoolId;
    const unauthenticated = () =>
      new AppHttpException({ code: 'UNAUTHENTICATED', message: 'Authentication required.' });

    if (!schoolId) throw unauthenticated();

    // ADR-0016/roadmap DoD item 4: a platform-level suspend/deactivate
    // blocks *all* school access immediately, on every request — not just
    // new logins — so an already-open session stops working the instant
    // Software Admin acts. Checked before session resolution: a school-
    // level block takes precedence over individual session validity, and
    // this is a cheap read-only check (AccessGateService.getPlatformOverride),
    // not the full recompute-and-persist path. Deliberately NOT checked for
    // EXPIRED-alone (no override) — ADR-0015 keeps login/reads working
    // through an expired subscription.
    // B21: TenancyMiddleware already read the override in the same lookup
    // that resolved the school, this request — reuse it rather than read
    // the `schools` row a second time.
    const preloaded = this.tenancy.platformOverride;
    const override =
      preloaded !== undefined ? preloaded : await this.accessGate.getPlatformOverride(schoolId);
    if (override === 'SUSPENDED') {
      throw new AppHttpException({
        code: 'SCHOOL_ACCESS_SUSPENDED',
        message: 'This school has been suspended.',
      });
    }
    if (override === 'DEACTIVATED') {
      throw new AppHttpException({
        code: 'SCHOOL_ACCESS_DEACTIVATED',
        message: 'This school has been deactivated.',
      });
    }

    const tokenHash = this.sessions.tokenHashFromRequest(req);
    if (!tokenHash) throw unauthenticated();

    // B21: session, membership (with its active roles) and user in ONE
    // tenant transaction — this guard runs on every authenticated request,
    // and four separate transactions (each BEGIN + set_config + query +
    // COMMIT) were the largest fixed cost of an answer save. Same checks,
    // same current-state evaluation (AGENTS.md §6), one round of locking.
    const resolved = await withTenant(prisma, schoolId, async (tx) => {
      const session = await tx.session.findUnique({ where: { tokenHash } });
      if (!isLiveSession(session)) return null;
      const membership = await tx.schoolMembership.findFirst({
        where: { userId: session.userId, schoolId, status: 'ACTIVE' },
        include: { roleAssignments: { where: { schoolId, status: 'ACTIVE' } } },
      });
      const user = await tx.user.findUnique({ where: { id: session.userId } });
      return { session, membership, user };
    });
    if (!resolved) throw unauthenticated();
    const { session, membership, user } = resolved;

    if (!user || user.status !== 'ACTIVE' || !membership) throw unauthenticated();
    const roleAssignments = membership.roleAssignments;

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
      kind: 'SCHOOL',
      userId: user.id,
      schoolId,
      membershipId: membership.id,
      sessionId: session.id,
      roles: roleAssignments.map((r) => r.role),
    };
    enrichLogContext({ userId: user.id });
    return true;
  }
}
