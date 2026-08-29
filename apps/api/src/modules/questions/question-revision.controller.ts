import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { resolveQuestionActorRole } from './actor.util.js';
import { QuestionRevisionService } from './question-revision.service.js';
import {
  CreateRevisionDto,
  QuestionRevisionResponseDto,
  UpdateQuestionRevisionDto,
} from './dto/question.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** `questions.v1` — the revision lifecycle: draft edit/delete (DoD item 3),
 * a new revision from an approved/rejected source (DoD items 5/7), and
 * submit (DoD item 4). */
@ApiTags('questions')
@Controller('questions/:questionId/revisions')
export class QuestionRevisionController {
  constructor(private readonly revisions: QuestionRevisionService) {}

  @Patch(':revisionId')
  @Authorized('questionBank.editOwnDraft')
  @ApiOperation({ summary: 'Edit a draft revision in place — freely editable while DRAFT.' })
  @ApiOkResponse({ type: QuestionRevisionResponseDto })
  async update(
    @Req() req: FastifyRequest,
    @Param('questionId') questionId: string,
    @Param('revisionId') revisionId: string,
    @Body() body: UpdateQuestionRevisionDto,
  ): Promise<QuestionRevisionResponseDto> {
    const user = currentUser(req);
    return this.revisions.updateDraft(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      questionId,
      revisionId,
      body,
      { actorUserId: user.userId, actorRole: resolveQuestionActorRole(user) },
    );
  }

  @Delete(':revisionId')
  @Authorized('questionBank.deleteOwnDraft')
  @ApiOperation({ summary: "Delete a draft revision — refused for a question's only revision." })
  @ApiOkResponse({ type: StatusResponseDto })
  async remove(
    @Req() req: FastifyRequest,
    @Param('questionId') questionId: string,
    @Param('revisionId') revisionId: string,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.revisions.deleteDraft(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      questionId,
      revisionId,
      { actorUserId: user.userId, actorRole: resolveQuestionActorRole(user) },
    );
    return { status: 'ok' };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Authorized('questionBank.editOwnDraft')
  @ApiOperation({
    summary: 'Start a new revision cloned from the current one (must be APPROVED or REJECTED).',
  })
  @ApiOkResponse({ type: QuestionRevisionResponseDto })
  async createRevision(
    @Req() req: FastifyRequest,
    @Param('questionId') questionId: string,
    @Body() body: CreateRevisionDto,
  ): Promise<QuestionRevisionResponseDto> {
    const user = currentUser(req);
    return this.revisions.createRevision(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      questionId,
      body,
      {
        actorUserId: user.userId,
        actorRole: resolveQuestionActorRole(user),
      },
    );
  }

  @Post(':revisionId/submit')
  @HttpCode(HttpStatus.OK)
  @Authorized('questionBank.submitForReview')
  @ApiOperation({
    summary: 'DRAFT -> SUBMITTED, running the full validation catalogue (DoD item 8).',
  })
  @ApiOkResponse({ type: QuestionRevisionResponseDto })
  async submit(
    @Req() req: FastifyRequest,
    @Param('questionId') questionId: string,
    @Param('revisionId') revisionId: string,
  ): Promise<QuestionRevisionResponseDto> {
    const user = currentUser(req);
    return this.revisions.submit(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      questionId,
      revisionId,
      {
        actorUserId: user.userId,
        actorRole: resolveQuestionActorRole(user),
      },
    );
  }
}
