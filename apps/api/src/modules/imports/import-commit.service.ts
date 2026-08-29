import { Injectable, Logger } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { runUniqueGuarded } from '../academics/prisma-error.util.js';
import { StudentEnrollmentService } from '../academics/student-enrollment.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import { IdentityService } from '../identity/identity.service.js';
import { createPersonMembership } from '../users/person.util.js';

const CHUNK_SIZE = 100;

/**
 * The commit half of B7's pipeline — writes through `StudentEnrollment
 * Service.enroll()`/`IdentityService.issueStaffInvitation()` exactly as the
 * manual creation flows do (`StudentService.create`/`TeacherService
 * .create`), never reimplementing their logic (ADR-0011 auto-registration,
 * enumeration-safe invitation dispatch). Deliberately a plain injectable
 * Nest service, run from a BullMQ `Worker` constructed inside `apps/api`
 * itself — see `ImportQueueService`'s own doc comment for why.
 *
 * Resumability (DoD item 8): processes `ImportRow`s in chunks, selecting
 * `WHERE status = 'VALID'` — nothing depends on the whole job completing in
 * one transaction. Within a row, `resultMembershipId` is a finer-grained
 * progress marker (see `ImportRowStatus`'s own schema doc comment): a
 * resumed row whose person was already created (id present, still status
 * VALID) skips straight to enrollment/invitation rather than re-creating
 * the person — `StudentEnrollmentService.enroll()` is itself already
 * idempotent for a repeat call with the same class ("avoid manufacturing a
 * needless CONFLICT when the caller re-sends the same enrollment," per its
 * own doc comment); a repeat `issueStaffInvitation` call simply re-sends
 * one invitation email, an accepted, bounded, documented cost for the rare
 * crash-mid-row case, not a data-integrity issue.
 */
@Injectable()
export class ImportCommitService {
  private readonly logger = new Logger(ImportCommitService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
    private readonly enrollments: StudentEnrollmentService,
  ) {}

  async commit(schoolId: string, importJobId: string): Promise<void> {
    const job = await withTenant(prisma, schoolId, (tx) =>
      tx.importJob.findUnique({ where: { id: importJobId } }),
    );
    if (!job || job.schoolId !== schoolId) {
      this.logger.warn(`commit(): ImportJob ${importJobId} not found for school ${schoolId}.`);
      return;
    }
    if (job.status === 'COMPLETED') return; // already finished — idempotent no-op
    if (job.status !== 'IMPORTING') return; // not confirmed, or already failed/expired

    const actor = { actorUserId: job.uploaderUserId, actorRole: job.uploaderRole };

    // Chunked loop; exits via `break` once no VALID rows remain.
    while (true) {
      const rows = await withTenant(prisma, schoolId, (tx) =>
        tx.importRow.findMany({
          where: { schoolId, importJobId, status: 'VALID' },
          orderBy: { rowNumber: 'asc' },
          take: CHUNK_SIZE,
        }),
      );
      if (rows.length === 0) break;

      let committedInChunk = 0;
      let failedInChunk = 0;

      for (const row of rows) {
        try {
          const person = await this.ensurePerson(schoolId, job.type, row);
          if (job.type === 'STUDENTS') {
            await this.enrollStudent(schoolId, person, row, job, actor);
          } else {
            await this.identity.issueStaffInvitation(schoolId, person.userId);
          }
          await withTenant(prisma, schoolId, (tx) =>
            tx.importRow.update({ where: { id: row.id }, data: { status: 'COMMITTED' } }),
          );
          committedInChunk += 1;
        } catch (error) {
          this.logger.warn(
            `commit(): row ${row.rowNumber} of ImportJob ${importJobId} failed: ` +
              `${(error as Error).message}`,
          );
          await withTenant(prisma, schoolId, (tx) =>
            tx.importRow.update({
              where: { id: row.id },
              data: {
                status: 'FAILED',
                errors: [
                  { field: '_row', message: (error as Error).message },
                ] as Prisma.InputJsonValue,
              },
            }),
          );
          failedInChunk += 1;
        }
      }

      await withTenant(prisma, schoolId, (tx) =>
        tx.importJob.update({
          where: { id: importJobId },
          data: {
            committedRows: { increment: committedInChunk },
            failedRows: { increment: failedInChunk },
          },
        }),
      );
    }

    await withTenant(prisma, schoolId, (tx) =>
      tx.importJob.update({ where: { id: importJobId }, data: { status: 'COMPLETED' } }),
    );

    const finalJob = await withTenant(prisma, schoolId, (tx) =>
      tx.importJob.findUniqueOrThrow({ where: { id: importJobId } }),
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: job.type === 'STUDENTS' ? 'STUDENT_IMPORT_COMPLETED' : 'TEACHER_IMPORT_COMPLETED',
      entityType: 'ImportJob',
      entityId: importJobId,
      metadata: {
        totalRows: finalJob.totalRows,
        committedRows: finalJob.committedRows,
        failedRows: finalJob.failedRows,
      },
    });
  }

  /** Creates the row's person on first pass, or resolves the already-
   * created one on a resumed pass (`row.resultMembershipId` already set —
   * see this class's own doc comment). Either way returns the ids the
   * enrollment/invitation step needs. */
  private async ensurePerson(
    schoolId: string,
    type: 'STUDENTS' | 'TEACHERS',
    row: { id: string; resultMembershipId: string | null; rawData: unknown },
  ): Promise<{ membershipId: string; userId: string; studentProfileId: string | null }> {
    if (row.resultMembershipId) {
      return withTenant(prisma, schoolId, async (tx) => {
        const membership = await tx.schoolMembership.findUniqueOrThrow({
          where: { id: row.resultMembershipId as string },
        });
        if (type === 'STUDENTS') {
          const profile = await tx.studentProfile.findFirst({
            where: { schoolId, membershipId: membership.id },
          });
          return {
            membershipId: membership.id,
            userId: membership.userId,
            studentProfileId: profile?.id ?? null,
          };
        }
        return { membershipId: membership.id, userId: membership.userId, studentProfileId: null };
      });
    }

    const rawData = row.rawData as Record<string, string>;
    return withTenant(prisma, schoolId, async (tx) => {
      if (type === 'STUDENTS') {
        const person = await createPersonMembership(tx, {
          schoolId,
          firstName: rawData['First Name'] ?? '',
          lastName: rawData['Last Name'] ?? '',
          loginIdentifier: rawData['Student ID'] ?? '',
          role: 'STUDENT',
        });
        const profile = await runUniqueGuarded(
          () =>
            tx.studentProfile.create({
              data: {
                schoolId,
                membershipId: person.membershipId,
                studentId: rawData['Student ID'] ?? '',
              },
            }),
          `A student with ID "${rawData['Student ID']}" already exists at this school.`,
        );
        await tx.importRow.update({
          where: { id: row.id },
          data: { resultMembershipId: person.membershipId },
        });
        return {
          membershipId: person.membershipId,
          userId: person.userId,
          studentProfileId: profile.id,
        };
      }

      const person = await createPersonMembership(tx, {
        schoolId,
        firstName: rawData['First Name'] ?? '',
        lastName: rawData['Last Name'] ?? '',
        email: rawData['Email'] ?? '',
        loginIdentifier: rawData['Staff ID'] ?? '',
        role: 'TEACHER',
      });
      await runUniqueGuarded(
        () =>
          tx.teacherProfile.create({
            data: {
              schoolId,
              membershipId: person.membershipId,
              staffId: rawData['Staff ID'] ?? '',
            },
          }),
        `A teacher with staff ID "${rawData['Staff ID']}" already exists at this school.`,
      );
      await tx.importRow.update({
        where: { id: row.id },
        data: { resultMembershipId: person.membershipId },
      });
      return { membershipId: person.membershipId, userId: person.userId, studentProfileId: null };
    });
  }

  /** Re-resolves the row's Class by name against the job's target session
   * — the same case-insensitive match `import-row-validator.ts` already
   * proved resolves at validation time. A class archived in the window
   * between validation and confirm (staging can last up to 24h) is a real,
   * if narrow, possibility; re-checking here rather than trusting a
   * validation-time id means that case surfaces as one row's clear FAILED
   * reason, not a silent skip or a stale reference. */
  private async enrollStudent(
    schoolId: string,
    person: { studentProfileId: string | null },
    row: { rawData: unknown },
    job: { targetAcademicSessionId: string | null },
    actor: { actorUserId: string; actorRole: Role },
  ): Promise<void> {
    if (!person.studentProfileId) {
      throw new Error('Student profile could not be resolved for this row.');
    }
    // A STUDENTS-type ImportJob always has a resolved session (createStudentImport
    // either takes one explicitly or resolves the school's current one, throwing
    // otherwise) — only TEACHERS jobs ever have this null. Asserted, not silently
    // coerced, since a null here for a STUDENTS job would be a real bug elsewhere.
    if (!job.targetAcademicSessionId) {
      throw new Error('This import job has no target academic session.');
    }
    const targetAcademicSessionId = job.targetAcademicSessionId;
    const rawData = row.rawData as Record<string, string>;
    const className = rawData['Class'] ?? '';
    const classGroup = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findFirst({
        where: {
          schoolId,
          academicSessionId: targetAcademicSessionId,
          status: 'ACTIVE',
          name: { equals: className, mode: 'insensitive' },
        },
      }),
    );
    if (!classGroup) {
      throw new Error(
        `Class "${className}" could not be resolved (it may have been archived since validation).`,
      );
    }
    await this.enrollments.enroll(
      schoolId,
      person.studentProfileId,
      { classId: classGroup.id, academicSessionId: targetAcademicSessionId },
      actor,
    );
  }
}
