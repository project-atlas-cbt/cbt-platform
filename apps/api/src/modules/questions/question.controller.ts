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
import { prisma, withTenant } from '@atlas/db';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { SubjectListResponseDto } from '../academics/dto/subject.dto.js';
import { resolveQuestionActorRole } from './actor.util.js';
import { QuestionService } from './question.service.js';
import { QUESTION_INCLUDE, deriveCurrentStatus } from './question-mappers.js';
import { buildQuestionsExportCsv } from './question-export.util.js';
import {
  CreateQuestionDto,
  ListQuestionsQueryDto,
  QuestionCountsResponseDto,
  QuestionListResponseDto,
  QuestionResponseDto,
} from './dto/question.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `questions.v1` (B8) — `Question` CRUD. Revision-lifecycle actions live in
 * `QuestionRevisionController`; media attach in `QuestionMediaController`;
 * topics in `TopicController` — split the same way `academics/` splits one
 * controller per resource concept, not because these are separate Prisma
 * models alone.
 *
 * B9's `QuestionReview`/approve/reject/comment endpoints are explicitly not
 * built here — `questionBank.review`/`.approve`/`.reject`/`.requestChanges`
 * remain `awaitingResource: 'Question review workflow (B9)'`.
 */
@ApiTags('questions')
@Controller('questions')
export class QuestionController {
  constructor(private readonly questions: QuestionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('questionBank.create')
  @ApiOperation({ summary: 'Create a question + its initial draft revision (DoD items 1/2/8).' })
  @ApiOkResponse({ type: QuestionResponseDto })
  async create(
    @Req() req: FastifyRequest,
    @Body() body: CreateQuestionDto,
  ): Promise<QuestionResponseDto> {
    const user = currentUser(req);
    return this.questions.create(user.schoolId, actorFromAuthenticatedUser(user), body, {
      actorUserId: user.userId,
      actorRole: resolveQuestionActorRole(user),
    });
  }

  // Declared before `GET :id` — both literal segments must be matched
  // before the generic `:id` route would otherwise treat them as an id,
  // mirroring imports.controller.ts's own `templates/:type` precedent.
  @Get('counts')
  @Authorized('questionBank.view')
  @ApiOperation({
    summary: "Status counts for the bank home (05 §15.1), within the caller's scope.",
  })
  @ApiOkResponse({ type: QuestionCountsResponseDto })
  async counts(@Req() req: FastifyRequest): Promise<QuestionCountsResponseDto> {
    const user = currentUser(req);
    return this.questions.counts(user.schoolId, actorFromAuthenticatedUser(user));
  }

  @Get('export')
  @Authorized('questionBank.export')
  @ApiOperation({ summary: 'Download the bank (within scope) as a re-importable CSV.' })
  @ApiProduces('text/csv')
  async export(
    @Req() req: FastifyRequest,
    @Query() query: ListQuestionsQueryDto,
    @Res() res: FastifyReply,
  ): Promise<void> {
    const user = currentUser(req);
    const actor = actorFromAuthenticatedUser(user);
    // Not paginated — export is a full-scope download, so pageSize is
    // pinned well above any realistic school's bank size rather than
    // reusing the list endpoint's default page.
    const { questions } = await this.questions.list(user.schoolId, actor, {
      ...query,
      page: 1,
      pageSize: 5000,
    });
    const withOptions = await withTenant(prisma, user.schoolId, (tx) =>
      Promise.all(
        questions.map((q) =>
          tx.question.findUniqueOrThrow({ where: { id: q.id }, include: QUESTION_INCLUDE }),
        ),
      ),
    );
    const csv = buildQuestionsExportCsv(
      withOptions.map((q) => ({
        content: q.currentRevision?.content ?? '',
        options: q.currentRevision?.options ?? [],
        subjectName: q.subject.name,
        level: q.level,
        topicName: q.currentRevision?.topic?.name ?? null,
        difficulty: q.currentRevision?.difficulty ?? '',
        marks: q.currentRevision?.marks ?? 0,
        currentStatus: deriveCurrentStatus(q),
      })),
    );
    res
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="questions-export.csv"')
      .send(csv);
  }

  @Get()
  @Authorized('questionBank.view')
  @ApiOperation({ summary: "List questions within the caller's scope, filtered." })
  @ApiOkResponse({ type: QuestionListResponseDto })
  async list(
    @Req() req: FastifyRequest,
    @Query() query: ListQuestionsQueryDto,
  ): Promise<QuestionListResponseDto> {
    const user = currentUser(req);
    return this.questions.list(user.schoolId, actorFromAuthenticatedUser(user), query);
  }

  // Declared before `GET :id` — same "literal segment before the generic
  // :id route" precedent as `counts`/`export` above.
  @Get('assigned-subjects')
  @Authorized('questionBank.create')
  @ApiOperation({
    summary:
      'Subjects the caller (a teacher) is actively assigned to teach — powers the Question ' +
      "Editor's Subject picker, since `schoolConfig.subject.view` is denied to TEACHER.",
  })
  @ApiOkResponse({ type: SubjectListResponseDto })
  async assignedSubjects(@Req() req: FastifyRequest): Promise<SubjectListResponseDto> {
    const user = currentUser(req);
    return this.questions.myAssignedSubjects(user.schoolId, actorFromAuthenticatedUser(user));
  }

  @Get(':id')
  @Authorized('questionBank.view')
  @ApiOperation({ summary: 'A question with its full revision history.' })
  @ApiOkResponse({ type: QuestionResponseDto })
  async get(@Req() req: FastifyRequest, @Param('id') id: string): Promise<QuestionResponseDto> {
    const user = currentUser(req);
    return this.questions.get(user.schoolId, actorFromAuthenticatedUser(user), id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Authorized('questionBank.archive')
  @ApiOperation({ summary: 'Archive a question — always allowed, never touches any revision row.' })
  @ApiOkResponse({ type: QuestionResponseDto })
  async archive(@Req() req: FastifyRequest, @Param('id') id: string): Promise<QuestionResponseDto> {
    const user = currentUser(req);
    return this.questions.archive(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveQuestionActorRole(user),
    });
  }
}
