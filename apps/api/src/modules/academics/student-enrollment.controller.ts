import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Authorized } from '../authorization/decorators.js';
import { type AuthenticatedUser } from '../identity/auth.guard.js';
import { resolveActorRole } from './actor.util.js';
import { assertCanViewClassPeople, assertCanViewStudent } from './people-scope.util.js';
import {
  ClassRosterResponseDto,
  EnrollStudentDto,
  SetStudentStreamDto,
  StudentEnrollmentListResponseDto,
  StudentEnrollmentResponseDto,
} from './dto/student-enrollment.dto.js';
import { StudentEnrollmentService } from './student-enrollment.service.js';

function currentUser(req: FastifyRequest): AuthenticatedUser {
  return req.user as AuthenticatedUser;
}

/** `people.v1` — StudentEnrollment. Deliberately not nested under
 * `academics/...` (unlike HodAssignmentController et al.) — the roadmap's
 * own `people.v1` endpoint table pins these routes at `/v1/students/...`
 * and `/v1/classes/...` directly, so this controller declares full
 * per-route paths off an empty class-level prefix, the same technique
 * HodAssignmentController already uses for its own non-uniform routes. */
@ApiTags('people')
@Controller()
export class StudentEnrollmentController {
  constructor(private readonly enrollments: StudentEnrollmentService) {}

  @Post('students/:id/enrollments')
  @HttpCode(HttpStatus.OK)
  @Authorized('assignments.studentToClass')
  @ApiOperation({
    summary:
      'Enroll a student into a class for a session, or move them to another class within a ' +
      'session they are already enrolled in (07 §35) — one endpoint serves both.',
  })
  @ApiOkResponse({ type: StudentEnrollmentResponseDto })
  async enroll(
    @Req() req: FastifyRequest,
    @Param('id') studentProfileId: string,
    @Body() body: EnrollStudentDto,
  ): Promise<StudentEnrollmentResponseDto> {
    const user = currentUser(req);
    return this.enrollments.enroll(user.schoolId, studentProfileId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Put('students/:id/stream')
  @Authorized('assignments.studentToClass')
  @ApiOperation({
    summary:
      "Put a student's current enrollment in another stream (ADR-0038); registers the new " +
      "stream's subjects and deregisters the old stream's, for future exams only.",
  })
  @ApiOkResponse({ type: StudentEnrollmentResponseDto })
  async setStream(
    @Req() req: FastifyRequest,
    @Param('id') studentProfileId: string,
    @Body() body: SetStudentStreamDto,
  ): Promise<StudentEnrollmentResponseDto> {
    const user = currentUser(req);
    return this.enrollments.setStream(user.schoolId, studentProfileId, body, {
      actorUserId: user.userId,
      actorRole: resolveActorRole(user),
    });
  }

  @Get('students/:id/enrollments')
  @Authorized('assignments.view')
  @ApiOperation({ summary: "A student's full enrollment history (never overwritten, 07 §35)." })
  @ApiOkResponse({ type: StudentEnrollmentListResponseDto })
  async listForStudent(
    @Req() req: FastifyRequest,
    @Param('id') studentProfileId: string,
  ): Promise<StudentEnrollmentListResponseDto> {
    const user = currentUser(req);
    await assertCanViewStudent(user, studentProfileId);
    const enrollments = await this.enrollments.listForStudent(user.schoolId, studentProfileId);
    return { enrollments };
  }

  @Get('classes/:id/students')
  @Authorized('assignments.view')
  @ApiOperation({ summary: "A class's current roster (07 §6.7)." })
  @ApiOkResponse({ type: ClassRosterResponseDto })
  async roster(
    @Req() req: FastifyRequest,
    @Param('id') classId: string,
  ): Promise<ClassRosterResponseDto> {
    const user = currentUser(req);
    await assertCanViewClassPeople(user, classId);
    const students = await this.enrollments.rosterForClass(user.schoolId, classId);
    return { students };
  }
}
