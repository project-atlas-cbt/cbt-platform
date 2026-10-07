import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Transform } from 'class-transformer';
import { IsIn } from 'class-validator';
import { IMPORT_JOB_TYPES, type ImportJobType } from '@atlas/domain';
import { Authorized, AuthorizedWrite } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { resolveActorRole } from '../academics/actor.util.js';
import { MediaAssetSummaryResponseDto } from '../media/dto/media.dto.js';
import { ImportsService } from './imports.service.js';
import {
  CreateQuestionImportDto,
  CreateStudentImportDto,
  CreateTeacherImportDto,
  ImportJobDetailResponseDto,
  ImportJobListResponseDto,
  ImportJobResponseDto,
  ListImportJobsQueryDto,
  ListImportRowsQueryDto,
  RequestImportUploadDto,
  RequestImportUploadResponseDto,
} from './dto/import.dto.js';
import { RateLimitClass } from '../../security/rate-limit.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** Path-param DTO for `GET /imports/templates/:type` — `IsIn` against the
 * same closed vocabulary as everywhere else in this module, rather than
 * accepting an arbitrary string and 404ing later. The URL segment itself is
 * lowercase (`.../templates/students`), matching this API's own path-
 * segment convention elsewhere — `@Transform` normalises it to the
 * uppercase `ImportJobType` vocabulary before `@IsIn` ever sees it, rather
 * than requiring callers to type the internal enum casing into a URL. */
class ImportTypeParamDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsIn(IMPORT_JOB_TYPES)
  type!: ImportJobType;
}

/**
 * `imports.v1` — the validate-preview-confirm bulk import pipeline for
 * students, teachers (`05 §10.1`, B7), and questions (`05 §18`, B8, added
 * once the `Question` model existed — the roadmap's own "sequence
 * student/teacher import first if B8 is not ready").
 *
 * `users.import.students` and `users.import.teachers` share an identical
 * grant shape (SCHOOL_ADMIN/MODERATOR only, SCHOOL scope — see
 * permission-table.ts). The two *creation* routes below are gated by their
 * own matching permission id, since that's genuinely what each one is.
 * Every other route here is type-agnostic once a job already exists (its
 * own `type` no longer changes who may act on it), so — rather than invent
 * a third, purely representational permission id — they're all gated by
 * `users.import.students`; either id would authorize the same actors
 * identically, so this is a documented equivalence, not an inaccuracy (see
 * that row's own comment in permission-table.ts).
 */
@ApiTags('imports')
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post('upload-target')
  @RateLimitClass('heavy')
  @AuthorizedWrite('users.import.students')
  @ApiOperation({ summary: 'Request an upload target for a student/teacher import file.' })
  @ApiOkResponse({ type: RequestImportUploadResponseDto })
  async requestUpload(
    @Req() req: FastifyRequest,
    @Body() body: RequestImportUploadDto,
  ): Promise<RequestImportUploadResponseDto> {
    const user = currentUser(req);
    return this.imports.requestUpload(user.schoolId, user.userId, body);
  }

  @Post('upload-target/:id/complete')
  @RateLimitClass('heavy')
  @AuthorizedWrite('users.import.students')
  @ApiOperation({ summary: 'Finalise and validate an uploaded import file by content.' })
  @ApiOkResponse({ type: MediaAssetSummaryResponseDto })
  async completeUpload(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<MediaAssetSummaryResponseDto> {
    return this.imports.completeUpload(currentUser(req).schoolId, id);
  }

  @Post('students')
  @RateLimitClass('heavy')
  @AuthorizedWrite('users.import.students')
  @ApiOperation({ summary: 'Start validating a student import file (05 §10.1).' })
  @ApiOkResponse({ type: ImportJobResponseDto })
  async createStudentImport(
    @Req() req: FastifyRequest,
    @Body() body: CreateStudentImportDto,
  ): Promise<ImportJobResponseDto> {
    const user = currentUser(req);
    return this.imports.createStudentImport(user.schoolId, body, {
      userId: user.userId,
      role: resolveActorRole(user),
    });
  }

  @Post('teachers')
  @RateLimitClass('heavy')
  @AuthorizedWrite('users.import.teachers')
  @ApiOperation({ summary: 'Start validating a teacher import file (05 §10.1).' })
  @ApiOkResponse({ type: ImportJobResponseDto })
  async createTeacherImport(
    @Req() req: FastifyRequest,
    @Body() body: CreateTeacherImportDto,
  ): Promise<ImportJobResponseDto> {
    const user = currentUser(req);
    return this.imports.createTeacherImport(user.schoolId, body, {
      userId: user.userId,
      role: resolveActorRole(user),
    });
  }

  // B8: a dedicated upload-target/complete pair for question import files,
  // gated by questionBank.import rather than users.import.students —
  // TEACHER/HOD hold the former but not the latter (questionBank.import's
  // grant is genuinely wider than STUDENTS/TEACHERS import's SCHOOL_ADMIN/
  // MODERATOR-only shape), so the shared upload-target route above would
  // otherwise 403 exactly the actors who create QUESTIONS-type jobs. Same
  // reasoning as SCHOOL_LOGO/IMPORT_SOURCE's own dedicated-route precedent
  // (media.module.ts's doc comment) — delegates to the same, already
  // type-agnostic ImportsService methods, never duplicating them.
  @Post('questions/upload-target')
  @RateLimitClass('heavy')
  @AuthorizedWrite('questionBank.import')
  @ApiOperation({ summary: 'Request an upload target for a question import file.' })
  @ApiOkResponse({ type: RequestImportUploadResponseDto })
  async requestQuestionUpload(
    @Req() req: FastifyRequest,
    @Body() body: RequestImportUploadDto,
  ): Promise<RequestImportUploadResponseDto> {
    const user = currentUser(req);
    return this.imports.requestUpload(user.schoolId, user.userId, body);
  }

  @Post('questions/upload-target/:id/complete')
  @RateLimitClass('heavy')
  @AuthorizedWrite('questionBank.import')
  @ApiOperation({ summary: 'Finalise and validate an uploaded question import file by content.' })
  @ApiOkResponse({ type: MediaAssetSummaryResponseDto })
  async completeQuestionUpload(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<MediaAssetSummaryResponseDto> {
    return this.imports.completeUpload(currentUser(req).schoolId, id);
  }

  @Post('questions')
  @RateLimitClass('heavy')
  @AuthorizedWrite('questionBank.import')
  @ApiOperation({ summary: 'Start validating a question import file (05 §18).' })
  @ApiOkResponse({ type: ImportJobResponseDto })
  async createQuestionImport(
    @Req() req: FastifyRequest,
    @Body() body: CreateQuestionImportDto,
  ): Promise<ImportJobResponseDto> {
    const user = currentUser(req);
    return this.imports.createQuestionImport(user.schoolId, body, {
      userId: user.userId,
      role: resolveActorRole(user),
    });
  }

  @Get()
  @Authorized('users.import.students')
  @ApiOperation({ summary: "This school's recent import jobs, newest first." })
  @ApiOkResponse({ type: ImportJobListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query() query: ListImportJobsQueryDto,
  ): Promise<ImportJobListResponseDto> {
    return this.imports.list(currentUser(req).schoolId, query);
  }

  // Declared before `GET :id` — `templates/:type`'s literal first segment
  // must be matched before the generic `:id` route would otherwise treat
  // "templates" itself as an id.
  //
  // B8: this route and the three below (`GET :id`, `GET :id/errors`,
  // `POST :id/confirm`) are gated by `questionBank.import`, not
  // `users.import.students` — B7's original "type-agnostic once a job
  // exists, either id authorizes the same actors identically" reasoning
  // broke the moment a third import type (QUESTIONS) added TEACHER/HOD as
  // real job creators who hold `questionBank.import` but not
  // `users.import.students`. `questionBank.import`'s own broader grant set
  // (SCHOOL_ADMIN/MODERATOR SCHOOL, HOD DEPARTMENT, TEACHER ASSIGNED) is
  // wide enough at the *guard* level to admit every creator of every
  // import type; the real per-job boundary — a Teacher/HOD may only reach
  // their *own* QUESTIONS-type job, never someone else's or a STUDENTS/
  // TEACHERS-type one — is enforced in `ImportsService.assertCanAccessJob`,
  // the coarse-guard-plus-service-level-ownership-check pattern this
  // phase already uses for `QuestionRevisionService`'s OWNED-graded
  // actions. `templates/:type` itself carries no per-job data at all (a
  // static file), so broadening it costs nothing.
  @Get('templates/:type')
  @Authorized('questionBank.import')
  @ApiOperation({ summary: 'Download the current, versioned CSV template for this import type.' })
  @ApiProduces('text/csv')
  downloadTemplate(@Param() params: ImportTypeParamDto, @Res() res: FastifyReply): void {
    const csv = this.imports.downloadTemplate(params.type);
    res
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${params.type.toLowerCase()}-template.csv"`,
      )
      .send(csv);
  }

  @Get(':id')
  @Authorized('questionBank.import')
  @ApiOperation({ summary: 'Status, counts, and a page of row-level validation results.' })
  @ApiOkResponse({ type: ImportJobDetailResponseDto })
  async get(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() rowsQuery: ListImportRowsQueryDto,
  ): Promise<ImportJobDetailResponseDto> {
    const user = currentUser(req);
    return this.imports.get(user.schoolId, id, rowsQuery, {
      userId: user.userId,
      membershipId: user.membershipId,
      roles: user.roles,
    });
  }

  @Get(':id/errors')
  @Authorized('questionBank.import')
  @ApiOperation({
    summary: 'Download every invalid/failed row as a correctable, re-uploadable CSV (DoD item 6).',
  })
  @ApiProduces('text/csv')
  async downloadErrors(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const user = currentUser(req);
    const csv = await this.imports.downloadErrorsCsv(user.schoolId, id, {
      userId: user.userId,
      membershipId: user.membershipId,
      roles: user.roles,
    });
    res
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="import-errors.csv"')
      .send(csv);
  }

  @Post(':id/confirm')
  @RateLimitClass('heavy')
  @HttpCode(HttpStatus.OK)
  @AuthorizedWrite('questionBank.import')
  @ApiOperation({ summary: 'Commit every VALID row of a validated import (05 §10.2).' })
  @ApiOkResponse({ type: ImportJobResponseDto })
  async confirm(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ImportJobResponseDto> {
    const user = currentUser(req);
    return this.imports.confirm(user.schoolId, id, {
      userId: user.userId,
      membershipId: user.membershipId,
      roles: user.roles,
    });
  }
}
