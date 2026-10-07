import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized, AuthorizedWrite } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { QuestionReviewService } from './question-review.service.js';
import {
  ApproveQuestionReviewDto,
  QuestionReviewHistoryResponseDto,
  QuestionReviewQueueResponseDto,
  QuestionReviewWorkspaceResponseDto,
  RejectQuestionReviewDto,
  RequestChangesQuestionReviewDto,
} from './dto/question-review.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `question-review.v1` (B9) — the HOD review queue, review workspace, the
 * three decision actions, and immutable review history. See
 * `question-review.module.ts`'s own doc comment for why this is a peer
 * module to `QuestionsModule` (B8) rather than folded into it.
 */
@ApiTags('question-review')
@Controller('reviews')
export class QuestionReviewController {
  constructor(private readonly reviews: QuestionReviewService) {}

  @Get('queue')
  @Authorized('questionBank.review')
  @ApiOperation({
    summary: "Pending questions within the actor's scope, grouped by subject (DoD item 1).",
  })
  @ApiOkResponse({ type: QuestionReviewQueueResponseDto })
  async queue(@Req() req: FastifyRequest): Promise<QuestionReviewQueueResponseDto> {
    const user = currentUser(req);
    return this.reviews.getQueue(user.schoolId, actorFromAuthenticatedUser(user));
  }

  @Get('questions/:id')
  @Authorized('questionBank.review')
  @ApiOperation({
    summary: 'The full review workspace: content, options, metadata, and review history.',
  })
  @ApiOkResponse({ type: QuestionReviewWorkspaceResponseDto })
  async workspace(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<QuestionReviewWorkspaceResponseDto> {
    const user = currentUser(req);
    return this.reviews.getWorkspace(user.schoolId, actorFromAuthenticatedUser(user), id);
  }

  @Post('questions/:id/approve')
  @HttpCode(HttpStatus.OK)
  @AuthorizedWrite('questionBank.approve')
  @ApiOperation({ summary: 'Approve — an optional HOD note (DoD item 2).' })
  @ApiOkResponse({ type: QuestionReviewWorkspaceResponseDto })
  async approve(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: ApproveQuestionReviewDto,
  ): Promise<QuestionReviewWorkspaceResponseDto> {
    const user = currentUser(req);
    return this.reviews.approve(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
    });
  }

  @Post('questions/:id/reject')
  @HttpCode(HttpStatus.OK)
  @AuthorizedWrite('questionBank.reject')
  @ApiOperation({ summary: 'Reject — reason mandatory (DoD item 3).' })
  @ApiOkResponse({ type: QuestionReviewWorkspaceResponseDto })
  async reject(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: RejectQuestionReviewDto,
  ): Promise<QuestionReviewWorkspaceResponseDto> {
    const user = currentUser(req);
    return this.reviews.reject(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
    });
  }

  @Post('questions/:id/request-changes')
  @HttpCode(HttpStatus.OK)
  @AuthorizedWrite('questionBank.requestChanges')
  @ApiOperation({
    summary: 'Request changes — reason mandatory, behaves like reject (DoD item 4).',
  })
  @ApiOkResponse({ type: QuestionReviewWorkspaceResponseDto })
  async requestChanges(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: RequestChangesQuestionReviewDto,
  ): Promise<QuestionReviewWorkspaceResponseDto> {
    const user = currentUser(req);
    return this.reviews.requestChanges(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
    });
  }

  @Get('history/:questionId')
  @Authorized('questionBank.comment.view')
  @ApiOperation({
    summary: 'Full immutable review history across every revision of the question (DoD item 5).',
  })
  @ApiOkResponse({ type: QuestionReviewHistoryResponseDto })
  async history(
    @Req() req: FastifyRequest,
    @Param('questionId') questionId: string,
  ): Promise<QuestionReviewHistoryResponseDto> {
    const user = currentUser(req);
    return this.reviews.getHistory(user.schoolId, actorFromAuthenticatedUser(user), questionId);
  }
}
