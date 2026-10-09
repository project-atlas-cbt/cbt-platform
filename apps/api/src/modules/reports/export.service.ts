import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import { EXPORT_ARTEFACT_TTL_MS, type Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { ObjectStorageService } from '../../storage/object-storage.service.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { AuditService } from '../operations/audit-event.service.js';
import type { CreateExportDto, ExportJobResponseDto, ExportScope } from './dto/export.dto.js';
import type { Readable } from 'node:stream';
import { ExportQueueService } from './export-queue.service.js';
import { csv } from './csv.js';
import { classifyUnavailable } from '../../common/dependency-errors.js';
import { buildQuestionsExportCsv } from '../questions/question-export.util.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';

const CSV_CONTENT_TYPE = 'text/csv; charset=utf-8';

/** B22: how long a PROCESSING export may go untouched before it is treated
 * as abandoned by a killed worker. Generous against a real generation run;
 * the export queue's backoff (export-queue.service.ts) outlasts it. */
export const EXPORT_CLAIM_STALE_MS = 10 * 60 * 1000;

/** B22: another run holds this export's claim; retry later. */
export class ExportClaimHeldError extends Error {
  constructor(exportJobId: string) {
    super(`Export ${exportJobId} is held by another run's claim; retrying later`);
    this.name = 'ExportClaimHeldError';
  }
}

/** B22: the staff-visible reason, never the raw error (which can name
 * buckets, hosts or SQL). The full error goes to the log. */
export function exportFailureReason(error: unknown): string {
  return classifyUnavailable(error) !== undefined
    ? 'A service was temporarily unavailable while this export was generated. Please try again.'
    : 'This export could not be generated. Please try again, or contact support if it keeps failing.';
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  constructor(
    private readonly queue: ExportQueueService,
    private readonly storage: ObjectStorageService,
    private readonly audit: AuditService,
    private readonly authz: AuthorizationService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateExportDto): Promise<ExportJobResponseDto> {
    const scope = await this.validateScope(user, dto);
    const expiresAt = new Date(Date.now() + EXPORT_ARTEFACT_TTL_MS);
    const job = await withTenant(prisma, user.schoolId, (tx) =>
      tx.exportJob.create({
        data: {
          schoolId: user.schoolId,
          type: dto.type,
          requesterUserId: user.userId,
          requesterMembershipId: user.membershipId,
          requesterRole: user.roles[0] as Role,
          scope: scope as Prisma.InputJsonValue,
          expiresAt,
        },
      }),
    );
    // Schedule retention from the authoritative request timestamp.  This
    // also clears pending/failed jobs that never reach the worker.
    await this.queue.enqueueExpiry({ schoolId: user.schoolId, exportJobId: job.id }, expiresAt);
    await this.audit.record({
      schoolId: user.schoolId,
      actorUserId: user.userId,
      actorRole: user.roles[0] as Role,
      action: 'EXPORT_REQUESTED',
      entityType: 'ExportJob',
      entityId: job.id,
      metadata: { type: dto.type },
    });
    await this.queue.enqueue({ schoolId: user.schoolId, exportJobId: job.id });
    return this.toDto(job);
  }

  /** Platform exports remain school-owned: Software Admin explicitly chooses
   * a school and gets no unscoped, platform-wide export capability. */
  async createForPlatform(
    userId: string,
    schoolId: string,
    dto: CreateExportDto,
  ): Promise<ExportJobResponseDto> {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true },
    });
    if (!school) throw new AppHttpException({ code: 'NOT_FOUND', message: 'School not found.' });
    // Validate the requested target through the same school-level rules;
    // this synthetic actor is never persisted and cannot receive staff-only
    // HOD/Teacher scope because it has the School Admin role only.
    const scope = await this.validateScope(
      {
        kind: 'SCHOOL',
        passwordless: false,
        userId,
        schoolId,
        membershipId: '__platform__',
        sessionId: '__platform__',
        roles: ['SCHOOL_ADMIN'],
      },
      dto,
    );
    const expiresAt = new Date(Date.now() + EXPORT_ARTEFACT_TTL_MS);
    const job = await withTenant(prisma, schoolId, (tx) =>
      tx.exportJob.create({
        data: {
          schoolId,
          type: dto.type,
          requesterUserId: userId,
          requesterMembershipId: null,
          requesterRole: 'SOFTWARE_ADMIN',
          scope: scope as Prisma.InputJsonValue,
          expiresAt,
        },
      }),
    );
    await this.queue.enqueueExpiry({ schoolId, exportJobId: job.id }, expiresAt);
    await this.audit.record({
      schoolId,
      actorUserId: userId,
      actorRole: 'SOFTWARE_ADMIN',
      action: 'EXPORT_REQUESTED',
      entityType: 'ExportJob',
      entityId: job.id,
      metadata: { type: dto.type, platformRequested: true },
    });
    await this.queue.enqueue({ schoolId, exportJobId: job.id });
    return this.toDto(job);
  }

  async get(user: AuthenticatedUser, id: string): Promise<ExportJobResponseDto> {
    const job = await this.findOwned(user, id);
    if (job.status !== 'COMPLETED' || job.expiresAt <= new Date()) return this.toDto(job);
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Math.min(job.expiresAt.getTime(), Date.now() + 15 * 60 * 1000));
    await withTenant(prisma, user.schoolId, (tx) =>
      tx.exportJob.update({
        where: { id: job.id },
        data: {
          downloadTokenHash: this.tokenHash(token),
          downloadTokenExpiresAt: expiresAt,
        },
      }),
    );
    return { ...this.toDto(job), downloadUrl: `/v1/exports/${job.id}/download?token=${token}` };
  }

  async getForPlatform(
    userId: string,
    schoolId: string,
    id: string,
  ): Promise<ExportJobResponseDto> {
    const result = await this.get(
      {
        kind: 'SCHOOL',
        passwordless: false,
        userId,
        schoolId,
        membershipId: '__platform__',
        sessionId: '__platform__',
        roles: ['SCHOOL_ADMIN'],
      },
      id,
    );
    return result.downloadUrl
      ? {
          ...result,
          downloadUrl: result.downloadUrl.replace(
            `/v1/exports/${id}/download`,
            `/v1/platform/schools/${schoolId}/exports/${id}/download`,
          ),
        }
      : result;
  }

  async download(
    user: AuthenticatedUser,
    id: string,
    token: string | undefined,
  ): Promise<{ filename: string; body: Readable }> {
    const job = await this.findOwned(user, id);
    if (job.status !== 'COMPLETED' || !job.storageKey || !job.originalFilename) {
      throw new AppHttpException({
        code: 'NOT_FOUND',
        message: 'Export is not available for download.',
      });
    }
    if (job.expiresAt <= new Date())
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Export expired.' });
    if (
      !token ||
      !job.downloadTokenHash ||
      !job.downloadTokenExpiresAt ||
      job.downloadTokenExpiresAt <= new Date() ||
      this.tokenHash(token) !== job.downloadTokenHash
    ) {
      throw new AppHttpException({
        code: 'NOT_FOUND',
        message: 'Download link is invalid or expired.',
      });
    }
    return {
      filename: job.originalFilename,
      body: await this.storage.getObjectStream(job.storageKey),
    };
  }

  async downloadForPlatform(
    userId: string,
    schoolId: string,
    id: string,
    token: string | undefined,
  ): Promise<{ filename: string; body: Readable }> {
    return this.download(
      {
        kind: 'SCHOOL',
        passwordless: false,
        userId,
        schoolId,
        membershipId: '__platform__',
        sessionId: '__platform__',
        roles: ['SCHOOL_ADMIN'],
      },
      id,
      token,
    );
  }

  /** Worker entry point. It claims once, then generates only tenant-bound data. */
  async generate(schoolId: string, id: string): Promise<void> {
    const job = await withTenant(prisma, schoolId, (tx) =>
      tx.exportJob.updateMany({
        where: {
          id,
          schoolId,
          expiresAt: { gt: new Date() },
          // B22: a PROCESSING export untouched for EXPORT_CLAIM_STALE_MS was
          // abandoned by a killed worker; the redelivered job takes it over
          // instead of finding nothing to claim and leaving it PROCESSING
          // until it expires.
          OR: [
            { status: { in: ['PENDING', 'FAILED'] } },
            {
              status: 'PROCESSING',
              updatedAt: { lt: new Date(Date.now() - EXPORT_CLAIM_STALE_MS) },
            },
          ],
        },
        data: { status: 'PROCESSING', failureReason: null },
      }),
    );
    if (job.count === 0) {
      const current = await withTenant(prisma, schoolId, (tx) =>
        tx.exportJob.findFirst({ where: { id, schoolId }, select: { status: true } }),
      );
      // B22: still PROCESSING under a live claim — possibly a killed worker
      // whose claim is not stale yet. Retry after the backoff rather than
      // completing the job with the export stranded.
      if (current?.status === 'PROCESSING') throw new ExportClaimHeldError(id);
      return;
    }
    let uploadedKey: string | undefined;
    try {
      const record = await withTenant(prisma, schoolId, (tx) =>
        tx.exportJob.findUniqueOrThrow({ where: { id } }),
      );
      const document = await this.render(schoolId, record.type, record.scope);
      const filename = `${record.type.toLowerCase()}-${record.id}.csv`;
      const key = `schools/${schoolId}/reports/exports/${record.id}/${filename}`;
      uploadedKey = key;
      // Persist the deterministic private key before upload.  If a process
      // dies between S3 PUT and completion, the already-scheduled expiry
      // sweep can still remove the artefact.
      await withTenant(prisma, schoolId, (tx) =>
        tx.exportJob.updateMany({
          where: { id, schoolId, status: 'PROCESSING' },
          data: { storageKey: key, originalFilename: filename, contentType: CSV_CONTENT_TYPE },
        }),
      );
      await this.storage.putObject({
        storageKey: key,
        contentType: CSV_CONTENT_TYPE,
        body: Buffer.from(document.csv),
      });
      const completed = await withTenant(prisma, schoolId, (tx) =>
        tx.exportJob.updateMany({
          where: { id, schoolId, status: 'PROCESSING', expiresAt: { gt: new Date() } },
          data: {
            status: 'COMPLETED',
            storageKey: key,
            originalFilename: filename,
            contentType: CSV_CONTENT_TYPE,
            sizeBytes: Buffer.byteLength(document.csv),
            rowCount: document.rows,
          },
        }),
      );
      // An expiry worker may have won while bytes were being generated.
      // Never resurrect that job or retain its object.
      if (completed.count === 0) await this.storage.deleteObject(key);
      uploadedKey = undefined;
    } catch (error) {
      if (uploadedKey) {
        try {
          await this.storage.deleteObject(uploadedKey);
        } catch {
          /* expiry retry remains a fallback */
        }
      }
      await withTenant(prisma, schoolId, (tx) =>
        tx.exportJob.updateMany({
          where: { id, schoolId, status: 'PROCESSING' },
          data: {
            status: 'FAILED',
            // B22: never the raw error text — SDK and driver messages can
            // name buckets, hosts and SQL, and this is shown to staff.
            failureReason: exportFailureReason(error),
          },
        }),
      );
      this.logger.error({ msg: 'Export generation failed', exportJobId: id, err: error });
      throw error;
    }
  }

  async expire(schoolId: string, id: string): Promise<void> {
    const job = await withTenant(prisma, schoolId, (tx) =>
      tx.exportJob.findFirst({ where: { id, schoolId } }),
    );
    if (!job || job.expiresAt > new Date()) return;
    if (job.storageKey) await this.storage.deleteObject(job.storageKey);
    await withTenant(prisma, schoolId, (tx) =>
      tx.exportJob.updateMany({
        where: { id, schoolId, status: { in: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] } },
        data: { status: 'EXPIRED', downloadTokenHash: null, downloadTokenExpiresAt: null },
      }),
    );
  }

  /** Recovery sweep for delayed-job loss/restarts.  School ids are only a
   * routing list; each job query and mutation still runs under withTenant. */
  async sweepExpired(): Promise<void> {
    const schools = await prisma.school.findMany({ select: { id: true } });
    for (const { id: schoolId } of schools) {
      const jobs = await withTenant(prisma, schoolId, (tx) =>
        tx.exportJob.findMany({
          where: {
            expiresAt: { lte: new Date() },
            status: { in: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] },
          },
          select: { id: true },
          take: 100,
        }),
      );
      for (const job of jobs) await this.expire(schoolId, job.id);
    }
  }

  private async render(
    schoolId: string,
    type: string,
    scope: unknown,
  ): Promise<{ csv: string; rows: number }> {
    // B18 starts with bounded query shapes; workers can add cursor chunks without changing the external job contract.
    return withTenant(prisma, schoolId, async (tx) => {
      if (type === 'STUDENTS') {
        const classId = this.stringScope(scope, 'classId');
        const departmentId = this.stringScope(scope, 'departmentId');
        const rows = await tx.studentProfile.findMany({
          // P2-20: both filters narrow the same relation, so they are ANDed
          // (spread into one object, the department filter replaced the
          // class one), and both count only current enrolments.
          where: {
            AND: [
              ...(classId
                ? [{ enrollments: { some: { schoolId, classId, status: 'ACTIVE' as const } } }]
                : []),
              ...(departmentId
                ? [
                    {
                      // ADR-0038: a department's students are those taking
                      // its subjects, not those in a class of it.
                      enrollments: {
                        some: {
                          status: 'ACTIVE' as const,
                          registrations: {
                            some: {
                              status: 'REGISTERED' as const,
                              classSubject: { subject: { departmentId } },
                            },
                          },
                        },
                      },
                    },
                  ]
                : []),
            ],
          },
          include: { membership: { include: { user: true } } },
        });
        return {
          rows: rows.length,
          csv: csv([
            ['Login ID', 'Admission Number', 'First Name', 'Last Name', 'Email'],
            ...rows.map((r) => [
              r.membership.loginIdentifier,
              r.admissionNumber,
              r.membership.user.firstName,
              r.membership.user.lastName,
              r.membership.user.email,
            ]),
          ]),
        };
      }
      if (type === 'TEACHERS') {
        const departmentId = this.stringScope(scope, 'departmentId');
        const rows = await tx.teacherProfile.findMany({
          where: departmentId
            ? { assignments: { some: { classSubject: { subject: { departmentId } } } } }
            : {},
          include: { membership: { include: { user: true } } },
        });
        return {
          rows: rows.length,
          csv: csv([
            ['Staff ID', 'First Name', 'Last Name', 'Email'],
            ...rows.map((r) => [
              r.staffId,
              r.membership.user.firstName,
              r.membership.user.lastName,
              r.membership.user.email,
            ]),
          ]),
        };
      }
      if (type === 'CLASSES') {
        const departmentId = this.stringScope(scope, 'departmentId');
        const classId = this.stringScope(scope, 'classId');
        const rows = await tx.classGroup.findMany({
          where: {
            // ADR-0038: classes taught a subject of the department.
            ...(departmentId && {
              classSubjects: { some: { subject: { departmentId } } },
            }),
            ...(classId && { id: classId }),
          },
        });
        return {
          rows: rows.length,
          csv: csv([
            ['Class', 'Name', 'Level', 'Status'],
            ...rows.map((r) => [`${r.level}${r.arm}`, r.name, r.level, r.status]),
          ]),
        };
      }
      if (type === 'QUESTION_BANK') {
        const subjectId = this.stringScope(scope, 'subjectId');
        const level = this.stringScope(scope, 'level');
        const rows = await tx.question.findMany({
          where: { ...(subjectId && { subjectId }), ...(level && { level: level as never }) },
          include: {
            subject: true,
            currentRevision: {
              include: { topic: true, options: { orderBy: { originalOrder: 'asc' } } },
            },
          },
        });
        return {
          rows: rows.length,
          csv: buildQuestionsExportCsv(
            rows.map((q) => {
              const r = q.currentRevision;
              return {
                content: r?.content ?? '',
                options:
                  r?.options.map((o) => ({ content: o.content, correctFlag: o.correctFlag })) ?? [],
                subjectName: q.subject.name,
                level: q.level,
                topicName: r?.topic?.name ?? null,
                difficulty: r?.difficulty ?? '',
                marks: r?.marks ?? 0,
                currentStatus: q.archivedAt ? 'ARCHIVED' : (r?.status ?? 'DRAFT'),
              };
            }),
          ),
        };
      }
      if (type === 'EXAM_RESULTS') {
        const examId = this.stringScope(scope, 'examId');
        if (!examId) throw new Error('EXAM_RESULTS export is missing its canonical exam scope.');
        const [exam, results, participants, participation] = await Promise.all([
          tx.exam.findUniqueOrThrow({ where: { id: examId }, select: { title: true } }),
          tx.result.findMany({
            where: { examId },
            include: {
              exam: true,
              attempt: true,
              studentProfile: { include: { membership: { include: { user: true } } } },
            },
          }),
          tx.examSessionParticipant.findMany({
            where: { session: { examId } },
            include: { studentProfile: { include: { membership: { include: { user: true } } } } },
          }),
          tx.examParticipation.findMany({ where: { examId } }),
        ]);
        // Participation is session-scoped; retain that provenance so an
        // original absence and a later makeup are never silently collapsed.
        const key = (studentProfileId: string, examSessionId: string) =>
          `${studentProfileId}:${examSessionId}`;
        const resultByParticipant = new Map(
          results.map((row) => [key(row.studentProfileId, row.attempt.examSessionId), row]),
        );
        const participationByParticipant = new Map(
          participation.map((row) => [key(row.studentProfileId, row.examSessionId), row.status]),
        );
        const seen = new Set<string>();
        const source = [
          ...participants.filter((p) => {
            const participantKey = key(p.studentProfileId, p.examSessionId);
            if (seen.has(participantKey)) return false;
            seen.add(participantKey);
            return true;
          }),
          ...results
            .filter((r) => !seen.has(key(r.studentProfileId, r.attempt.examSessionId)))
            .map((r) => ({
              studentProfileId: r.studentProfileId,
              examSessionId: r.attempt.examSessionId,
              studentProfile: r.studentProfile,
            })),
        ];
        const output = source.map((entry) => {
          const result = resultByParticipant.get(key(entry.studentProfileId, entry.examSessionId));
          if (result) {
            // P2-12: a result still being marked, or voided, has no score to
            // report; its state decides the status before the attempt's.
            const scored = result.state === 'FINAL' || result.state === 'ADJUSTED';
            return [
              result.exam.title,
              result.studentProfile.studentId,
              result.studentProfile.membership.user.displayName,
              scored ? `${result.earnedMarks}/${result.totalMarks}` : '',
              scored ? result.percentage : '',
              scored ? (result.grade ?? '') : '',
              result.state === 'VOIDED'
                ? 'VOIDED'
                : result.state === 'PROCESSING'
                  ? 'MARKING'
                  : result.attempt.state === 'AUTO_SUBMITTED'
                    ? 'AUTO-SUBMITTED'
                    : 'COMPLETED',
              result.attempt.submittedAt?.toISOString() ?? '',
            ];
          }
          const status =
            participationByParticipant.get(key(entry.studentProfileId, entry.examSessionId)) ===
            'ABSENT'
              ? 'ABSENT'
              : 'NOT ATTEMPTED';
          return [
            exam.title,
            entry.studentProfile.studentId,
            entry.studentProfile.membership.user.displayName,
            '',
            '',
            '',
            status,
            '',
          ];
        });
        return {
          rows: output.length,
          csv: csv([
            [
              'Exam',
              'Student ID',
              'Student Name',
              'Score',
              'Percentage',
              'Grade',
              'Status',
              'Submitted At',
            ],
            ...output,
          ]),
        };
      }
      if (type === 'PARTICIPATION') {
        const examId = this.stringScope(scope, 'examId');
        const rows = await tx.examParticipation.findMany({
          ...(examId ? { where: { examId } } : {}),
          include: {
            exam: true,
            examSession: true,
            studentProfile: { include: { membership: { include: { user: true } } } },
          },
        });
        return {
          rows: rows.length,
          csv: csv([
            ['Exam', 'Student', 'Session Type', 'Status', 'Marked At'],
            ...rows.map((r) => [
              r.exam.title,
              r.studentProfile.membership.user.displayName,
              r.examSession.sessionType,
              r.status,
              r.markedAt.toISOString(),
            ]),
          ]),
        };
      }
      return { rows: 0, csv: csv([['Export']]) };
    });
  }

  private async findOwned(user: AuthenticatedUser, id: string) {
    const job = await withTenant(prisma, user.schoolId, (tx) =>
      tx.exportJob.findFirst({
        where: { id, schoolId: user.schoolId, requesterUserId: user.userId },
      }),
    );
    if (!job) throw new AppHttpException({ code: 'NOT_FOUND', message: 'Export not found.' });
    return job;
  }
  private toDto(job: {
    id: string;
    type: string;
    status: string;
    expiresAt: Date;
    rowCount: number;
    failureReason: string | null;
  }): ExportJobResponseDto {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      expiresAt: job.expiresAt.toISOString(),
      rowCount: job.rowCount,
      ...(job.failureReason ? { failureReason: job.failureReason } : {}),
    };
  }

  private tokenHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private stringScope(scope: unknown, key: string): string | undefined {
    return scope &&
      typeof scope === 'object' &&
      typeof (scope as Record<string, unknown>)[key] === 'string'
      ? (scope as Record<string, string>)[key]
      : undefined;
  }

  private async validateScope(user: AuthenticatedUser, dto: CreateExportDto): Promise<ExportScope> {
    const input = dto.scope ?? {};
    const value = (key: keyof ExportScope) => this.stringScope(input, key);
    const scope: ExportScope = {};
    const actor = actorFromAuthenticatedUser(user);
    const permission =
      dto.type === 'EXAM_RESULTS' || dto.type === 'PARTICIPATION'
        ? 'reporting.exportExamResults'
        : dto.type === 'QUESTION_BANK'
          ? 'reporting.exportQuestionBank'
          : dto.type === 'STUDENTS'
            ? 'reporting.exportStudentList'
            : 'reporting.exportSchoolData';
    const deny = (message: string): never => {
      throw new AppHttpException({ code: 'VALIDATION_ERROR', message });
    };
    const requireDepartment = async () => {
      const departmentId = value('departmentId');
      if (!departmentId) deny('This export requires scope.departmentId.');
      const assigned = await withTenant(prisma, user.schoolId, (tx) =>
        tx.hODAssignment.findFirst({
          where: {
            schoolId: user.schoolId,
            membershipId: user.membershipId,
            departmentId: departmentId!,
            status: 'ACTIVE',
          },
          select: { id: true },
        }),
      );
      if (!assigned)
        throw new AppHttpException({
          code: 'FORBIDDEN',
          message: 'Department is outside your HOD scope.',
        });
      scope.departmentId = departmentId!;
      return departmentId!;
    };
    const isHod =
      user.roles.includes('HOD') &&
      !user.roles.includes('SCHOOL_ADMIN') &&
      !user.roles.includes('MODERATOR');
    const isTeacher =
      user.roles.includes('TEACHER') &&
      !user.roles.includes('SCHOOL_ADMIN') &&
      !user.roles.includes('MODERATOR') &&
      !user.roles.includes('HOD');
    let resource: {
      schoolId: string;
      ownerMembershipId?: string;
      departmentId?: string;
      classSubjectId?: string;
    } = { schoolId: user.schoolId };

    if (dto.type === 'EXAM_RESULTS' || dto.type === 'PARTICIPATION') {
      const examId = value('examId');
      if (!examId) deny('This export requires scope.examId.');
      const exam = await withTenant(prisma, user.schoolId, (tx) =>
        tx.exam.findUnique({
          where: { id: examId! },
          select: { id: true, createdByMembershipId: true, departmentId: true },
        }),
      );
      if (!exam) throw new AppHttpException({ code: 'NOT_FOUND', message: 'Exam not found.' });
      scope.examId = exam.id;
      resource = {
        schoolId: user.schoolId,
        ownerMembershipId: exam.createdByMembershipId,
        ...(exam.departmentId && { departmentId: exam.departmentId }),
      };
    } else if (dto.type === 'QUESTION_BANK') {
      const subjectId = value('subjectId');
      if (!subjectId) deny('Question-bank export requires scope.subjectId.');
      const subject = await withTenant(prisma, user.schoolId, (tx) =>
        tx.subject.findUnique({
          where: { id: subjectId! },
          select: { id: true, departmentId: true },
        }),
      );
      if (!subject)
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Subject not found.' });
      scope.subjectId = subject.id;
      if (isHod) {
        const departmentId = await requireDepartment();
        if (subject.departmentId !== departmentId)
          throw new AppHttpException({
            code: 'FORBIDDEN',
            message: 'Subject is outside your department.',
          });
        resource = { schoolId: user.schoolId, departmentId };
      }
      if (isTeacher) {
        const level = value('level');
        if (!level) deny('Teacher question-bank export requires scope.level.');
        const assignment = await withTenant(prisma, user.schoolId, (tx) =>
          tx.teacherAssignment.findFirst({
            where: {
              schoolId: user.schoolId,
              status: 'ACTIVE',
              teacherProfile: { membershipId: user.membershipId },
              classSubject: { subjectId: subject.id, classGroupSession: { level: level as never } },
            },
            select: { classSubjectId: true },
          }),
        );
        if (!assignment)
          throw new AppHttpException({
            code: 'FORBIDDEN',
            message: 'Subject and level are outside your assignment.',
          });
        scope.level = level!;
        resource = { schoolId: user.schoolId, classSubjectId: assignment.classSubjectId };
      }
    } else if (dto.type === 'STUDENTS' || dto.type === 'CLASSES') {
      const classId = value('classId');
      if (isTeacher && !classId) deny('Teacher export requires scope.classId.');
      if (classId) {
        const classGroup = await withTenant(prisma, user.schoolId, (tx) =>
          tx.classGroup.findUnique({
            where: { id: classId },
            select: {
              id: true,
              classSubjects: { select: { subject: { select: { departmentId: true } } } },
            },
          }),
        );
        if (!classGroup)
          throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
        scope.classId = classGroup.id;
        if (isHod) {
          const departmentId = await requireDepartment();
          // ADR-0038: a class is in an HOD's scope when it is taught a
          // subject of their department.
          if (!classGroup.classSubjects.some((cs) => cs.subject.departmentId === departmentId))
            throw new AppHttpException({
              code: 'FORBIDDEN',
              message: 'Class is outside your department.',
            });
          resource = { schoolId: user.schoolId, departmentId };
        }
        if (isTeacher) {
          const assignment = await withTenant(prisma, user.schoolId, (tx) =>
            tx.teacherAssignment.findFirst({
              where: {
                schoolId: user.schoolId,
                status: 'ACTIVE',
                teacherProfile: { membershipId: user.membershipId },
                classSubject: { classId },
              },
              select: { classSubjectId: true },
            }),
          );
          if (!assignment)
            throw new AppHttpException({
              code: 'FORBIDDEN',
              message: 'Class is outside your assignment.',
            });
          resource = { schoolId: user.schoolId, classSubjectId: assignment.classSubjectId };
        }
      } else if (isHod) {
        resource = { schoolId: user.schoolId, departmentId: await requireDepartment() };
      }
    } else if (dto.type === 'TEACHERS') {
      if (isTeacher)
        throw new AppHttpException({
          code: 'FORBIDDEN',
          message: 'Teachers cannot export the staff directory.',
        });
      if (isHod) resource = { schoolId: user.schoolId, departmentId: await requireDepartment() };
    }
    const decision = await this.authz.evaluate(actor, permission, resource);
    if (!decision.allowed)
      throw new AppHttpException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to create this export.',
      });
    return scope;
  }
}
