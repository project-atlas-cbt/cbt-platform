import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { QuestionService } from '../questions/question.service.js';
import { ListQuestionsQueryDto, QuestionListResponseDto } from '../questions/dto/question.dto.js';
import { resolveExamActorRole } from './actor.util.js';
import { ExamConfigurationService } from './exam-configuration.service.js';
import { ExamQuestionService } from './exam-question.service.js';
import { ExamReadinessService } from './exam-readiness.service.js';
import { ExamService } from './exam.service.js';
import {
  CancelExamDto,
  CreateExamDto,
  ExamListResponseDto,
  ExamReadinessResponseDto,
  ExamResponseDto,
  ListExamsQueryDto,
  SetExamQuestionsDto,
  UpdateExamConfigurationDto,
  UpdateExamDto,
} from './dto/exam.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `exams.v1` (B11) — exam construction from approved question revisions,
 * configuration, and the itemised readiness check gating `DRAFT → READY`.
 * Nothing past `READY` lives here: no open/close/pause/reopen, no Control
 * Center — those are `B12`/`B13` (`exam.pause`/`.closeNewAttempts`/
 * `.reopen` and every `examAdmin.*` row stay `awaitingResource`-flagged,
 * untouched by this controller).
 */
@ApiTags('exams')
@Controller('exams')
export class ExamController {
  constructor(
    private readonly exams: ExamService,
    private readonly questions: ExamQuestionService,
    private readonly configuration: ExamConfigurationService,
    private readonly readiness: ExamReadinessService,
    private readonly questionBank: QuestionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('exam.create')
  @ApiOperation({ summary: "Create an exam within the caller's assigned scope (DoD item 1)." })
  @ApiOkResponse({ type: ExamResponseDto })
  async create(@Req() req: FastifyRequest, @Body() body: CreateExamDto): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.exams.create(user.schoolId, actorFromAuthenticatedUser(user), body, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Get()
  @Authorized('exam.viewAll')
  @ApiOperation({ summary: "List exams within the caller's scope, tabbed by status and filtered." })
  @ApiOkResponse({ type: ExamListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query() query: ListExamsQueryDto,
  ): Promise<ExamListResponseDto> {
    const user = currentUser(req);
    return this.exams.list(user.schoolId, actorFromAuthenticatedUser(user), query);
  }

  @Get(':id')
  @Authorized('exam.viewAll')
  @ApiOperation({ summary: 'A single exam with its full configuration and question selection.' })
  @ApiOkResponse({ type: ExamResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.exams.get(user.schoolId, actorFromAuthenticatedUser(user), id);
  }

  @Patch(':id')
  @Authorized('exam.editDraft')
  @ApiOperation({ summary: "Edit a DRAFT exam's identity fields, including class targeting." })
  @ApiOkResponse({ type: ExamResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateExamDto,
  ): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.exams.editDraft(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Delete(':id')
  @Authorized('exam.deleteDraft')
  @ApiOperation({ summary: 'Delete a DRAFT exam outright.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.exams.deleteDraft(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
    return { status: 'ok' };
  }

  @Get(':id/available-questions')
  @Authorized('exam.useApprovedQuestions')
  @ApiOperation({
    summary: "Approved question revisions available to bind — this exam's subject/level only.",
  })
  @ApiOkResponse({ type: QuestionListResponseDto })
  async availableQuestions(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Query() query: ListQuestionsQueryDto,
  ): Promise<QuestionListResponseDto> {
    const user = currentUser(req);
    const actor = actorFromAuthenticatedUser(user);
    const { subjectId, level } = await this.exams.assertUsableForQuestionSelection(
      user.schoolId,
      actor,
      id,
    );
    const listQuery: ListQuestionsQueryDto = { ...query, subjectId };
    if (level !== null) {
      listQuery.level = level as NonNullable<ListQuestionsQueryDto['level']>;
    }
    return this.questionBank.listBindable(user.schoolId, actor, listQuery);
  }

  @Put(':id/questions')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.addQuestions')
  @ApiOperation({ summary: "Set the exam's question selection — a full replace (DoD items 2/9)." })
  @ApiOkResponse({ type: ExamResponseDto })
  async setQuestions(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: SetExamQuestionsDto,
  ): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.questions.setSelection(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Put(':id/configuration')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.configureDuration')
  @ApiOperation({ summary: 'Configure duration/attempts/navigation/randomization/result policy.' })
  @ApiOkResponse({ type: ExamResponseDto })
  async setConfiguration(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: UpdateExamConfigurationDto,
  ): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.configuration.update(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Get(':id/readiness')
  @Authorized('exam.viewAll')
  @ApiOperation({ summary: 'The itemised readiness checklist (05 §72) — never a single boolean.' })
  @ApiOkResponse({ type: ExamReadinessResponseDto })
  async getReadiness(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ExamReadinessResponseDto> {
    const user = currentUser(req);
    // exam.viewAll re-checked here too (not just readiness.evaluate's own
    // NOT_FOUND-on-missing-row check) so an out-of-scope actor learns
    // nothing about a real exam's readiness state either.
    await this.exams.get(user.schoolId, actorFromAuthenticatedUser(user), id);
    return this.readiness.evaluate(user.schoolId, id);
  }

  @Post(':id/ready')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.publish')
  @ApiOperation({ summary: 'DRAFT → READY — succeeds only when every readiness check passes.' })
  @ApiOkResponse({ type: ExamResponseDto })
  async ready(@Req() req: FastifyRequest, @Param('id') id: string): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.exams.ready(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.cancel')
  @ApiOperation({ summary: 'Cancel from DRAFT or READY — mandatory reason, audited (DoD item 7).' })
  @ApiOkResponse({ type: ExamResponseDto })
  async cancel(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: CancelExamDto,
  ): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.exams.cancel(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.archive')
  @ApiOperation({ summary: 'Archive from DRAFT, READY, or CANCELLED.' })
  @ApiOkResponse({ type: ExamResponseDto })
  async archive(@Req() req: FastifyRequest, @Param('id') id: string): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.exams.archive(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }
}
