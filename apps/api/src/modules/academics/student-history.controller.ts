import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { assertCanViewStudent } from './people-scope.util.js';
import { StudentHistoryResponseDto } from './dto/student-history.dto.js';
import { StudentHistoryService } from './student-history.service.js';

/** The student page's academic history (2026-10-09 redesign). Same access as
 * `GET /students/:id/enrollments`, whose rows it explains. */
@ApiTags('people')
@Controller()
export class StudentHistoryController {
  constructor(private readonly history: StudentHistoryService) {}

  @Get('students/:id/history')
  @Authorized('assignments.view')
  @ApiOperation({
    summary:
      "A student's academic history by session: classes, moves, subject changes, rollover outcomes and exam counts.",
  })
  @ApiOkResponse({ type: StudentHistoryResponseDto })
  async get(
    @Req() req: FastifyRequest,
    @Param('id') studentProfileId: string,
  ): Promise<StudentHistoryResponseDto> {
    const user = req.user as AuthenticatedUser;
    await assertCanViewStudent(user, studentProfileId);
    return this.history.forStudent(user.schoolId, studentProfileId);
  }
}
