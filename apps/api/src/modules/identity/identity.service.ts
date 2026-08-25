import { randomBytes, createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma, withTenant } from '@atlas/db';
import type { Env } from '@atlas/config';
import type { NotificationChannel } from '@atlas/notifications';
import { AppHttpException } from '../../common/app-http-exception.js';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { PasswordService } from './password.service.js';
import { SessionService, type AuthenticatedSession } from './session.service.js';
import { AuthLockoutService } from './auth-lockout.service.js';
import { PASSWORD_RESET_TEMPLATE_NAME } from './templates.js';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Every branch login can fail for, kept distinct so tests can assert the
 * server-side reasoning is correct — but IdentityService.login collapses
 * all non-SUCCESS outcomes to one generic AppHttpException. See this
 * class's login() doc comment for why the HTTP response never varies.
 */
export type LoginOutcome =
  | { kind: 'LOCKED_OUT' }
  | { kind: 'UNKNOWN_IDENTIFIER' }
  | { kind: 'MEMBERSHIP_INACTIVE' }
  | { kind: 'USER_NOT_ACTIVE' }
  | { kind: 'CREDENTIAL_NOT_SET' }
  | { kind: 'WRONG_PASSWORD' }
  | { kind: 'SUCCESS'; userId: string; membershipId: string; schoolId: string };

const GENERIC_LOGIN_FAILURE = () =>
  new AppHttpException({ code: 'UNAUTHENTICATED', message: 'Invalid credentials.' });

@Injectable()
export class IdentityService {
  private readonly logger = new Logger('IdentityService');

  constructor(
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly lockout: AuthLockoutService,
    private readonly config: ConfigService<Env, true>,
    @Inject(NOTIFICATION_CHANNEL) private readonly notifications: NotificationChannel,
  ) {}

  /**
   * Walks every branch a login attempt can take, but the DoD's enumeration-
   * resistance requirement (item 2) and account-state-leak requirement
   * (item 3: "without leaking account state to an unauthenticated caller")
   * both mean the wire response must be identical regardless of which
   * branch fired — only the internal `LoginOutcome` (asserted by tests) and
   * a server-side log line (a real persisted audit trail is B10's job — see
   * IdentityService's module comment) distinguish them. A caller can never
   * learn, from the response alone, whether an identifier exists, whether
   * an account is suspended, or how many attempts remain.
   */
  async evaluateLogin(
    schoolId: string,
    identifier: string,
    password: string,
  ): Promise<LoginOutcome> {
    if (await this.lockout.isLocked(schoolId, identifier)) {
      await this.passwords.verifyDummy();
      return { kind: 'LOCKED_OUT' };
    }

    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findUnique({
        where: { schoolId_loginIdentifier: { schoolId, loginIdentifier: identifier } },
      }),
    );

    if (!membership) {
      await this.passwords.verifyDummy();
      await this.lockout.recordFailure(schoolId, identifier);
      return { kind: 'UNKNOWN_IDENTIFIER' };
    }
    if (membership.status !== 'ACTIVE') {
      await this.passwords.verifyDummy();
      await this.lockout.recordFailure(schoolId, identifier);
      this.logger.warn(`Login rejected: membership ${membership.id} is ${membership.status}.`);
      return { kind: 'MEMBERSHIP_INACTIVE' };
    }

    const user = await prisma.user.findUnique({ where: { id: membership.userId } });
    if (!user || user.status !== 'ACTIVE') {
      await this.passwords.verifyDummy();
      await this.lockout.recordFailure(schoolId, identifier);
      this.logger.warn(
        `Login rejected: user ${membership.userId} is ${user?.status ?? 'missing'}.`,
      );
      return { kind: 'USER_NOT_ACTIVE' };
    }
    if (!user.passwordHash) {
      await this.passwords.verifyDummy();
      await this.lockout.recordFailure(schoolId, identifier);
      return { kind: 'CREDENTIAL_NOT_SET' };
    }

    const valid = await this.passwords.verify(user.passwordHash, password);
    if (!valid) {
      await this.lockout.recordFailure(schoolId, identifier);
      return { kind: 'WRONG_PASSWORD' };
    }

    await this.lockout.recordSuccess(schoolId, identifier);
    return { kind: 'SUCCESS', userId: user.id, membershipId: membership.id, schoolId };
  }

  async login(
    schoolId: string,
    identifier: string,
    password: string,
    res: FastifyReply,
    req: FastifyRequest,
  ): Promise<AuthenticatedSession> {
    const outcome = await this.evaluateLogin(schoolId, identifier, password);
    if (outcome.kind !== 'SUCCESS') throw GENERIC_LOGIN_FAILURE();

    await prisma.user.update({
      where: { id: outcome.userId },
      data: { lastLoginAt: new Date() },
    });

    return this.sessions.issue(res, { userId: outcome.userId, schoolId, req });
  }

  async logout(schoolId: string, sessionId: string, res: FastifyReply): Promise<void> {
    await this.sessions.revoke(schoolId, sessionId);
    this.sessions.clearCookie(res);
  }

  async refresh(
    req: FastifyRequest,
    res: FastifyReply,
    schoolId: string,
  ): Promise<AuthenticatedSession> {
    const current = await this.sessions.resolve(req, schoolId);
    if (!current) throw GENERIC_LOGIN_FAILURE();

    await this.sessions.revoke(schoolId, current.sessionId);
    return this.sessions.issue(res, {
      userId: current.userId,
      schoolId,
      rotatedFromId: current.sessionId,
      req,
    });
  }

  async me(schoolId: string, userId: string, membershipId: string) {
    const [user, membership, roleAssignments] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId } }),
      withTenant(prisma, schoolId, (tx) =>
        tx.schoolMembership.findUniqueOrThrow({ where: { id: membershipId } }),
      ),
      withTenant(prisma, schoolId, (tx) =>
        tx.roleAssignment.findMany({ where: { membershipId, status: 'ACTIVE' } }),
      ),
    ]);

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        displayName: user.displayName,
        status: user.status,
      },
      membership: {
        id: membership.id,
        loginIdentifier: membership.loginIdentifier,
        status: membership.status,
      },
      roles: roleAssignments.map((r) => r.role),
      effectiveSchoolId: schoolId,
    };
  }

  async changePassword(
    schoolId: string,
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    // A user changing a password they themselves already chose
    // (credentialState OK) must prove they know it. A user still on a
    // MUST_SET_PASSWORD/MUST_CHANGE_PASSWORD credential doesn't — the
    // resolved session from AuthGuard is the authorization in that case
    // (matches PasswordChangeDto's own doc comment).
    if (user.credentialState === 'OK') {
      if (
        !currentPassword ||
        !user.passwordHash ||
        !(await this.passwords.verify(user.passwordHash, currentPassword))
      ) {
        throw new AppHttpException({
          code: 'UNAUTHENTICATED',
          message: 'Current password is incorrect.',
        });
      }
    }

    const passwordHash = await this.passwords.hash(newPassword);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, credentialState: 'OK' },
    });
    void schoolId; // reserved for an audit event once B10 exists
  }

  /**
   * Staff-only (ADR-0019 — students have no email). Always resolves
   * successfully regardless of whether `identifier` exists, matching the
   * same enumeration-resistance rule as login: the response can never
   * confirm or deny an account's existence.
   */
  async requestPasswordReset(schoolId: string, identifier: string): Promise<void> {
    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findUnique({
        where: { schoolId_loginIdentifier: { schoolId, loginIdentifier: identifier } },
      }),
    );
    if (!membership || membership.status !== 'ACTIVE') return;

    const user = await prisma.user.findUnique({ where: { id: membership.userId } });
    // No email on file (ADR-0019: students never have one) — silently
    // skipped rather than erroring, for the same enumeration-resistance
    // reason as every other branch here.
    if (!user || user.status !== 'ACTIVE' || !user.email) return;

    const rawToken = randomBytes(32).toString('base64url');
    const ttlSeconds = this.config.get('PASSWORD_RESET_TOKEN_TTL_SECONDS', { infer: true });
    await withTenant(prisma, schoolId, (tx) =>
      tx.passwordResetToken.create({
        data: {
          schoolId,
          userId: user.id,
          tokenHash: hashToken(rawToken),
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        },
      }),
    );

    const webOrigin = this.config.get('WEB_ORIGIN', { infer: true });
    // Placeholder route — F1 owns the actual reset-password screen this
    // points at; only the query contract (a `token` param) is fixed here.
    const resetUrl = `${webOrigin}/reset-password?token=${rawToken}`;
    await this.notifications.send({
      to: user.email,
      template: PASSWORD_RESET_TEMPLATE_NAME,
      variables: { displayName: user.displayName, resetUrl },
    });
  }

  async confirmPasswordReset(
    schoolId: string,
    rawToken: string,
    newPassword: string,
  ): Promise<void> {
    const tokenHash = hashToken(rawToken);
    const token = await withTenant(prisma, schoolId, (tx) =>
      tx.passwordResetToken.findUnique({ where: { tokenHash } }),
    );

    const invalid = () =>
      new AppHttpException({
        code: 'VALIDATION_ERROR',
        httpStatus: 400,
        message: 'Invalid or expired reset token.',
      });

    if (!token || token.usedAt || token.expiresAt < new Date()) throw invalid();

    const passwordHash = await this.passwords.hash(newPassword);
    await withTenant(prisma, schoolId, async (tx) => {
      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash, credentialState: 'OK' },
      });
      await tx.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
    });
  }
}
