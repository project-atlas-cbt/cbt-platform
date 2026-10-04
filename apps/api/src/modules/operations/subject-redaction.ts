import { prisma, withTenant } from '@atlas/db';
import type { AuditService } from './audit-event.service.js';
import {
  importSourcesForMembership,
  type ImportSourceStorage,
} from '../imports/import-source-purge.js';
import {
  assertRequestRef,
  readRegisterSince,
  writeRegisterEntry,
  type RegisterStorage,
} from './redaction-register.js';

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
 * - B22 (decision 6A): every uploaded import file that created this
 *   person, deleted whole from object storage — it also holds other
 *   people's rows, which cannot be cut out of a spreadsheet;
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
 *
 * B22 (decision 2b): each applied redaction is also written to the
 * redaction register (redaction-register.ts) — by UUID only — so it can be
 * re-applied after a database restore rolls it back.
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
  /** B22: uploaded import files to delete whole (decision 6A). */
  importSourceFilesToDelete: number;
  alreadyRedacted: boolean;
}

/** Both markers ever written over `import_rows.raw_data` (this command's,
 * and the worker's retention sweep's). Matched exactly: a row carrying
 * either is already redacted. */
const REDACTED_ROW_MARKERS = [
  { redacted: true, by: 'subject-request' },
  { redacted: true, by: 'retention-sweep' },
];
const notRedactedRow = {
  NOT: REDACTED_ROW_MARKERS.map((marker) => ({ rawData: { equals: marker } })),
};

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

    const sourceFiles = await importSourcesForMembership(schoolId, membership.id);
    const [sessions, tokens, importRows] = await Promise.all([
      tx.session.count({ where: { schoolId, userId: membership.userId, revokedAt: null } }),
      tx.passwordResetToken.count({ where: { schoolId, userId: membership.userId } }),
      tx.importRow.count({
        where: {
          schoolId,
          resultMembershipId: membership.id,
          // B22: the old filter compared against `{ redacted: true }`, which
          // no redacted row ever equals, so a re-run reported every row again.
          ...notRedactedRow,
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
      importSourceFilesToDelete: sourceFiles.length,
      alreadyRedacted,
    };
  });
}

export interface ApplyRedactionOptions {
  /** Object storage: deletes import source files, writes the register. */
  storage: ImportSourceStorage & RegisterStorage;
  /** False when re-applying a register entry after a restore — it is
   * already in the register. */
  register?: boolean;
}

export async function applyRedaction(
  audit: AuditService,
  params: RedactSubjectParams,
  options: ApplyRedactionOptions,
): Promise<RedactionPlan> {
  if (!params.reason.trim() || !params.requestRef.trim()) {
    throw new Error('Both a reason and a request reference are required.');
  }
  assertRequestRef(params.requestRef);
  const plan = await planRedaction(params);
  const { schoolId } = params;

  // B22 order: the register entry first, so a redaction is never applied
  // without one (an entry for a run that then failed is harmless — a
  // replay applies what the operator asked for). Then the files, before
  // the database marks them gone (see import-source-purge.ts).
  if (options.register !== false) {
    await writeRegisterEntry(options.storage, {
      version: 1,
      requestRef: params.requestRef,
      schoolId,
      membershipId: plan.membershipId,
      userId: plan.userId,
      actorUserId: params.actorUserId,
      appliedAt: new Date().toISOString(),
    });
  }
  const sourceFiles = await importSourcesForMembership(schoolId, plan.membershipId);
  for (const file of sourceFiles) await options.storage.deleteObject(file.storageKey);

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
      where: { schoolId, resultMembershipId: plan.membershipId, ...notRedactedRow },
      data: { rawData: { redacted: true, by: 'subject-request' } },
    });
    if (sourceFiles.length > 0) {
      await tx.importJob.updateMany({
        where: { schoolId, id: { in: sourceFiles.map((f) => f.jobId) }, sourcePurgedAt: null },
        data: { sourcePurgedAt: new Date() },
      });
    }
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
        importSourceFilesDeleted: sourceFiles.length,
        alreadyRedacted: plan.alreadyRedacted,
      },
    });
  });
  return plan;
}

export const REPLAY_REASON = 'Re-applied from the redaction register after a database restore';

export interface ReplayOutcome {
  requestRef: string;
  schoolId: string;
  membershipId: string;
  /** REAPPLIED / WOULD_REAPPLY: the restore had brought the data back.
   * ALREADY_REDACTED: the restore point was after this redaction.
   * NOT_PRESENT: the restore point was before this person existed. */
  outcome: 'REAPPLIED' | 'WOULD_REAPPLY' | 'ALREADY_REDACTED' | 'NOT_PRESENT';
}

/**
 * B22 (decision 2b): after a database restore, re-apply every redaction the
 * register holds from the restore point on. Dry run unless `apply`.
 * Re-applying is the same idempotent `applyRedaction`, audited again under
 * the original request reference, and not registered a second time.
 */
export async function replayRedactions(
  audit: AuditService,
  params: { since: Date; actorUserId: string; apply: boolean },
  options: Omit<ApplyRedactionOptions, 'register'>,
): Promise<ReplayOutcome[]> {
  const outcomes: ReplayOutcome[] = [];
  for (const entry of await readRegisterSince(options.storage, params.since)) {
    const subject = {
      schoolId: entry.schoolId,
      membershipId: entry.membershipId,
      actorUserId: params.actorUserId,
      reason: REPLAY_REASON,
      requestRef: entry.requestRef,
    };
    const base = {
      requestRef: entry.requestRef,
      schoolId: entry.schoolId,
      membershipId: entry.membershipId,
    };
    const school = await prisma.school.findUnique({
      where: { id: entry.schoolId },
      select: { id: true },
    });
    const plan = school ? await planRedaction(subject).catch(() => null) : null;
    if (!plan) {
      outcomes.push({ ...base, outcome: 'NOT_PRESENT' });
    } else if (plan.alreadyRedacted && plan.importSourceFilesToDelete === 0) {
      outcomes.push({ ...base, outcome: 'ALREADY_REDACTED' });
    } else if (!params.apply) {
      outcomes.push({ ...base, outcome: 'WOULD_REAPPLY' });
    } else {
      await applyRedaction(audit, subject, { ...options, register: false });
      outcomes.push({ ...base, outcome: 'REAPPLIED' });
    }
  }
  return outcomes;
}
