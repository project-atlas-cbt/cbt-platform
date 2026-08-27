import { Injectable, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { PasswordService } from '../identity/password.service.js';
import { AuthLockoutService } from '../identity/auth-lockout.service.js';
import {
  PlatformSessionService,
  type AuthenticatedPlatformSession,
} from './platform-session.service.js';

// AuthLockoutService's key is an arbitrary namespaced string, not literally
// a school id (see identity.module.ts's export comment) — this is that
// namespace for Software Admin login, kept distinct from any real
// School.id so a platform lockout counter can never collide with a
// school's own.
const LOCKOUT_NAMESPACE = 'platform';

export type PlatformLoginOutcome =
  | { kind: 'LOCKED_OUT' }
  | { kind: 'UNKNOWN_IDENTIFIER' }
  | { kind: 'USER_NOT_ACTIVE' }
  | { kind: 'CREDENTIAL_NOT_SET' }
  | { kind: 'WRONG_PASSWORD' }
  | { kind: 'SUCCESS'; userId: string };

const GENERIC_LOGIN_FAILURE = () =>
  new AppHttpException({ code: 'UNAUTHENTICATED', message: 'Invalid credentials.' });

/**
 * Software Admin's equivalent of identity/identity.service.ts's
 * IdentityService login/logout/me trio — same enumeration-resistance shape
 * (one generic wire response regardless of which internal branch fired),
 * same lockout mechanism (reused, not reimplemented). Looked up by
 * `User.email` (there is no SchoolMembership.loginIdentifier equivalent for
 * a platform account) plus an active PlatformRoleAssignment — a User row
 * with an email but no such assignment is treated identically to "no such
 * user" (UNKNOWN_IDENTIFIER), never a distinct outcome.
 */
@Injectable()
export class PlatformAuthService {
  private readonly logger = new Logger('PlatformAuthService');

  constructor(
    private readonly passwords: PasswordService,
    private readonly sessions: PlatformSessionService,
    private readonly lockout: AuthLockoutService,
  ) {}

  async evaluateLogin(email: string, password: string): Promise<PlatformLoginOutcome> {
    if (await this.lockout.isLocked(LOCKOUT_NAMESPACE, email)) {
      await this.passwords.verifyDummy();
      return { kind: 'LOCKED_OUT' };
    }

    const user = await prisma.user.findFirst({
      where: { email, platformRoleAssignments: { some: { status: 'ACTIVE' } } },
    });

    if (!user) {
      await this.passwords.verifyDummy();
      await this.lockout.recordFailure(LOCKOUT_NAMESPACE, email);
      return { kind: 'UNKNOWN_IDENTIFIER' };
    }
    if (user.status !== 'ACTIVE') {
      await this.passwords.verifyDummy();
      await this.lockout.recordFailure(LOCKOUT_NAMESPACE, email);
      this.logger.warn(`Platform login rejected: user ${user.id} is ${user.status}.`);
      return { kind: 'USER_NOT_ACTIVE' };
    }
    if (!user.passwordHash) {
      await this.passwords.verifyDummy();
      await this.lockout.recordFailure(LOCKOUT_NAMESPACE, email);
      return { kind: 'CREDENTIAL_NOT_SET' };
    }

    const valid = await this.passwords.verify(user.passwordHash, password);
    if (!valid) {
      await this.lockout.recordFailure(LOCKOUT_NAMESPACE, email);
      return { kind: 'WRONG_PASSWORD' };
    }

    await this.lockout.recordSuccess(LOCKOUT_NAMESPACE, email);
    return { kind: 'SUCCESS', userId: user.id };
  }

  async login(
    email: string,
    password: string,
    res: FastifyReply,
    req: FastifyRequest,
  ): Promise<AuthenticatedPlatformSession> {
    const outcome = await this.evaluateLogin(email, password);
    if (outcome.kind !== 'SUCCESS') throw GENERIC_LOGIN_FAILURE();

    await prisma.user.update({ where: { id: outcome.userId }, data: { lastLoginAt: new Date() } });
    return this.sessions.issue(res, { userId: outcome.userId, req });
  }

  async logout(sessionId: string, res: FastifyReply): Promise<void> {
    await this.sessions.revoke(sessionId);
    this.sessions.clearCookie(res);
  }

  async me(userId: string): Promise<{
    user: { id: string; firstName: string; lastName: string; displayName: string; status: string };
    roles: Role[];
  }> {
    const [user, roleAssignments] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      prisma.platformRoleAssignment.findMany({ where: { userId, status: 'ACTIVE' } }),
    ]);

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        status: user.status,
      },
      roles: roleAssignments.map((r) => r.role),
    };
  }
}
