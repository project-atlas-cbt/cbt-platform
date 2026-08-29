import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AcademicsContextService } from '../academics/academics-context.service.js';
import { MediaService } from '../media/media.service.js';
import type { MediaAssetSummaryResponseDto } from '../media/dto/media.dto.js';
import { ImportQueueService } from './import-queue.service.js';
import { buildErrorRowsCsv, buildTemplateCsv } from './import-templates.js';
import type {
  ImportJobDetailResponseDto,
  ImportJobListResponseDto,
  ImportJobResponseDto,
  ImportJobType,
  ImportRowResponseDto,
  CreateQuestionImportDto,
  CreateStudentImportDto,
  CreateTeacherImportDto,
  ListImportJobsQueryDto,
  ListImportRowsQueryDto,
  RequestImportUploadDto,
  RequestImportUploadResponseDto,
} from './dto/import.dto.js';

/** A-17 "staging expiry": a VALIDATED-but-unconfirmed import may be
 * confirmed for 24h from creation, then must be re-uploaded. */
const IMPORT_STAGING_TTL_MS = 24 * 60 * 60 * 1000;

interface ActorContext {
  userId: string;
  role: Role;
}

/** The identity shape `get()`/`downloadErrorsCsv()`/`confirm()` need for
 * `assertCanAccessJob` — every active role, not just one resolved role
 * (unlike `ActorContext`, used only at job-creation time for audit
 * attribution). `membershipId` is what lets an HOD's real `DEPARTMENT`
 * scope be resolved (see `assertCanAccessJob`'s own doc comment). */
interface RequestingActor {
  userId: string;
  membershipId: string;
  roles: Role[];
}

function toJobResponseDto(job: {
  id: string;
  type: string;
  status: string;
  targetAcademicSessionId: string | null;
  templateVersion: number;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  committedRows: number;
  failedRows: number;
  failureReason: string | null;
  expiresAt: Date;
  createdAt: Date;
}): ImportJobResponseDto {
  return {
    id: job.id,
    type: job.type as ImportJobResponseDto['type'],
    status: job.status as ImportJobResponseDto['status'],
    targetAcademicSessionId: job.targetAcademicSessionId,
    templateVersion: job.templateVersion,
    totalRows: job.totalRows,
    validRows: job.validRows,
    invalidRows: job.invalidRows,
    committedRows: job.committedRows,
    failedRows: job.failedRows,
    failureReason: job.failureReason,
    expiresAt: job.expiresAt.toISOString(),
    createdAt: job.createdAt.toISOString(),
  };
}

function toRowResponseDto(row: {
  rowNumber: number;
  status: string;
  rawData: unknown;
  errors: unknown;
}): ImportRowResponseDto {
  return {
    rowNumber: row.rowNumber,
    status: row.status as ImportRowResponseDto['status'],
    rawData: row.rawData as Record<string, string>,
    errors: (row.errors as { field: string; message: string }[] | null) ?? null,
  };
}

/**
 * `imports.v1` — orchestrates upload/creation/status/confirm for
 * `ImportsController`. Delegates the actual file transfer to `MediaService`
 * (IMPORT_SOURCE type), current-session resolution to the already-existing
 * `AcademicsContextService`, and background processing to
 * `ImportQueueService` — this class owns none of that logic itself, only
 * the request/response shaping and the `ImportJob` row's own lifecycle
 * (creation, listing, confirm's conditional state transition).
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly media: MediaService,
    private readonly academicsContext: AcademicsContextService,
    private readonly queue: ImportQueueService,
  ) {}

  async requestUpload(
    schoolId: string,
    uploaderUserId: string,
    dto: RequestImportUploadDto,
  ): Promise<RequestImportUploadResponseDto> {
    return this.media.requestUpload({
      schoolId,
      uploaderUserId,
      type: 'IMPORT_SOURCE',
      filename: dto.filename,
      declaredMimeType: dto.declaredMimeType,
      declaredSizeBytes: dto.declaredSizeBytes,
    });
  }

  async completeUpload(
    schoolId: string,
    mediaAssetId: string,
  ): Promise<MediaAssetSummaryResponseDto> {
    return this.media.completeUpload(schoolId, mediaAssetId);
  }

  async createStudentImport(
    schoolId: string,
    dto: CreateStudentImportDto,
    actor: ActorContext,
  ): Promise<ImportJobResponseDto> {
    const asset = await this.getReadyImportSourceAsset(schoolId, dto.mediaAssetId);

    let academicSessionId = dto.academicSessionId;
    if (!academicSessionId) {
      const context = await this.academicsContext.get(schoolId);
      if (!context.session) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'No current academic session exists for this school.',
        });
      }
      academicSessionId = context.session.id;
    } else {
      // A caller-supplied session id was previously trusted unchecked: a
      // typo'd/stale/wrong-school id would silently create a job whose
      // *every* row then fails validation with "Class not found," which
      // looks indistinguishable from a genuinely bad file. Reject it
      // up front instead, with a message that actually names the problem.
      //
      // Captured into a plain const, not read as `academicSessionId`
      // directly inside the closure below — a `let`'s narrowing to `string`
      // doesn't survive being read from inside a nested `withTenant(...)`
      // closure (same rationale as `import-validation.service.ts`'s
      // `templateVersion` capture).
      const requestedSessionId = academicSessionId;
      const session = await withTenant(prisma, schoolId, (tx) =>
        tx.academicSession.findUnique({ where: { id: requestedSessionId } }),
      );
      if (!session || session.schoolId !== schoolId) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'The specified academic session does not exist.',
        });
      }
    }

    const job = await this.createJob(schoolId, 'STUDENTS', asset.id, academicSessionId, actor);
    await this.queue.enqueueValidation(schoolId, job.id);
    return toJobResponseDto(job);
  }

  async createTeacherImport(
    schoolId: string,
    dto: CreateTeacherImportDto,
    actor: ActorContext,
  ): Promise<ImportJobResponseDto> {
    const asset = await this.getReadyImportSourceAsset(schoolId, dto.mediaAssetId);
    const job = await this.createJob(schoolId, 'TEACHERS', asset.id, null, actor);
    await this.queue.enqueueValidation(schoolId, job.id);
    return toJobResponseDto(job);
  }

  /** B8. `questionBank.import`'s grant is wider than Teacher (Moderator/
   * HOD/School Admin can all reach this route), but every imported
   * question's `authorTeacherProfileId` is a required FK — a caller with
   * no `TeacherProfile` at this school structurally cannot author what
   * their own import would create. Rejected here, at job-creation time,
   * rather than letting every row fail individually — mirrors this
   * method's own sibling `createStudentImport`'s "reject a bad
   * academicSessionId immediately" precedent. */
  async createQuestionImport(
    schoolId: string,
    dto: CreateQuestionImportDto,
    actor: ActorContext,
  ): Promise<ImportJobResponseDto> {
    const membership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findFirst({ where: { schoolId, userId: actor.userId } }),
    );
    const teacherProfile =
      membership &&
      (await withTenant(prisma, schoolId, (tx) =>
        tx.teacherProfile.findUnique({
          where: { schoolId_membershipId: { schoolId, membershipId: membership.id } },
        }),
      ));
    if (!teacherProfile) {
      throw new AppHttpException({
        code: 'QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE',
        message:
          'Only an actor with an active teacher profile at this school can import questions.',
      });
    }

    const asset = await this.getReadyImportSourceAsset(schoolId, dto.mediaAssetId);
    const job = await this.createJob(schoolId, 'QUESTIONS', asset.id, null, actor);
    await this.queue.enqueueValidation(schoolId, job.id);
    return toJobResponseDto(job);
  }

  async list(schoolId: string, query: ListImportJobsQueryDto): Promise<ImportJobListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const [jobs, total] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.importJob.findMany({
          where: { schoolId },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.importJob.count({ where: { schoolId } }),
      ]),
    );
    return { jobs: jobs.map(toJobResponseDto), total, page, pageSize };
  }

  async get(
    schoolId: string,
    id: string,
    rowsQuery: ListImportRowsQueryDto,
    actor: RequestingActor,
  ): Promise<ImportJobDetailResponseDto> {
    const job = await this.findJobOrThrow(schoolId, id);
    await this.assertCanAccessJob(schoolId, job, actor);
    const page = rowsQuery.page ?? 1;
    const pageSize = rowsQuery.pageSize ?? 50;
    const where: Prisma.ImportRowWhereInput = {
      schoolId,
      importJobId: id,
      ...(rowsQuery.status && { status: rowsQuery.status }),
    };
    const [rows, rowsTotal] = await withTenant(prisma, schoolId, (tx) =>
      Promise.all([
        tx.importRow.findMany({
          where,
          orderBy: { rowNumber: 'asc' },
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.importRow.count({ where }),
      ]),
    );
    return {
      ...toJobResponseDto(job),
      rows: rows.map(toRowResponseDto),
      rowsTotal,
      rowsPage: page,
      rowsPageSize: pageSize,
    };
  }

  /** Conditional `VALIDATED -> IMPORTING` update — the single-winner
   * mechanism for two concurrent confirm() calls (DoD concurrency
   * requirement): Postgres's own row-level locking serializes the two
   * `updateMany` statements, so only the one that actually flips the
   * status enqueues the commit job. Already-IMPORTING/COMPLETED is an
   * idempotent no-op (mirrors `MediaService.completeUpload`'s own
   * repeat-call precedent), not an error. */
  async confirm(
    schoolId: string,
    id: string,
    actor: RequestingActor,
  ): Promise<ImportJobResponseDto> {
    const job = await this.findJobOrThrow(schoolId, id);
    await this.assertCanAccessJob(schoolId, job, actor);

    if (job.status === 'IMPORTING' || job.status === 'COMPLETED') {
      return toJobResponseDto(job);
    }
    if (job.status !== 'VALIDATED') {
      throw new AppHttpException({
        code: 'IMPORT_JOB_NOT_VALIDATED',
        message: 'This import is not ready to be confirmed.',
      });
    }
    if (job.expiresAt.getTime() < Date.now()) {
      await withTenant(prisma, schoolId, (tx) =>
        tx.importJob.update({ where: { id }, data: { status: 'EXPIRED' } }),
      );
      throw new AppHttpException({
        code: 'IMPORT_JOB_EXPIRED',
        message: 'This import has expired. Please re-upload the file.',
      });
    }

    const result = await withTenant(prisma, schoolId, (tx) =>
      tx.importJob.updateMany({
        where: { id, schoolId, status: 'VALIDATED' },
        data: { status: 'IMPORTING' },
      }),
    );
    if (result.count > 0) {
      await this.queue.enqueueCommit(schoolId, id);
    }

    const updated = await this.findJobOrThrow(schoolId, id);
    return toJobResponseDto(updated);
  }

  async downloadErrorsCsv(schoolId: string, id: string, actor: RequestingActor): Promise<string> {
    const job = await this.findJobOrThrow(schoolId, id);
    await this.assertCanAccessJob(schoolId, job, actor);
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.importRow.findMany({
        where: { schoolId, importJobId: id, status: { in: ['INVALID', 'FAILED'] } },
        orderBy: { rowNumber: 'asc' },
      }),
    );
    return buildErrorRowsCsv(
      job.type,
      rows.map((row) => ({
        rawData: row.rawData as Record<string, string>,
        errors: row.errors as { field: string; message: string }[] | null,
      })),
    );
  }

  downloadTemplate(type: ImportJobType): string {
    return buildTemplateCsv(type);
  }

  private async getReadyImportSourceAsset(
    schoolId: string,
    mediaAssetId: string,
  ): Promise<{ id: string }> {
    const asset = await withTenant(prisma, schoolId, (tx) =>
      tx.mediaAsset.findUnique({ where: { id: mediaAssetId } }),
    );
    // RLS makes a cross-school id indistinguishable from "doesn't exist" —
    // same rationale as every other cross-tenant lookup in this codebase
    // (see MediaService.completeUpload's own identical comment).
    if (
      !asset ||
      asset.schoolId !== schoolId ||
      asset.type !== 'IMPORT_SOURCE' ||
      asset.status !== 'READY'
    ) {
      throw new AppHttpException({
        code: 'IMPORT_SOURCE_NOT_READY',
        message: 'The referenced file is not a ready, uploaded import source.',
      });
    }
    return { id: asset.id };
  }

  private async createJob(
    schoolId: string,
    type: ImportJobType,
    sourceMediaAssetId: string,
    targetAcademicSessionId: string | null,
    actor: ActorContext,
  ) {
    return withTenant(prisma, schoolId, (tx) =>
      tx.importJob.create({
        data: {
          schoolId,
          type,
          sourceMediaAssetId,
          uploaderUserId: actor.userId,
          uploaderRole: actor.role,
          ...(targetAcademicSessionId !== null && { targetAcademicSessionId }),
          // Placeholder until the validation job parses the real marker —
          // 0 is not a value any real IMPORT_TEMPLATE_VERSION ever takes.
          templateVersion: 0,
          expiresAt: new Date(Date.now() + IMPORT_STAGING_TTL_MS),
        },
      }),
    );
  }

  private async findJobOrThrow(schoolId: string, id: string) {
    const job = await withTenant(prisma, schoolId, (tx) =>
      tx.importJob.findUnique({ where: { id } }),
    );
    if (!job || job.schoolId !== schoolId) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Import job not found.' });
    }
    return job;
  }

  /**
   * B8 gap-closure: `GET :id`/`GET :id/errors`/`POST :id/confirm` are now
   * gated at the guard level by `questionBank.import` (see
   * `imports.controller.ts`'s own doc comment on why) — wide enough to
   * admit every creator of every import type, but not narrow enough on its
   * own. This is the real per-job boundary: School Admin/Moderator keep
   * their existing full oversight (matching `users.import.students`'s own
   * SCHOOL scope, unchanged from B7); a Teacher may only reach a QUESTIONS-
   * typed job they themselves uploaded — never someone else's, and never a
   * STUDENTS/TEACHERS-type job merely because `questionBank.import` happens
   * to admit them at the guard level.
   *
   * An HOD's own grant is `DEPARTMENT`, not `OWNED` — narrowing it to
   * "self-uploaded only" (as the Teacher case does) would deny an HOD
   * oversight of their own department's teachers' imports, contrary to what
   * the permission table declares. Resolved via `canHodAccessDepartmentJob`:
   * an HOD may reach any QUESTIONS-typed job whose uploader holds at least
   * one active `TeacherAssignment` into a subject under a department the
   * HOD actively manages — the same "does this person's real assignment
   * fall under my department" join `department-scope.resolver.ts` uses for
   * a single resource, extended here to a job's uploader (a bulk file's own
   * rows can span several subjects, so the job itself carries no single
   * department to check against).
   */
  private async assertCanAccessJob(
    schoolId: string,
    job: { uploaderUserId: string; type: string },
    actor: RequestingActor,
  ): Promise<void> {
    if (actor.roles.includes('SCHOOL_ADMIN') || actor.roles.includes('MODERATOR')) return;
    if (job.type === 'QUESTIONS' && job.uploaderUserId === actor.userId) return;
    if (
      actor.roles.includes('HOD') &&
      job.type === 'QUESTIONS' &&
      (await this.canHodAccessDepartmentJob(schoolId, job, actor.membershipId))
    ) {
      return;
    }
    throw new AppHttpException({
      code: 'FORBIDDEN',
      message: 'You do not have permission to access this import job.',
    });
  }

  private async canHodAccessDepartmentJob(
    schoolId: string,
    job: { uploaderUserId: string },
    hodMembershipId: string,
  ): Promise<boolean> {
    const departments = await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.findMany({
        where: { schoolId, membershipId: hodMembershipId, status: 'ACTIVE' },
        select: { departmentId: true },
      }),
    );
    if (departments.length === 0) return false;
    const departmentIds = departments.map((d) => d.departmentId);

    const uploaderMembership = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findFirst({
        where: { schoolId, userId: job.uploaderUserId },
        select: { id: true },
      }),
    );
    if (!uploaderMembership) return false;
    const uploaderTeacherProfile = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId: uploaderMembership.id } },
        select: { id: true },
      }),
    );
    if (!uploaderTeacherProfile) return false;

    const overlap = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherAssignment.findFirst({
        where: {
          schoolId,
          teacherProfileId: uploaderTeacherProfile.id,
          status: 'ACTIVE',
          classSubject: { subject: { departmentId: { in: departmentIds } } },
        },
        select: { id: true },
      }),
    );
    return overlap !== null;
  }
}
