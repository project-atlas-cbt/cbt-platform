import { prisma, withTenant } from '@atlas/db';
import type { AuditService } from './audit-event.service.js';

/**
 * B20 data-subject redaction (ADR-0028: "personal identifiers may be
 * redacted or anonymised on request, but academic evidence — attempts,
 * answers, snapshots, results — is never destroyed"; project-owner decision
 * 2026-10-02 to build an audited operator tool). Run through the
 * `ops:redact-subject` CLI by a platform operator acting for the school,
 * which is the data controller; never exposed as an HTTP endpoint.
 *
 * What changes (school-scoped, inside one tenant transaction):
 * - the membership's sign-in identifier, the student/staff number, the
 *   admission number — replaced by neutral placeholders;
 * - every session ended, every reset token removed;
 * - raw import rows that created this person — source cells removed;
 * - the person's name/email and credential — ONLY if they belong to no
 *   other school (a `User` spans schools; each school is its own
 *   controller and can only ask for its own data), and the account is
 *   deactivated.
 *
 * What never changes: attempts, answers, snapshots, results, adjustments,
 * participation, audit — the school's academic record. Results keep
 * pointing at the same (now anonymous) person, so provenance survives.
 * The database role could not delete those rows anyway (privileges.ts).
 *
 * Idempotent: running it again on a redacted subject changes nothing new.
 */
export const DATA_SUBJECT_REDACTED_ACTION = 'DATA_SUBJECT_REDACTED';

export const REDACTED_NAME = {
  firstName: 'Redacted',
  lastName: 'Person',
  displayName: 'Redacted person',
};

export interface RedactSubjectParams {
  schoolId: string;
  membershipId: string;
  actorUserId: string;
  reason: string;
  requestRef: string;
}

export interface RedactionPlan {
  membershipId: string;
  userId: string;
  /** Field names that will change (never their values). */
  membershipFields: string[];
  profileFields: string[];
  userFields: string[];
  /** Why the shared `User` record is left alone, when it is. */
  userSkippedReason?: string;
  sessionsToRevoke: number;
  resetTokensToDelete: number;
  importRowsToRedact: number;
  alreadyRedacted: boolean;
}

const placeholder = (prefix: string, id: string) =>
  `${prefix}-${id.replace(/-/g, '').slice(0, 12)}`;

async function membershipsElsewhere(userId: string, schoolId: string): Promise<number> {
  // school_memberships is RLS-scoped; count per school under its own tenant.
  const schools = await prisma.school.findMany({
    where: { id: { not: schoolId } },
    select: { id: true },
  });
  let n = 0;
  for (const s of schools) {
    n += await withTenant(prisma, s.id, (tx) => tx.schoolMembership.count({ where: { userId } }));
  }
  return n;
}

export async function planRedaction(params: RedactSubjectParams): Promise<RedactionPlan> {
  const { schoolId, membershipId } = params;
  return withTenant(prisma, schoolId, async (tx) => {
    const membership = await tx.schoolMembership.findFirst({
      where: { id: membershipId, schoolId },
      include: { studentProfile: true, teacherProfile: true },
    });
    if (!membership) throw new Error('Membership not found in this school.');
    const loginPlaceholder = placeholder('redacted', membership.id);
    const alreadyRedacted = membership.loginIdentifier === loginPlaceholder;
    const otherSchools = await membershipsElsewhere(membership.userId, schoolId);

    const [sessions, tokens, importRows] = await Promise.all([
      tx.session.count({ where: { schoolId, userId: membership.userId, revokedAt: null } }),
      tx.passwordResetToken.count({ where: { schoolId, userId: membership.userId } }),
      tx.importRow.count({
        where: {
          schoolId,
          resultMembershipId: membership.id,
          NOT: { rawData: { equals: { redacted: true } } },
        },
      }),
    ]);

    return {
      membershipId: membership.id,
      userId: membership.userId,
      membershipFields: alreadyRedacted ? [] : ['loginIdentifier'],
      profileFields: alreadyRedacted
        ? []
        : membership.studentProfile
          ? ['studentId', 'admissionNumber']
          : membership.teacherProfile
            ? ['staffId']
            : [],
      userFields:
        otherSchools > 0 || alreadyRedacted
          ? []
          : ['firstName', 'lastName', 'displayName', 'email', 'passwordHash', 'status'],
      ...(otherSchools > 0 && {
        userSkippedReason: `The person also belongs to ${otherSchools} other school(s); only this school's identifiers are redacted.`,
      }),
      sessionsToRevoke: sessions,
      resetTokensToDelete: tokens,
      importRowsToRedact: importRows,
      alreadyRedacted,
    };
  });
}

export async function applyRedaction(
  audit: AuditService,
  params: RedactSubjectParams,
): Promise<RedactionPlan> {
  if (!params.reason.trim() || !params.requestRef.trim()) {
    throw new Error('Both a reason and a request reference are required.');
  }
  const plan = await planRedaction(params);
  const { schoolId } = params;

  await withTenant(prisma, schoolId, async (tx) => {
    if (plan.membershipFields.length > 0) {
      await tx.schoolMembership.update({
        where: { id: plan.membershipId },
        data: { loginIdentifier: placeholder('redacted', plan.membershipId) },
      });
      await tx.studentProfile.updateMany({
        where: { schoolId, membershipId: plan.membershipId },
        data: { studentId: placeholder('R', plan.membershipId), admissionNumber: null },
      });
      await tx.teacherProfile.updateMany({
        where: { schoolId, membershipId: plan.membershipId },
        data: { staffId: placeholder('R', plan.membershipId) },
      });
    }
    await tx.session.updateMany({
      where: { schoolId, userId: plan.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.passwordResetToken.deleteMany({ where: { schoolId, userId: plan.userId } });
    await tx.importRow.updateMany({
      where: { schoolId, resultMembershipId: plan.membershipId },
      data: { rawData: { redacted: true, by: 'subject-request' } },
    });
    if (plan.userFields.length > 0) {
      await tx.user.update({
        where: { id: plan.userId },
        data: { ...REDACTED_NAME, email: null, passwordHash: null, status: 'INACTIVE' },
      });
    }
    await audit.recordInTx(tx, {
      schoolId,
      actorUserId: params.actorUserId,
      actorRole: 'SOFTWARE_ADMIN',
      action: DATA_SUBJECT_REDACTED_ACTION,
      entityType: 'SchoolMembership',
      entityId: plan.membershipId,
      reason: params.reason,
      // Field names and counts only — never the values that were removed.
      metadata: {
        requestRef: params.requestRef,
        membershipFields: plan.membershipFields,
        profileFields: plan.profileFields,
        userFields: plan.userFields,
        userRedacted: plan.userFields.length > 0,
        sessionsRevoked: plan.sessionsToRevoke,
        resetTokensDeleted: plan.resetTokensToDelete,
        importRowsRedacted: plan.importRowsToRedact,
        alreadyRedacted: plan.alreadyRedacted,
      },
    });
  });
  return plan;
}
