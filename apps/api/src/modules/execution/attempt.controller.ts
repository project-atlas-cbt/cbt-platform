import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { resolveExamActorRole } from '../exams/actor.util.js';
import { AttemptAnswerService } from './attempt-answer.service.js';
import { AttemptEventService } from './attempt-event.service.js';
import { AttemptLifecycleService } from './attempt-lifecycle.service.js';
import { AttemptStatusService } from './attempt-status.service.js';
import { AttemptAdministrationService } from './attempt-administration.service.js';
import { InvalidateAttemptDto } from './dto/participation.dto.js';
import {
  AttemptPackageResponseDto,
  AttemptStateResponseDto,
  AttemptStatusResponseDto,
  RecordAttemptEventDto,
  SaveAnswerBatchDto,
  SaveAnswerBatchResponseDto,
  SaveAnswerDto,
  SaveAnswerResponseDto,
} from './dto/attempt.dto.js';
import { RateLimitClass } from '../../security/rate-limit.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `attempt.v1` (B13) — `08 §9`'s "narrowest, most carefully designed
 * surface in the product." `POST /v1/exams/:id/attempts` (start) lives in
 * `ExamControlController` instead, mirroring that controller's own
 * exam-scoped-route convention; every other attempt route is scoped under
 * `/v1/attempts/:id` here.
 */
@ApiTags('attempts')
@Controller('attempts')
export class AttemptController {
  constructor(
    private readonly lifecycle: AttemptLifecycleService,
    private readonly answers: AttemptAnswerService,
    private readonly events: AttemptEventService,
    private readonly statusService: AttemptStatusService,
    private readonly administration: AttemptAdministrationService,
  ) {}

  @Post(':id/invalidate')
  @HttpCode(HttpStatus.OK)
  @Authorized('examAdmin.invalidateAttempt')
  async invalidate(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: InvalidateAttemptDto,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.administration.invalidate(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      id,
      body,
      { actorUserId: user.userId, actorRole: resolveExamActorRole(user) },
    );
    return { status: 'ok' };
  }

  @Get(':id')
  @Authorized('studentCbt.resume')
  @ApiOperation({
    summary:
      'Resume: full state, projected snapshot, saved answers, server-computed remaining time (DoD item 5).',
  })
  @ApiOkResponse({ type: AttemptPackageResponseDto })
  async resume(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<AttemptPackageResponseDto> {
    const user = currentUser(req);
    return this.lifecycle.resume(user.schoolId, actorFromAuthenticatedUser(user), id);
  }

  @Put(':id/answers/:questionId')
  @RateLimitClass('answer')
  @HttpCode(HttpStatus.OK)
  @Authorized('studentCbt.answer')
  @ApiOperation({ summary: 'Save one answer — idempotent, sequenced (ADR-0003/ADR-0007).' })
  @ApiOkResponse({ type: SaveAnswerResponseDto })
  async saveAnswer(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() body: SaveAnswerDto,
  ): Promise<SaveAnswerResponseDto> {
    const user = currentUser(req);
    return this.answers.saveAnswer(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      id,
      questionId,
      body,
      new Date(),
    );
  }

  @Post(':id/answers/batch')
  @RateLimitClass('answer')
  @HttpCode(HttpStatus.OK)
  @Authorized('studentCbt.answer')
  @ApiOperation({ summary: 'Flush an offline answer queue — never all-or-nothing.' })
  @ApiOkResponse({ type: SaveAnswerBatchResponseDto })
  async saveAnswerBatch(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: SaveAnswerBatchDto,
  ): Promise<SaveAnswerBatchResponseDto> {
    const user = currentUser(req);
    return this.answers.saveAnswerBatch(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      id,
      body,
      new Date(),
    );
  }

  @Post(':id/heartbeat')
  @RateLimitClass('answer')
  @HttpCode(HttpStatus.OK)
  @Authorized('studentCbt.navigate')
  @ApiOperation({
    summary:
      'Liveness (ADR-0020) plus the decision-1 device/session-binding signal — never blocks or delays answering.',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async heartbeat(@Req() req: FastifyRequest, @Param('id') id: string): Promise<StatusResponseDto> {
    const user = currentUser(req);
    const deviceId = req.headers['x-device-id'];
    await this.events.heartbeat(user.schoolId, actorFromAuthenticatedUser(user), id, {
      ...(req.ip !== undefined && { ipAddress: req.ip }),
      ...(typeof deviceId === 'string' && { deviceId }),
    });
    return { status: 'ok' };
  }

  @Post(':id/events')
  @RateLimitClass('answer')
  @HttpCode(HttpStatus.OK)
  @Authorized('studentCbt.navigate')
  @ApiOperation({
    summary: 'Integrity signals (ADR-0020) — counts, never judgements. Off the critical path.',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  async recordEvent(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: RecordAttemptEventDto,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.events.recordEvent(user.schoolId, actorFromAuthenticatedUser(user), id, body);
    return { status: 'ok' };
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Authorized('studentCbt.submit')
  @ApiOperation({
    summary: 'Normal submission — state transition and answer freeze only, never marking (B14).',
  })
  @ApiOkResponse({ type: AttemptStateResponseDto })
  async submit(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<AttemptStateResponseDto> {
    const user = currentUser(req);
    return this.lifecycle.submit(user.schoolId, actorFromAuthenticatedUser(user), id, new Date(), {
      actorUserId: user.userId,
      actorRole: 'STUDENT',
    });
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @Authorized('examAdmin.endAttempt')
  @ApiOperation({ summary: 'Staff-initiated end of a running attempt.' })
  @ApiOkResponse({ type: AttemptStateResponseDto })
  async end(@Req() req: FastifyRequest, @Param('id') id: string): Promise<AttemptStateResponseDto> {
    const user = currentUser(req);
    return this.lifecycle.end(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Get(':id/status')
  @RateLimitClass('answer')
  @Authorized('studentCbt.resume')
  @ApiOperation({
    summary:
      'B14: post-submission status for the confirmation screen — live-aggregated marking output, never a Result (B15).',
  })
  @ApiOkResponse({ type: AttemptStatusResponseDto })
  async status(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<AttemptStatusResponseDto> {
    const user = currentUser(req);
    return this.statusService.getStatus(user.schoolId, actorFromAuthenticatedUser(user), id);
  }
}
