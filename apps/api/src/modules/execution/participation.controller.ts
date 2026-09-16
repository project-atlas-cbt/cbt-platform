import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import {
  BulkGrantMakeupDto,
  BulkGrantMakeupResponseDto,
  ConfirmAbsencesDto,
  ExamParticipationResponseDto,
  GrantAttemptAuthorizationDto,
  InvalidateAttemptDto,
  ParticipationAuthorizationDto,
  RevokeAttemptAuthorizationDto,
  StudentParticipationHistoryResponseDto,
} from './dto/participation.dto.js';
import { ParticipationNotificationService } from './participation-notification.service.js';
import { ParticipationService } from './participation.service.js';
import { StudentParticipationService } from './student-participation.service.js';

const currentUser = (request: FastifyRequest) => request.user as AuthenticatedUser;

@ApiTags('participation')
@Controller()
export class ParticipationController {
  constructor(
    private readonly participation: ParticipationService,
    private readonly notifications: ParticipationNotificationService,
    private readonly studentParticipation: StudentParticipationService,
  ) {}

  @Get('exams/:id/participation')
  @Authorized('examAdmin.viewRegisteredStudents')
  @ApiOkResponse({ type: ExamParticipationResponseDto })
  list(@Req() request: FastifyRequest, @Param('id') examId: string) {
    const user = currentUser(request);
    return this.participation.list(user.schoolId, actorFromAuthenticatedUser(user), examId);
  }

  @Post('exams/:id/participation/confirm-absences')
  @Authorized('examAdmin.markAbsence')
  @ApiOkResponse({ type: ExamParticipationResponseDto })
  confirmAbsences(
    @Req() request: FastifyRequest,
    @Param('id') examId: string,
    @Body() body: ConfirmAbsencesDto,
  ) {
    const user = currentUser(request);
    return this.participation.confirmAbsences(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      examId,
      body,
    );
  }

  @Post('exams/:id/makeup-authorizations')
  @Authorized('examAdmin.grantMakeup')
  @ApiOkResponse({ type: ParticipationAuthorizationDto })
  async grantMakeup(
    @Req() request: FastifyRequest,
    @Param('id') examId: string,
    @Body() body: GrantAttemptAuthorizationDto,
  ) {
    const user = currentUser(request);
    const authorization = await this.participation.grant(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      examId,
      'MAKEUP',
      body,
    );
    await this.notifications.makeupGranted(user.schoolId, [body.studentProfileId], examId);
    return authorization;
  }

  @Post('exams/:id/makeup-authorizations/bulk')
  @Authorized('examAdmin.grantMakeup')
  @ApiOkResponse({ type: BulkGrantMakeupResponseDto })
  async grantMakeupBulk(
    @Req() request: FastifyRequest,
    @Param('id') examId: string,
    @Body() body: BulkGrantMakeupDto,
  ) {
    const user = currentUser(request);
    const result = await this.participation.grantMakeupBulk(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      examId,
      body,
    );
    await this.notifications.makeupGranted(user.schoolId, body.studentProfileIds, examId);
    return result;
  }

  @Post('exams/:id/retry-authorizations')
  @Authorized('examAdmin.grantMakeup')
  @ApiOkResponse({ type: ParticipationAuthorizationDto })
  grantRetry(
    @Req() request: FastifyRequest,
    @Param('id') examId: string,
    @Body() body: GrantAttemptAuthorizationDto,
  ) {
    const user = currentUser(request);
    return this.participation.grant(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      examId,
      'RETRY',
      body,
    );
  }

  @Delete('attempt-authorizations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authorized('examAdmin.grantMakeup')
  @ApiNoContentResponse()
  async revoke(
    @Req() request: FastifyRequest,
    @Param('id') authorizationId: string,
    @Body() body: RevokeAttemptAuthorizationDto,
  ) {
    const user = currentUser(request);
    await this.participation.revoke(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      authorizationId,
      body,
    );
  }

  @Post('attempts/:id/invalidate')
  @Authorized('examAdmin.invalidateAttempt')
  @ApiOkResponse({ type: StatusResponseDto })
  invalidate(
    @Req() request: FastifyRequest,
    @Param('id') attemptId: string,
    @Body() body: InvalidateAttemptDto,
  ) {
    const user = currentUser(request);
    return this.participation.invalidate(
      user.schoolId,
      actorFromAuthenticatedUser(user),
      attemptId,
      body,
    );
  }

  @Get('student/participation')
  @Authorized('analytics.studentHistory')
  @ApiOkResponse({ type: StudentParticipationHistoryResponseDto })
  studentHistory(@Req() request: FastifyRequest) {
    const user = currentUser(request);
    return this.studentParticipation.list(user.schoolId, actorFromAuthenticatedUser(user));
  }
}
