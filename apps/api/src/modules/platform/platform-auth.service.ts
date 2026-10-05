import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '@atlas/config';
import { prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import type { NotificationChannel } from '@atlas/notifications';
import { formatInTimeZone } from '@atlas/validation';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { AppHttpException } from '../../common/app-http-exception.js';
import { PasswordService } from '../identity/password.service.js';
import { AuthLockoutService } from '../identity/auth-lockout.service.js';
import { PlatformSessionService } from './platform-session.service.js';
import { PlatformMfaService, PLATFORM_MFA_AUDIT_ACTIONS } from './mfa/platform-mfa.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import { PLATFORM_PASSWORD_CHANGED_TEMPLATE_NAME } from './templates.js';

export const PLATFORM_PASSWORD_CHANGED_AUDIT_ACTION = 'PLATFORM_PASSWORD_CHANGED';

/** B20: what `POST /platform/auth/login` tells the caller. */
export type PlatformLoginResult =
  { status: 'ok' } | { status: 'mfa_required'; challengeToken: string };

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
    private readonly mfa: PlatformMfaService,
    private readonly audit: AuditService,
    @Inject(NOTIFICATION_CHANNEL) private readonly notifications: NotificationChannel,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async evaluateLogin(email: string, password: string): Promise<PlatformLoginOutcome> {
    if (await this.lockout.isLocked(LOCKOUT_NAMESPACE, email)) {
      await this.passwords.verifyDummy();
      return { kind: 'LOCKED_OUT' };
    }

    // Case-insensitive, matching evaluateLogin's own reasoning
    // (apps/api/src/modules/identity/identity.service.ts) — email local
    // parts are conventionally treated case-insensitively by virtually
    // every real mail system, and there's no reason a Software Admin's
    // login should be stricter about it than a school-scoped one is about
    // its own identifier.
    const user = await prisma.user.findFirst({
      where: {
        email: { equals: email, mode: 'insensitive' },
        platformRoleAssignments: { some: { status: 'ACTIVE' } },
      },
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

  /**
   * B20: an admin with an enrolled second factor gets a challenge token and
   * NO session — the session is only issued by `completeMfa`. Without a
   * factor, the session is issued here (and, if PLATFORM_MFA_REQUIRED is
   * on, PlatformAuthGuard confines it to the enrolment routes).
   */
  async login(
    email: string,
    password: string,
    res: FastifyReply,
    req: FastifyRequest,
  ): Promise<PlatformLoginResult> {
    const outcome = await this.evaluateLogin(email, password);
    if (outcome.kind !== 'SUCCESS') throw GENERIC_LOGIN_FAILURE();

    if (await this.mfa.isEnrolled(outcome.userId)) {
      return {
        status: 'mfa_required',
        challengeToken: await this.mfa.createChallenge(outcome.userId),
      };
    }
    await this.startSession(outcome.userId, res, req, { mfa: false });
    return { status: 'ok' };
  }

  async completeMfa(
    challengeToken: string,
    proof: { otp: string } | { recoveryCode: string },
    res: FastifyReply,
    req: FastifyRequest,
  ): Promise<void> {
    const userId = await this.mfa.completeChallenge(challengeToken, proof);
    // Re-checked: the account could have been suspended or demoted in the
    // minutes between the password step and this one.
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        status: 'ACTIVE',
        platformRoleAssignments: { some: { status: 'ACTIVE' } },
      },
      select: { id: true },
    });
    if (!user) throw GENERIC_LOGIN_FAILURE();
    await this.startSession(userId, res, req, {
      mfa: true,
      method: 'otp' in proof ? 'totp' : 'recovery_code',
    });
  }

  private async startSession(
    userId: string,
    res: FastifyReply,
    req: FastifyRequest,
    metadata: { mfa: boolean; method?: string },
  ): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    const session = await this.sessions.issue(res, { userId, req });
    await this.audit
      .recordPlatform({
        actorUserId: userId,
        actorRole: 'SOFTWARE_ADMIN',
        action: PLATFORM_MFA_AUDIT_ACTIONS.signedIn,
        entityType: 'PlatformSession',
        entityId: session.sessionId,
        metadata,
      })
      .catch((err: unknown) =>
        this.logger.error({ msg: 'Platform sign-in audit write failed', err }),
      );
  }

  async logout(sessionId: string, res: FastifyReply): Promise<void> {
    await this.sessions.revoke(sessionId);
    this.sessions.clearCookie(res);
  }

  /**
   * A Software Admin replaces their own password. The current password is
   * always required, the temporary one included: this is a platform
   * account, and a session cookie alone must never be enough to take it
   * over. Other sessions end, the change is audited at platform level, and
   * a notice goes to the account's address so a change the owner did not
   * make is noticed.
   */
  async changePassword(
    userId: string,
    sessionId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new AppHttpException({
        code: 'UNAUTHENTICATED',
        message: 'Current password is incorrect.',
      });
    }
    if (newPassword === currentPassword) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Choose a new password that is different from your current one.',
      });
    }

    const wasTemporary = user.credentialState !== 'OK';
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(newPassword), credentialState: 'OK' },
    });
    const revoked = await this.sessions.revokeAllForUser(userId, sessionId);
    await this.audit.recordPlatform({
      actorUserId: userId,
      actorRole: 'SOFTWARE_ADMIN',
      action: PLATFORM_PASSWORD_CHANGED_AUDIT_ACTION,
      entityType: 'User',
      entityId: userId,
      metadata: { otherSessionsRevoked: revoked, wasTemporary },
    });

    // The change has happened; a mail outage must not turn it into an
    // error the admin retries with a password that no longer works.
    if (user.email) {
      const changedAt = formatInTimeZone(new Date(), {
        timeZone: this.config.get('DEFAULT_SCHOOL_TIMEZONE', { infer: true }),
        locale: 'en-NG',
        dateStyle: 'long',
        timeStyle: 'short',
      });
      await this.notifications
        .send({
          to: user.email,
          template: PLATFORM_PASSWORD_CHANGED_TEMPLATE_NAME,
          variables: { displayName: user.displayName, changedAt },
        })
        .catch((err: unknown) =>
          this.logger.error({ msg: 'Platform password-changed notice failed to send', err }),
        );
    }
  }

  async me(userId: string): Promise<{
    user: { id: string; firstName: string; lastName: string; displayName: string; status: string };
    roles: Role[];
    mustChangePassword: boolean;
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
      mustChangePassword: user.credentialState !== 'OK',
    };
  }
}
