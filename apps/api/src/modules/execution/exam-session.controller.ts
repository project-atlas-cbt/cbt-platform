import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { resolveExamActorRole } from '../exams/actor.util.js';
import { ExamSessionParticipantService } from './exam-session-participant.service.js';
import { ExamSessionService } from './exam-session.service.js';
import {
  AuthorizeParticipantsDto,
  AuthorizeParticipantsResponseDto,
  ExamSessionResponseDto,
  RevokeParticipantDto,
} from './dto/exam-session.dto.js';
import { GrantExtraTimeDto } from './dto/attempt.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `exam-control.v1` (B12) — session-level close/reopen/authorize/revoke.
 * Exam-level actions live in `ExamControlController` (`/v1/exams/...`)
 * instead.
 */
@ApiTags('exam-control')
@Controller('exam-sessions')
export class ExamSessionController {
  constructor(
    private readonly sessions: ExamSessionService,
    private readonly participants: ExamSessionParticipantService,
  ) {}

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.closeNewAttempts')
  @ApiOperation({
    summary: 'Close this session for new starts. Running attempts continue (ADR-0009).',
  })
  @ApiOkResponse({ type: ExamSessionResponseDto })
  async close(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ExamSessionResponseDto> {
    const user = currentUser(req);
    return this.sessions.close(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.reopen')
  @ApiOperation({ summary: 'Reopen this session for new starts (ADR-0009).' })
  @ApiOkResponse({ type: ExamSessionResponseDto })
  async reopen(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ExamSessionResponseDto> {
    const user = currentUser(req);
    return this.sessions.reopen(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Post(':id/participants')
  @HttpCode(HttpStatus.OK)
  @Authorized('examAdmin.allowStudent')
  @ApiOperation({ summary: 'Batch-authorize students for this session (DoD items 2/4).' })
  @ApiOkResponse({ type: AuthorizeParticipantsResponseDto })
  async authorizeParticipants(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: AuthorizeParticipantsDto,
  ): Promise<AuthorizeParticipantsResponseDto> {
    const user = currentUser(req);
    return this.participants.authorize(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Delete(':id/participants/:studentId')
  @HttpCode(HttpStatus.OK)
  @Authorized('examAdmin.allowStudent')
  @ApiOperation({
    summary: 'Revoke access before start — refused after start (DoD item 7, X-13).',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async revokeParticipant(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Body() body: RevokeParticipantDto,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.participants.revoke(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      id,
      studentId,
      body,
      {
        actorUserId: user.userId,
        actorRole: resolveExamActorRole(user),
      },
    );
    return { status: 'ok' };
  }

  @Post(':id/participants/:studentId/extra-time')
  @HttpCode(HttpStatus.OK)
  @Authorized('examAdmin.grantExtraTime')
  @ApiOperation({
    summary:
      'Grant a per-student accommodation (extra time) — B13 decision 2, X-11. Frozen into ExamAttempt.durationGrantedSeconds at attempt creation.',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async grantExtraTime(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
    @Body() body: GrantExtraTimeDto,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.participants.grantExtraTime(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      id,
      studentId,
      body,
      {
        actorUserId: user.userId,
        actorRole: resolveExamActorRole(user),
      },
    );
    return { status: 'ok' };
  }
}
