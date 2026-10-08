import { Injectable, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AccessGateService } from '../platform/access-gate.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import { AuthLockoutService } from './auth-lockout.service.js';
import { PasswordService } from './password.service.js';
import { SessionService, type AuthenticatedSession } from './session.service.js';

export const STUDENT_PASSWORDLESS_AUDIT_ACTIONS = {
  settingsChanged: 'STUDENT_PASSWORDLESS_SIGN_IN_CHANGED',
  signedIn: 'USER_SIGNED_IN_PASSWORDLESS',
} as const;

export interface StudentPasswordlessSettings {
  /** On for every student of the school. */
  allStudents: boolean;
  /** Classes switched on individually. */
  classIds: string[];
}

const GENERIC_FAILURE = () =>
  new AppHttpException({ code: 'UNAUTHENTICATED', message: 'Invalid credentials.' });

/** Lower-case words of a name: accents dropped, anything but letters and
 * digits treated as a separator ("O'Brien" → "o", "brien"; "Adé-Bayo" →
 * "ade", "bayo"). */
export function nameWords(value: string): string[] {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

/**
 * Owner decision 2026-10-08: the typed name matches when it contains the
 * student's first name and surname, in any order and any capitals; middle
 * names are optional, and any word that is not part of the recorded name
 * fails the match.
 */
export function nameMatches(
  typed: string,
  record: { firstName: string; lastName: string; displayName: string },
): boolean {
  const words = nameWords(typed);
  if (words.length === 0) return false;
  const first = nameWords(record.firstName);
  const last = nameWords(record.lastName);
  const known = new Set([...first, ...last, ...nameWords(record.displayName)]);
  const typedSet = new Set(words);
  return (
    first.length > 0 &&
    last.length > 0 &&
    words.every((w) => known.has(w)) &&
    first.every((w) => typedSet.has(w)) &&
    last.every((w) => typedSet.has(w))
  );
}

/**
 * Passwordless student sign-in (owner decision 2026-10-08, for students
 * who are not yet comfortable with computers). A School Admin or Moderator
 * switches it on for the whole school or for chosen classes; while it is
 * on, a student of those classes signs in with Login ID + name instead of
 * a password. It stays on until switched off, and switching off revokes
 * every passwordless session no longer covered.
 *
 * Staff never qualify: the membership must hold the STUDENT role and no
 * other. A passwordless session skips the forced first password change
 * (AuthGuard) and can never change the password (IdentityController), so
 * signing in as a classmate cannot take over their account.
 */
@Injectable()
export class StudentPasswordlessService {
  private readonly logger = new Logger('StudentPasswordlessService');

  constructor(
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly lockout: AuthLockoutService,
    private readonly accessGate: AccessGateService,
    private readonly audit: AuditService,
  ) {}

  async getSettings(schoolId: string): Promise<StudentPasswordlessSettings> {
    return withTenant(prisma, schoolId, async (tx) => {
      const school = await tx.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { studentPasswordlessSignIn: true },
      });
      const classes = await tx.classGroup.findMany({
        where: { schoolId, passwordlessSignIn: true },
        select: { id: true },
        orderBy: { name: 'asc' },
      });
      return {
        allStudents: school.studentPasswordlessSignIn,
        classIds: classes.map((c) => c.id),
      };
    });
  }

  /** True when any student of the school could sign in without a password
   * right now — the sign-in page shows the student form only then. */
  async isAnyOn(schoolId: string): Promise<boolean> {
    const s = await this.getSettings(schoolId);
    return s.allStudents || s.classIds.length > 0;
  }

  /** Replaces the whole setting (school switch + the set of classes). */
  async updateSettings(
    schoolId: string,
    actor: { userId: string; roles: Role[] },
    next: StudentPasswordlessSettings,
  ): Promise<StudentPasswordlessSettings> {
    const classIds = [...new Set(next.classIds)];
    const before = await this.getSettings(schoolId);

    await withTenant(prisma, schoolId, async (tx) => {
      if (classIds.length > 0) {
        const found = await tx.classGroup.count({ where: { schoolId, id: { in: classIds } } });
        if (found !== classIds.length) {
          throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
        }
      }
      await tx.school.update({
        where: { id: schoolId },
        data: { studentPasswordlessSignIn: next.allStudents },
      });
      await tx.classGroup.updateMany({
        where: { schoolId, passwordlessSignIn: true, id: { notIn: classIds } },
        data: { passwordlessSignIn: false },
      });
      if (classIds.length > 0) {
        await tx.classGroup.updateMany({
          where: { schoolId, id: { in: classIds } },
          data: { passwordlessSignIn: true },
        });
      }
    });

    const after = await this.getSettings(schoolId);
    const changed =
      before.allStudents !== after.allStudents ||
      before.classIds.join() !== [...after.classIds].join();
    if (!changed) return after;

    const revoked = await this.revokeUncovered(schoolId);
    await this.audit.record({
      schoolId,
      actorUserId: actor.userId,
      actorRole: actor.roles.includes('SCHOOL_ADMIN') ? 'SCHOOL_ADMIN' : 'MODERATOR',
      action: STUDENT_PASSWORDLESS_AUDIT_ACTIONS.settingsChanged,
      entityType: 'School',
      entityId: schoolId,
      metadata: {
        before: { allStudents: before.allStudents, classIds: before.classIds },
        after: { allStudents: after.allStudents, classIds: after.classIds },
        sessionsEnded: revoked,
      },
    });
    return after;
  }

  /** Ends every live passwordless session whose student is no longer
   * covered by the current setting. Returns how many were ended. */
  private async revokeUncovered(schoolId: string): Promise<number> {
    const live = await withTenant(prisma, schoolId, (tx) =>
      tx.session.findMany({
        where: { schoolId, passwordless: true, revokedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, userId: true },
      }),
    );
    let count = 0;
    for (const s of live) {
      const membership = await withTenant(prisma, schoolId, (tx) =>
        tx.schoolMembership.findFirst({
          where: { schoolId, userId: s.userId },
          select: { id: true },
        }),
      );
      if (membership && (await this.isCovered(schoolId, membership.id))) continue;
      await this.sessions.revoke(schoolId, s.id);
      count++;
    }
    return count;
  }

  /** Whether this membership is a student (and only a student) whose
   * school, or one of whose active classes, has the switch on. */
  private async isCovered(schoolId: string, membershipId: string): Promise<boolean> {
    return withTenant(prisma, schoolId, async (tx) => {
      const membership = await tx.schoolMembership.findFirst({
        where: { schoolId, id: membershipId, status: 'ACTIVE' },
        include: {
          roleAssignments: { where: { schoolId, status: 'ACTIVE' } },
          studentProfile: true,
        },
      });
      if (!membership?.studentProfile || membership.studentProfile.status !== 'ACTIVE') {
        return false;
      }
      const roles = membership.roleAssignments.map((r) => r.role);
      if (roles.length === 0 || roles.some((r) => r !== 'STUDENT')) return false;

      const school = await tx.school.findUniqueOrThrow({
        where: { id: schoolId },
        select: { studentPasswordlessSignIn: true },
      });
      if (school.studentPasswordlessSignIn) return true;
      const enrolled = await tx.studentEnrollment.count({
        where: {
          schoolId,
          studentProfileId: membership.studentProfile.id,
          status: 'ACTIVE',
          classGroupSession: { passwordlessSignIn: true },
        },
      });
      return enrolled > 0;
    });
  }

  /**
   * Login ID + name sign-in. Every failure is the same generic
   * UNAUTHENTICATED response as password sign-in, and counts towards the
   * same per-identifier lockout, so a name cannot be guessed endlessly.
   */
  async signIn(
    schoolId: string,
    identifier: string,
    name: string,
    res: FastifyReply,
    req: FastifyRequest,
  ): Promise<AuthenticatedSession> {
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

    if (await this.lockout.isLocked(schoolId, identifier)) throw GENERIC_FAILURE();

    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findFirst({
        where: { schoolId, loginIdentifier: { equals: identifier, mode: 'insensitive' } },
        select: { id: true, userId: true },
      }),
    );
    const user = membership
      ? await prisma.user.findUnique({ where: { id: membership.userId } })
      : null;

    const ok =
      membership !== null &&
      user !== null &&
      user.status === 'ACTIVE' &&
      (await this.isCovered(schoolId, membership.id)) &&
      nameMatches(name, user);

    if (!ok || !membership || !user) {
      // Same cost profile as a password sign-in failure.
      await this.passwords.verifyDummy();
      await this.lockout.recordFailure(schoolId, identifier);
      throw GENERIC_FAILURE();
    }

    await this.lockout.recordSuccess(schoolId, identifier);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const session = await this.sessions.issue(res, {
      userId: user.id,
      schoolId,
      req,
      passwordless: true,
    });
    try {
      await this.audit.record({
        schoolId,
        actorUserId: user.id,
        actorRole: 'STUDENT',
        action: STUDENT_PASSWORDLESS_AUDIT_ACTIONS.signedIn,
        entityType: 'SchoolMembership',
        entityId: membership.id,
      });
    } catch (err) {
      // Never block a lab of students over an audit hiccup (see
      // IdentityService.auditBestEffort).
      this.logger.error({ msg: 'Passwordless sign-in audit write failed', err });
    }
    return session;
  }
}
