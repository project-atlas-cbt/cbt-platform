import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import { ExamResponseDto } from '../exams/dto/exam.dto.js';
import { resolveExamActorRole } from '../exams/actor.util.js';
import { ExamAdministratorService } from './exam-administrator.service.js';
import { ExamCompletionService } from './exam-completion.service.js';
import { ExamControlCenterService } from './exam-control-center.service.js';
import { ExamControlStreamService } from './exam-control-stream.service.js';
import { ExamLifecycleService } from './exam-lifecycle.service.js';
import { ExamSessionParticipantService } from './exam-session-participant.service.js';
import { ExamSessionService } from './exam-session.service.js';
import {
  AttemptLifecycleService,
  type AttemptRequestContext,
} from './attempt-lifecycle.service.js';
import {
  AssignExamAdministratorDto,
  EligibleStudentsResponseDto,
  ExamAdministratorListResponseDto,
  ExamAdministratorResponseDto,
  ExamSessionResponseDto,
  OpenExamSessionDto,
} from './dto/exam-session.dto.js';
import { CompleteExamDto, ExamControlCenterResponseDto } from './dto/exam-control-center.dto.js';
import { AttemptPackageResponseDto } from './dto/attempt.dto.js';

function attemptRequestContext(
  req: FastifyRequest,
  user: AuthenticatedUser,
): AttemptRequestContext {
  const userAgent = req.headers['user-agent'];
  const deviceId = req.headers['x-device-id'];
  return {
    ...(req.ip !== undefined && { ipAddress: req.ip }),
    ...(typeof userAgent === 'string' && { userAgent }),
    ...(typeof deviceId === 'string' && { deviceId }),
    sessionId: user.sessionId,
  };
}

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `exam-control.v1` (B12) — exam-level activation & control: close/reopen,
 * opening a session, the Control Center (poll + SSE stream), End
 * Examination, the eligible-students roster, and `ExamAdministrator`
 * delegation. Session-level close/reopen/participants live in
 * `ExamSessionController` (`/v1/exam-sessions/...`) instead.
 */
@ApiTags('exam-control')
@Controller('exams')
export class ExamControlController {
  constructor(
    private readonly lifecycle: ExamLifecycleService,
    private readonly sessions: ExamSessionService,
    private readonly participants: ExamSessionParticipantService,
    private readonly administrators: ExamAdministratorService,
    private readonly controlCenter: ExamControlCenterService,
    private readonly stream: ExamControlStreamService,
    private readonly completion: ExamCompletionService,
    private readonly attempts: AttemptLifecycleService,
  ) {}

  @Post(':id/attempts')
  @HttpCode(HttpStatus.OK)
  @Authorized('studentCbt.start')
  @ApiOperation({
    summary:
      "Start (or idempotently resume) this student's attempt — the highest-integrity transaction in the product (07 §23-24, 09 §47).",
  })
  @ApiOkResponse({ type: AttemptPackageResponseDto })
  async startAttempt(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<AttemptPackageResponseDto> {
    const user = currentUser(req);
    return this.attempts.start(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      id,
      attemptRequestContext(req, user),
      { actorUserId: user.userId, actorRole: 'STUDENT' },
    );
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.closeNewAttempts')
  @ApiOperation({
    summary:
      'Close the whole exam — cascades every OPEN session to CLOSED. ADR-0009: this is "Pause."',
  })
  @ApiOkResponse({ type: ExamResponseDto })
  async closeExam(@Req() req: FastifyRequest, @Param('id') id: string): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.lifecycle.closeExam(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.reopen')
  @ApiOperation({
    summary:
      'Reopen the exam so new sessions may be opened again. Does not auto-reopen closed sessions.',
  })
  @ApiOkResponse({ type: ExamResponseDto })
  async reopenExam(@Req() req: FastifyRequest, @Param('id') id: string): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.lifecycle.reopenExam(user.schoolId, actorFromAuthenticatedUser(user), id, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Post(':id/sessions')
  @HttpCode(HttpStatus.CREATED)
  @Authorized('examAdmin.controlCenter')
  @ApiOperation({ summary: 'Open a new ExamSession (DoD items 1-4).' })
  @ApiOkResponse({ type: ExamSessionResponseDto })
  async openSession(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: OpenExamSessionDto,
  ): Promise<ExamSessionResponseDto> {
    const user = currentUser(req);
    return this.sessions.open(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Get(':id/control')
  @Authorized('examAdmin.controlCenter')
  @ApiOperation({ summary: 'Control Center aggregates + session list (DoD items 8-9, 13).' })
  @ApiOkResponse({ type: ExamControlCenterResponseDto })
  async getControl(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ExamControlCenterResponseDto> {
    const user = currentUser(req);
    return this.controlCenter.get(user.schoolId, actorFromAuthenticatedUser(user), id);
  }

  @Get(':id/control/stream')
  @Authorized('examAdmin.controlCenter')
  @ApiOperation({ summary: 'SSE live updates — Last-Event-ID reconnection replay (DoD item 10).' })
  async streamControl(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Param('id') id: string,
  ): Promise<void> {
    const user = currentUser(req);
    // Must resolve (and may throw NOT_FOUND/FORBIDDEN) BEFORE any SSE
    // header is written — @Authorized('examAdmin.controlCenter') on this
    // route only proves the actor's role could hold the permission in
    // principle (no resource is visible to the guard for a bare GET), so
    // the real resource-scoped check (ownership/department/delegate) has to
    // happen here, exactly like every other route in this controller.
    // Found missing in review: without it, any role holding a non-denied
    // grant for this permission could stream any other exam's live Control
    // Center in this school, and a bad/cross-school id would have already
    // committed a 200 SSE response before the 404 was ever known.
    await this.stream.assertAccess(user.schoolId, actorFromAuthenticatedUser(user), id);
    reply.raw.writeHead(HttpStatus.OK, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });
    const lastEventId = req.headers['last-event-id'];
    await this.stream.attach(reply.raw, {
      schoolId: user.schoolId,
      examId: id,
      ...(typeof lastEventId === 'string' && { lastEventId }),
    });
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @Authorized('examAdmin.controlCenter')
  @ApiOperation({ summary: 'End Examination — confirm absences (DoD item 12, A-14).' })
  @ApiOkResponse({ type: ExamResponseDto })
  async complete(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: CompleteExamDto,
  ): Promise<ExamResponseDto> {
    const user = currentUser(req);
    return this.completion.complete(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Get(':id/eligible-students')
  @Authorized('examAdmin.viewRegisteredStudents')
  @ApiOperation({ summary: "The exam's full targeted-class roster with live eligibility (A-04)." })
  @ApiOkResponse({ type: EligibleStudentsResponseDto })
  async eligibleStudents(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<EligibleStudentsResponseDto> {
    const user = currentUser(req);
    return this.participants.listEligible(user.schoolId, actorFromAuthenticatedUser(user), id);
  }

  @Get(':id/administrators')
  @Authorized('exam.manageAdministrators')
  @ApiOperation({ summary: 'List every delegation (any status) for this exam — F12 gap closure.' })
  @ApiOkResponse({ type: ExamAdministratorListResponseDto })
  async listAdministrators(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<ExamAdministratorListResponseDto> {
    const user = currentUser(req);
    return this.administrators.list(user.schoolId, actorFromAuthenticatedUser(user), id);
  }

  @Post(':id/administrators')
  @HttpCode(HttpStatus.CREATED)
  @Authorized('exam.manageAdministrators')
  @ApiOperation({ summary: 'Delegate exam administration (ADR-0012/M-15).' })
  @ApiOkResponse({ type: ExamAdministratorResponseDto })
  async assignAdministrator(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Body() body: AssignExamAdministratorDto,
  ): Promise<ExamAdministratorResponseDto> {
    const user = currentUser(req);
    return this.administrators.assign(user.schoolId, actorFromAuthenticatedUser(user), id, body, {
      actorUserId: user.userId,
      actorRole: resolveExamActorRole(user),
    });
  }

  @Delete(':id/administrators/:membershipId')
  @HttpCode(HttpStatus.OK)
  @Authorized('exam.manageAdministrators')
  @ApiOperation({ summary: 'Revoke a delegated administrator.' })
  @ApiOkResponse({ type: StatusResponseDto })
  async revokeAdministrator(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
    @Param('membershipId') membershipId: string,
  ): Promise<StatusResponseDto> {
    const user = currentUser(req);
    await this.administrators.revoke(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      id,
      membershipId,
      {
        actorUserId: user.userId,
        actorRole: resolveExamActorRole(user),
      },
    );
    return { status: 'ok' };
  }
}
