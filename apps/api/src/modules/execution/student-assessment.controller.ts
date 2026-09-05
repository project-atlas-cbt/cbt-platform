import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StudentAssessmentService } from './student-assessment.service.js';
import { ActiveAssessmentResponseDto, AttemptPreviewResponseDto } from './dto/attempt.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** `attempt.v1` (B13) — the two read-only routes preceding `POST
 * /v1/exams/:id/attempts`. */
@ApiTags('attempts')
@Controller('student/assessment')
export class StudentAssessmentController {
  constructor(private readonly assessment: StudentAssessmentService) {}

  @Get()
  @Authorized('studentCbt.viewActiveAssessment')
  @ApiOperation({ summary: 'The single available assessment for the caller, or none.' })
  @ApiOkResponse({ type: ActiveAssessmentResponseDto })
  async getActive(@Req() req: FastifyRequest): Promise<ActiveAssessmentResponseDto> {
    const user = currentUser(req);
    return this.assessment.getActiveAssessment(user.schoolId, actorFromAuthenticatedUser(user));
  }

  @Get(':examId/preview')
  @Authorized('studentCbt.viewActiveAssessment')
  @ApiOperation({ summary: 'Instructions and rules before starting (03 §32-36).' })
  @ApiOkResponse({ type: AttemptPreviewResponseDto })
  async getPreview(
    @Req() req: FastifyRequest,
    @Param('examId') examId: string,
  ): Promise<AttemptPreviewResponseDto> {
    const user = currentUser(req);
    return this.assessment.getPreview(user.schoolId, actorFromAuthenticatedUser(user), examId);
  }
}
