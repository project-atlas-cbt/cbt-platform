import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { actorFromAuthenticatedUser } from '../authorization/permission.guard.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { StudentResultService } from './student-result.service.js';
import { StudentResultDetailDto, StudentResultsResponseDto } from './dto/student-result.dto.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/**
 * `student-results.v1` — 04 §60/§61. A separate controller (and a separate
 * DTO family) from the staff surface on purpose: the two have different
 * audiences and different disclosure rules, and keeping them apart is what
 * stops a staff-only field reaching a student payload by accident.
 */
@ApiTags('student-results')
@Controller('student/results')
export class StudentResultController {
  constructor(private readonly results: StudentResultService) {}

  @Get()
  @Authorized('results.viewExamResults')
  @ApiOperation({ summary: "The signed-in student's own published results only (05 §51)." })
  @ApiOkResponse({ type: StudentResultsResponseDto })
  async list(@Req() req: FastifyRequest): Promise<StudentResultsResponseDto> {
    const user = currentUser(req);
    return this.results.list(user.schoolId, actorFromAuthenticatedUser(user));
  }

  @Get(':id')
  @Authorized('results.viewIndividualResult')
  @ApiOperation({
    summary:
      "One result, with detail gated by the exam's own result_detail_visibility policy (ADR-0010).",
  })
  @ApiOkResponse({ type: StudentResultDetailDto })
  async getDetail(
    @Req() req: FastifyRequest,
    @Param('id') id: string,
  ): Promise<StudentResultDetailDto> {
    const user = currentUser(req);
    return this.results.getDetail(user.schoolId, actorFromAuthenticatedUser(user), id);
  }
}
