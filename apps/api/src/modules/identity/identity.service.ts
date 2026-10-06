import { randomBytes, createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma, withTenant } from '@atlas/db';
import type { Env } from '@atlas/config';
import type { NotificationChannel } from '@atlas/notifications';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { buildSchoolUrl } from '../../common/school-url.js';
import { NOTIFICATION_CHANNEL } from '../../notifications/notifications.module.js';
import { AccessGateService } from '../platform/access-gate.service.js';
import { PasswordService } from './password.service.js';
import { SessionService, type AuthenticatedSession } from './session.service.js';
import { AuthLockoutService } from './auth-lockout.service.js';
import { PASSWORD_RESET_TEMPLATE_NAME } from './templates.js';
import { AuditService } from '../operations/audit-event.service.js';
import { PlatformSettingsService } from '../../platform-settings/platform-settings.service.js';

/** B20: identity audit actions (registered by
 * IdentityAuditActionRegistrationProvider). Ids and outcomes only — the
 * identifier typed at a failed sign-in is never recorded. */
export const IDENTITY_AUDIT_ACTIONS = {
  signedIn: 'USER_SIGNED_IN',
  accountLocked: 'USER_ACCOUNT_LOCKED',
  passwordChanged: 'USER_PASSWORD_CHANGED',
  passwordResetCompleted: 'USER_PASSWORD_RESET_COMPLETED',
} as const;

/** Most-privileged role first — the role an identity event is attributed
 * to when a membership holds several (Teacher + HOD, say). */
const ROLE_PRECEDENCE: Role[] = ['SCHOOL_ADMIN', 'MODERATOR', 'HOD', 'TEACHER', 'STUDENT'];

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
    private readonly accessGate: AccessGateService,
    private readonly audit: AuditService,
    private readonly settings: PlatformSettingsService,
  ) {}

  /** The role an identity audit event is attributed to (see ROLE_PRECEDENCE). */
  private async actorRoleFor(schoolId: string, membershipId: string): Promise<Role> {
    const roles = await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.findMany({
        where: { schoolId, membershipId, status: 'ACTIVE' },
        select: { role: true },
      }),
    );
    const held = new Set(roles.map((r) => r.role));
    return ROLE_PRECEDENCE.find((r) => held.has(r)) ?? 'STUDENT';
  }

  /** Sign-in/lockout auditing never blocks or fails the sign-in itself —
   * an audit-store hiccup must not lock a lab of students out of an exam.
   * Credential *changes* are audited in-band instead (see changePassword). */
  private async auditBestEffort(
    schoolId: string,
    userId: string,
    membershipId: string,
    action: string,
  ): Promise<void> {
    try {
      await this.audit.record({
        schoolId,
        actorUserId: userId,
        actorRole: await this.actorRoleFor(schoolId, membershipId),
        action,
        entityType: 'SchoolMembership',
        entityId: membershipId,
      });
    } catch (err) {
      this.logger.error({ msg: 'Identity audit write failed', err, action });
    }
  }

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

    // Case-insensitive by design: the `@@unique([schoolId, loginIdentifier])`
    // constraint itself stays case-sensitive at the DB level (unchanged —
    // that's a storage/uniqueness concern, not a login one), but the login
    // comparison shouldn't force a caller to reproduce the exact case an
    // identifier happened to be created with. findFirst (not findUnique):
    // a composite-unique lookup can't carry a `mode: 'insensitive'` filter,
    // and existing data could in principle hold two differently-cased rows
    // for the "same" identifier at one school — an edge case this resolves
    // in an unspecified but deterministic-enough direction rather than
    // rejecting outright, since case sensitivity was never an intentional
    // uniqueness dimension in the first place.
    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findFirst({
        where: { schoolId, loginIdentifier: { equals: identifier, mode: 'insensitive' } },
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
      const { lockedNow } = await this.lockout.recordFailure(schoolId, identifier);
      if (lockedNow) {
        await this.auditBestEffort(
          schoolId,
          user.id,
          membership.id,
          IDENTITY_AUDIT_ACTIONS.accountLocked,
        );
      }
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
    // Roadmap DoD item 4 / ADR-0016: a suspended or deactivated school
    // blocks login itself, not just subsequent requests (AuthGuard enforces
    // the latter for an already-open session) — checked before credential
    // evaluation so a suspended school's login attempt never even reaches
    // password verification. Distinct, specific codes: see error-codes.ts's
    // own comment on why this isn't enumeration-sensitive the way account
    // existence is.
    const override = await this.accessGate.getPlatformOverride(schoolId);
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

    const outcome = await this.evaluateLogin(schoolId, identifier, password);
    if (outcome.kind !== 'SUCCESS') throw GENERIC_LOGIN_FAILURE();

    await prisma.user.update({
      where: { id: outcome.userId },
      data: { lastLoginAt: new Date() },
    });

    // Session fixation: always a fresh server-generated token (issue()),
    // never anything the client presented.
    const session = await this.sessions.issue(res, { userId: outcome.userId, schoolId, req });
    await this.auditBestEffort(
      schoolId,
      outcome.userId,
      outcome.membershipId,
      IDENTITY_AUDIT_ACTIONS.signedIn,
    );
    return session;
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

  /** P1-4: a new password ends any sign-in lockout on this school's
   * login identifier — the person has just proved who they are. */
  private async clearLockoutFor(schoolId: string, userId: string): Promise<void> {
    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findFirst({
        where: { schoolId, userId },
        select: { loginIdentifier: true },
      }),
    );
    if (membership) await this.lockout.clear(schoolId, membership.loginIdentifier);
  }

  async changePassword(
    schoolId: string,
    userId: string,
    currentPassword: string | undefined,
    newPassword: string,
    current?: { sessionId: string; membershipId: string },
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
    await this.clearLockoutFor(schoolId, userId);

    // B20 (08 §16 revocable sessions): every other session issued against
    // the old credential ends now; the caller's own session survives.
    const revoked = await this.sessions.revokeAllForUser(schoolId, userId, current?.sessionId);
    if (current) {
      await this.audit.record({
        schoolId,
        actorUserId: userId,
        actorRole: await this.actorRoleFor(schoolId, current.membershipId),
        action: IDENTITY_AUDIT_ACTIONS.passwordChanged,
        entityType: 'SchoolMembership',
        entityId: current.membershipId,
        metadata: { otherSessionsRevoked: revoked },
      });
    }
  }

  /**
   * Staff-only (ADR-0019 — students have no email). Always resolves
   * successfully regardless of whether `identifier` exists, matching the
   * same enumeration-resistance rule as login: the response can never
   * confirm or deny an account's existence.
   */
  async requestPasswordReset(schoolId: string, identifier: string): Promise<void> {
    // See evaluateLogin's own comment on why this is findFirst + `mode:
    // 'insensitive'` rather than the composite-unique findUnique this used
    // to be.
    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findFirst({
        where: { schoolId, loginIdentifier: { equals: identifier, mode: 'insensitive' } },
      }),
    );
    if (!membership || membership.status !== 'ACTIVE') return;

    const user = await prisma.user.findUnique({ where: { id: membership.userId } });
    // No email on file (ADR-0019: students never have one) — silently
    // skipped rather than erroring, for the same enumeration-resistance
    // reason as every other branch here.
    if (!user || user.status !== 'ACTIVE' || !user.email) return;

    const rawToken = randomBytes(32).toString('base64url');
    const ttlSeconds = (await this.settings.current()).passwordResetTokenTtlSeconds;
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

    const resetUrl = await this.schoolResetUrl(schoolId, rawToken);
    await this.notifications.send({
      to: user.email,
      template: PASSWORD_RESET_TEMPLATE_NAME,
      variables: { displayName: user.displayName, resetUrl },
    });
  }

  /**
   * B6: a staff member's (teacher/HOD/moderator) initial invitation —
   * `templates.ts`'s own doc comment named this exact reuse when B1 built
   * `PASSWORD_RESET_TEMPLATE_NAME`: "also a staff member's initial
   * invitation once B6 starts issuing those tokens the same way."
   * Deliberately not `requestPasswordReset` itself — that method requires
   * `user.status === 'ACTIVE'` (an enumeration-resistance gate appropriate
   * for a "forgot password" request), but a freshly created staff member is
   * `INVITED`, not yet `ACTIVE`. Called once, synchronously, at the point
   * UsersModule creates a teacher/HOD/moderator — CredentialSheetService is
   * the equivalent primitive for students (system-generated password shown
   * once), this is the parallel path for staff (invitation link).
   */
  async issueStaffInvitation(schoolId: string, userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'User not found.' });
    }
    if (!user.email) {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Staff members require an email address to receive their invitation.',
      });
    }

    const rawToken = randomBytes(32).toString('base64url');
    const ttlSeconds = (await this.settings.current()).passwordResetTokenTtlSeconds;
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

    const resetUrl = await this.schoolResetUrl(schoolId, rawToken);
    await this.notifications.send({
      to: user.email,
      template: PASSWORD_RESET_TEMPLATE_NAME,
      variables: { displayName: user.displayName, resetUrl },
    });
  }

  /**
   * F21 (launch checklist 5.4): the link opens on the school's own host. On
   * the bare `WEB_ORIGIN` the reset page has no tenant (ADR-0005), so the
   * token could not be redeemed there.
   */
  private async schoolResetUrl(schoolId: string, rawToken: string): Promise<string> {
    const school = await prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { subdomain: true },
    });
    return buildSchoolUrl(
      this.config.get('WEB_ORIGIN', { infer: true }),
      this.config.get('PLATFORM_ROOT_DOMAIN', { infer: true }),
      school.subdomain,
      `/reset-password?token=${rawToken}`,
    );
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
      // Gap closure (2026-08-30): this endpoint is also where a freshly
      // invited staff member (B6's `issueStaffInvitation`, sharing this
      // exact token mechanism per its own doc comment) accepts their
      // invitation — but a User created by createPersonMembership starts
      // `status: 'INVITED'`, and nothing else in this codebase ever
      // transitions it to `ACTIVE` except ActivationService.redeem()'s
      // bespoke first-School-Admin bootstrap. Every teacher/HOD/moderator
      // created since B6 could therefore set a real password here and
      // still never pass AuthGuard's `status === 'ACTIVE'` check
      // afterward — mirrors that same redeem() transition, and is
      // conditional for the identical reason its own `status !== 'INVITED'`
      // guard exists: an ordinary forgot-password reset (the only other
      // caller of this method) always finds an already-ACTIVE user, so this
      // is a no-op there; a SUSPENDED/INACTIVE account reusing a still-valid
      // token from before it was suspended must not be silently reactivated.
      const user = await tx.user.findUniqueOrThrow({ where: { id: token.userId } });
      await tx.user.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          credentialState: 'OK',
          ...(user.status === 'INVITED' ? { status: 'ACTIVE' as const } : {}),
        },
      });
      await tx.passwordResetToken.update({
        where: { id: token.id },
        data: { usedAt: new Date() },
      });
    });

    // B20: a reset is exactly the case where an attacker may hold a live
    // session — every session for this user at this school ends now.
    const revoked = await this.sessions.revokeAllForUser(schoolId, token.userId);
    await this.clearLockoutFor(schoolId, token.userId);
    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findFirst({
        where: { schoolId, userId: token.userId },
        select: { id: true },
      }),
    );
    if (membership) {
      await this.audit.record({
        schoolId,
        actorUserId: token.userId,
        actorRole: await this.actorRoleFor(schoolId, membership.id),
        action: IDENTITY_AUDIT_ACTIONS.passwordResetCompleted,
        entityType: 'SchoolMembership',
        entityId: membership.id,
        metadata: { sessionsRevoked: revoked },
      });
    }
  }
}
