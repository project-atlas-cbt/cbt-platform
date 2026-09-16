import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import {
  AttemptAuthorizationResponseDto,
  ConfirmAbsencesDto,
  ExamParticipationResponseDto,
  GrantAttemptAuthorizationDto,
  InvalidateAttemptDto,
  RevokeAttemptAuthorizationDto,
} from './dto/participation.dto.js';
import { ParticipationNotificationService } from './participation-notification.service.js';
import { ParticipationService } from './participation.service.js';
import { StudentParticipationService } from './student-participation.service.js';

const user = (request: FastifyRequest) => request.user as AuthenticatedUser;

@ApiTags('participation')
@Controller()
export class ParticipationController {
  constructor(
    private readonly service: ParticipationService,
    private readonly notifications: ParticipationNotificationService,
    private readonly studentParticipation: StudentParticipationService,
  ) {}

  @Get('exams/:id/participation')
  @Authorized('examAdmin.viewRegisteredStudents')
  @ApiOkResponse({ type: ExamParticipationResponseDto })
  list(@Req() request: FastifyRequest, @Param('id') id: string) {
    const current = user(request);
    return this.service.list(current.schoolId, actorFromAuthenticatedUser(current), id);
  }

  @Post('exams/:id/participation/confirm-absences')
  @Authorized('examAdmin.markAbsence')
  @ApiOkResponse({ type: ExamParticipationResponseDto })
  confirm(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: ConfirmAbsencesDto) {
    const current = user(request);
    return this.service.confirmAbsences(current.schoolId, actorFromAuthenticatedUser(current), id, body);
  }

  @Post('exams/:id/makeup-authorizations')
  @Authorized('examAdmin.grantMakeup')
  @ApiOkResponse({ type: AttemptAuthorizationResponseDto })
  async makeup(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: GrantAttemptAuthorizationDto) {
    const current = user(request);
    const result = await this.service.grant(current.schoolId, actorFromAuthenticatedUser(current), id, 'MAKEUP', body);
    await this.notifications.authorizationGranted(current.schoolId, body.studentProfileId, id, 'MAKEUP');
    return result;
  }

  @Post('exams/:id/retry-authorizations')
  @Authorized('examAdmin.grantMakeup')
  @ApiOkResponse({ type: AttemptAuthorizationResponseDto })
  retry(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: GrantAttemptAuthorizationDto) {
    const current = user(request);
    return this.service.grant(current.schoolId, actorFromAuthenticatedUser(current), id, 'RETRY', body);
  }

  @Delete('makeup-authorizations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Authorized('examAdmin.grantMakeup')
  async revoke(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: RevokeAttemptAuthorizationDto) {
    const current = user(request);
    await this.service.revoke(current.schoolId, actorFromAuthenticatedUser(current), id, body);
  }

  @Post('attempts/:id/invalidate')
  @Authorized('examAdmin.invalidateAttempt')
  @ApiOkResponse({ type: StatusResponseDto })
  invalidate(@Req() request: FastifyRequest, @Param('id') id: string, @Body() body: InvalidateAttemptDto) {
    const current = user(request);
    return this.service.invalidate(current.schoolId, actorFromAuthenticatedUser(current), id, body);
  }

  @Get('student/participation')
  @Authorized('results.viewExamResults')
  studentHistory(@Req() request: FastifyRequest) {
    const current = user(request);
    return this.studentParticipation.list(current.schoolId, actorFromAuthenticatedUser(current));
  }
}
