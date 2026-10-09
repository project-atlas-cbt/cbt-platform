import { Injectable, Logger } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { runUniqueGuarded } from '../academics/prisma-error.util.js';
import { StudentEnrollmentService } from '../academics/student-enrollment.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import { IdentityService } from '../identity/identity.service.js';
import { createPersonMembership } from '../users/person.util.js';
import { QuestionService } from '../questions/question.service.js';
import { TopicService } from '../questions/topic.service.js';
import { splitElectives, streamCell } from './import-row-validator.js';

const CHUNK_SIZE = 100;

/** How long a claim is honoured before it's treated as abandoned (the
 * process that held it crashed without clearing it) and a new run may
 * re-claim the job. Generous relative to a single chunk's real processing
 * time — this only ever needs to fire in the crash case, not the happy
 * path, since a live run keeps refreshing nothing and simply clears its
 * claim in the `finally` below on every exit. */
const CLAIM_STALE_MS = 10 * 60 * 1000;

/** B22: another run holds this import's lease; retry later. */
export class ImportClaimHeldError extends Error {
  constructor(importJobId: string) {
    super(`ImportJob ${importJobId} is held by another run's claim; retrying later`);
    this.name = 'ImportClaimHeldError';
  }
}

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
 *
 * Single-runner guard: `ImportJob.processingClaimedAt` (see that field's own
 * schema doc comment) is claimed atomically before any row is touched and
 * released in a `finally` on every exit, refreshed once per chunk so a
 * long-running commit never goes stale mid-flight. This is a *lease*, not a
 * transaction boundary — it doesn't change the chunked-transaction shape
 * above, it only stops two overlapping executions of the same job (e.g. a
 * BullMQ stalled-lock redelivery landing on a second worker while the first
 * is still genuinely alive) from both processing the same batch of rows,
 * which would otherwise surface as a spurious FAILED row (a unique-
 * constraint loss to the other, faster runner) on a row that actually did
 * commit successfully.
 */
@Injectable()
export class ImportCommitService {
  private readonly logger = new Logger(ImportCommitService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
    private readonly enrollments: StudentEnrollmentService,
    private readonly questions: QuestionService,
    private readonly topics: TopicService,
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

    // Atomically claim the job before touching any row — see
    // ImportJob.processingClaimedAt's own schema doc comment. Same
    // conditional-updateMany idiom as confirm()'s VALIDATED -> IMPORTING
    // transition in imports.service.ts: only the caller whose UPDATE
    // actually matches a row goes on to process it. A previously-abandoned
    // (crashed) claim older than CLAIM_STALE_MS is treated as available.
    const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
    const claim = await withTenant(prisma, schoolId, (tx) =>
      tx.importJob.updateMany({
        where: {
          id: importJobId,
          schoolId,
          status: 'IMPORTING',
          OR: [{ processingClaimedAt: null }, { processingClaimedAt: { lt: staleBefore } }],
        },
        data: { processingClaimedAt: new Date() },
      }),
    );
    if (claim.count === 0) {
      // B22: thrown, not returned. Another run holds a live lease — either
      // it really is running, or it was killed and its lease has not gone
      // stale yet (a BullMQ stalled-job redelivery arrives within ~30 s, the
      // lease lasts CLAIM_STALE_MS). Returning used to complete this job
      // and leave the import IMPORTING forever in the second case; throwing
      // lets BullMQ retry after its backoff, by which time a dead holder's
      // lease is stale and this run takes over.
      throw new ImportClaimHeldError(importJobId);
    }

    const actor = { actorUserId: job.uploaderUserId, actorRole: job.uploaderRole };

    try {
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
            if (job.type === 'QUESTIONS') {
              await this.commitQuestionRow(schoolId, row, actor);
            } else {
              const person = await this.ensurePerson(schoolId, job.type, row);
              if (job.type === 'STUDENTS') {
                await this.enrollStudent(schoolId, person, row, job, actor);
              } else {
                await this.identity.issueStaffInvitation(schoolId, person.userId);
              }
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
              // Refreshed every chunk so a long-running commit (many
              // chunks) never has its own claim go stale mid-flight —
              // CLAIM_STALE_MS only ever needs to fire for a run that
              // actually died, not a slow-but-alive one.
              processingClaimedAt: new Date(),
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
        action:
          job.type === 'STUDENTS'
            ? 'STUDENT_IMPORT_COMPLETED'
            : job.type === 'TEACHERS'
              ? 'TEACHER_IMPORT_COMPLETED'
              : 'QUESTION_IMPORT_COMPLETED',
        entityType: 'ImportJob',
        entityId: importJobId,
        metadata: {
          totalRows: finalJob.totalRows,
          committedRows: finalJob.committedRows,
          failedRows: finalJob.failedRows,
        },
      });
    } finally {
      // Always release the claim on the way out, success or failure —
      // a bare post-loop clear wouldn't run on an exception thrown outside
      // any per-row try/catch (e.g. the row-fetch query itself), which
      // would otherwise leave a legitimate retry blocked for up to
      // CLAIM_STALE_MS. The release's own failure is logged and swallowed,
      // not rethrown — a `finally` that throws would replace whatever
      // error the try block was already propagating.
      await withTenant(prisma, schoolId, (tx) =>
        tx.importJob.updateMany({
          where: { id: importJobId, schoolId, processingClaimedAt: { not: null } },
          data: { processingClaimedAt: null },
        }),
      ).catch((err: unknown) => {
        this.logger.error(
          `commit(): failed to release processing claim for ImportJob ${importJobId}: ` +
            `${(err as Error).message}`,
        );
      });
    }
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

  /** B8 — question creation is one atomic transaction (unlike the
   * student/teacher person-then-enroll/invite split), so resumability here
   * is simply "already has a resultQuestionId, or doesn't" — no finer-
   * grained progress marker is needed the way `resultMembershipId` needs
   * one for STUDENTS/TEACHERS. Resolves the row's Subject/Class/Topic
   * fresh at commit time (never trusting a validation-time id — mirrors
   * `enrollStudent`'s own "may have changed since validation, staging can
   * last 24h" reasoning), and always creates the row's author as the
   * uploader's own `TeacherProfile` (`QuestionService.createFromImportRow`
   * re-verifies the assignment is still active). */
  private async commitQuestionRow(
    schoolId: string,
    row: { id: string; resultQuestionId: string | null; rawData: unknown },
    actor: { actorUserId: string; actorRole: Role },
  ): Promise<void> {
    if (row.resultQuestionId) return; // already created on a prior pass

    const rawData = row.rawData as Record<string, string>;
    const uploaderMembership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findFirst({ where: { schoolId, userId: actor.actorUserId } }),
    );
    if (!uploaderMembership) throw new Error('Uploader has no membership at this school.');
    const teacherProfile = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId: uploaderMembership.id } },
      }),
    );
    if (!teacherProfile) throw new Error('Uploader has no active teacher profile at this school.');

    const subject = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.findFirst({
        where: {
          schoolId,
          status: 'ACTIVE',
          name: { equals: rawData['Subject'] ?? '', mode: 'insensitive' },
        },
      }),
    );
    if (!subject) throw new Error(`Subject "${rawData['Subject']}" could not be resolved.`);
    const classGroup = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findFirst({
        where: {
          schoolId,
          status: 'ACTIVE',
          name: { equals: rawData['Class'] ?? '', mode: 'insensitive' },
        },
      }),
    );
    if (!classGroup) throw new Error(`Class "${rawData['Class']}" could not be resolved.`);

    const topicName = (rawData['Topic'] ?? '').trim();
    const topic = topicName
      ? await this.topics.findOrCreate(schoolId, subject.id, { name: topicName })
      : null;

    const optionColumns = ['Option A', 'Option B', 'Option C', 'Option D'];
    const optionLetters = ['A', 'B', 'C', 'D'];
    const correctLetter = (rawData['Correct Answer'] ?? '').trim().toUpperCase();
    const options = optionColumns
      .map((col, index) => ({
        content: (rawData[col] ?? '').trim(),
        correctFlag: optionLetters[index] === correctLetter,
      }))
      .filter((option) => option.content.length > 0);

    const created = await this.questions.createFromImportRow(schoolId, {
      teacherProfileId: teacherProfile.id,
      createdByMembershipId: uploaderMembership.id,
      subjectId: subject.id,
      level: classGroup.level,
      // 05 §18.1's template carries no Question Type column — SINGLE_CHOICE
      // covers True/False structurally too (two options whose text happens
      // to be "True"/"False"), so no fragile option-count heuristic is
      // needed to guess a distinct TRUE_FALSE type from row shape alone.
      questionType: 'SINGLE_CHOICE',
      content: rawData['Question'] ?? '',
      options,
      topicId: topic?.id ?? null,
      difficulty: (rawData['Difficulty'] ?? '').trim().toUpperCase(),
      marks: Number(rawData['Marks']),
    });

    await withTenant(prisma, schoolId, (tx) =>
      tx.importRow.update({ where: { id: row.id }, data: { resultQuestionId: created.id } }),
    );
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
    // ADR-0038: the row's stream (blank: the class's default) and its
    // electives, re-resolved by name as the validator did.
    const stream = streamCell(rawData);
    const streamRow = stream.value
      ? await withTenant(prisma, schoolId, (tx) =>
          tx.stream.findFirst({
            where: {
              schoolId,
              status: 'ACTIVE',
              OR: [
                { name: { equals: stream.value, mode: 'insensitive' } },
                { code: { equals: stream.value, mode: 'insensitive' } },
              ],
            },
          }),
        )
      : null;
    if (stream.value && !streamRow) {
      throw new Error(`Stream "${stream.value}" could not be resolved.`);
    }
    const enrollment = await this.enrollments.enroll(
      schoolId,
      person.studentProfileId,
      {
        classId: classGroup.id,
        academicSessionId: targetAcademicSessionId,
        ...(streamRow && { streamId: streamRow.id }),
      },
      actor,
    );
    const electives = splitElectives(rawData['Electives'] ?? '');
    if (electives.length > 0) {
      await withTenant(prisma, schoolId, async (tx) => {
        const offerings = await tx.classSubject.findMany({
          where: { schoolId, classId: classGroup.id, status: 'ACTIVE' },
          select: { id: true, subject: { select: { name: true, code: true } } },
        });
        const byName = new Map(
          offerings.flatMap((o) => [
            [o.subject.name.toLowerCase(), o.id],
            [o.subject.code.toLowerCase(), o.id],
          ]),
        );
        const ids = electives.map((name) => byName.get(name.toLowerCase()));
        const missing = electives.filter((_, i) => ids[i] === undefined);
        if (missing.length > 0) {
          throw new Error(`Class "${className}" does not offer ${missing.join(', ')}.`);
        }
        await tx.studentSubjectRegistration.createMany({
          data: [...new Set(ids as string[])].map((classSubjectId) => ({
            schoolId,
            studentEnrollmentId: enrollment.id,
            classSubjectId,
          })),
          skipDuplicates: true,
        });
      });
    }
  }
}
